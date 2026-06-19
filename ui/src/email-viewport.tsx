import { sanitize } from "lettersanitizer";
import { useEffect, useMemo, useRef, useState } from "react";

interface EmailViewportProps {
	html: string;
	text?: string;
	/** Iframe width in px, or null for full-width responsive (Desktop). */
	width: number | null;
	title?: string;
}

// Minimal reset injected into the iframe document. Kept tiny so it never
// interferes with the email's own cascade or @media breakpoints.
const RESET = `html,body{margin:0;padding:0;}img{max-width:100%;}body{background:#fff;}`;

export default function EmailViewport({ html, text, width, title }: EmailViewportProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(400);

	// Sanitize with the same engine react-letter uses. noWrapper avoids
	// id-scoping the email's CSS, which is pointless inside an isolated iframe.
	const srcDoc = useMemo(() => {
		const body = sanitize(html, text, {
			preserveCssPriority: true,
			noWrapper: true,
		});
		return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${RESET}</style></head><body>${body}</body></html>`;
	}, [html, text]);

	// Auto-size the iframe to its content and keep it in sync as the email
	// reflows (e.g. when the chosen width crosses a media-query breakpoint).
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;

		let ro: ResizeObserver | undefined;

		const measure = () => {
			const doc = iframe.contentDocument;
			if (!doc?.body) return;
			setHeight(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight));
		};

		const onLoad = () => {
			measure();
			const doc = iframe.contentDocument;
			if (doc?.body && "ResizeObserver" in window) {
				ro = new ResizeObserver(measure);
				ro.observe(doc.body);
			}
		};

		iframe.addEventListener("load", onLoad);
		// srcDoc may already be loaded by the time this effect runs.
		if (iframe.contentDocument?.readyState === "complete") onLoad();

		return () => {
			iframe.removeEventListener("load", onLoad);
			ro?.disconnect();
		};
	}, [srcDoc, width]);

	return (
		<div className="flex justify-center overflow-x-auto bg-gray-100 p-4">
			<iframe
				ref={iframeRef}
				title={title || "Email preview"}
				srcDoc={srcDoc}
				// No allow-scripts: untrusted email must never execute JS.
				// allow-same-origin is required to read contentDocument for
				// auto-height; the sanitizer is the primary defense.
				sandbox="allow-same-origin"
				referrerPolicy="no-referrer"
				className="border border-gray-200 bg-white shadow-sm"
				style={{
					width: width == null ? "100%" : `${width}px`,
					flex: width == null ? "1 1 auto" : "0 0 auto",
					height: `${height}px`,
					border: "none",
				}}
			/>
		</div>
	);
}
