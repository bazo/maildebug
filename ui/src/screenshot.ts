/**
 * Rasterizes the rendered email preview to a PNG.
 *
 * The preview lives in a sandboxed iframe, and canvas has no "draw this DOM"
 * primitive — the only way to rasterize markup is to hand the browser an SVG
 * whose <foreignObject> contains the markup, then draw that SVG into a canvas.
 * Two consequences drive everything below:
 *
 *  1. The SVG image is loaded from a data: URL, so it can't reference anything
 *     external: every stylesheet is gone and every image/background URL has to
 *     be inlined as a data: URL first (a remote URL would also taint the canvas
 *     and make toBlob throw).
 *  2. Media queries inside a foreignObject resolve against the *browser*
 *     viewport, not the chosen preview width — so replaying the email's own
 *     <style> would render the desktop layout even in the Mobile preview.
 *     Instead the email's stylesheets are dropped and each element carries the
 *     computed style the live iframe already resolved at the selected width.
 *
 * Fidelity limits worth knowing: pseudo-elements (::before/::after) and remote
 * webfonts are not reproduced, and images the sender's host serves without CORS
 * headers are dropped rather than drawn.
 */

const XHTML = "http://www.w3.org/1999/xhtml";

// Nothing here contributes pixels once styles are inlined; <style>/<link> are
// actively harmful (see the media-query note above).
const SKIPPED_TAGS = new Set([
	"script",
	"style",
	"link",
	"meta",
	"title",
	"noscript",
	"base",
	"iframe",
	"frame",
	"object",
	"embed",
	"template",
	"map",
]);

// Attributes that would re-introduce an external fetch or a stylesheet hook.
const SKIPPED_ATTRS = new Set(["style", "class", "id", "srcset", "sizes", "loading", "ping"]);

// Computed properties whose value may carry url(); anything else containing a
// url() is dropped rather than inlined.
const URL_PROPS = new Set([
	"background-image",
	"border-image-source",
	"list-style-image",
	"mask-image",
	"-webkit-mask-image",
]);

const FETCH_TIMEOUT_MS = 8000;
// Chrome/Safari refuse canvases beyond ~16k px on a side; long newsletters can
// exceed that once multiplied by devicePixelRatio, so the scale is clamped.
const MAX_CANVAS_PX = 16000;

type UrlCache = Map<string, Promise<string>>;

/** Renders the iframe's current document to a PNG blob. */
export async function captureEmail(iframe: HTMLIFrameElement): Promise<Blob> {
	const win = iframe.contentWindow;
	const doc = iframe.contentDocument;
	if (!win || !doc?.body) throw new Error("The preview is not ready yet.");

	const width = Math.max(doc.documentElement.clientWidth || iframe.clientWidth, 1);
	const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);

	// Kick every <img> fetch off in parallel before walking the tree; the walk
	// awaits the same cached promises instead of fetching one at a time.
	const cache: UrlCache = new Map();
	for (const img of Array.from(doc.images)) {
		const src = img.currentSrc || img.src;
		if (src) void toDataUrl(src, cache);
	}

	const root = (await cloneStyled(doc.body, win, cache)) as HTMLElement | null;
	if (!root) throw new Error("The preview is empty.");
	root.style.setProperty("width", `${width}px`);
	root.style.setProperty("margin", "0");
	root.style.setProperty("box-sizing", "border-box");

	const xml = new XMLSerializer().serializeToString(root);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
		`<foreignObject x="0" y="0" width="${width}" height="${height}">${xml}</foreignObject></svg>`;

	const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

	let scale = Math.min(window.devicePixelRatio || 1, 2);
	scale = Math.min(scale, MAX_CANVAS_PX / width, MAX_CANVAS_PX / height);
	scale = Math.max(scale, 0.1);

	const canvas = document.createElement("canvas");
	canvas.width = Math.round(width * scale);
	canvas.height = Math.round(height * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas is unavailable in this browser.");
	ctx.scale(scale, scale);
	// Emails assume a white page; the body background may well be transparent.
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, width, height);
	ctx.drawImage(image, 0, 0, width, height);

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
	if (!blob) throw new Error("Rendering the screenshot failed.");
	return blob;
}

/** Copies a PNG of the preview to the clipboard. */
export async function copyEmailScreenshot(iframe: HTMLIFrameElement): Promise<void> {
	if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
		throw new Error("This browser can't copy images to the clipboard — save the PNG instead.");
	}
	const blob = await captureEmail(iframe);
	await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Downloads a PNG of the preview as `filename`. */
export async function downloadEmailScreenshot(
	iframe: HTMLIFrameElement,
	filename: string,
): Promise<void> {
	const blob = await captureEmail(iframe);
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	// Revoking synchronously can race the download in Safari.
	window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Deep-clones `source` into the host document, replacing every stylesheet with
 * the already-resolved computed style of each element and inlining resources.
 * Returns null for nodes that contribute nothing (skipped tags, display:none).
 */
async function cloneStyled(source: Node, win: Window, cache: UrlCache): Promise<Node | null> {
	if (source.nodeType === Node.TEXT_NODE) {
		return document.createTextNode(source.nodeValue ?? "");
	}
	if (source.nodeType !== Node.ELEMENT_NODE) return null;

	const element = source as Element;
	const tag = element.tagName.toLowerCase();
	if (SKIPPED_TAGS.has(tag)) return null;

	const computed = win.getComputedStyle(element);
	if (computed.display === "none") return null;

	// <body> can't be nested inside the foreignObject wrapper; it carries no
	// styling of its own that the copied computed style doesn't already hold.
	const clone = document.createElementNS(XHTML, tag === "body" ? "div" : tag);

	for (const attr of Array.from(element.attributes)) {
		if (SKIPPED_ATTRS.has(attr.name) || attr.name.startsWith("on")) continue;
		try {
			clone.setAttribute(attr.name, attr.value);
		} catch {
			/* attribute name invalid in XML — drop it */
		}
	}

	if (tag === "img") {
		const img = element as HTMLImageElement;
		const data = await toDataUrl(img.currentSrc || img.src, cache);
		// Leaving a remote src would taint the canvas; better a missing image.
		if (data) clone.setAttribute("src", data);
		else clone.removeAttribute("src");
	}

	clone.setAttribute("style", await inlineStyle(computed, tag, cache));

	const children = await Promise.all(
		Array.from(element.childNodes).map((child) => cloneStyled(child, win, cache)),
	);
	for (const child of children) {
		if (child) clone.appendChild(child);
	}

	return clone;
}

/**
 * Serializes a computed style, skipping every property the browser would
 * compute the same way from its own UA stylesheet. Without that diff a single
 * declaration block runs ~350 properties per element and a long email blows
 * past what a data: URL can carry.
 */
async function inlineStyle(
	computed: CSSStyleDeclaration,
	tag: string,
	cache: UrlCache,
): Promise<string> {
	const defaults = defaultStyle(tag);
	const declarations: string[] = [];

	for (let i = 0; i < computed.length; i++) {
		const prop = computed[i];
		let value = computed.getPropertyValue(prop);
		if (!value || value === defaults[prop]) continue;
		if (value.includes("url(")) {
			if (!URL_PROPS.has(prop)) continue;
			value = await inlineCssUrls(value, cache);
		}
		declarations.push(`${prop}:${value}`);
	}

	return declarations.join(";");
}

/** Replaces every url() in a computed value with a data: URL. */
async function inlineCssUrls(value: string, cache: UrlCache): Promise<string> {
	const matches = Array.from(value.matchAll(/url\((['"]?)([^'")]+)\1\)/g)).filter(
		(match) => !match[2].trim().startsWith("data:"),
	);
	const inlined = await Promise.all(matches.map((match) => toDataUrl(match[2].trim(), cache)));

	let out = value;
	matches.forEach((match, index) => {
		const data = inlined[index];
		// split/join: replace() would interpret $ sequences inside the data URL.
		out = out.split(match[0]).join(data ? `url("${data}")` : "none");
	});
	return out;
}

let defaultsFrame: HTMLIFrameElement | null = null;
const defaultsCache = new Map<string, Record<string, string>>();

/** UA-default computed style for `tag`, measured in a blank offscreen frame. */
function defaultStyle(tag: string): Record<string, string> {
	const cached = defaultsCache.get(tag);
	if (cached) return cached;

	if (!defaultsFrame) {
		defaultsFrame = document.createElement("iframe");
		defaultsFrame.setAttribute("aria-hidden", "true");
		defaultsFrame.style.cssText =
			"position:fixed;top:0;left:-9999px;width:0;height:0;border:0;visibility:hidden";
		document.body.appendChild(defaultsFrame);
	}

	const doc = defaultsFrame.contentDocument;
	const win = defaultsFrame.contentWindow;
	const map: Record<string, string> = {};
	if (doc?.body && win) {
		const probe = doc.createElement(tag);
		doc.body.appendChild(probe);
		const computed = win.getComputedStyle(probe);
		for (let i = 0; i < computed.length; i++) {
			map[computed[i]] = computed.getPropertyValue(computed[i]);
		}
		probe.remove();
	}

	defaultsCache.set(tag, map);
	return map;
}

/** Fetches `url` and returns it as a data: URL, or "" when it can't be read. */
function toDataUrl(url: string, cache: UrlCache): Promise<string> {
	if (!url) return Promise.resolve("");
	if (url.startsWith("data:")) return Promise.resolve(url);

	const hit = cache.get(url);
	if (hit) return hit;

	const pending = (async () => {
		const controller = new AbortController();
		const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(url, {
				mode: "cors",
				credentials: "omit",
				signal: controller.signal,
			});
			if (!response.ok) return "";
			return await blobToDataUrl(await response.blob());
		} catch {
			// Cross-origin images without CORS headers land here; the screenshot
			// simply omits them rather than failing outright.
			return "";
		} finally {
			window.clearTimeout(timer);
		}
	})();

	cache.set(url, pending);
	return pending;
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
		reader.onerror = () => resolve("");
		reader.readAsDataURL(blob);
	});
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("The preview could not be rasterized."));
		image.src = src;
	});
}
