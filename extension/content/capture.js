// Injected into the page to turn what's on screen into a self-contained
// article.html. This is the only context with a DOM, so everything DOM-shaped —
// Readability, sanitizing, URL rewriting — happens here; the service worker just
// packs the strings this returns. (An MV3 worker has no DOMParser, so there is no
// second chance to touch markup after this file is done with it.)
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
	 * @param {'drop' | 'inline'} imageMode
	 * @returns {{ images: { name: string, url: string }[], droppedImages: number }}
	 */
	function sanitize(root, base, imageMode) {
		/** @type {{ name: string, url: string }[]} */
		const images = [];
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

				if (imageMode === 'inline' && absolute) {
					// The extension only ever re-encodes to WebP, so the name is fixed
					// here and the worker fills in the bytes. Keeping images as sibling
					// archive entries (rather than data: URIs) means the preview
					// sandbox's service worker serves them like any other project file.
					const name = `assets/img-${images.length}.webp`;
					images.push({ name, url: absolute });
					replaceAttrs(el, { src: name, alt });
					continue;
				}

				// Dropped: keep the alt text, which is often the only description of
				// a chart or diagram the article depends on.
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

		return { images, droppedImages };
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

	/**
	 * Extract the page. `mode: 'article'` runs Readability; `mode: 'full'` falls
	 * back to the whole body, for pages Readability can't find an article in.
	 * @param {{ mode?: 'article' | 'full', images?: 'drop' | 'inline' }} [options]
	 * @returns {Capture}
	 */
	function capture(options = {}) {
		const { mode = 'article', images: imageMode = 'drop' } = options;
		const base = document.baseURI || location.href;
		const readerable = LinkifyReadability.isProbablyReaderable(document);

		let title = document.title;
		let byline = '';
		let siteName = '';
		let excerpt = '';
		let lang = document.documentElement.lang || '';
		let textLength = 0;
		/** @type {string} */
		let contentHtml;

		if (mode === 'article') {
			// Readability rewrites the document it is given, so it never sees the
			// real one — a mutated live DOM would visibly break the page under the
			// user.
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

			contentHtml = article.content;
			title = article.title || title;
			byline = article.byline || '';
			siteName = article.siteName || '';
			excerpt = article.excerpt || '';
			lang = article.lang || lang;
			textLength = article.length ?? 0;
		} else {
			contentHtml = document.body.innerHTML;
			textLength = document.body.textContent?.length ?? 0;
		}

		// Parse into a detached document rather than assigning to a live element:
		// nothing here should fetch a subresource or run, and a fresh DOMParser
		// document is inert.
		const holder = new DOMParser().parseFromString(
			`<div id="linkify-root">${contentHtml}</div>`,
			'text/html',
		);
		const root = holder.getElementById('linkify-root');
		if (!root) throw new Error('Failed to parse the extracted content');

		const { images, droppedImages } = sanitize(root, base, imageMode);

		const html = buildDocument({
			title,
			byline,
			siteName,
			lang,
			url: location.href,
			body: root.innerHTML,
		});

		return {
			html,
			title,
			byline,
			siteName,
			excerpt,
			textLength,
			readerable,
			mode,
			images,
			droppedImages,
		};
	}

	// The worker calls this in a second executeScript once the files are in place.
	globalThis.__linkifyInkCapture = capture;
})();
