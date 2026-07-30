import { useMemo, useState } from "react";

import EmailViewport from "@/email-viewport";
import { categoryColors, classNames, deriveCategory, formatDate } from "@/helpers";
import {
	CheckIcon,
	CopyIcon,
	DesktopIcon,
	DownloadIcon,
	MobileIcon,
	PaperclipIcon,
	TabletIcon,
} from "@/icons";
import { useSettings } from "@/settings";
import type { Message } from "@/types";

interface MessagePreviewProps {
	message: Message;
}

type TabKey = "html" | "text" | "headers" | "raw";

const VIEWPORTS = [
	{ label: "Desktop", icon: DesktopIcon, width: null },
	{ label: "Tablet", icon: TabletIcon, width: 768 },
	{ label: "Mobile", icon: MobileIcon, width: 375 },
] as const;

function attachmentUrl(messageId: string, index: number): string {
	return `${import.meta.env.VITE_API_URL || ""}/messages/${messageId}/attachments/${index}`;
}

/** Reconstruct an RFC 822 representation from the parsed headers + body. */
function buildRaw(message: Message, body: string): string {
	const lines: string[] = [];
	for (const [key, values] of Object.entries(message.rawHeaders || {})) {
		for (const value of values) lines.push(`${key}: ${value}`);
	}
	return `${lines.join("\n")}\n\n${body}`;
}

export default function MessagePreview({ message }: MessagePreviewProps) {
	// Both are null rather than [] when the message failed to parse and only
	// its raw bytes were kept. attachments is memoized so the fallback doesn't
	// hand out a fresh array each render — its identity reaches the sanitizer
	// through cidUrls.
	const parts = message.parts ?? [];
	const attachments = useMemo(() => message.attachments ?? [], [message.attachments]);

	const html = parts.find((p) => p.mediaType === "text/html");
	const plainText = parts.find((p) => p.mediaType === "text/plain");

	// Inline parts are addressed from the HTML as cid:<Content-ID>. Absolutize
	// the URLs: they end up inside the preview iframe's srcdoc document, which
	// has no URL of its own.
	const cidUrls = useMemo(() => {
		const map: Record<string, string> = {};
		attachments.forEach((attachment, index) => {
			if (attachment.contentId) {
				map[attachment.contentId] = new URL(
					attachmentUrl(message.id, index),
					window.location.href,
				).href;
			}
		});
		return map;
	}, [message.id, attachments]);

	// Inline images are already rendered inside the body; listing them as
	// downloads too is noise. Keep the original index — it addresses the API.
	const downloads = attachments
		.map((attachment, index) => ({ attachment, index }))
		.filter(({ attachment }) => !attachment.inline);

	const [tab, setTab] = useState<TabKey>(html ? "html" : "text");
	// Email preview width in px, or null for full-width responsive (Desktop).
	const [viewport, setViewport] = useState<number | null>(null);
	const [customWidth, setCustomWidth] = useState("");
	const [copied, setCopied] = useState<string>("");
	const { resolvedLocale } = useSettings();

	const category = deriveCategory(message);
	const tag = categoryColors(category);

	const raw = useMemo(
		() => buildRaw(message, html?.data ?? plainText?.data ?? ""),
		[message, html, plainText],
	);

	const copy = (key: string, value: string) => {
		try {
			navigator.clipboard?.writeText(value);
		} catch {
			/* clipboard unavailable */
		}
		setCopied(key);
		window.setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1400);
	};

	const download = () => {
		const blob = new Blob([raw], { type: "message/rfc822" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `${(message.subject || "message").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.eml`;
		a.click();
		URL.revokeObjectURL(a.href);
	};

	const tabs: { key: TabKey; label: string; show: boolean }[] = [
		{ key: "html", label: "HTML", show: !!html },
		{ key: "text", label: "Plain text", show: !!plainText },
		{ key: "headers", label: "Headers", show: true },
		{ key: "raw", label: "Raw source", show: true },
	];

	return (
		<>
			{/* subject header */}
			<div className="flex-none border-b border-[#eaecef] bg-white px-8 pt-6 pb-5">
				<div className="flex items-start justify-between gap-6">
					<div className="min-w-0">
						<div className="mb-[7px] flex items-center gap-2.5">
							<span
								className="rounded-md px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em]"
								style={{ color: tag.fg, background: tag.bg }}
							>
								{category}
							</span>
							<span className="font-mono text-[12.5px] text-[#9aa1ac]">
								{formatDate(message.date, resolvedLocale)}
							</span>
						</div>
						<h1 className="m-0 text-[21px] font-bold leading-[1.25] tracking-[-0.02em]">
							{message.subject || "(no subject)"}
						</h1>
					</div>
					<button
						type="button"
						onClick={download}
						className="flex h-9 flex-none cursor-pointer items-center gap-[7px] rounded-[9px] border border-[#eaecef] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#f4f5f7]"
					>
						<DownloadIcon size={15} />
						.eml
					</button>
				</div>
			</div>

			{/* meta grid */}
			<div className="grid flex-none grid-cols-2 gap-x-10 gap-y-4 border-b border-[#eaecef] bg-white px-8 py-[18px]">
				<MetaField
					label="From"
					value={message.fromFormatted || message.from}
					copyValue={message.from}
					copied={copied === "from"}
					onCopy={() => copy("from", message.from)}
				/>
				<MetaField
					label="To"
					value={message.to.join(", ")}
					copied={copied === "to"}
					onCopy={() => copy("to", message.to.join(", "))}
				/>
				<MetaField label="Date" value={formatDate(message.date, resolvedLocale)} />
				<MetaField
					label="Message-Id"
					value={message.messageId}
					copied={copied === "id"}
					onCopy={() => copy("id", message.messageId)}
					small
				/>
			</div>

			{/* attachments */}
			{downloads.length > 0 && (
				<div className="flex flex-none flex-wrap items-center gap-2 border-b border-[#eaecef] bg-white px-8 py-3">
					<span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#9aa1ac]">
						Attachments
					</span>
					{downloads.map(({ attachment, index }) => (
						<a
							key={`att-${index}`}
							href={attachmentUrl(message.id, index)}
							className="flex items-center gap-1.5 rounded-lg border border-[#eaecef] bg-[#fbfbfc] px-2.5 py-1.5 text-[12.5px] font-medium text-[#374151] hover:bg-[#f4f5f7]"
							title={attachment.mediaType}
						>
							<PaperclipIcon size={13} className="text-[#9aa1ac]" />
							{attachment.name || `attachment-${index + 1}`}
						</a>
					))}
				</div>
			)}

			{/* toolbar */}
			<div className="flex flex-none items-center justify-between border-b border-[#eaecef] bg-[#fbfbfc] px-8 py-[11px]">
				<div className="flex gap-1">
					{tabs
						.filter((t) => t.show)
						.map((t) => {
							const active = tab === t.key;
							return (
								<button
									key={t.key}
									type="button"
									onClick={() => setTab(t.key)}
									className={classNames(
										"h-8 cursor-pointer rounded-lg px-3.5 text-[12.5px] font-semibold",
										active
											? "bg-[#eef0ff] text-[#4f46e5]"
											: "bg-transparent text-[#6b7280] hover:text-[#1a1d21]",
									)}
								>
									{t.label}
								</button>
							);
						})}
				</div>
				{tab === "html" && html && (
					<div className="flex items-center gap-1 rounded-[9px] bg-[#eef0f2] p-[3px]">
						{VIEWPORTS.map((v) => {
							const active = viewport === v.width && customWidth === "";
							return (
								<button
									key={v.label}
									type="button"
									title={`${v.label} width`}
									aria-label={v.label}
									aria-pressed={active}
									onClick={() => {
										setViewport(v.width);
										setCustomWidth("");
									}}
									className={classNames(
										"flex h-[26px] w-[34px] cursor-pointer items-center justify-center rounded-md",
										active
											? "bg-white text-[#4f46e5]"
											: "bg-transparent text-[#9aa1ac] hover:text-[#6b7280]",
									)}
								>
									<v.icon size={15} />
								</button>
							);
						})}
						<input
							type="number"
							min={200}
							max={2000}
							placeholder="px"
							value={customWidth}
							onChange={(e) => {
								const raw = e.target.value;
								setCustomWidth(raw);
								const n = parseInt(raw, 10);
								if (!Number.isNaN(n)) setViewport(n);
							}}
							className={classNames(
								"ml-0.5 h-[26px] w-16 rounded-md border-none bg-transparent px-2 text-[12px] outline-none",
								customWidth !== ""
									? "bg-white text-[#4f46e5]"
									: "text-[#6b7280] placeholder:text-[#9aa1ac]",
							)}
						/>
					</div>
				)}
			</div>

			{/* content */}
			<div className="min-h-0 flex-1 overflow-auto bg-[#eef0f3]">
				{tab === "html" &&
					(html ? (
						<EmailViewport
							html={html.data}
							width={viewport}
							title={message.subject}
							cidUrls={cidUrls}
						/>
					) : (
						<EmptyPane text="No HTML part in this message." />
					))}

				{tab === "text" &&
					(plainText ? (
						<div className="p-7">
							<pre className="m-0 whitespace-pre-wrap rounded-[12px] bg-white p-6 font-mono text-[13px] leading-[1.7] text-[#374151] shadow-sm">
								{plainText.data}
							</pre>
						</div>
					) : (
						<EmptyPane text="No plain-text part in this message." />
					))}

				{tab === "headers" && (
					<div className="p-7">
						<div className="overflow-hidden rounded-[12px] bg-white shadow-sm">
							{Object.entries(message.rawHeaders).map(([key, values]) => (
								<div
									key={key}
									className="flex gap-5 border-b border-[#f1f2f4] px-[22px] py-[11px]"
								>
									<span className="w-40 flex-none font-mono text-[12.5px] font-medium text-[#9aa1ac]">
										{key}
									</span>
									<span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-[#1a1d21]">
										{values.join(", ")}
									</span>
								</div>
							))}
						</div>
					</div>
				)}

				{tab === "raw" && (
					<div className="p-7">
						<pre className="m-0 whitespace-pre-wrap break-words rounded-[12px] bg-[#1a1d21] p-6 font-mono text-[12.5px] leading-[1.7] text-[#cbd2dc] shadow-md">
							{raw}
						</pre>
					</div>
				)}
			</div>
		</>
	);
}

interface MetaFieldProps {
	label: string;
	value: string;
	copyValue?: string;
	copied?: boolean;
	onCopy?: () => void;
	small?: boolean;
}

function MetaField({ label, value, copied, onCopy, small }: MetaFieldProps) {
	return (
		<div className="min-w-0">
			<div className="mb-[5px] text-[11px] font-semibold uppercase tracking-[0.05em] text-[#9aa1ac]">
				{label}
			</div>
			<div className="flex min-w-0 items-center gap-2">
				<span
					className={classNames(
						"truncate font-mono font-medium",
						small ? "text-[12.5px] text-[#6b7280]" : "text-[13.5px] text-[#1a1d21]",
					)}
				>
					{value || "—"}
				</span>
				{onCopy && (
					<button
						type="button"
						onClick={onCopy}
						title={`Copy ${label}`}
						className="flex flex-none cursor-pointer p-px"
						style={{ color: copied ? "#059669" : "#c2c7cf" }}
					>
						{copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
					</button>
				)}
			</div>
		</div>
	);
}

function EmptyPane({ text }: { text: string }) {
	return <div className="p-7 text-[13px] text-[#9aa1ac]">{text}</div>;
}
