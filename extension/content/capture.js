// Injected into the page to turn what's on screen into article.html. This is the
// only context with a DOM, so everything DOM-shaped — Readability, sanitizing,
// URL rewriting — happens here; the service worker just packs the strings this
// returns. (An MV3 worker has no DOMParser, so there is no second chance to touch
// markup after this file is done with it.)
//
// The two modes are deliberately opposites, and the split is the whole design:
//
//   article — Readability picks the content out, then sanitize() strips it to an
//             allowlist and rebuilds it around READER_CSS. Curated and small.
//   full    — a snapshot. Scripts, styles, iframes, ads, inline handlers, the lot.
//             Nothing is filtered, because the moment full mode starts deciding
//             what is content and what is clutter it has become a bad ad blocker
//             and duplicated article mode badly. A reader who wants less runs
//             their own blocker and captures what survives; a reader who wants
//             the curated version already has article mode.
//
// Full mode still rewrites URLs and recovers stylesheets, but that is fidelity,
// not filtering: without it a capture points at dead relative paths and renders
// unstyled. Script *execution* is a preview-time concern, not a capture-time one —
// the extension tags its links `nojs: 1` and the sandbox declines to run them.
//
// A classic script, not a module: chrome.scripting.executeScript injects classic
// scripts, so this reads Readability off the `LinkifyReadability` global that
// vendor/vendor.readability.bundle.js — injected immediately before it — defines.
// Everything lives inside an IIFE and the entry point is hung on globalThis, so
// re-injecting into an already-captured tab silently replaces it instead of
// throwing on redeclared top-level bindings.

(() => {
	/**
	 * @typedef {{
	 *   html: string,
	 *   title: string,
	 *   byline: string,
	 *   siteName: string,
	 *   excerpt: string,
	 *   textLength: number,
	 *   readerable: boolean,
	 *   mode: 'article' | 'full',
	 *   images: { name: string, url: string }[],
	 *   linkedImages: number,
	 *   droppedImages: number,
	 * }} Capture
	 */

	// Elements dropped wholesale, subtree and all. Scripts and styles are the
	// security-relevant ones; the rest are either unrenderable once detached from
	// the origin (form, iframe, object) or pure weight (noscript's duplicate
	// markup, inline svg icon sprites). The capture is previewed in an iframe the
	// site grants allow-scripts, so stripping script here is defence in depth on
	// top of the sandbox origin, not instead of it.
	const DROP_TAGS = new Set([
		'script', 'style', 'link', 'meta', 'base', 'noscript', 'template',
		'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
		'form', 'input', 'select', 'textarea', 'button', 'label',
		'svg', 'canvas', 'audio', 'video', 'source', 'track', 'map', 'area',
		'dialog', 'menu', 'slot',
	]);

	// Everything else is removed. An allowlist rather than a denylist because the
	// interesting attacks are the attributes nobody thought of, and because page
	// markup carries a lot of dead weight (data-*, aria-*, tracking ids, inline
	// style) that costs URL length for nothing. `style` is deliberately absent:
	// inline styles are frequently the single largest thing Readability hands back.
	const KEEP_ATTRS = new Set([
		'href', 'src', 'alt', 'title', 'id', 'lang', 'dir',
		'colspan', 'rowspan', 'span', 'start', 'reversed', 'value',
		'datetime', 'cite', 'width', 'height',
	]);

	// Tags that carry no meaning once emptied — dropping an image shouldn't leave
	// a stray figure behind.
	const PRUNE_IF_EMPTY = new Set(['figure', 'picture', 'figcaption', 'p', 'div', 'span', 'li']);

	/** @param {string} s @returns {string} */
	function escapeHtml(s) {
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	/**
	 * Resolve a possibly-relative URL against the page. Fragment-only links are
	 * left alone so in-document anchors (footnotes, "back to top") keep working
	 * inside the captured file rather than pointing back at the live page.
	 * @param {string} url
	 * @param {string} base
	 * @returns {string | null} absolute URL, the original fragment, or null if unusable
	 */
	function absolutize(url, base) {
		const trimmed = url.trim();
		if (!trimmed) return null;
		if (trimmed.startsWith('#')) return trimmed;
		try {
			const resolved = new URL(trimmed, base);
			// Only schemes that are safe to hand a reader. javascript:, data: and
			// blob: are all either dangerous or dead outside the original page.
			if (!['http:', 'https:', 'mailto:'].includes(resolved.protocol)) return null;
			return resolved.href;
		} catch {
			return null;
		}
	}

	/**
	 * Strip a parsed fragment down to safe, compact markup, in place.
	 * @param {Element} root
	 * @param {string} base page URL, for resolving relative links
	 * @param {'link' | 'inline'} imageMode
	 * @returns {{ images: { name: string, url: string }[], linkedImages: number, droppedImages: number }}
	 */
	function sanitize(root, base, imageMode) {
		/** @type {{ name: string, url: string }[]} */
		const images = [];
		let linkedImages = 0;
		let droppedImages = 0;

		// Snapshot first: the walk mutates the tree, and a live collection would
		// skip nodes as siblings shift under it.
		for (const el of Array.from(root.querySelectorAll('*'))) {
			// Already removed as part of an ancestor's subtree.
			if (!el.isConnected && !root.contains(el)) continue;

			const tag = el.tagName.toLowerCase();

			if (DROP_TAGS.has(tag)) {
				el.remove();
				continue;
			}

			if (tag === 'img') {
				const src = el.getAttribute('src') ?? el.getAttribute('data-src') ?? '';
				const alt = el.getAttribute('alt')?.trim() ?? '';
				const absolute = absolutize(src, base);

				// No usable source at all: a lazy-loading placeholder, or a data:/blob:
				// URI absolutize refuses. Keep the alt text, which is often the only
				// description of a chart or diagram the article depends on.
				if (!absolute) {
					droppedImages++;
					if (alt) {
						const note = el.ownerDocument.createElement('p');
						note.className = 'img-alt';
						note.textContent = alt;
						el.replaceWith(note);
					} else {
						el.remove();
					}
					continue;
				}

				if (imageMode === 'inline') {
					// The extension only ever re-encodes to WebP, so the name is fixed
					// here and the worker fills in the bytes. Keeping images as sibling
					// archive entries (rather than data: URIs) means the preview
					// sandbox's service worker serves them like any other project file.
					const name = `assets/img-${images.length}.webp`;
					images.push({ name, url: absolute });
					replaceAttrs(el, { src: name, alt });
					continue;
				}

				// Default: keep pointing at the original host. An absolute URL costs a
				// hundred-odd characters against a link budget an embedded image would
				// spend tens of thousands on, and the reader still sees the article as
				// written. The trade is that the capture is no longer self-contained —
				// it needs the network, and it rots when the host moves the file.
				linkedImages++;
				replaceAttrs(el, { src: absolute, alt });
				continue;
			}

			if (tag === 'a') {
				const href = absolutize(el.getAttribute('href') ?? '', base);
				if (!href) {
					// A link that goes nowhere useful is still worth reading as text.
					el.replaceWith(...Array.from(el.childNodes));
					continue;
				}
				replaceAttrs(el, {
					href,
					title: el.getAttribute('title') ?? '',
					// Kept because footnote markup routinely hangs the anchor target
					// off the link itself; without it the "back to text" links in a
					// captured article dead-end.
					id: el.getAttribute('id') ?? '',
				});
				if (!href.startsWith('#')) {
					// The capture is read inside a preview iframe; without this a click
					// navigates the frame away from the article.
					el.setAttribute('target', '_blank');
					el.setAttribute('rel', 'noopener noreferrer');
				}
				continue;
			}

			for (const attr of Array.from(el.attributes)) {
				if (!KEEP_ATTRS.has(attr.name.toLowerCase())) el.removeAttribute(attr.name);
			}
		}

		// Second pass: containers left empty by the first one (a figure whose only
		// child was an image with no alt text).
		for (const el of Array.from(root.querySelectorAll('*')).reverse()) {
			const tag = el.tagName.toLowerCase();
			if (!PRUNE_IF_EMPTY.has(tag)) continue;
			if (el.children.length === 0 && !el.textContent?.trim()) el.remove();
		}

		return { images, linkedImages, droppedImages };
	}

	/**
	 * Reset an element's attributes to exactly the given set, skipping empties.
	 * @param {Element} el
	 * @param {Record<string, string>} attrs
	 */
	function replaceAttrs(el, attrs) {
		for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
		for (const [name, value] of Object.entries(attrs)) {
			if (value) el.setAttribute(name, value);
		}
	}

	// Inline stylesheet for the captured document. Kept deliberately small — every
	// byte here is spent on every link — and neutral, since the capture is read in
	// a preview iframe with no control over the surrounding theme. `color-scheme`
	// plus `light-dark()` means it follows the reader's preference for free.
	const READER_CSS = `
:root{color-scheme:light dark;--fg:light-dark(#1a1a1a,#e8e8e8);--muted:light-dark(#666,#999);--bg:light-dark(#fdfdfd,#1a1a1a);--rule:light-dark(#e0e0e0,#333);--link:light-dark(#2563eb,#60a5fa)}
html{background:var(--bg)}
body{margin:0 auto;padding:2.5rem 1.25rem 4rem;max-width:38rem;font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--fg);overflow-wrap:break-word}
h1{font-size:1.75rem;line-height:1.25;margin:0 0 .5rem}
h2,h3,h4{line-height:1.3;margin:2rem 0 .5rem}
p,ul,ol,blockquote,pre,table{margin:0 0 1.1rem}
a{color:var(--link)}
.source{margin:0 0 2rem;padding:0 0 1.25rem;border-bottom:1px solid var(--rule);color:var(--muted);font-size:.85rem}
.source a{color:inherit}
.img-alt{color:var(--muted);font-size:.9rem;font-style:italic}
blockquote{padding-left:1rem;border-left:3px solid var(--rule);color:var(--muted)}
pre{padding:.75rem;overflow-x:auto;background:light-dark(#f5f5f5,#252525);border-radius:4px}
code{font:0.9em/1.5 ui-monospace,monospace}
pre code{font-size:.85em}
img{max-width:100%;height:auto}
table{width:100%;border-collapse:collapse}
td,th{padding:.4rem .6rem;border:1px solid var(--rule);text-align:left}
hr{border:0;border-top:1px solid var(--rule)}
`.trim();

	/**
	 * Assemble the final standalone document.
	 * @param {{ title: string, byline: string, siteName: string, lang: string, url: string, body: string }} parts
	 * @returns {string}
	 */
	function buildDocument({ title, byline, siteName, lang, url, body }) {
		const captured = new Date().toISOString().slice(0, 10);
		// Byline and site name are frequently the same string, or one is missing;
		// join whatever survives so the line never reads " ·  · ".
		const credits = [byline, siteName].filter(Boolean);
		const unique = credits.filter((c, i) => credits.indexOf(c) === i);
		const meta = [...unique, `captured ${captured}`].map(escapeHtml).join(' · ');

		return `<!doctype html>
<html lang="${escapeHtml(lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Images are usually still hosted by the original site, so opening a capture
     reaches out to it. One tag, once, is cheaper than a referrerpolicy per img. -->
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>${READER_CSS}</style>
</head>
<body>
<article>
<h1>${escapeHtml(title)}</h1>
<p class="source">${meta}<br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
${body}
</article>
</body>
</html>
`;
	}

	// ── Full-page mode ───────────────────────────────────────────────────────────

	/**
	 * Resolve a URL against the page, keeping anything it can't or shouldn't touch
	 * exactly as found. The permissive counterpart to `absolutize`: article mode
	 * drops what it doesn't recognize, full mode keeps it. `data:` and `blob:` are
	 * returned untouched (the first is already self-contained, the second is dead
	 * outside its page but is not ours to delete), and so is `javascript:` — whether
	 * that ever runs is the preview's decision, not the capture's.
	 * @param {string} value
	 * @param {string} base
	 * @returns {string}
	 */
	function absolutizeLoose(value, base) {
		const trimmed = value.trim();
		if (!trimmed || trimmed.startsWith('#')) return value;
		// Already carries a scheme — absolute, or one there is nothing to resolve.
		if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return value;
		try {
			return new URL(trimmed, base).href;
		} catch {
			return value;
		}
	}

	/**
	 * Rewrite each candidate in a srcset. Bails on `data:` rather than risk it: the
	 * separator is a comma and base64 payloads are full of them, so a naive split
	 * would corrupt a list it has no need to touch in the first place.
	 * @param {string} value
	 * @param {string} base
	 * @returns {string}
	 */
	function absolutizeSrcset(value, base) {
		if (value.includes('data:')) return value;
		return value
			.split(',')
			.map((part) => {
				const candidate = part.trim();
				if (!candidate) return '';
				// `url descriptor`, e.g. `hero.jpg 2x` — split on the first space only.
				const gap = candidate.indexOf(' ');
				const url = gap === -1 ? candidate : candidate.slice(0, gap);
				const descriptor = gap === -1 ? '' : candidate.slice(gap);
				return absolutizeLoose(url, base) + descriptor;
			})
			.filter(Boolean)
			.join(', ');
	}

	/**
	 * Rewrite `url(...)` and `@import` targets inside a stylesheet or a style
	 * attribute. Background images, @font-face sources and imported sheets are all
	 * relative far more often than not, and every one of them is invisible to an
	 * attribute-level pass.
	 * @param {string} css
	 * @param {string} base
	 * @returns {string}
	 */
	function absolutizeCss(css, base) {
		return css
			.replace(
				/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
				(_match, quote, url) => `url(${quote}${absolutizeLoose(url, base)}${quote})`,
			)
			.replace(
				/@import\s+(['"])([^'"]+)\1/gi,
				(_match, quote, url) => `@import ${quote}${absolutizeLoose(url, base)}${quote}`,
			);
	}

	/** Attributes whose value is a single URL. */
	const URL_ATTRS = ['src', 'href', 'poster', 'data', 'action', 'formaction', 'cite'];

	/**
	 * Absolutize every URL in the document, in place.
	 * @param {Document} doc
	 * @param {string} base
	 */
	function absolutizeAll(doc, base) {
		for (const el of Array.from(doc.querySelectorAll('*'))) {
			for (const name of URL_ATTRS) {
				const value = el.getAttribute(name);
				if (value !== null) el.setAttribute(name, absolutizeLoose(value, base));
			}
			const srcset = el.getAttribute('srcset');
			if (srcset !== null) el.setAttribute('srcset', absolutizeSrcset(srcset, base));
			const style = el.getAttribute('style');
			if (style !== null) el.setAttribute('style', absolutizeCss(style, base));
		}
		for (const style of Array.from(doc.querySelectorAll('style'))) {
			if (style.textContent) style.textContent = absolutizeCss(style.textContent, base);
		}
	}

	/**
	 * Serialize a stylesheet's rules back to text, or '' if they can't be read.
	 * Cross-origin sheets throw SecurityError on `.cssRules` unless they were served
	 * with CORS — for those the `<link>` survives in the capture and the reader
	 * fetches the sheet themselves, the same trade linked images already make.
	 * @param {CSSStyleSheet | null} sheet
	 * @returns {string}
	 */
	function readRules(sheet) {
		if (!sheet) return '';
		try {
			return Array.from(sheet.cssRules)
				.map((rule) => rule.cssText)
				.join('\n');
		} catch {
			return '';
		}
	}

	/**
	 * Recover stylesheets that exist only in the CSSOM and so are invisible to any
	 * serializer. This is the difference between a full capture that looks like the
	 * page and one that renders as unstyled text: CSS-in-JS libraries (styled-
	 * components, Emotion) insert rules via `CSSStyleSheet.insertRule` in production
	 * for speed, which leaves the `<style>` element in the DOM completely empty, and
	 * `adoptedStyleSheets` has no element at all.
	 *
	 * Everything recovered is appended as one `<style>` at the end of `<head>`
	 * rather than written back into the elements it came from. Matching sheets to
	 * their original nodes is not reliably possible once shadow roots have been
	 * serialized into the tree (they contribute `<style>` elements that
	 * `document.styleSheets` never listed), and end-of-head is where these libraries
	 * inject anyway — so the cascade order comes out close to what the page had.
	 *
	 * @param {Document} doc the parsed copy to write into
	 * @returns {number} how many sheets were recovered
	 */
	function recoverStyleSheets(doc) {
		const recovered = [];

		for (const sheet of Array.from(document.styleSheets)) {
			const owner = sheet.ownerNode;
			// Only sheets whose rules are missing from the markup. A <style> with text
			// in it, or a <link>, already survives serialization on its own.
			if (!(owner instanceof Element) || owner.tagName.toLowerCase() !== 'style') continue;
			if (owner.textContent?.trim()) continue;
			const css = readRules(sheet);
			if (css) recovered.push(css);
		}

		// Constructed sheets, which have no DOM node whatsoever.
		for (const sheet of Array.from(document.adoptedStyleSheets ?? [])) {
			const css = readRules(sheet);
			if (css) recovered.push(css);
		}

		if (recovered.length === 0) return 0;

		const style = doc.createElement('style');
		style.setAttribute('data-linkify-recovered', '');
		style.textContent = recovered.join('\n');
		(doc.head ?? doc.documentElement).append(style);
		return recovered.length;
	}

	/**
	 * Point `<img>` tags at archive entries the worker will fill in, for embedding.
	 * Runs after `absolutizeAll`, so every src it sees is already absolute.
	 *
	 * `srcset` and `<picture>` sources have to go with them: they take priority over
	 * `src`, so leaving them behind means the browser quietly ignores the embedded
	 * copy and fetches from the original host anyway — an embedded capture that
	 * still needs the network is the one outcome worse than not embedding.
	 *
	 * @param {Document} doc
	 * @param {'link' | 'inline'} imageMode
	 * @returns {{ images: { name: string, url: string }[], linkedImages: number }}
	 */
	function rewriteImages(doc, imageMode) {
		/** @type {{ name: string, url: string }[]} */
		const images = [];
		let linkedImages = 0;

		for (const el of Array.from(doc.querySelectorAll('img'))) {
			const src = el.getAttribute('src') ?? '';
			// Only http(s) is fetchable by the worker. A data: URI is already carried
			// in the markup and needs nothing done to it.
			if (!/^https?:/i.test(src)) continue;

			if (imageMode !== 'inline') {
				linkedImages++;
				continue;
			}

			const name = `assets/img-${images.length}.webp`;
			images.push({ name, url: src });
			el.setAttribute('src', name);
			el.removeAttribute('srcset');
			el.removeAttribute('sizes');
			el.removeAttribute('loading');

			const picture = el.closest('picture');
			if (picture) {
				for (const source of Array.from(picture.querySelectorAll('source'))) {
					source.remove();
				}
			}
		}

		return { images, linkedImages };
	}

	/**
	 * Serialize the live document, shadow roots included.
	 *
	 * `outerHTML` drops shadow DOM silently — a page built from web components
	 * serializes as a set of empty custom-element tags. `getHTML()` writes open
	 * roots out as declarative `<template shadowrootmode>`, which survives a parse
	 * → re-serialize round trip and is rebuilt into real shadow roots by the browser
	 * that finally renders the capture, with no script involved. Closed roots are
	 * unreachable by anyone and are lost either way.
	 * @returns {string}
	 */
	function serializeLive() {
		const root = document.documentElement;
		/** @type {{ getHTML?: (options: object) => string }} */
		const serializable = root;
		if (typeof serializable.getHTML === 'function') {
			try {
				return serializable.getHTML({
					serializableShadowRoots: true,
					shadowRoots: collectShadowRoots(root),
				});
			} catch {
				// Older Chrome, or an option it doesn't recognize — fall through.
			}
		}
		return root.outerHTML;
	}

	/**
	 * Every open shadow root under `root`, depth first.
	 * @param {Element | ShadowRoot} root
	 * @returns {ShadowRoot[]}
	 */
	function collectShadowRoots(root) {
		/** @type {ShadowRoot[]} */
		const found = [];
		for (const el of Array.from(root.querySelectorAll('*'))) {
			if (!el.shadowRoot) continue;
			found.push(el.shadowRoot);
			found.push(...collectShadowRoots(el.shadowRoot));
		}
		return found;
	}

	/**
	 * Snapshot the whole page. Keeps everything; see the note at the top of the file.
	 * @param {string} base
	 * @param {'link' | 'inline'} imageMode
	 * @returns {{ html: string, images: { name: string, url: string }[], linkedImages: number }}
	 */
	function captureFull(base, imageMode) {
		// Parse the serialized page into a detached document instead of cloning the
		// live one: cloneNode drops shadow roots, and a DOMParser document is inert,
		// so none of the scripts being preserved here get a chance to run.
		const doc = new DOMParser().parseFromString(serializeLive(), 'text/html');

		// Dropped *before* rewriting: URLs are about to become absolute, and a
		// surviving <base> would then re-resolve them a second time against itself.
		for (const el of Array.from(doc.querySelectorAll('base'))) el.remove();

		recoverStyleSheets(doc);
		absolutizeAll(doc, base);
		const { images, linkedImages } = rewriteImages(doc, imageMode);

		// Opening a capture reaches out to the original host for whatever wasn't
		// embedded. The page's own referrer policy is replaced rather than added to,
		// since a later directive would otherwise override this one — the reader's
		// privacy is not the captured site's call to make.
		for (const meta of Array.from(doc.querySelectorAll('meta[name="referrer" i]'))) {
			meta.remove();
		}
		const referrer = doc.createElement('meta');
		referrer.setAttribute('name', 'referrer');
		referrer.setAttribute('content', 'no-referrer');
		doc.head?.prepend(referrer);

		return {
			html: '<!doctype html>\n' + doc.documentElement.outerHTML,
			images,
			linkedImages,
		};
	}

	// ── Entry point ──────────────────────────────────────────────────────────────

	/**
	 * Extract the page. `mode: 'article'` runs Readability and sanitizes what it
	 * returns; `mode: 'full'` snapshots the document as it stands.
	 * @param {{ mode?: 'article' | 'full', images?: 'link' | 'inline' }} [options]
	 * @returns {Capture}
	 */
	function capture(options = {}) {
		const { mode = 'article', images: imageMode = 'link' } = options;
		const base = document.baseURI || location.href;
		const readerable = LinkifyReadability.isProbablyReaderable(document);

		if (mode === 'full') {
			const { html, images, linkedImages } = captureFull(base, imageMode);
			return {
				html,
				title: document.title,
				byline: '',
				siteName: '',
				excerpt: '',
				textLength: document.body?.textContent?.length ?? 0,
				readerable,
				mode,
				images,
				linkedImages,
				// Nothing is dropped in full mode — that is the point of it.
				droppedImages: 0,
			};
		}

		// Readability rewrites the document it is given, so it never sees the real
		// one — a mutated live DOM would visibly break the page under the user.
		const article = new LinkifyReadability.Readability(
			/** @type {Document} */ (document.cloneNode(true)),
			{ keepClasses: false },
		).parse();

		if (!article?.content) {
			throw new Error(
				readerable
					? "Readability couldn't extract this page. Try capturing the full page instead."
					: "This doesn't look like an article. Try capturing the full page instead.",
			);
		}

		// Parse into a detached document rather than assigning to a live element:
		// nothing here should fetch a subresource or run, and a fresh DOMParser
		// document is inert.
		const holder = new DOMParser().parseFromString(
			`<div id="linkify-root">${article.content}</div>`,
			'text/html',
		);
		const root = holder.getElementById('linkify-root');
		if (!root) throw new Error('Failed to parse the extracted content');

		const { images, linkedImages, droppedImages } = sanitize(root, base, imageMode);

		const title = article.title || document.title;
		const html = buildDocument({
			title,
			byline: article.byline || '',
			siteName: article.siteName || '',
			lang: article.lang || document.documentElement.lang || '',
			url: location.href,
			body: root.innerHTML,
		});

		return {
			html,
			title,
			byline: article.byline || '',
			siteName: article.siteName || '',
			excerpt: article.excerpt || '',
			textLength: article.length ?? 0,
			readerable,
			mode,
			images,
			linkedImages,
			droppedImages,
		};
	}

	// The worker calls this in a second executeScript once the files are in place.
	globalThis.__linkifyInkCapture = capture;
})();
