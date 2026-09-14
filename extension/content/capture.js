// Injected into the page to turn what's on screen into article.html. This is the
// only context with a DOM, so everything DOM-shaped — Readability, sanitizing,
// computed styles, URL rewriting — happens here; the service worker just packs
// the strings this returns. (An MV3 worker has no DOMParser, so there is no
// second chance to touch markup after this file is done with it.)
//
// The two modes are deliberately opposites, and the split is the whole design:
//
//   article — Readability picks the content out, then sanitize() strips it to an
//             allowlist and rebuilds it around READER_CSS. Curated and small.
//   full    — a snapshot of the page as rendered. Not the page's markup and
//             stylesheets — those are 120–140 KB of mostly unused CSS plus
//             cross-origin sheets a content script can't even read — but a new
//             document rebuilt from what getComputedStyle says every visible
//             element looks like. Self-contained by construction, and an order
//             of magnitude smaller. Nothing is filtered, because the moment full
//             mode starts deciding what is content and what is clutter it has
//             become a bad ad blocker and duplicated article mode badly.
//
// Neither mode ships scripts: article mode strips them, full mode never copies
// them. The extension still tags its links `nojs: 1` so the preview's default is
// the same whichever mode produced the link.
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
	 *   width: number,
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
	//
	// A full capture ships neither the page's markup nor its stylesheets. It walks
	// the DOM, asks the browser what it decided for every element via
	// getComputedStyle, and rebuilds a new document from those answers. Nothing
	// external is referenced, nothing unused ships, and the result is styled by
	// construction rather than by hoping the original CSS survives the trip.
	//
	// The whole thing rests on one trick. A raw getComputedStyle dump is ~400
	// declarations per element, which for a 1000-element page is megabytes of CSS.
	// Almost all of it is noise, for exactly two reasons: the value is what the
	// element would have had anyway with no author CSS (the UA default), or it is an
	// inherited property whose value is already the parent's. So the capture diffs:
	// non-inherited properties against a per-tag baseline measured in a hidden
	// iframe, inherited properties against the parent's computed value. Measured on
	// the demo corpus (demo/scrape-compress/), that takes ~400 declarations per
	// element down to ~19, and a full-page link from ~38,000 characters to
	// 3,500–6,500.
	//
	// For the diff to be sound, the output document has to sit on the same
	// foundation the baseline was measured against. That is RESET below: it is
	// applied to the baseline iframe and emitted as the first rule of the generated
	// stylesheet, so "differs from the baseline" means exactly "load-bearing in the
	// output".
	//
	// What this cannot do, by construction: `@media`, `:hover`, `@keyframes` and
	// `display:none` subtrees are not part of a computed style, so only the state
	// the page was in at capture time survives, laid out at the width it was
	// captured at. The document declares that width in its viewport meta and a
	// phone scales it to fit — a static snapshot, which is what a page-to-link
	// capture is anyway.

	/**
	 * Resolve a URL against the page, keeping anything it can't or shouldn't touch
	 * exactly as found. The permissive counterpart to `absolutize`: article mode
	 * drops what it doesn't recognize, full mode keeps it. `data:` and `blob:` are
	 * returned untouched (the first is already self-contained, the second is dead
	 * outside its page but is not ours to delete), and so is `javascript:` — the
	 * preview declines to run scripts anyway.
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

	// Emitted as the first rule of every capture and applied to the baseline iframe,
	// so the two agree by construction. It does two different jobs, and which job a
	// property gets depends on one thing only: whether it inherits.
	//
	//   inherited properties are set to `inherit`. Author styles beat the UA
	//     stylesheet regardless of specificity, so this erases every per-tag UA
	//     override of an inherited value — `a{color:-webkit-link}`, `h1{font-size:2em}`,
	//     `code{font-family:monospace}`, `pre{white-space:pre}` — and makes
	//     inheritance actually transparent. That is what licenses the capture to drop
	//     any inherited property whose value already equals the parent's.
	//
	//   non-inherited properties are flattened to their initial values, so the UA's
	//     per-tag box decisions (margins on p and h1, padding on ul, borders on
	//     table) stop varying and the per-tag baselines collapse to nearly one table.
	//
	// Getting that split wrong is not a size regression, it is a rendering bug: an
	// inherited property pinned to a constant here re-applies to every descendant
	// and overrides the inheritance the capture was counting on. `white-space:normal`
	// instead of `white-space:inherit` makes every <pre> collapse its newlines,
	// because the <code> inside it is also matched by `*` and re-collapses what its
	// parent just preserved. tests/capture.spec.js exists to catch exactly that.
	//
	// `display` is pointedly NOT reset: it is where the UA stylesheet carries real
	// structural meaning (table parts, list-item, block vs inline) and re-deriving
	// it per element costs more than it saves. `appearance` is left alone for the
	// same reason — native form control rendering is not expressible in the
	// properties copied here.
	const RESET =
		'*,*::before,*::after{' +
		'font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;' +
		'color:inherit;text-align:inherit;text-indent:inherit;text-transform:inherit;' +
		'letter-spacing:inherit;word-spacing:inherit;white-space:inherit;' +
		'list-style:inherit;quotes:inherit;text-shadow:inherit;' +
		'border-collapse:inherit;border-spacing:inherit;' +
		'margin:0;padding:0;border-width:0;border-style:solid;border-color:currentColor;' +
		'box-sizing:border-box;background:none;text-decoration:none;' +
		'vertical-align:baseline;outline:none;min-width:0;min-height:0;box-shadow:none}' +
		// The root has nothing to inherit from, so `inherit` resolves to the initial
		// value there — except that the initial value of `white-space` is what makes
		// a document's stray markup newlines collapse, and of `list-style-type` what
		// makes list markers appear. Stating them on :root keeps the reset's meaning
		// identical while making it explicit rather than accidental.
		':root{white-space:normal;list-style:none;quotes:none}';

	// The properties that make a page look like itself. Everything outside this
	// list is dropped even where it differs from the baseline — writing modes,
	// exotic text layout, print styling, interaction hints. This is the one knob
	// that moves the link size a lot: copying every computed property instead
	// costs +11% to +185% on the demo corpus for no visible difference.
	const VISUAL_PROPS = [
		'display', 'position', 'top', 'right', 'bottom', 'left', 'float', 'clear', 'z-index',
		'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
		'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
		'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
		'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
		'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
		'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
		'border-top-left-radius', 'border-top-right-radius',
		'border-bottom-right-radius', 'border-bottom-left-radius',
		'box-sizing', 'box-shadow', 'outline-width', 'outline-style', 'outline-color',
		'outline-offset', 'opacity', 'overflow-x', 'overflow-y', 'visibility',
		'background-color', 'background-image', 'background-position-x', 'background-position-y',
		'background-size', 'background-repeat', 'background-attachment', 'background-clip',
		'background-origin', 'background-blend-mode', 'mix-blend-mode', 'filter', 'backdrop-filter',
		'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
		'font-variant', 'font-variant-caps', 'font-variant-numeric', 'font-feature-settings',
		'font-variation-settings', 'line-height', 'letter-spacing', 'word-spacing',
		'text-align', 'text-align-last', 'text-indent', 'text-transform', 'text-shadow',
		'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
		'text-decoration-thickness', 'text-underline-offset', 'text-overflow',
		'white-space', 'white-space-collapse', 'text-wrap-mode', 'text-wrap-style',
		'word-break', 'overflow-wrap', 'hyphens', 'tab-size', 'vertical-align', 'direction',
		'list-style-type', 'list-style-position', 'list-style-image',
		'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
		'align-self', 'justify-self', 'justify-items', 'order',
		'flex-grow', 'flex-shrink', 'flex-basis', 'gap', 'row-gap', 'column-gap',
		'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
		'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows',
		'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
		'transform', 'transform-origin', 'translate', 'rotate', 'scale',
		'table-layout', 'border-collapse', 'border-spacing', 'caption-side', 'empty-cells',
		'object-fit', 'object-position', 'aspect-ratio', 'isolation',
		'columns', 'column-count', 'column-width', 'column-rule-width',
		'column-rule-style', 'column-rule-color', 'appearance', 'accent-color', 'resize',
		'content', 'quotes', 'clip-path', 'mask-image', 'stroke', 'fill', 'stroke-width',
	];

	// Inherited longhands. Membership decides which side of the diff a property is
	// measured against: inherited ones against the parent's computed value,
	// everything else against the tag's baseline.
	const INHERITED = new Set([
		'border-collapse', 'border-spacing', 'caption-side', 'color', 'direction',
		'empty-cells', 'font-family', 'font-feature-settings', 'font-kerning',
		'font-optical-sizing', 'font-palette', 'font-size', 'font-size-adjust',
		'font-stretch', 'font-style', 'font-synthesis-small-caps', 'font-synthesis-style',
		'font-synthesis-weight', 'font-variant', 'font-variant-alternates',
		'font-variant-caps', 'font-variant-east-asian', 'font-variant-emoji',
		'font-variant-ligatures', 'font-variant-numeric', 'font-variant-position',
		'font-variation-settings', 'font-weight', 'hyphens', 'hyphenate-character',
		'image-orientation', 'image-rendering', 'letter-spacing', 'line-break',
		'line-height', 'list-style-image', 'list-style-position', 'list-style-type',
		'math-depth', 'math-shift', 'math-style', 'orphans', 'overflow-wrap', 'paint-order',
		'quotes', 'ruby-align', 'ruby-position', 'tab-size', 'text-align', 'text-align-last',
		'text-anchor', 'text-combine-upright', 'text-decoration-skip-ink', 'text-emphasis-color',
		'text-emphasis-position', 'text-emphasis-style', 'text-indent', 'text-justify',
		'text-orientation', 'text-rendering', 'text-shadow', 'text-size-adjust',
		'text-transform', 'text-underline-offset', 'text-underline-position',
		'text-wrap-mode', 'text-wrap-style', 'visibility', 'white-space-collapse',
		'widows', 'word-break', 'word-spacing', 'writing-mode',
		'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
		'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
		'-webkit-text-size-adjust',
	]);

	// Never walked into; contribute nothing a reader can see. `slot` is handled
	// separately — it is replaced by what was slotted into it.
	const FULL_SKIP_TAGS = new Set([
		'script', 'style', 'link', 'meta', 'base', 'noscript', 'template', 'title', 'head',
		'source', 'track',
	]);

	// Attributes worth keeping. Everything else — class, data-*, aria-*, event
	// handlers, framework bookkeeping — is dropped: the generated classes carry all
	// the styling, so the page's own class attribute is dead weight. `id` is kept
	// only where a fragment link in the document points at it.
	const FULL_KEEP_ATTRS = new Set([
		'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'span',
		'start', 'reversed', 'value', 'datetime', 'lang', 'dir', 'type',
		'placeholder', 'checked', 'disabled', 'selected', 'open',
	]);

	/** Kept even when empty — presence is the value. */
	const BOOLEAN_ATTRS = new Set(['checked', 'disabled', 'selected', 'open', 'reversed']);

	/** Read from the live element instead: the attribute is only the initial state. */
	const FORM_STATE_ATTRS = new Set(['checked', 'selected', 'value']);

	/** The only elements whose `src` survives. */
	const MEDIA_TAGS = new Set(['img', 'video', 'audio']);

	const VOID_TAGS = new Set([
		'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
		'link', 'meta', 'source', 'track', 'wbr',
	]);

	const SVG_NS = 'http://www.w3.org/2000/svg';
	const XLINK_NS = 'http://www.w3.org/1999/xlink';

	/**
	 * How long the walk may hold the main thread before yielding. getComputedStyle
	 * forces layout, three calls per element, and a big page can run to thousands
	 * of elements — a single synchronous pass would freeze the tab for seconds.
	 */
	const WALK_BUDGET_MS = 40;

	/** @returns {Promise<void>} */
	function yieldToPage() {
		return new Promise((resolve) => setTimeout(resolve, 0));
	}

	// ── Value shortening ─────────────────────────────────────────────────────────

	const NUM_RE = /(-?\d+\.\d+)/g;

	/**
	 * Shorten a computed value without changing what it means. Computed values are
	 * uniformly verbose — `rgb(255, 255, 255)` for white, `0px` for zero,
	 * `12.8000001907px` for a rounded em — and there are tens of thousands of them
	 * in a capture.
	 * @param {string} value
	 * @returns {string}
	 */
	function shorten(value) {
		let v = value;

		// Sub-hundredth-of-a-pixel precision is below what any display can show and
		// is an artifact of em/rem arithmetic, not a decision the page made.
		if (v.includes('.')) {
			v = v.replace(NUM_RE, (n) => String(Math.round(parseFloat(n) * 100) / 100));
		}

		// `rgb(a, b, c)` → `#rrggbb` → `#rgb`. Roughly a 50% saving on what is by
		// some distance the most common value shape in a capture.
		if (v.includes('rgb')) v = shortenColorsIn(v);

		// A zero is a zero in every unit CSS accepts here.
		if (v === '0px' || v === '0%' || v === '0em' || v === '0rem') return '0';

		// Whitespace after commas is free to drop inside function arguments and
		// between font-family entries.
		if (v.includes(', ')) v = v.replace(/,\s+/g, ',');

		return v;
	}

	/** @param {string} v @returns {string} */
	function shortenColorsIn(v) {
		return v.replace(/rgba?\(([^)]+)\)/g, (match, args) => {
			const parts = String(args).split(/[,\s/]+/).filter(Boolean);
			if (parts.length < 3) return match;
			const [r, g, b] = parts.map((p) => parseFloat(p));
			const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
			if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return match;
			if (a === 0) return 'transparent';
			/** @param {number} n */
			const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
			if (a === 1) {
				const h = hex(r) + hex(g) + hex(b);
				if (h[0] === h[1] && h[2] === h[3] && h[4] === h[5]) return '#' + h[0] + h[2] + h[4];
				return '#' + h;
			}
			// Alpha survives as an 8-digit hex, which is still shorter than rgba().
			return '#' + hex(r) + hex(g) + hex(b) + hex(a * 255);
		});
	}

	// ── Baseline ─────────────────────────────────────────────────────────────────

	/**
	 * A hidden document carrying nothing but RESET, used to answer "what would this
	 * tag look like with no author CSS?".
	 *
	 * An iframe rather than an off-screen div in the page: a div would inherit the
	 * page's own cascade, which is precisely the thing being measured against.
	 * `visibility:hidden` rather than `display:none` because a display:none subtree
	 * has no layout box and getComputedStyle then reports computed rather than used
	 * values — different numbers for exactly the properties that matter most.
	 *
	 * The reset goes in as a constructed stylesheet rather than a `<style>`: an
	 * about:blank iframe inherits the page's Content-Security-Policy, and on a site
	 * whose `style-src` forbids inline styles the `<style>` would be silently
	 * dropped, leaving every baseline measured against the UA stylesheet instead.
	 * Constructed sheets are not subject to CSP.
	 */
	function createBaseline() {
		const frame = document.createElement('iframe');
		frame.setAttribute('aria-hidden', 'true');
		frame.style.cssText =
			'position:absolute;left:-99999px;top:0;width:1024px;height:768px;border:0;visibility:hidden';
		(document.body ?? document.documentElement).appendChild(frame);
		const win = /** @type {(Window & typeof globalThis) | null} */ (frame.contentWindow);
		const doc = frame.contentDocument;
		if (!win || !doc?.body) {
			frame.remove();
			throw new Error("Couldn't create the baseline frame this capture needs.");
		}

		// The probe rule gives a pseudo-element to measure against. It is baseline-
		// only — the output stylesheet must not carry it, or every element that
		// happens to draw the class name `p` would grow a pseudo-element.
		const sheet = new win.CSSStyleSheet();
		sheet.replaceSync(RESET + '.p::before,.p::after{content:""}');
		doc.adoptedStyleSheets = [sheet];

		/** @type {Map<string, Record<string, string>>} */
		const cache = new Map();

		// Tags that only get their real UA treatment inside a particular ancestor.
		// A bare <td> outside a table is an inline box; inside one it is a table-cell,
		// and every box property differs.
		/** @type {Record<string, string[]>} */
		const CONTEXT = {
			td: ['table', 'tbody', 'tr'], th: ['table', 'thead', 'tr'],
			tr: ['table', 'tbody'], tbody: ['table'], thead: ['table'], tfoot: ['table'],
			caption: ['table'], colgroup: ['table'], col: ['table', 'colgroup'],
			li: ['ul'], dt: ['dl'], dd: ['dl'], option: ['select'], optgroup: ['select'],
			figcaption: ['figure'], summary: ['details'], legend: ['fieldset'],
			rt: ['ruby'], rp: ['ruby'],
		};

		/**
		 * @param {Element} el
		 * @param {string} [pseudo]
		 * @returns {Record<string, string>}
		 */
		const snapshot = (el, pseudo) => {
			const computed = win.getComputedStyle(el, pseudo);
			/** @type {Record<string, string>} */
			const out = {};
			for (const prop of VISUAL_PROPS) out[prop] = computed.getPropertyValue(prop);
			return out;
		};

		return {
			/**
			 * @param {string} tag
			 * @returns {Record<string, string>}
			 */
			get(tag) {
				const hit = cache.get(tag);
				if (hit) return hit;

				/** @type {Record<string, string>} */
				let out;
				if (tag === 'html') {
					out = snapshot(doc.documentElement);
				} else if (tag === 'body') {
					out = snapshot(doc.body);
				} else {
					let host = doc.body;
					for (const wrapper of CONTEXT[tag] ?? []) {
						const next = doc.createElement(wrapper);
						host.appendChild(next);
						host = next;
					}
					/** @type {Element} */
					let probe;
					try {
						probe = doc.createElement(tag);
					} catch {
						// A name createElement refuses (a namespaced tag outside its
						// namespace, say); the generic block is the nearest baseline.
						probe = doc.createElement('div');
					}
					// Some boxes collapse to nothing when empty, and a zero-area box
					// reports different used values than the same box with content in it.
					probe.textContent = 'x';
					host.appendChild(probe);
					out = snapshot(probe);
					// Leave the document as found, or the next probe inherits this one's
					// siblings (an <li> after an <li> is a different list item).
					doc.body.replaceChildren();
				}

				cache.set(tag, out);
				return out;
			},

			/**
			 * What a pseudo-element looks like with nothing but `content` set. Not the
			 * originating element's baseline: a `div::before{display:block}` would
			 * otherwise match the div's own `display:block` and be dropped, and the
			 * output's pseudo-element would come out inline.
			 * @returns {Record<string, string>}
			 */
			pseudo() {
				const hit = cache.get('::pseudo');
				if (hit) return hit;
				const probe = doc.createElement('span');
				probe.className = 'p';
				probe.textContent = 'x';
				doc.body.appendChild(probe);
				const out = snapshot(probe, '::before');
				// `content` is what makes a pseudo-element exist, so it must always be
				// emitted — including the empty string the probe itself carries.
				out.content = 'none';
				doc.body.replaceChildren();
				cache.set('::pseudo', out);
				return out;
			},

			destroy() {
				frame.remove();
			},
		};
	}

	// ── Style extraction ─────────────────────────────────────────────────────────

	/**
	 * Whether an element's box is horizontally centred by equal non-zero margins —
	 * the `margin-inline:auto` signature, as reported after the browser has already
	 * resolved it to pixels.
	 * @param {CSSStyleDeclaration} computed
	 * @returns {boolean}
	 */
	function isCentred(computed) {
		const l = parseFloat(computed.marginLeft);
		const r = parseFloat(computed.marginRight);
		return Number.isFinite(l) && l > 0.5 && Math.abs(l - r) < 1;
	}

	/**
	 * The declarations that are actually load-bearing for one element or pseudo-
	 * element: everything whose computed value differs from what the output document
	 * would produce on its own, given RESET and the parent's already-emitted styles.
	 *
	 * Sizes are copied as the used pixel values the browser reports, which pins the
	 * layout to the capture width. That is deliberate: `@media` rules are not part
	 * of a computed style, so by the time this runs "three columns above 992px, one
	 * below" has already collapsed to "three columns", and relaxing the widths would
	 * not make the capture responsive — only wrong.
	 *
	 * @param {CSSStyleDeclaration} computed
	 * @param {CSSStyleDeclaration | null} inheritFrom what the output will inherit from
	 * @param {Record<string, string>} baseline
	 * @param {{ skipSize?: boolean }} [flags]
	 * @returns {string[]} `prop:value` strings
	 */
	function extractStyles(computed, inheritFrom, baseline, flags = {}) {
		/** @type {string[]} */
		const decls = [];

		for (const prop of VISUAL_PROPS) {
			if (flags.skipSize && (prop === 'width' || prop === 'height')) continue;

			const value = computed.getPropertyValue(prop);
			if (!value) continue;

			// The two diffs. An inherited property is compared against the parent
			// because the output will inherit it; everything else against the tag's
			// baseline because the output will fall back to it.
			const expected =
				INHERITED.has(prop) && inheritFrom
					? inheritFrom.getPropertyValue(prop)
					: baseline[prop];
			if (value === expected) continue;

			// A used-value `auto` margin: the page centred this box and the browser
			// told us the answer in px. Emitting the px pins it to the capture width;
			// recognising the pattern keeps the box centred at any width AND is
			// shorter. Only horizontal, only when both sides agree — a vertical or
			// asymmetric match is far more likely to be a coincidence than an `auto`.
			if (prop === 'margin-left' && isCentred(computed)) {
				decls.push('margin-inline:auto');
				continue;
			}
			if (prop === 'margin-right' && isCentred(computed)) continue;

			decls.push(prop + ':' + shorten(value));
		}

		return decls;
	}

	/**
	 * Styles for an element's ::before/::after, if it has any.
	 *
	 * Worth the second and third getComputedStyle call per element: pseudo-elements
	 * are where icon fonts, quote marks, dividers and most of a design system's
	 * decorative layer live. A capture without them is visibly missing things in a
	 * way that reads as "broken" rather than "simplified".
	 * @param {Element} el
	 * @param {CSSStyleDeclaration} computed the element's own computed style
	 * @param {Record<string, string>} baseline the pseudo-element baseline
	 * @returns {{ before: string[] | null, after: string[] | null }}
	 */
	function extractPseudo(el, computed, baseline) {
		/** @param {'::before' | '::after'} which */
		const read = (which) => {
			const pseudo = getComputedStyle(el, which);
			const content = pseudo.getPropertyValue('content');
			// `none` is "no pseudo element"; `normal` is what non-generating contexts
			// report. Either way there is nothing to draw.
			if (!content || content === 'none' || content === 'normal') return null;
			// A pseudo-element inherits from its originating element, so that is the
			// right comparison for inherited properties.
			const decls = extractStyles(pseudo, computed, baseline);
			return decls.length ? decls : null;
		};

		return { before: read('::before'), after: read('::after') };
	}

	// ── Class assignment ─────────────────────────────────────────────────────────

	// CSS identifiers can't start with a digit, so the first character comes from a
	// 52-symbol alphabet and the rest from a 62-symbol one. Names are handed out in
	// descending order of use, so the classes that appear most often in the markup
	// get the one-character names.
	const HEAD = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	const TAIL = HEAD + '0123456789';

	/**
	 * The n-th shortest valid CSS class name.
	 * @param {number} n
	 * @returns {string}
	 */
	function className(n) {
		let name = HEAD[n % HEAD.length];
		let rest = Math.floor(n / HEAD.length);
		while (rest > 0) {
			rest -= 1;
			name += TAIL[rest % TAIL.length];
			rest = Math.floor(rest / TAIL.length);
		}
		return name;
	}

	/**
	 * Turn per-element declaration lists into a stylesheet plus a class list per
	 * element.
	 *
	 * Declarations that appear on exactly the same set of elements are emitted as
	 * one multi-declaration class, so the stylesheet holds each declaration once and
	 * the markup spends one token per group. Grouping by element set is, in effect,
	 * rediscovering the page's original CSS rules from their effects: every
	 * declaration that shared a selector in the source shares an element set here.
	 * It is an equivalence relation, so it is exact and linear — no cost model, no
	 * search. Groups used by a single element are folded back into `style=""`,
	 * where they cost nothing to name.
	 *
	 * Measured against the alternatives (demo/scrape-compress/README.md): on small
	 * pages this is within ~1% of plain inline styles after zstd, and on large ones
	 * it pulls ahead by ~9%, because inline styles grow with the number of elements
	 * while classes grow with the number of distinct styles. Anything cleverer —
	 * the greedy biclique cover that factors out partially overlapping groups — is
	 * bounded by that ~1% and not worth running in a content script.
	 *
	 * @param {string[][]} styleSets per-element declaration lists
	 * @returns {{ rules: string[], classesFor: (string[] | null)[], inlineFor: (string | null)[] }}
	 */
	function assignClasses(styleSets) {
		const count = styleSets.length;
		/** @type {(string[] | null)[]} */
		const classesFor = Array.from({ length: count }, () => null);
		/** @type {(string | null)[]} */
		const inlineFor = Array.from({ length: count }, () => null);

		// declaration → the elements carrying it. Element indices are pushed in
		// ascending order, so equal sets produce equal keys without set comparison.
		/** @type {Map<string, number[]>} */
		const owners = new Map();
		for (let i = 0; i < count; i++) {
			for (const decl of styleSets[i]) {
				const bucket = owners.get(decl);
				if (bucket) bucket.push(i);
				else owners.set(decl, [i]);
			}
		}

		/** @type {Map<string, { decls: string[], members: number[] }>} */
		const byMembers = new Map();
		for (const [decl, members] of owners) {
			const key = members.join(',');
			const hit = byMembers.get(key);
			if (hit) hit.decls.push(decl);
			else byMembers.set(key, { decls: [decl], members });
		}

		/** @type {string[][]} */
		const inlineDecls = Array.from({ length: count }, () => []);
		/** @type {{ decls: string[], members: number[] }[]} */
		const shared = [];
		for (const group of byMembers.values()) {
			if (group.members.length === 1) inlineDecls[group.members[0]].push(...group.decls);
			else shared.push(group);
		}

		// Sort by how many markup tokens the name will be written into, so the
		// shortest names go where they are repeated most.
		shared.sort((a, b) => b.members.length - a.members.length);

		/** @type {string[]} */
		const rules = [];
		shared.forEach((group, index) => {
			const name = className(index);
			rules.push(`.${name}{${group.decls.join(';')}}`);
			for (const member of group.members) {
				const list = classesFor[member];
				if (list) list.push(name);
				else classesFor[member] = [name];
			}
		});

		for (let i = 0; i < count; i++) {
			if (inlineDecls[i].length) inlineFor[i] = inlineDecls[i].join(';');
		}

		return { rules, classesFor, inlineFor };
	}

	// ── Fonts ────────────────────────────────────────────────────────────────────

	/**
	 * Serialize a stylesheet's rules, or [] if they can't be read. Cross-origin
	 * sheets throw SecurityError on `.cssRules` unless they were served with CORS.
	 * @param {CSSStyleSheet | null} sheet
	 * @returns {CSSRule[]}
	 */
	function readRules(sheet) {
		if (!sheet) return [];
		try {
			return Array.from(sheet.cssRules);
		} catch {
			return [];
		}
	}

	/**
	 * Rewrite `url(...)` targets inside a rule so a font file referenced relative to
	 * its stylesheet still resolves once the rule lives in a document with no
	 * stylesheet at all.
	 * @param {string} css
	 * @param {string} base
	 * @returns {string}
	 */
	function absolutizeCss(css, base) {
		return css.replace(
			/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
			(_match, quote, url) => `url(${quote}${absolutizeLoose(url, base)}${quote})`,
		);
	}

	/**
	 * A family name as it appears in a computed `font-family` list, normalized for
	 * matching against `@font-face` descriptors: unquoted, lower-cased.
	 * @param {string} name
	 * @returns {string}
	 */
	function fontKey(name) {
		return name.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
	}

	/**
	 * The `@font-face` rules for every family the captured elements actually use,
	 * with their sources made absolute.
	 *
	 * `font-family` is copied along with everything else, but a family name is only
	 * a name: without the rule that says where the file is, a page set in a webfont
	 * renders in the reader's fallback. The rules are readable from the CSSOM for
	 * same-origin sheets; the files themselves are far too large to embed in a URL,
	 * so this is the same trade linked images make — the font loads while its host
	 * serves it. Cross-origin sheets can't be read, and their fonts are lost.
	 *
	 * @param {Set<string>} usedFamilies computed `font-family` values seen in the walk
	 * @param {string} base
	 * @returns {string}
	 */
	function collectFontFaces(usedFamilies, base) {
		/** @type {Set<string>} */
		const wanted = new Set();
		for (const list of usedFamilies) {
			for (const name of list.split(',')) wanted.add(fontKey(name));
		}

		/** @type {string[]} */
		const out = [];
		/** @type {Set<string>} */
		const seen = new Set();

		/** @param {CSSStyleSheet | null} sheet @param {string} sheetBase */
		const visit = (sheet, sheetBase) => {
			for (const rule of readRules(sheet)) {
				if (rule instanceof CSSImportRule) {
					visit(rule.styleSheet, rule.styleSheet?.href ?? sheetBase);
				} else if (rule instanceof CSSFontFaceRule) {
					const family = fontKey(rule.style.getPropertyValue('font-family'));
					if (!wanted.has(family)) continue;
					const css = absolutizeCss(rule.cssText, sheetBase);
					if (seen.has(css)) continue;
					seen.add(css);
					out.push(css);
				}
			}
		};

		for (const sheet of Array.from(document.styleSheets)) visit(sheet, sheet.href ?? base);
		for (const sheet of Array.from(document.adoptedStyleSheets ?? [])) visit(sheet, base);
		return out.join('');
	}

	// ── SVG ──────────────────────────────────────────────────────────────────────

	/**
	 * Attributes copied verbatim off an `<svg>` root and its descendants. Geometry
	 * lives in attributes here (`d`, `points`, `viewBox`), not in CSS, so this is the
	 * one place the capture ships markup — minus the page's class names, which point
	 * at stylesheets that no longer exist, and the usual bookkeeping.
	 * @param {string} name
	 * @returns {boolean}
	 */
	function keepSvgAttr(name) {
		return (
			name !== 'class' && name !== 'style' &&
			!name.startsWith('data-') && !name.startsWith('aria-') && !name.startsWith('on')
		);
	}

	/**
	 * The inner markup of an inline SVG, with sprite references resolved.
	 *
	 * Icon systems put every glyph in one `<svg style="display:none">` at the top of
	 * the page and draw each with `<use href="#name">`. The sprite is invisible, so
	 * the walk never emits it, and every icon on the page would come out blank —
	 * unless the referenced `<symbol>` is copied into the `<use>` that needs it,
	 * which is what this does. References into the same SVG are left alone; they
	 * ship with it.
	 * @param {Element} svg
	 * @returns {string}
	 */
	function serializeSvg(svg) {
		const clone = /** @type {Element} */ (svg.cloneNode(true));

		for (const use of Array.from(clone.querySelectorAll('use'))) {
			const ref = use.getAttribute('href') ?? use.getAttributeNS(XLINK_NS, 'href') ?? '';
			if (!ref.startsWith('#')) continue;
			const target = document.getElementById(ref.slice(1));
			if (!target || svg.contains(target)) continue;

			const inlined = document.createElementNS(SVG_NS, 'svg');
			for (const name of ['x', 'y', 'width', 'height']) {
				const value = use.getAttribute(name);
				if (value) inlined.setAttribute(name, value);
			}
			if (target.tagName.toLowerCase() === 'symbol') {
				for (const name of ['viewBox', 'preserveAspectRatio']) {
					const value = target.getAttribute(name);
					if (value) inlined.setAttribute(name, value);
				}
				inlined.append(...Array.from(target.cloneNode(true).childNodes));
			} else {
				inlined.append(target.cloneNode(true));
			}
			use.replaceWith(inlined);
		}

		for (const el of Array.from(clone.querySelectorAll('*'))) {
			for (const attr of Array.from(el.attributes)) {
				if (!keepSvgAttr(attr.name)) el.removeAttribute(attr.name);
			}
		}

		return clone.innerHTML;
	}

	// ── The walk ─────────────────────────────────────────────────────────────────

	/**
	 * @typedef {{ kind: 'el', tag: string, attrs: [string, string][], children: CapNode[],
	 *             classes: string[] | null, inline: string | null, index: number }
	 *          | { kind: 'text', text: string }
	 *          | { kind: 'raw', html: string }} CapNode
	 */

	/** @param {string} s @returns {string} */
	function escapeText(s) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	/**
	 * Render a captured node as HTML.
	 * @param {CapNode} node
	 * @returns {string}
	 */
	function renderNode(node) {
		if (node.kind === 'text') return escapeText(node.text);
		if (node.kind === 'raw') return node.html;
		if (VOID_TAGS.has(node.tag)) return `<${node.tag}${renderAttrs(node)}>`;
		return `<${node.tag}${renderAttrs(node)}>${renderChildren(node)}</${node.tag}>`;
	}

	/**
	 * @param {CapNode & { kind: 'el' }} node
	 * @returns {string}
	 */
	function renderAttrs(node) {
		let attrs = '';
		if (node.classes?.length) attrs += ` class="${node.classes.join(' ')}"`;
		if (node.inline) attrs += ` style="${escapeHtml(node.inline)}"`;
		for (const [name, value] of node.attrs) attrs += ` ${name}="${escapeHtml(value)}"`;
		return attrs;
	}

	/**
	 * @param {CapNode & { kind: 'el' }} node
	 * @returns {string}
	 */
	function renderChildren(node) {
		return node.children.map(renderNode).join('');
	}

	/**
	 * Snapshot the whole page as a computed-style capture; see the note at the top
	 * of this section.
	 * @param {string} base
	 * @param {'link' | 'inline'} imageMode
	 * @returns {Promise<{ html: string, images: { name: string, url: string }[], linkedImages: number, width: number }>}
	 */
	async function captureFull(base, imageMode) {
		const baseline = createBaseline();
		/** @type {string[][]} */
		const styleSets = [];
		/** @type {{ index: number, which: '::before' | '::after', decls: string[] }[]} */
		const pseudoStyles = [];
		/** @type {Set<string>} */
		const usedFamilies = new Set();
		/** @type {{ name: string, url: string }[]} */
		const images = [];
		let linkedImages = 0;

		// Fragment targets are the only ids worth carrying: a footnote's "back to
		// text" link dead-ends without the id it points at, and every other id is
		// weight the generated classes made redundant.
		/** @type {Set<string>} */
		const anchored = new Set();
		for (const a of Array.from(document.querySelectorAll('a[href^="#"]'))) {
			const id = (a.getAttribute('href') ?? '').slice(1);
			if (!id) continue;
			anchored.add(id);
			try {
				anchored.add(decodeURIComponent(id));
			} catch {
				// Malformed escape; the raw form is already in.
			}
		}

		let deadline = performance.now() + WALK_BUDGET_MS;

		/**
		 * @param {Element} el
		 * @param {string} tag
		 * @returns {[string, string][]}
		 */
		function collectAttrs(el, tag) {
			/** @type {[string, string][]} */
			const attrs = [];
			for (const attr of Array.from(el.attributes)) {
				const name = attr.name.toLowerCase();
				if (name === 'id') {
					if (anchored.has(attr.value)) attrs.push(['id', attr.value]);
					continue;
				}
				if (tag === 'svg' ? !keepSvgAttr(name) : !FULL_KEEP_ATTRS.has(name)) continue;
				// Form state is read off the element below, not the markup.
				if (FORM_STATE_ATTRS.has(name)) continue;
				// A `src` is kept for media only. An iframe or embed would pull a live
				// third-party document into what is otherwise a self-contained snapshot
				// — and one the preview would not let run anyway. It keeps its box.
				if (name === 'src' && !MEDIA_TAGS.has(tag)) continue;
				let value = attr.value;
				if (name === 'href' || name === 'src') value = absolutizeLoose(value, base);
				if (value || name === 'alt' || BOOLEAN_ATTRS.has(name)) attrs.push([name, value]);
			}

			// What the user typed and ticked is what they see, and what they see is
			// what a snapshot keeps. That lives in properties, not attributes.
			if (el instanceof HTMLInputElement) {
				if (el.type === 'checkbox' || el.type === 'radio') {
					if (el.checked) attrs.push(['checked', '']);
				} else if (el.type !== 'password' && el.type !== 'file' && el.value) {
					attrs.push(['value', el.value]);
				}
			} else if (el instanceof HTMLOptionElement) {
				if (el.selected) attrs.push(['selected', '']);
			}
			return attrs;
		}

		/**
		 * @param {Node} node
		 * @param {CSSStyleDeclaration | null} parentComputed
		 * @returns {Promise<CapNode[]>} zero, one, or — for a slot — several nodes
		 */
		async function walk(node, parentComputed) {
			if (node.nodeType === Node.TEXT_NODE) {
				const text = node.nodeValue ?? '';
				return text ? [{ kind: 'text', text }] : [];
			}
			if (node.nodeType !== Node.ELEMENT_NODE) return [];

			const el = /** @type {Element} */ (node);
			const tag = el.tagName.toLowerCase();
			if (FULL_SKIP_TAGS.has(tag)) return [];

			// A slot is a placeholder for whatever was slotted into it (or, with
			// nothing slotted, for its own fallback content). What the browser draws
			// is the flattened tree, so that is what gets walked.
			if (el instanceof HTMLSlotElement) {
				/** @type {CapNode[]} */
				const out = [];
				for (const assigned of el.assignedNodes({ flatten: true })) {
					out.push(...(await walk(assigned, parentComputed)));
				}
				return out;
			}

			if (performance.now() > deadline) {
				await yieldToPage();
				deadline = performance.now() + WALK_BUDGET_MS;
			}

			const computed = getComputedStyle(el);

			// An element the browser decided not to draw contributes nothing but its
			// subtree's absence. `display:none` is the common case (mobile nav, modals,
			// tab panels) and skipping it is most of the difference between capturing
			// a page and capturing every state a page can be in.
			if (computed.display === 'none') return [];

			const index = styleSets.length;
			styleSets.push(
				extractStyles(computed, parentComputed, baseline.get(tag), {
					// The viewport is the root's containing block; its size is the
					// viewport's, which the output document declares in its own way.
					skipSize: tag === 'html',
				}),
			);
			usedFamilies.add(computed.fontFamily);

			const { before, after } = extractPseudo(el, computed, baseline.pseudo());
			if (before) pseudoStyles.push({ index, which: '::before', decls: before });
			if (after) pseudoStyles.push({ index, which: '::after', decls: after });

			const attrs = collectAttrs(el, tag);

			/** @type {CapNode[]} */
			const children = [];

			if (tag === 'svg') {
				// Geometry, not style: the shape lives in attributes no computed style
				// reconstructs. The root's own box and colours are captured like any
				// other element's; what is inside it ships verbatim.
				children.push({ kind: 'raw', html: serializeSvg(el) });
			} else if (tag === 'img') {
				// What the browser actually chose from a srcset, already absolute.
				const src = /** @type {HTMLImageElement} */ (el).currentSrc || el.getAttribute('src') || '';
				const entry = attrs.find(([name]) => name === 'src');
				if (/^https?:/i.test(src)) {
					if (imageMode === 'inline') {
						// The worker fills in the bytes; see sanitize() in article mode for
						// why the name is fixed here.
						const name = `assets/img-${images.length}.webp`;
						images.push({ name, url: src });
						if (entry) entry[1] = name;
						else attrs.push(['src', name]);
					} else {
						linkedImages++;
						if (entry) entry[1] = src;
						else attrs.push(['src', src]);
					}
				}
			} else if (el instanceof HTMLTextAreaElement) {
				if (el.value) children.push({ kind: 'text', text: el.value });
			} else {
				// The composed tree: a shadow root's children are what the browser
				// draws, and the host's light-DOM children only appear through slots.
				const source = el.shadowRoot ?? el;
				for (const child of Array.from(source.childNodes)) {
					children.push(...(await walk(child, computed)));
				}
			}

			return [{ kind: 'el', tag, attrs, children, classes: null, inline: null, index }];
		}

		/** @type {CapNode[]} */
		let walked;
		try {
			walked = await walk(document.documentElement, null);
		} finally {
			baseline.destroy();
		}
		const root = walked[0];
		if (!root || root.kind !== 'el') throw new Error('There is nothing visible to capture.');

		// Pseudo-element rules get their own classes, in a namespace that cannot
		// collide with the element ones: `className` never starts a name with `_`.
		const { rules, classesFor, inlineFor } = assignClasses(styleSets);
		/** @type {string[]} */
		const pseudoRules = [];
		/** @type {Map<number, string[]>} */
		const pseudoClasses = new Map();
		/** @type {Map<string, string>} */
		const pseudoNames = new Map();
		for (const { index, which, decls } of pseudoStyles) {
			const signature = which + '{' + decls.join(';') + '}';
			let name = pseudoNames.get(signature);
			if (!name) {
				name = '_' + className(pseudoNames.size);
				pseudoNames.set(signature, name);
				pseudoRules.push(`.${name}${which}{${decls.join(';')}}`);
			}
			const list = pseudoClasses.get(index);
			if (list) list.push(name);
			else pseudoClasses.set(index, [name]);
		}

		// Hand the assigned names back to the tree.
		/** @param {CapNode} node */
		const apply = (node) => {
			if (node.kind !== 'el') return;
			const own = classesFor[node.index] ?? [];
			const pseudo = pseudoClasses.get(node.index) ?? [];
			node.classes = own.length || pseudo.length ? own.concat(pseudo) : null;
			node.inline = inlineFor[node.index];
			for (const child of node.children) apply(child);
		};
		apply(root);

		const css = RESET + collectFontFaces(usedFamilies, base) + rules.join('') + pseudoRules.join('');
		const width = Math.round(window.innerWidth);

		// The capture declares the width it was taken at instead of claiming to be
		// device-width. A phone then lays it out at that width and scales the result
		// to fit — the same page, smaller — where `width=device-width` would promise
		// a reflow the document cannot perform and deliver a sideways scroll.
		//
		// Everything the reader sees loads from the original host — fonts, images
		// left un-embedded — so the referrer policy is set here, once.
		const html =
			`<!doctype html><html${renderAttrs(root)}><head><meta charset="utf-8">` +
			`<meta name="viewport" content="width=${width}">` +
			'<meta name="referrer" content="no-referrer">' +
			`<title>${escapeHtml(document.title)}</title>` +
			`<style>${css}</style></head>${renderChildren(root)}</html>`;

		return { html, images, linkedImages, width };
	}

	// ── Entry point ──────────────────────────────────────────────────────────────

	/**
	 * Extract the page. `mode: 'article'` runs Readability and sanitizes what it
	 * returns; `mode: 'full'` rebuilds the rendered page from computed styles.
	 * @param {{ mode?: 'article' | 'full', images?: 'link' | 'inline' }} [options]
	 * @returns {Promise<Capture>}
	 */
	async function capture(options = {}) {
		const { mode = 'article', images: imageMode = 'link' } = options;
		const base = document.baseURI || location.href;
		const readerable = LinkifyReadability.isProbablyReaderable(document);

		if (mode === 'full') {
			const { html, images, linkedImages, width } = await captureFull(base, imageMode);
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
				width,
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
			width: 0,
		};
	}

	// The worker calls this in a second executeScript once the files are in place.
	globalThis.__linkifyInkCapture = capture;
})();
