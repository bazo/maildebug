import { sanitize } from "lettersanitizer";
import { useEffect, useMemo, useRef, useState } from "react";

interface EmailViewportProps {
	html: string;
	text?: string;
	/** Iframe width in px, or null for full-width responsive (Desktop). */
	width: number | null;
	title?: string;
	/** Content-ID → URL, for inline parts the body references as cid:<id>. */
	cidUrls?: Record<string, string>;
}

// rewriteExternalResources below bypasses lettersanitizer's own scheme check,
// so the allowlist has to be reapplied by hand. Same set the library defaults
// to for resources, plus data: for self-contained images.
const ALLOWED_RESOURCE_SCHEMES = ["http", "https", "data"];

// Minimal reset injected into the iframe document. Kept tiny so it never
// interferes with the email's own cascade or @media breakpoints.
const RESET = `html,body{margin:0;padding:0;}img{max-width:100%;}body{background:#fff;}`;

export default function EmailViewport({ html, text, width, title, cidUrls }: EmailViewportProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(400);

	// Sanitize with the same engine react-letter uses. noWrapper avoids
	// id-scoping the email's CSS, which is pointless inside an isolated iframe.
	const srcDoc = useMemo(() => {
		const body = sanitize(html, text, {
			preserveCssPriority: true,
			noWrapper: true,
			// Emails embed images as separate MIME parts referenced by
			// src="cid:<Content-ID>". No browser resolves that scheme, and
			// lettersanitizer drops any src whose scheme it doesn't allow — so
			// without this the images silently lose their src entirely. Point
			// each cid at the API route that serves the stored part.
			rewriteExternalResources: (url) => {
				const scheme = url.toLowerCase().split(":")[0];
				if (scheme === "cid") {
					return cidUrls?.[decodeURIComponent(url.slice(4))] ?? "";
				}
				return ALLOWED_RESOURCE_SCHEMES.includes(scheme) ? url : "";
			},
		});
		// <base target="_blank"> makes every link open in a new tab; the
		// sandbox below grants allow-popups so the navigation isn't blocked.
		return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>${RESET}</style></head><body>${body}</body></html>`;
	}, [html, text, cidUrls]);

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
		<div className="flex justify-center overflow-x-auto bg-[#eef0f3] p-7">
			<div
				className="overflow-hidden rounded-[12px] bg-white"
				style={{
					width: width == null ? "100%" : `${width}px`,
					maxWidth: "100%",
					flex: width == null ? "1 1 auto" : "0 0 auto",
					transition: "width .25s ease",
					boxShadow: "0 1px 3px rgba(16,24,40,.08), 0 8px 24px rgba(16,24,40,.06)",
				}}
			>
				<iframe
					ref={iframeRef}
					title={title || "Email preview"}
					srcDoc={srcDoc}
					// No allow-scripts: untrusted email must never execute JS.
					// allow-same-origin is required to read contentDocument for
					// auto-height; the sanitizer is the primary defense.
					// allow-popups lets <base target="_blank"> links open a new
					// tab; allow-popups-to-escape-sandbox so the opened page is
					// not itself sandboxed.
					sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
					referrerPolicy="no-referrer"
					style={{
						display: "block",
						width: "100%",
						height: `${height}px`,
						border: "none",
					}}
				/>
			</div>
		</div>
	);
}
