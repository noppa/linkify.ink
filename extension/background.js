// Background service worker — the extension's codec host.
//
// This is the only context that touches LinkifyInk. The popup is pure UI and the
// content script only knows about the DOM, so a popup that closes mid-generation
// (Argon2 takes ~0.5-1s at the lib's settings) can't kill the work, and any future
// entry point — context menu, keyboard shortcut — reuses this same path.
//
// linkify.ink.js is DOM-free by design, so it runs here unmodified. The one thing
// a service worker needs that a page doesn't is permission to compile WebAssembly:
// both vendored WASM loaders take a non-streaming `WebAssembly.instantiate(bytes)`
// path for the data: URLs esbuild inlines, which the manifest's
// `script-src 'self' 'wasm-unsafe-eval'` allows.

import { linkifyInkCodecDependencies } from './vendor/vendor.codec.bundle.js';
import { LinkifyInk } from './vendor/linkify.ink.js';

/** @typedef {import('./types.js').Capture} Capture */
/** @typedef {import('./types.js').CaptureOptions} CaptureOptions */

/** Where generated links point. Overridable for local development. */
const DEFAULT_ORIGIN = 'https://linkify.ink';

/** Injected in order; the bundle defines the global the capture script reads. */
const CAPTURE_FILES = [
	'vendor/vendor.readability.bundle.js',
	'content/capture.js',
];

// Total re-encoded image bytes allowed in one capture. Images are already
// compressed, so zstd gains nothing on them and every byte here costs ~1.33
// characters of URL. 48KB lands a picture-carrying capture around 64,000
// characters — past the point the site warns about, which is the honest trade for
// opting in, and the popup says so.
const IMAGE_BUDGET_BYTES = 48_000;
/** Longest edge after downscaling. Above this, article images are wasted bytes. */
const IMAGE_MAX_EDGE = 1280;
const IMAGE_WEBP_QUALITY = 0.72;
/** Per-image ceiling on how long to wait for a slow or hanging host. */
const IMAGE_FETCH_TIMEOUT_MS = 8000;

/**
 * LinkifyInk instances keyed by origin. Cached rather than constructed per
 * capture because each instance memoizes its WASM initialization internally
 * (`#initPromise`); a fresh instance would re-init zstd on every link.
 * @type {Map<string, LinkifyInk>}
 */
const instances = new Map();

/** @param {string} origin @returns {LinkifyInk} */
function getLinkify(origin) {
	let instance = instances.get(origin);
	if (!instance) {
		instance = new LinkifyInk({ ...linkifyInkCodecDependencies, origin });
		instances.set(origin, instance);
	}
	return instance;
}

/** @returns {Promise<string>} the configured link origin */
async function getOrigin() {
	const { origin } = await chrome.storage.sync.get('origin');
	return typeof origin === 'string' && origin ? origin : DEFAULT_ORIGIN;
}

/**
 * Run the capture pipeline in the page.
 *
 * Two round trips on purpose: the first puts the files in place, the second calls
 * into them with arguments. `executeScript({ files })` only hands back the last
 * statement's value, which is too implicit a contract to hang the options on.
 * Both are cheap, and re-injecting into an already-primed tab just redefines the
 * global.
 *
 * @param {number} tabId
 * @param {CaptureOptions} options
 * @returns {Promise<Capture>}
 */
async function captureTab(tabId, options) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			files: CAPTURE_FILES,
		});
	} catch (e) {
		// The usual cause is a page extensions may not touch at all: chrome://,
		// the Web Store, a PDF viewer, another extension's page.
		throw new Error(
			`Can't read this page (${e instanceof Error ? e.message : String(e)}).`,
		);
	}

	const [injection] = await chrome.scripting.executeScript({
		target: { tabId },
		// Errors are caught and returned rather than thrown: a throw inside an
		// injected function surfaces inconsistently across Chrome versions, and the
		// messages here are written to be shown to the user verbatim.
		func: (opts) => {
			try {
				return { ok: /** @type {const} */ (true), capture: globalThis.__linkifyInkCapture(opts) };
			} catch (e) {
				return {
					ok: /** @type {const} */ (false),
					error: e instanceof Error ? e.message : String(e),
				};
			}
		},
		args: [options],
	});

	const result = injection?.result;
	if (!result) throw new Error('The page returned nothing — try reloading it.');
	if (!result.ok) throw new Error(result.error);
	return result.capture;
}

/**
 * Fetch an image and re-encode it as WebP, scaled to fit IMAGE_MAX_EDGE.
 *
 * Fetching here rather than in the page is the whole reason image inlining needs
 * a host permission: a page-context fetch is bound by that page's CORS rules and
 * fails on most CDN-hosted images, while the worker (once granted `<all_urls>`)
 * is not. `createImageBitmap` and `OffscreenCanvas` both exist in a service
 * worker, so nothing has to bounce through a document.
 *
 * @param {string} url
 * @returns {Promise<Uint8Array<ArrayBuffer> | null>} null if it can't be used
 */
async function fetchImageAsWebp(url) {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
		credentials: 'omit',
	});
	if (!response.ok) return null;

	const blob = await response.blob();
	if (!blob.type.startsWith('image/')) return null;

	const bitmap = await createImageBitmap(blob);
	try {
		const scale = Math.min(
			1,
			IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
		);
		const canvas = new OffscreenCanvas(
			Math.max(1, Math.round(bitmap.width * scale)),
			Math.max(1, Math.round(bitmap.height * scale)),
		);
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const encoded = await canvas.convertToBlob({
			type: 'image/webp',
			quality: IMAGE_WEBP_QUALITY,
		});
		return new Uint8Array(await encoded.arrayBuffer());
	} finally {
		bitmap.close();
	}
}

/**
 * Remove one `<img>` from the captured HTML, keeping its alt text.
 *
 * String surgery rather than a DOM edit because a service worker has no
 * DOMParser — by the time an image turns out to be unfetchable, the markup is
 * already a string and the page may be gone. It is safe here only because the
 * tag being matched is one this extension emitted itself: capture.js writes
 * exactly `<img src="assets/img-N.webp" alt="...">` through the DOM serializer,
 * so the value can't contain a raw `>` and the src is unique per image. Do not
 * reach for this on markup from anywhere else.
 *
 * @param {string} html
 * @param {string} name the image's archive path, e.g. `assets/img-3.webp`
 * @returns {string}
 */
function removeImage(html, name) {
	const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`<img src="${escapedName}"([^>]*)>`, 'g');
	return html.replace(pattern, (_match, rest) => {
		const alt = /alt="([^"]*)"/.exec(rest)?.[1];
		return alt ? `<p class="img-alt">${alt}</p>` : '';
	});
}

/**
 * Turn the capture's image references into real archive entries, dropping the
 * ones that fail or don't fit the budget.
 * @param {Capture} capture
 * @returns {Promise<{
 *   html: string,
 *   files: { name: string, data: Uint8Array<ArrayBuffer> }[],
 *   inlined: number,
 *   dropped: number,
 * }>}
 */
async function inlineImages(capture) {
	let html = capture.html;
	/** @type {{ name: string, data: Uint8Array<ArrayBuffer> }[]} */
	const files = [];
	let remaining = IMAGE_BUDGET_BYTES;
	let dropped = 0;

	// Sequential, not parallel: the budget check only means anything if each
	// image's real encoded size is known before the next one is considered, and
	// article images are few enough that the latency doesn't matter.
	for (const image of capture.images) {
		let data = null;
		if (remaining > 0) {
			try {
				data = await fetchImageAsWebp(image.url);
			} catch (e) {
				console.warn('[linkify.ink] image failed', image.url, e);
			}
		}

		if (!data || data.length > remaining) {
			html = removeImage(html, image.name);
			dropped++;
			continue;
		}

		files.push({ name: image.name, data });
		remaining -= data.length;
	}

	return { html, files, inlined: files.length, dropped };
}

/**
 * Pack files into a shareable link.
 * @param {{ name: string, data: Uint8Array<ArrayBuffer> }[]} files
 * @param {{ encryption?: 'none' | 'password', password?: string, metadata?: Record<string, unknown> }} [options]
 * @returns {Promise<{ url: string, chars: number }>}
 */
async function buildLink(files, options = {}) {
	const linkify = getLinkify(await getOrigin());
	const url = await linkify.createLink(files, {
		encryption: options.encryption ?? 'none',
		password: options.password,
		metadata: options.metadata,
	});
	return { url, chars: url.length };
}

/**
 * Capture the active tab and turn it into a link.
 * @param {CaptureOptions & { encryption?: 'none' | 'password', password?: string }} options
 */
async function captureToLink(options) {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id) throw new Error('No active tab.');

	// Checked up front rather than discovered per image: without the host
	// permission every fetch fails on its own and the user just sees everything
	// dropped with no explanation. The popup requests it on opt-in, but it can be
	// revoked from chrome://extensions between then and now.
	const wantsImages = options.images === 'inline';
	const hasImagePermission =
		wantsImages && (await chrome.permissions.contains({ origins: ['<all_urls>'] }));

	const capture = await captureTab(tab.id, {
		mode: options.mode ?? 'article',
		images: hasImagePermission ? 'inline' : 'drop',
	});

	const { html, files: imageFiles, inlined, dropped } = capture.images.length
		? await inlineImages(capture)
		: { html: capture.html, files: [], inlined: 0, dropped: 0 };

	/** @type {{ name: string, data: Uint8Array<ArrayBuffer> }[]} */
	const files = [
		{ name: 'article.html', data: new TextEncoder().encode(html) },
		...imageFiles,
	];

	const { url, chars } = await buildLink(files, {
		encryption: options.encryption,
		password: options.password,
		// Metadata is stored *uncompressed* in the payload, so it is kept to the
		// one field that earns its bytes: which file to show. Nothing reads it
		// today — Preview.js already picks the first HTML file — but it makes the
		// intent explicit for when it does.
		metadata: { preview: 'article.html' },
	});

	return {
		url,
		chars,
		title: capture.title,
		mode: capture.mode,
		readerable: capture.readerable,
		// capture.droppedImages counts images the page never offered up (drop mode);
		// `dropped` counts ones that were wanted but couldn't be fetched or didn't
		// fit the budget. The popup reports them differently.
		droppedImages: capture.droppedImages + dropped,
		unfetchedImages: dropped,
		inlinedImages: inlined,
		imagesRequested: wantsImages,
		imagePermission: hasImagePermission,
	};
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== 'capture') return undefined;
	captureToLink(message.options ?? {})
		.then((result) => sendResponse({ ok: true, ...result }))
		.catch((e) => {
			console.error('[linkify.ink] capture failed', e);
			sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
		});
	// Keeps the message channel open for the async response above.
	return true;
});

// Exposed for the service worker console: `await __linkifySmokeTest()`. This is
// the check that the WASM-in-a-service-worker assumption actually holds — if the
// manifest's CSP is missing 'wasm-unsafe-eval' this throws rather than silently
// degrading.
globalThis.__linkifySmokeTest = async () => {
	const data = new TextEncoder().encode('<h1>hello from the service worker</h1>');
	const { url, chars } = await buildLink([{ name: 'article.html', data }]);
	const linkify = getLinkify(await getOrigin());
	const { files } = await linkify.readLink(url);
	console.log('round-trip ok:', chars, 'chars ·', files[0].name);
	return url;
};
