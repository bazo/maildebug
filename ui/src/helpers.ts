import type { Message } from "@/types";

export function classNames(...classes: any[]) {
	return classes.filter(Boolean).join(" ");
}

export function formatDate(dateString: string): string {
	const date = new Date(dateString);
	const locale = import.meta.env.VITE_LOCALE || "sk-SK";
	return `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale)}`;
}

/** Short "HH:MM" used in the message list rows. */
export function formatTime(dateString: string): string {
	const date = new Date(dateString);
	const locale = import.meta.env.VITE_LOCALE || "sk-SK";
	return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** Case-insensitive lookup over the parsed (canonicalized) raw headers. */
function header(message: Message, name: string): string | undefined {
	const want = name.toLowerCase();
	for (const [key, values] of Object.entries(message.rawHeaders || {})) {
		if (key.toLowerCase() === want) return values[0];
	}
	return undefined;
}

/**
 * Best-effort message category, in priority order:
 *  1. An explicit `X-Mail-Category` header the sending app set.
 *  2. Header heuristics (List-Unsubscribe → Marketing, Precedence/Auto-Submitted → Bulk).
 *  3. Sender / subject keywords (no-reply, "reset password", …) → Transactional.
 *  4. Otherwise "Untagged".
 */
export function deriveCategory(message: Message): string {
	const explicit = header(message, "X-Mail-Category");
	if (explicit) {
		const v = explicit.trim();
		return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
	}

	if (header(message, "List-Unsubscribe")) return "Marketing";

	const precedence = (header(message, "Precedence") || "").toLowerCase();
	if (/bulk|list|junk/.test(precedence)) return "Bulk";

	const autoSubmitted = (header(message, "Auto-Submitted") || "").toLowerCase();
	if (autoSubmitted && autoSubmitted !== "no") return "Automated";

	if (/no-?reply|do-?not-?reply|notifications?|mailer-daemon/i.test(message.from)) {
		return "Transactional";
	}
	if (
		/reset|verify|verif|confirm|password|receipt|invoice|order|otp|one[- ]?time|code|welcome|activate/i.test(
			message.subject || "",
		)
	) {
		return "Transactional";
	}

	return "Untagged";
}

export function categoryColors(category: string): { fg: string; bg: string } {
	const map: Record<string, { fg: string; bg: string }> = {
		Transactional: { fg: "#1d4ed8", bg: "#eff4ff" },
		Marketing: { fg: "#b45309", bg: "#fef6e7" },
		Test: { fg: "#6d28d9", bg: "#f4eeff" },
		Bulk: { fg: "#475569", bg: "#f1f5f9" },
		Automated: { fg: "#475569", bg: "#f1f5f9" },
		Untagged: { fg: "#6b7280", bg: "#f1f2f4" },
	};
	return map[category] || { fg: "#374151", bg: "#f1f2f4" };
}

const AVATAR_PALETTE = [
	"#4f46e5",
	"#0ea5a4",
	"#db2777",
	"#d97706",
	"#2563eb",
	"#059669",
	"#7c3aed",
];

export function avatarColor(email: string): string {
	let sum = 0;
	for (let i = 0; i < email.length; i++) {
		sum = (sum + email.charCodeAt(i)) % AVATAR_PALETTE.length;
	}
	return AVATAR_PALETTE[sum];
}

/**
 * Human-friendly sender name. Prefer the display name from the formatted
 * `From` header ("Jane Doe <jane@x.com>"), falling back to the local part
 * of the address with separators turned into spaces.
 */
export function displayName(message: Message): string {
	const formatted = (message.fromFormatted || "").trim();
	const match = formatted.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
	if (match && match[1].trim()) return match[1].trim();
	const local = (message.from || formatted).split("@")[0];
	return local.replace(/[._-]+/g, " ").trim() || message.from;
}

export function initial(message: Message): string {
	const name = displayName(message) || message.from || "?";
	return name.charAt(0).toUpperCase();
}

/** First non-empty line of the plain-text part, used as a list preview. */
export function snippet(message: Message): string {
	const text = message.parts.find((p) => p.mediaType === "text/plain")?.data;
	if (!text) return "";
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed) return trimmed;
	}
	return "";
}
