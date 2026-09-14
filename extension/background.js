// Background service worker — the extension's codec host.
//
// This is the only context that touches LinkifyInk. The popup is pure UI and the
// content script only knows about the DOM, so a popup that closes mid-capture
// can't kill the work, and any future entry point — context menu, keyboard
// shortcut — reuses this same path.
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
		// messages here are written to be shown to the user verbatim. The capture is
		// async (full mode yields to the page between batches of elements) and
		// executeScript settles a returned promise before reporting the result.
		func: async (opts) => {
			try {
				return { ok: /** @type {const} */ (true), capture: await globalThis.__linkifyInkCapture(opts) };
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
 * Pack files into a public link. Encryption is deliberately not an option here:
 * the editor already does it, and a capture can be opened there and re-shared
 * with a password in two clicks. One implementation of the flow is enough.
 * @param {{ name: string, data: Uint8Array<ArrayBuffer> }[]} files
 * @param {Record<string, unknown>} [metadata]
 * @returns {Promise<{ url: string, chars: number }>}
 */
async function buildLink(files, metadata) {
	const linkify = getLinkify(await getOrigin());
	const url = await linkify.createLink(files, { encryption: 'none', metadata });
	return { url, chars: url.length };
}

/**
 * Capture the active tab and turn it into a link.
 * @param {CaptureOptions} options
 */
async function captureToLink(options) {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id) throw new Error('No active tab.');

	const capture = await captureTab(tab.id, { mode: options.mode ?? 'article' });

	/** @type {{ name: string, data: Uint8Array<ArrayBuffer> }[]} */
	const files = [{ name: 'article.html', data: new TextEncoder().encode(capture.html) }];

	// Metadata is stored *uncompressed* in the payload, so only fields that earn
	// their bytes go in. `preview` names the file to show; `nojs: 1` asks the
	// preview not to run scripts.
	//
	// Neither mode ships a script — article mode strips them, full mode rebuilds
	// the page from computed styles and never copies them — so the flag is eight
	// bytes of belt-and-braces: the preview's default stays "off" even for a
	// capture that somehow carried one, and it does not depend on which mode
	// produced the link.
	//
	// This is a default, not a boundary: metadata is author-controlled, so a
	// hostile link can simply omit it. The isolation that actually holds is the
	// throwaway sandbox origin the preview runs on.
	const { url, chars } = await buildLink(files, { preview: 'article.html', nojs: 1 });

	return {
		url,
		chars,
		title: capture.title,
		mode: capture.mode,
		readerable: capture.readerable,
		// Images always load from the original host. Embedding was tried and
		// dropped: an image is already compressed, so every byte costs ~1.33
		// characters of URL and a single photo outweighs the whole article. A link
		// carries the page; anyone who wants a persistent archive wants a
		// different tool.
		linkedImages: capture.linkedImages,
		// Only images with no usable source at all — a data: URI, or a lazy-loading
		// placeholder that never resolved. These are gone; the alt text is all
		// that's left of them.
		droppedImages: capture.droppedImages,
		// The viewport width a full capture was laid out at; 0 for article mode.
		width: capture.width,
	};
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type === 'capture') {
		captureToLink(message.options ?? {})
			.then((result) => sendResponse({ ok: true, ...result }))
			.catch((e) => {
				console.error('[linkify.ink] capture failed', e);
				sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
			});
		return true;
	}

	return undefined;
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
