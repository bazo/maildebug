import { useEffect, useState } from "react";

import type { CheckStatus, ChecksResult, LinkCheckResult, SpamResult } from "@/types";

const API = import.meta.env.VITE_API_URL || "";

const STATUS_STYLE: Record<CheckStatus, { fg: string; bg: string; label: string }> = {
	pass: { fg: "#059669", bg: "#ecfdf5", label: "Pass" },
	warn: { fg: "#b45309", bg: "#fffbeb", label: "Warning" },
	fail: { fg: "#dc2626", bg: "#fef2f2", label: "Fail" },
};

function StatusPill({ status }: { status: CheckStatus }) {
	const s = STATUS_STYLE[status];
	return (
		<span
			className="rounded-md px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.04em]"
			style={{ color: s.fg, background: s.bg }}
		>
			{s.label}
		</span>
	);
}

function Card({
	title,
	right,
	children,
}: {
	title: string;
	right?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="overflow-hidden rounded-[12px] bg-white shadow-sm">
			<div className="flex items-center justify-between border-b border-[#f1f2f4] px-5 py-3">
				<span className="text-[13px] font-semibold text-[#1a1d21]">{title}</span>
				{right}
			</div>
			<div className="px-5 py-4">{children}</div>
		</div>
	);
}

export default function ChecksPanel({ id }: { id: string }) {
	const [checks, setChecks] = useState<ChecksResult | null>(null);
	const [links, setLinks] = useState<LinkCheckResult | null>(null);
	const [linksLoading, setLinksLoading] = useState(false);
	const [spam, setSpam] = useState<SpamResult | null>(null);
	const [spamState, setSpamState] = useState<"idle" | "loading" | "disabled" | "error">("idle");
	const [spamError, setSpamError] = useState("");

	// Cheap, no-network checks load automatically.
	useEffect(() => {
		let cancelled = false;
		fetch(`${API}/messages/${id}/checks`, { mode: "cors" })
			.then((r) => r.json())
			.then((d) => {
				if (!cancelled) setChecks(d);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [id]);

	const runLinks = () => {
		setLinksLoading(true);
		fetch(`${API}/messages/${id}/link-check`, { mode: "cors" })
			.then((r) => r.json())
			.then(setLinks)
			.catch(() => {})
			.finally(() => setLinksLoading(false));
	};

	const runSpam = () => {
		setSpamState("loading");
		fetch(`${API}/messages/${id}/spam-check`, { mode: "cors" }).then(async (r) => {
			if (r.status === 409) {
				setSpamState("disabled");
				return;
			}
			if (!r.ok) {
				const body = await r.json().catch(() => ({}));
				setSpamError(body.error || `Error ${r.status}`);
				setSpamState("error");
				return;
			}
			setSpam(await r.json());
			setSpamState("idle");
		});
	};

	const unsub = checks?.unsubscribe;
	const htmlCheck = checks?.html;

	return (
		<div className="flex flex-col gap-4 p-7">
			{htmlCheck?.hasHtml && (
				<Card title="HTML compatibility" right={<StatusPill status={htmlCheck.status} />}>
					{htmlCheck.findings.length === 0 ? (
						<p className="text-[13px] text-[#059669]">
							No common compatibility issues detected.
						</p>
					) : (
						<div className="flex flex-col gap-2">
							{htmlCheck.findings.map((f) => (
								<div
									key={f.feature}
									className="flex items-start gap-2.5 text-[12.5px]"
								>
									<StatusPill status={f.status} />
									<div className="min-w-0">
										<span className="font-mono font-semibold text-[#1a1d21]">
											{f.feature}
										</span>
										{f.count > 1 && (
											<span className="ml-1.5 text-[#9aa1ac]">
												×{f.count}
											</span>
										)}
										<p className="text-[#6b7280]">{f.note}</p>
									</div>
								</div>
							))}
						</div>
					)}
				</Card>
			)}
			<Card
				title="List-Unsubscribe"
				right={unsub ? <StatusPill status={unsub.status} /> : null}
			>
				{!unsub ? (
					<p className="text-[13px] text-[#9aa1ac]">Loading…</p>
				) : (
					<div className="flex flex-col gap-2 text-[13px]">
						{unsub.uris.length > 0 && (
							<ul className="flex flex-col gap-1">
								{unsub.uris.map((u) => (
									<li
										key={u.uri}
										className="flex items-center gap-2 font-mono text-[12.5px]"
									>
										<span className="rounded bg-[#eef0f2] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-[#6b7280]">
											{u.type}
										</span>
										<span className="min-w-0 break-all text-[#374151]">
											{u.uri}
										</span>
									</li>
								))}
							</ul>
						)}
						<div className="text-[12.5px] text-[#6b7280]">
							One-Click:{" "}
							<span className="font-semibold">{unsub.oneClick ? "yes" : "no"}</span>
						</div>
						{unsub.notes.map((n) => (
							<p key={n} className="text-[12.5px] text-[#9aa1ac]">
								{n}
							</p>
						))}
					</div>
				)}
			</Card>

			<Card
				title="Links & images"
				right={
					<button
						type="button"
						onClick={runLinks}
						disabled={linksLoading}
						className="h-7 cursor-pointer rounded-lg border border-[#eaecef] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#f4f5f7] disabled:opacity-50"
					>
						{linksLoading ? "Checking…" : links ? "Re-check" : "Check links"}
					</button>
				}
			>
				{!links ? (
					<p className="text-[13px] text-[#9aa1ac]">
						Probes every http(s) link and image (makes outbound requests).
					</p>
				) : links.total === 0 ? (
					<p className="text-[13px] text-[#9aa1ac]">No http(s) links found.</p>
				) : (
					<div className="flex flex-col gap-1.5">
						<p className="mb-1 text-[12.5px] text-[#6b7280]">
							{links.total} checked · {links.failed} failing
						</p>
						{links.links.map((l) => (
							<div
								key={`${l.kind}-${l.url}`}
								className="flex items-center gap-2 text-[12.5px]"
							>
								<span
									className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
									style={{
										color: l.ok ? "#059669" : "#dc2626",
										background: l.ok ? "#ecfdf5" : "#fef2f2",
									}}
								>
									{l.status || "ERR"}
								</span>
								<span className="flex-none text-[10.5px] uppercase text-[#9aa1ac]">
									{l.kind}
								</span>
								<span
									className="min-w-0 break-all font-mono text-[#374151]"
									title={l.error}
								>
									{l.url}
								</span>
							</div>
						))}
					</div>
				)}
			</Card>

			<Card
				title="Spam score (SpamAssassin)"
				right={
					<button
						type="button"
						onClick={runSpam}
						disabled={spamState === "loading"}
						className="h-7 cursor-pointer rounded-lg border border-[#eaecef] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#f4f5f7] disabled:opacity-50"
					>
						{spamState === "loading" ? "Scoring…" : "Check spam"}
					</button>
				}
			>
				{spamState === "disabled" ? (
					<p className="text-[13px] text-[#9aa1ac]">
						Not configured. Set{" "}
						<code className="font-mono">MAILDEBUG_SPAMASSASSIN</code> to a spamd
						host:port (e.g. <code className="font-mono">localhost:783</code>).
					</p>
				) : spamState === "error" ? (
					<p className="text-[13px] text-[#dc2626]">{spamError}</p>
				) : !spam ? (
					<p className="text-[13px] text-[#9aa1ac]">
						Scores this message against a configured SpamAssassin daemon.
					</p>
				) : (
					<div className="flex flex-col gap-2 text-[13px]">
						<div className="flex items-center gap-3">
							<span
								className="text-[20px] font-bold"
								style={{ color: spam.isSpam ? "#dc2626" : "#059669" }}
							>
								{spam.score.toFixed(1)}
							</span>
							<span className="text-[12.5px] text-[#6b7280]">
								threshold {spam.threshold.toFixed(1)} ·{" "}
								{spam.isSpam ? "SPAM" : "clean"}
							</span>
						</div>
						{spam.rules.length > 0 && (
							<div className="flex flex-col gap-1">
								{spam.rules.map((rule) => (
									<div
										key={rule.name}
										className="flex items-baseline gap-2 text-[12px]"
									>
										<span className="w-10 flex-none text-right font-mono text-[#6b7280]">
											{rule.score.toFixed(1)}
										</span>
										<span className="flex-none font-mono font-semibold text-[#1a1d21]">
											{rule.name}
										</span>
										<span className="min-w-0 text-[#9aa1ac]">
											{rule.description}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</Card>
		</div>
	);
}
