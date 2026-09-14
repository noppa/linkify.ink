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

// Embedded images are re-encoded, not capped. They're already compressed, so
// zstd gains nothing and every byte costs ~1.33 characters of URL — but how long
// a link may get is the user's call, not this extension's. The popup shows the
// character count and the site handles a truncated link on the way back in.
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
 * Point one `<img>` back at its original URL, undoing capture.js's rewrite for an
 * image that couldn't be fetched or re-encoded. The reader still gets the image
 * as long as the host serves it — the same place it would have come from had
 * embedding never been asked for.
 *
 * String surgery rather than a DOM edit because a service worker has no
 * DOMParser — by the time an image turns out to be unfetchable, the markup is
 * already a string and the page may be gone. It is safe here only because the
 * value being matched is one this extension minted itself: capture.js assigns
 * `assets/img-N.webp` through the DOM serializer, so it carries no quote to break
 * out of the attribute and the index makes it unique within the capture.
 *
 * The whole attribute is matched rather than the `<img src="…"` prefix article
 * mode used to guarantee: full mode writes an image's generated class and style
 * before its `src`. Anchoring on the tag there would match nothing and leave the
 * markup pointing at an archive entry that was never written.
 *
 * @param {string} html
 * @param {string} name the image's archive path, e.g. `assets/img-3.webp`
 * @param {string} url the original absolute URL to restore
 * @returns {string}
 */
function relinkImage(html, name, url) {
	const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`src="${escapedName}"`, 'g');
	// The URL came from `new URL(...).href`, so it carries no raw `"` to break
	// out of the attribute; `&` still has to be entity-encoded to stay valid HTML.
	const escaped = url.replace(/&/g, '&amp;');
	return html.replace(pattern, `src="${escaped}"`);
}

/**
 * Turn the capture's image references into real archive entries, leaving the ones
 * that fail pointed at their original host.
 * @param {Capture} capture
 * @returns {Promise<{
 *   html: string,
 *   files: { name: string, data: Uint8Array<ArrayBuffer> }[],
 *   inlined: number,
 *   relinked: number,
 * }>}
 */
async function inlineImages(capture) {
	let html = capture.html;
	/** @type {{ name: string, data: Uint8Array<ArrayBuffer> }[]} */
	const files = [];
	let relinked = 0;

	// Parallel: nothing here depends on what the previous image weighed, and an
	// article's worth of images against a slow host is otherwise a long wait with
	// the popup sitting on "Capturing…".
	const results = await Promise.all(
		capture.images.map(async (image) => {
			try {
				return await fetchImageAsWebp(image.url);
			} catch (e) {
				console.warn('[linkify.ink] image failed', image.url, e);
				return null;
			}
		}),
	);

	for (const [i, image] of capture.images.entries()) {
		const data = results[i];
		if (!data) {
			html = relinkImage(html, image.name, image.url);
			relinked++;
			continue;
		}
		files.push({ name: image.name, data });
	}

	return { html, files, inlined: files.length, relinked };
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
		images: hasImagePermission ? 'inline' : 'link',
	});

	const { html, files: imageFiles, inlined, relinked } = capture.images.length
		? await inlineImages(capture)
		: { html: capture.html, files: [], inlined: 0, relinked: 0 };

	/** @type {{ name: string, data: Uint8Array<ArrayBuffer> }[]} */
	const files = [
		{ name: 'article.html', data: new TextEncoder().encode(html) },
		...imageFiles,
	];

	const { url, chars } = await buildLink(files, {
		encryption: options.encryption,
		password: options.password,
		// Metadata is stored *uncompressed* in the payload, so only fields that
		// earn their bytes go in. `preview` names the file to show; `nojs: 1` asks
		// the preview not to run scripts.
		//
		// Neither mode ships a script any more — article mode strips them, full
		// mode rebuilds the page from computed styles and never copies them — so
		// the flag is eight bytes of belt-and-braces: the preview's default stays
		// "off" even for a capture that somehow carried one, and it does not depend
		// on which mode produced the link.
		//
		// This is a default, not a boundary: metadata is author-controlled, so a
		// hostile link can simply omit it. The isolation that actually holds is the
		// throwaway sandbox origin the preview runs on.
		metadata: { preview: 'article.html', nojs: 1 },
	});

	return {
		url,
		chars,
		title: capture.title,
		mode: capture.mode,
		readerable: capture.readerable,
		inlinedImages: inlined,
		// Images the reader will fetch from the original host: the ones capture.js
		// deliberately left alone, plus any the worker wanted to embed and couldn't.
		linkedImages: capture.linkedImages + relinked,
		// Only images with no usable source at all — a data: URI, or a lazy-loading
		// placeholder that never resolved. These are gone; the alt text is all
		// that's left of them.
		droppedImages: capture.droppedImages,
		imagesRequested: wantsImages,
		imagePermission: hasImagePermission,
		// The viewport width a full capture was laid out at; 0 for article mode.
		width: capture.width,
	};
}

/** Key for the one picker result waiting for a reopened popup. */
const ELEMENT_RESULT_KEY = 'elementPickerResult';
const ELEMENT_OPTIONS_KEY = 'elementPickerOptions';

/**
 * Turn an element selected in the page into a link. The markup is intentionally
 * not sanitized or wrapped: this feature promises the selected element's exact
 * `outerHTML`, rather than a Readability interpretation of it.
 * @param {{ html: string, title: string }} selection
 * @param {{ encryption?: 'none' | 'password', password?: string }} options
 */
async function elementToLink(selection, options) {
	const { url, chars } = await buildLink([
		{ name: 'element.html', data: new TextEncoder().encode(selection.html) },
	], {
		encryption: options.encryption,
		password: options.password,
		// The selected element can contain scripts and event handlers from the page.
		// Keep the preview inert, just as page captures are.
		metadata: { preview: 'element.html', nojs: 1 },
	});

	return {
		url,
		chars,
		title: selection.title || 'Selected element',
		mode: 'element',
		readerable: false,
		inlinedImages: 0,
		linkedImages: 0,
		droppedImages: 0,
		imagesRequested: false,
		imagePermission: false,
		width: 0,
	};
}

/**
 * Install the temporary page-side picker. It reports the click separately to
 * the service worker because the popup that started it disappears as soon as
 * the user clicks back into the tab.
 * @param {number} tabId
 */
async function startElementPicker(tabId) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			func: () => {
				// Replacing a previous picker makes the action harmless if the popup is
				// opened twice before an element is chosen.
				globalThis.__linkifyInkElementPickerCleanup?.();

				const outline = document.createElement('div');
				outline.setAttribute('aria-hidden', 'true');
				outline.style.cssText = [
					'position:fixed', 'z-index:2147483647', 'pointer-events:none',
					'border:2px solid #3b82f6', 'background:rgb(59 130 246 / 12%)',
					'box-shadow:0 0 0 1px white', 'display:none',
				].join(';');
				document.documentElement.append(outline);

				const root = document.documentElement;
				const previousCursor = root.style.getPropertyValue('cursor');
				const previousCursorPriority = root.style.getPropertyPriority('cursor');
				root.style.setProperty('cursor', 'crosshair', 'important');
				/** @type {Element | null} */
				let hovered = null;

				const show = (target) => {
					if (!(target instanceof Element)) return;
					hovered = target;
					const rect = target.getBoundingClientRect();
					outline.style.display = 'block';
					outline.style.left = `${rect.left}px`;
					outline.style.top = `${rect.top}px`;
					outline.style.width = `${rect.width}px`;
					outline.style.height = `${rect.height}px`;
				};

				const cleanup = () => {
					document.removeEventListener('pointermove', onPointerMove, true);
					document.removeEventListener('click', onClick, true);
					document.removeEventListener('keydown', onKeyDown, true);
					outline.remove();
					root.style.setProperty('cursor', previousCursor, previousCursorPriority);
					if (!previousCursor) root.style.removeProperty('cursor');
					delete globalThis.__linkifyInkElementPickerCleanup;
				};

				const onPointerMove = (event) => show(event.target);
				const onClick = (event) => {
					const selected = event.target instanceof Element ? event.target : hovered;
					if (event.button !== 0 || !selected) return;
					event.preventDefault();
					event.stopImmediatePropagation();
					const tag = selected.tagName.toLowerCase();
					const title = document.title || `<${tag}>`;
					const html = selected.outerHTML;
					cleanup();
					chrome.runtime.sendMessage({ type: 'element-picked', selection: { html, title } });
				};
				const onKeyDown = (event) => {
					if (event.key !== 'Escape') return;
					event.preventDefault();
					event.stopImmediatePropagation();
					cleanup();
					chrome.runtime.sendMessage({ type: 'element-pick-cancelled' });
				};

				globalThis.__linkifyInkElementPickerCleanup = cleanup;
				document.addEventListener('pointermove', onPointerMove, true);
				document.addEventListener('click', onClick, true);
				document.addEventListener('keydown', onKeyDown, true);
				return true;
			},
		});
	} catch (e) {
		throw new Error(`Can't read this page (${e instanceof Error ? e.message : String(e)}).`);
	}
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

	if (message?.type === 'pick-element') {
		// Keep the encryption choice in extension storage, rather than putting a
		// password into the page-side picker message. It also survives the popup
		// closing while the user returns to the page.
		chrome.storage.session.set({ [ELEMENT_OPTIONS_KEY]: message.options ?? {} })
			.then(() => chrome.tabs.query({ active: true, currentWindow: true }))
			.then(([tab]) => {
				if (!tab?.id) throw new Error('No active tab.');
				return startElementPicker(tab.id);
			})
			.then(() => sendResponse({ ok: true }))
			.catch((e) => chrome.storage.session.remove(ELEMENT_OPTIONS_KEY).then(() => {
				sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
			}));
		return true;
	}

	if (message?.type === 'element-picked') {
		chrome.storage.session.get(ELEMENT_OPTIONS_KEY)
			.then((stored) => {
				const options = stored[ELEMENT_OPTIONS_KEY] ?? {};
				return chrome.storage.session.remove(ELEMENT_OPTIONS_KEY).then(() => options);
			})
			.then((options) => elementToLink(message.selection, options))
			.then((result) => chrome.storage.session.set({ [ELEMENT_RESULT_KEY]: { result } }))
			.catch((e) => chrome.storage.session.set({
				[ELEMENT_RESULT_KEY]: { error: e instanceof Error ? e.message : String(e) },
			}));
		sendResponse({ ok: true });
		return undefined;
	}

	if (message?.type === 'element-pick-cancelled') {
		chrome.storage.session.remove(ELEMENT_OPTIONS_KEY).then(() =>
			chrome.storage.session.set({ [ELEMENT_RESULT_KEY]: { error: 'Element selection cancelled.' } }),
		);
		sendResponse({ ok: true });
		return undefined;
	}

	if (message?.type === 'take-element-result') {
		chrome.storage.session.get(ELEMENT_RESULT_KEY)
			.then((stored) => {
				const value = stored[ELEMENT_RESULT_KEY];
				return chrome.storage.session.remove(ELEMENT_RESULT_KEY).then(() => value);
			})
			.then((value) => sendResponse(value ? { ok: true, ...value } : { ok: true }))
			.catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
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
