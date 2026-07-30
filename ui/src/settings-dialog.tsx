import { useEffect, useState } from "react";

import { formatDate, formatTime } from "@/helpers";
import { CloseIcon } from "@/icons";
import { isValidLocale, LOCALE_PRESETS, SYSTEM_LOCALE, useSettings } from "@/settings";

const CUSTOM = "__custom__";

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
	const { locale, resolvedLocale, setLocale } = useSettings();

	const isPreset = locale === SYSTEM_LOCALE || LOCALE_PRESETS.some((p) => p.value === locale);
	const [custom, setCustom] = useState(isPreset ? "" : locale);
	const [showCustom, setShowCustom] = useState(!isPreset);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const handleSelect = (value: string) => {
		if (value === CUSTOM) {
			setShowCustom(true);
			if (custom && isValidLocale(custom)) setLocale(custom);
			return;
		}
		setShowCustom(false);
		setLocale(value);
	};

	const handleCustom = (value: string) => {
		setCustom(value);
		const trimmed = value.trim();
		if (trimmed && isValidLocale(trimmed)) setLocale(trimmed);
	};

	const customInvalid = showCustom && custom.trim() !== "" && !isValidLocale(custom.trim());

	// Sample instants that exercise each branch of `formatTime`.
	const now = new Date();
	const earlierThisYear = new Date(now.getFullYear(), 0, 9, 14, 5);
	const lastYear = new Date(now.getFullYear() - 1, 10, 23, 9, 30);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1d21]/35 p-6"
			onClick={onClose}
		>
			{/* Clicks inside the panel must not reach the backdrop's close handler. */}
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Settings"
				onClick={(e) => e.stopPropagation()}
				className="w-full max-w-[460px] overflow-hidden rounded-[14px] border border-[#eaecef] bg-white shadow-xl"
			>
				<div className="flex items-center justify-between border-b border-[#eef0f2] px-5 py-[14px]">
					<div className="flex flex-col leading-[1.15]">
						<span className="text-[14.5px] font-semibold tracking-[-0.01em]">
							Settings
						</span>
						<span className="mt-0.5 text-[11.5px] font-medium text-[#9aa1ac]">
							Stored in this browser
						</span>
					</div>
					<button
						type="button"
						title="Close"
						onClick={onClose}
						className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#eaecef] bg-white text-[#6b7280] transition-colors hover:bg-[#f4f5f7] hover:text-[#1a1d21]"
					>
						<CloseIcon size={15} />
					</button>
				</div>

				<div className="px-5 py-[18px]">
					<span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9aa1ac]">
						Date &amp; time
					</span>

					<label
						htmlFor="locale-select"
						className="mt-3 block text-[13px] font-semibold text-[#1a1d21]"
					>
						Locale
					</label>
					<p className="mt-1 text-[12px] leading-[1.5] text-[#9aa1ac]">
						Controls how message dates and times are formatted.
					</p>
					<select
						id="locale-select"
						value={showCustom ? CUSTOM : locale}
						onChange={(e) => handleSelect(e.target.value)}
						className="mt-2 h-[38px] w-full cursor-pointer rounded-[10px] border border-[#eaecef] bg-white px-[11px] text-[13.5px] text-[#1a1d21] outline-none focus:border-[#c7c9ff]"
					>
						<option value={SYSTEM_LOCALE}>
							System default ({navigator.language || "unknown"})
						</option>
						{LOCALE_PRESETS.map((preset) => (
							<option key={preset.value} value={preset.value}>
								{preset.label}
							</option>
						))}
						<option value={CUSTOM}>Custom…</option>
					</select>

					{showCustom && (
						<>
							<input
								value={custom}
								onChange={(e) => handleCustom(e.target.value)}
								placeholder="BCP 47 tag, e.g. en-AU"
								spellCheck={false}
								className={`mt-2 h-[38px] w-full rounded-[10px] border bg-white px-[11px] text-[13.5px] text-[#1a1d21] outline-none placeholder:text-[#9aa1ac] ${
									customInvalid
										? "border-[#fecaca] focus:border-[#fca5a5]"
										: "border-[#eaecef] focus:border-[#c7c9ff]"
								}`}
							/>
							{customInvalid && (
								<p className="mt-1.5 text-[12px] text-[#dc2626]">
									“{custom.trim()}” isn’t a locale tag this browser understands.
								</p>
							)}
						</>
					)}

					<div className="mt-4 rounded-[10px] border border-[#f0f1f3] bg-[#f9fafb] px-[13px] py-3">
						<span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9aa1ac]">
							Preview
						</span>
						<dl className="mt-2 flex flex-col gap-[7px]">
							<PreviewRow
								label="Today"
								value={formatTime(now.toISOString(), resolvedLocale)}
							/>
							<PreviewRow
								label="This year"
								value={formatTime(earlierThisYear.toISOString(), resolvedLocale)}
							/>
							<PreviewRow
								label="Older"
								value={formatTime(lastYear.toISOString(), resolvedLocale)}
							/>
							<PreviewRow
								label="Message header"
								value={formatDate(now.toISOString(), resolvedLocale)}
							/>
						</dl>
					</div>
				</div>
			</div>
		</div>
	);
}

function PreviewRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="text-[12px] text-[#9aa1ac]">{label}</dt>
			<dd className="truncate text-[12.5px] font-medium text-[#1a1d21]">{value}</dd>
		</div>
	);
}
