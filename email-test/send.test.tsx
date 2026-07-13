import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { connect } from "net";
import { tmpdir } from "os";
import { join } from "path";

import { spawn, spawnSync, type Subprocess } from "bun";

import {
	allowedTemplateNames,
	renderTemplate,
	sendEmail,
	type SmtpConfig,
	type TemplateName,
} from "./templates";

// Isolated, uncommon ports so the suite never clashes with a dev server.
const SMTP_PORT = 11025;
const API_PORT = 18100;
const USERNAME = "username";
const PASSWORD = "password";
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const repoRoot = join(import.meta.dir, "..");
const binPath = join(repoRoot, "tmp", "maildebug-test");

const smtpConfig: SmtpConfig = {
	host: "127.0.0.1",
	port: SMTP_PORT,
	secure: false,
	auth: { user: USERNAME, pass: PASSWORD },
};

let server: Subprocess | undefined;
let workDir = "";

interface ApiMessage {
	id: string;
	subject: string;
	from: string;
	to: string[];
	read: boolean;
	parts: { mediaType: string; data: string }[];
}

function tcpProbe(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ host: "127.0.0.1", port }, () => {
			socket.end();
			resolve(true);
		});
		socket.on("error", () => resolve(false));
	});
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs: number, what: string) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await fn()) return;
		await Bun.sleep(150);
	}
	throw new Error(`timed out waiting for ${what} after ${timeoutMs}ms`);
}

async function listMessages(): Promise<ApiMessage[]> {
	const res = await fetch(`${API_BASE}/messages`);
	if (!res.ok) throw new Error(`GET /messages -> ${res.status}`);
	const body = (await res.json()) as { messages: ApiMessage[] };
	return body.messages ?? [];
}

async function deleteMessages() {
	const res = await fetch(`${API_BASE}/messages`, { method: "DELETE" });
	if (!res.ok) throw new Error(`DELETE /messages -> ${res.status}`);
}

/** Poll until a message with the given subject is captured, then return it. */
async function waitForMessage(subject: string, timeoutMs = 10000): Promise<ApiMessage> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const found = (await listMessages()).find((m) => m.subject === subject);
		if (found) return found;
		await Bun.sleep(150);
	}
	throw new Error(`timed out waiting for message "${subject}"`);
}

beforeAll(async () => {
	// The Go binary embeds ui/dist (//go:embed), so it must exist before build.
	if (!existsSync(join(repoRoot, "ui", "dist"))) {
		const built = spawnSync(["bun", "run", "build"], {
			cwd: join(repoRoot, "ui"),
			stdout: "inherit",
			stderr: "inherit",
		});
		if (!built.success) throw new Error("failed to build ui/dist");
	}

	const build = spawnSync(["go", "build", "-o", binPath, "."], {
		cwd: repoRoot,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (!build.success) throw new Error("failed to build maildebug binary");

	// Fresh working dir: the server writes data/ relative to its cwd, so this
	// fully isolates the test DB from the real one.
	workDir = mkdtempSync(join(tmpdir(), "maildebug-test-"));

	server = spawn([binPath], {
		cwd: workDir,
		env: {
			...process.env,
			MAILDEBUG_ENV: "test",
			MAILDEBUG_SMTP_PORT: String(SMTP_PORT),
			MAILDEBUG_API_PORT: String(API_PORT),
			MAILDEBUG_DB_NAME: "test.bolt",
			MAILDEBUG_USERNAME: USERNAME,
			MAILDEBUG_PASSWORD: PASSWORD,
			MAILDEBUG_DOMAIN: "127.0.0.1",
			MAILDEBUG_ALLOW_INSECURE_AUTH: "true",
		},
		stdout: "inherit",
		stderr: "inherit",
	});

	await waitFor(() => tcpProbe(SMTP_PORT), 15000, "SMTP port");
	await waitFor(
		async () =>
			await fetch(`${API_BASE}/messages`)
				.then((r) => r.ok)
				.catch(() => false),
		15000,
		"HTTP API",
	);
}, 180000);

afterAll(() => {
	server?.kill();
	if (workDir) rmSync(workDir, { recursive: true, force: true });
});

beforeEach(async () => {
	await deleteMessages();
});

describe("capturing rendered emails", () => {
	for (const name of allowedTemplateNames) {
		test(`captures the ${name} template`, async () => {
			const subject = `test-${name}`;
			const to = `${name}@example.com`;
			const from = "sender@example.com";

			const html = await renderTemplate(name as TemplateName);
			await sendEmail({ config: smtpConfig, from, to, subject, html });

			const msg = await waitForMessage(subject);

			expect(msg.subject).toBe(subject);
			expect(msg.from).toContain(from);
			expect(msg.to).toContain(to);

			const htmlPart = msg.parts.find((p) => p.mediaType === "text/html");
			expect(htmlPart).toBeDefined();
			expect(htmlPart!.data.length).toBeGreaterThan(0);
		}, 20000);
	}

	test("responsive template keeps its @media breakpoints end-to-end", async () => {
		const subject = "test-responsive-media";
		const html = await renderTemplate("responsive");
		await sendEmail({
			config: smtpConfig,
			from: "sender@example.com",
			to: "responsive@example.com",
			subject,
			html,
		});

		const msg = await waitForMessage(subject);
		const htmlPart = msg.parts.find((p) => p.mediaType === "text/html");
		expect(htmlPart).toBeDefined();
		expect(htmlPart!.data).toContain("@media");
		expect(htmlPart!.data).toContain("max-width: 600px");
	}, 20000);
});

describe("live UX + core endpoints", () => {
	async function sendPlain(to: string, subject: string, body: string, extraHeaders = "") {
		// nodemailer can't set List-Unsubscribe easily; use a raw SMTP send.
		const raw =
			`Subject: ${subject}\r\nFrom: sender@example.com\r\nTo: ${to}\r\n` +
			extraHeaders +
			`\r\n${body}`;
		await new Promise<void>((resolve, reject) => {
			const sock = connect({ host: "127.0.0.1", port: SMTP_PORT }, () => {
				let step = 0;
				const script = [
					`HELO test\r\n`,
					`MAIL FROM:<sender@example.com>\r\n`,
					`RCPT TO:<${to}>\r\n`,
					`DATA\r\n`,
					`${raw}\r\n.\r\n`,
					`QUIT\r\n`,
				];
				sock.on("data", () => {
					if (step < script.length) sock.write(script[step++]);
					else {
						sock.end();
						resolve();
					}
				});
			});
			sock.on("error", reject);
		});
	}

	test("server-side search filters across all fields", async () => {
		await sendPlain("bob@x.com", "Your receipt", "thanks for your order");
		await sendPlain("carol@y.com", "Weekly newsletter", "big sale inside");
		await waitForMessage("Your receipt");
		await waitForMessage("Weekly newsletter");

		const search = async (qs: string) => {
			const r = await fetch(`${API_BASE}/messages?${qs}`);
			const b = (await r.json()) as { messages: ApiMessage[] };
			return b.messages.map((m) => m.subject);
		};

		expect(await search("search=receipt")).toEqual(["Your receipt"]);
		expect(await search("to=carol")).toEqual(["Weekly newsletter"]);
		expect(await search("body=sale")).toEqual(["Weekly newsletter"]);
	}, 20000);

	test("raw endpoint returns the true on-disk bytes", async () => {
		await sendPlain("r@x.com", "raw-check", "hello raw");
		const msg = await waitForMessage("raw-check");
		const raw = await fetch(`${API_BASE}/messages/${msg.id}/raw`).then((r) => r.text());
		expect(raw).toContain("Subject: raw-check");
		expect(raw).toContain("hello raw");
	}, 20000);

	test("read state and single delete", async () => {
		await sendPlain("r@x.com", "read-check", "body");
		const msg = await waitForMessage("read-check");

		let list = await fetch(`${API_BASE}/messages`).then((r) => r.json());
		expect(list.unread).toBe(1);

		const readRes = await fetch(`${API_BASE}/messages/${msg.id}/read`, { method: "POST" });
		expect(readRes.ok).toBe(true);

		const single = (await fetch(`${API_BASE}/messages/${msg.id}`).then((r) =>
			r.json(),
		)) as ApiMessage;
		expect(single.read).toBe(true);

		list = await fetch(`${API_BASE}/messages`).then((r) => r.json());
		expect(list.unread).toBe(0);

		const del = await fetch(`${API_BASE}/messages/${msg.id}`, { method: "DELETE" });
		expect(del.ok).toBe(true);
		expect(await fetch(`${API_BASE}/messages/${msg.id}`).then((r) => r.status)).toBe(404);
	}, 20000);

	test("checks endpoint validates List-Unsubscribe and HTML", async () => {
		await sendPlain(
			"r@x.com",
			"checks-msg",
			"<html><body><script>x</script><a href='https://ex.com'>a</a></body></html>",
			`List-Unsubscribe: <https://ex.com/u>, <mailto:u@ex.com>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nContent-Type: text/html\r\n`,
		);
		const msg = await waitForMessage("checks-msg");
		const checks = await fetch(`${API_BASE}/messages/${msg.id}/checks`).then((r) => r.json());
		expect(checks.unsubscribe.status).toBe("pass");
		expect(checks.unsubscribe.oneClick).toBe(true);
		expect(checks.html.hasHtml).toBe(true);
		expect(checks.html.status).toBe("fail"); // <script> present
	}, 20000);

	test("spam-check returns 409 when unconfigured", async () => {
		await sendPlain("r@x.com", "spam-msg", "body");
		const msg = await waitForMessage("spam-msg");
		const res = await fetch(`${API_BASE}/messages/${msg.id}/spam-check`);
		expect(res.status).toBe(409);
	}, 20000);

	test("SSE stream pushes a new-message event", async () => {
		const controller = new AbortController();
		const res = await fetch(`${API_BASE}/events`, { signal: controller.signal });
		const reader = res.body!.getReader();
		const decoder = new TextDecoder();

		// Give the subscription a moment, then send a mail.
		await Bun.sleep(200);
		await sendPlain("r@x.com", "sse-event", "body");

		let buf = "";
		const deadline = Date.now() + 8000;
		try {
			while (Date.now() < deadline) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				if (buf.includes("sse-event")) break;
			}
		} finally {
			controller.abort();
		}
		expect(buf).toContain("data:");
		expect(buf).toContain("sse-event");
	}, 20000);
});
