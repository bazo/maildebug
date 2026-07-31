import type { SVGProps } from "react";

// Lucide-style stroke icons matching the Mail Debug design. Each icon inherits
// `currentColor` and accepts the usual SVG props (size, className, etc.).
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			{children}
		</svg>
	);
}

export const MailIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="2" y="4" width="20" height="16" rx="2" />
		<path d="m2 7 10 6 10-6" />
	</Icon>
);

export const RefreshIcon = (p: IconProps) => (
	<Icon strokeWidth={2.1} {...p}>
		<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
		<path d="M21 3v5h-5" />
		<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
		<path d="M8 16H3v5" />
	</Icon>
);

export const TrashIcon = (p: IconProps) => (
	<Icon strokeWidth={2.1} {...p}>
		<path d="M3 6h18" />
		<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
	</Icon>
);

export const SearchIcon = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="11" cy="11" r="8" />
		<path d="m21 21-4.3-4.3" />
	</Icon>
);

export const CloseIcon = (p: IconProps) => (
	<Icon strokeWidth={2.2} {...p}>
		<path d="M18 6 6 18M6 6l12 12" />
	</Icon>
);

export const DownloadIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<path d="M7 10l5 5 5-5" />
		<path d="M12 15V3" />
	</Icon>
);

export const DesktopIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="2" y="3" width="20" height="14" rx="2" />
		<path d="M8 21h8M12 17v4" />
	</Icon>
);

export const TabletIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="4" y="2" width="16" height="20" rx="2" />
		<path d="M11 18h2" />
	</Icon>
);

export const MobileIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="6" y="2" width="12" height="20" rx="2" />
		<path d="M11 18h2" />
	</Icon>
);

export const CopyIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="9" y="9" width="13" height="13" rx="2" />
		<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
	</Icon>
);

export const CheckIcon = (p: IconProps) => (
	<Icon strokeWidth={2.4} {...p}>
		<path d="M20 6 9 17l-5-5" />
	</Icon>
);

export const PaperclipIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
	</Icon>
);

export const SettingsIcon = (p: IconProps) => (
	<Icon strokeWidth={1.9} {...p}>
		<circle cx="12" cy="12" r="3" />
		<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
	</Icon>
);

export const CameraIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
		<circle cx="12" cy="13" r="3.5" />
	</Icon>
);

export const ExpandIcon = (p: IconProps) => (
	<Icon strokeWidth={2.1} {...p}>
		<path d="M15 3h6v6" />
		<path d="M9 21H3v-6" />
		<path d="M21 3l-7 7" />
		<path d="M3 21l7-7" />
	</Icon>
);

export const CollapseIcon = (p: IconProps) => (
	<Icon strokeWidth={2.1} {...p}>
		<path d="M20 10h-6V4" />
		<path d="M4 14h6v6" />
		<path d="M21 3l-7 7" />
		<path d="M3 21l7-7" />
	</Icon>
);

export const SpinnerIcon = (p: IconProps) => (
	<Icon strokeWidth={2.2} {...p}>
		<path d="M12 3a9 9 0 1 0 9 9" />
	</Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="m15 18-6-6 6-6" />
	</Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="m9 18 6-6-6-6" />
	</Icon>
);
