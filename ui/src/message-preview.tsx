import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import ChecksPanel from "@/checks-panel";
import EmailViewport from "@/email-viewport";
import { categoryColors, classNames, deriveCategory, formatDate } from "@/helpers";
import {
	CameraIcon,
	CheckIcon,
	CollapseIcon,
	CopyIcon,
	DesktopIcon,
	DownloadIcon,
	ExpandIcon,
	MobileIcon,
	PaperclipIcon,
	SpinnerIcon,
	TabletIcon,
	TrashIcon,
} from "@/icons";
import { copyEmailScreenshot, downloadEmailScreenshot } from "@/screenshot";
import { useSettings } from "@/settings";
import type { Message } from "@/types";

const API = import.meta.env.VITE_API_URL || "";

interface MessagePreviewProps {
	message: Message;
	onDelete?: (id: string) => void;
}

type TabKey = "html" | "text" | "headers" | "raw" | "checks";

const VIEWPORTS = [
	{ label: "Desktop", icon: DesktopIcon, width: null },
	{ label: "Tablet", icon: TabletIcon, width: 768 },
	{ label: "Mobile", icon: MobileIcon, width: 375 },
] as const;

function attachmentUrl(messageId: string, index: number): string {
	return `${API}/messages/${messageId}/attachments/${index}`;
}

export default function MessagePreview({ message, onDelete }: MessagePreviewProps) {
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
	// True on-disk RFC 822 source, fetched lazily when the Raw tab is opened.
	const [raw, setRaw] = useState<string | null>(null);
	const [fullscreen, setFullscreen] = useState(false);
	// The rendered iframes, handed to the screenshot capture. Two of them: the
	// inline pane and the fullscreen overlay each render their own.
	const paneFrame = useRef<HTMLIFrameElement | null>(null);
	const fullscreenFrame = useRef<HTMLIFrameElement | null>(null);
	const { resolvedLocale } = useSettings();

	const category = deriveCategory(message);
	const tag = categoryColors(category);

	useEffect(() => {
		if (tab !== "raw" || raw !== null) return;
		let cancelled = false;
		fetch(`${API}/messages/${message.id}/raw`, { mode: "cors" })
			.then((r) => r.text())
			.then((t) => {
				if (!cancelled) setRaw(t);
			})
			.catch(() => {
				if (!cancelled) setRaw("Failed to load raw source.");
			});
		return () => {
			cancelled = true;
		};
	}, [tab, raw, message.id]);

	const copy = (key: string, value: string) => {
		try {
			navigator.clipboard?.writeText(value);
		} catch {
			/* clipboard unavailable */
		}
		setCopied(key);
		window.setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1400);
	};

	const slug = (message.subject || "message").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

	const download = () => {
		const a = document.createElement("a");
		a.href = `${API}/messages/${message.id}/raw?download=1`;
		a.download = `${slug}.eml`;
		a.click();
	};

	// Escape leaves the fullscreen preview, matching the settings dialog.
	useEffect(() => {
		if (!fullscreen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setFullscreen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [fullscreen]);

	// The HTML tab is the only one the fullscreen view renders.
	useEffect(() => {
		if (tab !== "html") setFullscreen(false);
	}, [tab]);

	const tabs: { key: TabKey; label: string; show: boolean }[] = [
		{ key: "html", label: "HTML", show: !!html },
		{ key: "text", label: "Plain text", show: !!plainText },
		{ key: "headers", label: "Headers", show: true },
		{ key: "raw", label: "Raw source", show: true },
		{ key: "checks", label: "Checks", show: true },
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
					<div className="flex flex-none items-center gap-2">
						<button
							type="button"
							onClick={download}
							className="flex h-9 cursor-pointer items-center gap-[7px] rounded-[9px] border border-[#eaecef] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#f4f5f7]"
						>
							<DownloadIcon size={15} />
							.eml
						</button>
						{onDelete && (
							<button
								type="button"
								title="Delete message"
								onClick={() => onDelete(message.id)}
								className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-[#eaecef] bg-white text-[#6b7280] hover:border-[#fecaca] hover:bg-[#fef2f2] hover:text-[#dc2626]"
							>
								<TrashIcon size={15} />
							</button>
						)}
					</div>
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
					{tabs.flatMap((t) =>
						t.show
							? [
									<button
										key={t.key}
										type="button"
										onClick={() => setTab(t.key)}
										className={classNames(
											"h-8 cursor-pointer rounded-lg px-3.5 text-[12.5px] font-semibold",
											tab === t.key
												? "bg-[#eef0ff] text-[#4f46e5]"
												: "bg-transparent text-[#6b7280] hover:text-[#1a1d21]",
										)}
									>
										{t.label}
									</button>,
								]
							: [],
					)}
				</div>
				{tab === "html" && html && (
					<div className="flex items-center gap-2">
						<ViewportControls
							viewport={viewport}
							customWidth={customWidth}
							onPreset={(width) => {
								setViewport(width);
								setCustomWidth("");
							}}
							onCustom={setCustomWidth}
							onCustomWidth={setViewport}
						/>
						<ScreenshotButton frameRef={paneFrame} filename={`${slug}.png`} />
						<button
							type="button"
							title="Fullscreen preview (Esc to exit)"
							aria-label="Fullscreen preview"
							onClick={() => setFullscreen(true)}
							className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#eaecef] bg-white text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#1a1d21]"
						>
							<ExpandIcon size={15} />
						</button>
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
							frameRef={paneFrame}
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
							{raw ?? "Loading raw source…"}
						</pre>
					</div>
				)}

				{tab === "checks" && <ChecksPanel id={message.id} />}
			</div>

			{/* fullscreen preview — the rendered email over the whole window */}
			{fullscreen && html && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Fullscreen email preview"
					className="fixed inset-0 z-50 flex flex-col bg-[#eef0f3]"
				>
					<div className="flex flex-none items-center justify-between gap-6 border-b border-[#eaecef] bg-white px-6 py-3">
						<div className="min-w-0">
							<div className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">
								{message.subject || "(no subject)"}
							</div>
							<div className="mt-0.5 truncate font-mono text-[12px] text-[#9aa1ac]">
								{message.fromFormatted || message.from} → {message.to.join(", ")}
							</div>
						</div>
						<div className="flex flex-none items-center gap-2">
							<ViewportControls
								viewport={viewport}
								customWidth={customWidth}
								onPreset={(width) => {
									setViewport(width);
									setCustomWidth("");
								}}
								onCustom={setCustomWidth}
								onCustomWidth={setViewport}
							/>
							<ScreenshotButton frameRef={fullscreenFrame} filename={`${slug}.png`} />
							<button
								type="button"
								title="Exit fullscreen (Esc)"
								aria-label="Exit fullscreen"
								onClick={() => setFullscreen(false)}
								className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#eaecef] bg-white text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#1a1d21]"
							>
								<CollapseIcon size={15} />
							</button>
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-auto">
						<EmailViewport
							html={html.data}
							width={viewport}
							title={message.subject}
							cidUrls={cidUrls}
							frameRef={fullscreenFrame}
						/>
					</div>
				</div>
			)}
		</>
	);
}

interface ViewportControlsProps {
	viewport: number | null;
	customWidth: string;
	onPreset: (width: number | null) => void;
	onCustom: (value: string) => void;
	onCustomWidth: (width: number) => void;
}

/** Desktop / Tablet / Mobile presets plus a free-form width, Mailtrap-style. */
function ViewportControls({
	viewport,
	customWidth,
	onPreset,
	onCustom,
	onCustomWidth,
}: ViewportControlsProps) {
	return (
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
						onClick={() => onPreset(v.width)}
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
				aria-label="Custom width in pixels"
				value={customWidth}
				onChange={(e) => {
					const raw = e.target.value;
					onCustom(raw);
					const n = parseInt(raw, 10);
					if (!Number.isNaN(n)) onCustomWidth(n);
				}}
				className={classNames(
					"ml-0.5 h-[26px] w-16 rounded-md border-none bg-transparent px-2 text-[12px] outline-none",
					customWidth !== ""
						? "bg-white text-[#4f46e5]"
						: "text-[#6b7280] placeholder:text-[#9aa1ac]",
				)}
			/>
		</div>
	);
}

type ShotState = "idle" | "working" | "copied" | "saved" | "error";

const SHOT_LABELS: Record<ShotState, string> = {
	idle: "Screenshot",
	working: "Capturing…",
	copied: "Copied",
	saved: "Saved",
	error: "Failed",
};

/** Captures the rendered email as a PNG — to the clipboard or to a file. */
function ScreenshotButton({
	frameRef,
	filename,
}: {
	frameRef: RefObject<HTMLIFrameElement | null>;
	filename: string;
}) {
	const [open, setOpen] = useState(false);
	const [state, setState] = useState<ShotState>("idle");
	const [error, setError] = useState("");
	const resetTimer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(resetTimer.current), []);

	const capture = async (mode: "copy" | "save") => {
		setOpen(false);
		const frame = frameRef.current;
		if (!frame) return;

		window.clearTimeout(resetTimer.current);
		setError("");
		setState("working");
		try {
			if (mode === "copy") {
				await copyEmailScreenshot(frame);
				setState("copied");
			} else {
				await downloadEmailScreenshot(frame, filename);
				setState("saved");
			}
		} catch (e) {
			setState("error");
			setError(e instanceof Error ? e.message : "The screenshot could not be taken.");
		}
		resetTimer.current = window.setTimeout(() => {
			setState("idle");
			setError("");
		}, 3000);
	};

	const busy = state === "working";

	return (
		<div className="relative">
			<button
				type="button"
				disabled={busy}
				title="Screenshot the rendered email"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className={classNames(
					"flex h-8 cursor-pointer items-center gap-[6px] rounded-lg border border-[#eaecef] bg-white px-2.5 text-[12.5px] font-medium hover:bg-[#f4f5f7]",
					state === "error" ? "text-[#dc2626]" : "text-[#374151]",
					busy && "cursor-progress opacity-70",
				)}
			>
				{busy ? (
					<SpinnerIcon size={15} className="animate-spin" />
				) : state === "copied" || state === "saved" ? (
					<CheckIcon size={15} className="text-[#059669]" />
				) : (
					<CameraIcon size={15} />
				)}
				{SHOT_LABELS[state]}
			</button>

			{open && (
				<>
					{/* Click-away target; a button so it stays keyboard-reachable. */}
					<button
						type="button"
						aria-label="Close screenshot menu"
						onClick={() => setOpen(false)}
						className="fixed inset-0 z-40 cursor-default"
					/>
					<div
						role="menu"
						className="absolute right-0 top-[calc(100%+6px)] z-50 w-[188px] overflow-hidden rounded-[10px] border border-[#eaecef] bg-white py-1 shadow-lg"
					>
						<MenuItem icon={<CopyIcon size={14} />} onClick={() => capture("copy")}>
							Copy image
						</MenuItem>
						<MenuItem icon={<DownloadIcon size={14} />} onClick={() => capture("save")}>
							Save as PNG
						</MenuItem>
					</div>
				</>
			)}

			{error && (
				<div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] leading-[1.45] text-[#b91c1c] shadow-sm">
					{error}
				</div>
			)}
		</div>
	);
}

function MenuItem({
	icon,
	onClick,
	children,
}: {
	icon: React.ReactNode;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			onClick={onClick}
			className="flex w-full cursor-pointer items-center gap-2 px-3 py-[7px] text-left text-[13px] text-[#374151] hover:bg-[#f4f5f7]"
		>
			<span className="text-[#9aa1ac]">{icon}</span>
			{children}
		</button>
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
