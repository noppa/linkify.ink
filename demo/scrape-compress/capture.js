// capture.js — the experimental "computed style" page capture.
//
// This is a DEMO, not extension code. It is injected into a page (classic script,
// same as extension/content/capture.js) and hangs `__linkifyScrape` on globalThis.
//
// The idea, in one paragraph: instead of shipping the page's markup plus its
// stylesheets — which is what extension/content/capture.js does today, and which
// carries megabytes of rules the page never used plus any external sheet we
// couldn't read — walk the DOM, ask the browser what it actually decided for each
// element via getComputedStyle, and rebuild a *new* document from those answers.
// Nothing external is referenced, nothing unused ships, and the result is styled
// by construction rather than by hoping the original CSS survived the trip.
//
// The whole thing rests on one trick. A raw getComputedStyle dump is ~340
// declarations per element and is useless — a 1000-element page would be 10MB of
// CSS. Almost all of it is noise, and there are exactly two reasons a declaration
// is noise:
//
//   1. it is the value the element would have anyway with no author CSS at all
//      (the UA default), or
//   2. it is an inherited property whose value is already the parent's, so the
//      element would inherit it for free.
//
// So we diff. A hidden iframe carrying nothing but a reset gives us the per-tag
// baseline for (1); the parent's own computed values give us (2). What survives
// the diff is the page's actual styling, and it is small — one to two orders of
// magnitude smaller than the dump.
//
// For the diff to be *sound* the output document has to be built on the same
// foundation the baseline was measured against, which is what RESET below is. It
// is injected into the baseline iframe and emitted as the first rule of the
// generated stylesheet, so "computed value differs from baseline" means exactly
// "this declaration is load-bearing in the output". The reset also neutralises
// the UA stylesheet's inherited-property overrides (`a{color:-webkit-link}`,
// `h1{font-size:2em}`, `code{font-family:monospace}` ...), which is what makes
// rule (2) safe to apply to every element rather than to a hand-maintained list
// of tags the UA happens to leave alone.
//
// Everything after that is packaging: turning per-element declaration sets into
// shared CSS classes (four strategies, see assignClasses), and serializing the
// tree (HTML, or the compact s-expression form). Both are measured rather than
// assumed — see run.mjs.

(() => {
	'use strict';

	// ── The reset ────────────────────────────────────────────────────────────────
	//
	// Emitted as the first rule of every capture and applied to the baseline iframe,
	// so the two agree by construction. It does two different jobs, and which job a
	// property gets depends on one thing only: whether it inherits.
	//
	//   inherited properties are set to `inherit`. Author styles beat the UA
	//     stylesheet regardless of specificity, so this erases every per-tag UA
	//     override of an inherited value — `a{color:-webkit-link}`, `h1{font-size:2em}`,
	//     `code{font-family:monospace}`, `pre{white-space:pre}` — and makes
	//     inheritance actually transparent. That is what licenses the capture to drop
	//     any inherited property whose value already equals the parent's, which is
	//     where most of the per-element saving comes from.
	//
	//   non-inherited properties are flattened to their initial values, so the UA's
	//     per-tag box decisions (margins on p and h1, padding on ul, borders on
	//     table) stop varying and the per-tag baselines collapse to nearly one table.
	//
	// Getting that split wrong is not a size regression, it is a rendering bug: an
	// inherited property pinned to a constant here re-applies to every descendant
	// and overrides the inheritance the capture was counting on. `white-space:normal`
	// instead of `white-space:inherit` is the instructive one — it makes every
	// <pre> in a capture collapse its newlines, because the <code> inside it is also
	// matched by `*` and re-collapses what its parent just preserved.
	//
	// `display` is pointedly NOT reset: it is where the UA stylesheet carries real
	// structural meaning (table parts, list-item, block vs inline) and re-deriving
	// it per element costs more than it saves. `appearance` is left alone for the
	// same reason — native form control rendering is not expressible in the
	// properties we copy.
	const RESET =
		'*,*::before,*::after{' +
		// Inherited — neutralise the UA stylesheet without breaking inheritance.
		'font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;' +
		'color:inherit;text-align:inherit;text-indent:inherit;text-transform:inherit;' +
		'letter-spacing:inherit;word-spacing:inherit;white-space:inherit;' +
		'list-style:inherit;quotes:inherit;text-shadow:inherit;' +
		'border-collapse:inherit;border-spacing:inherit;' +
		// Non-inherited — flatten to initial.
		'margin:0;padding:0;border-width:0;border-style:solid;border-color:currentColor;' +
		'box-sizing:border-box;background:none;text-decoration:none;' +
		'vertical-align:baseline;outline:none;min-width:0;min-height:0;box-shadow:none}' +
		// The root has nothing to inherit from, so `inherit` resolves to the initial
		// value there — except that the initial value of `white-space` is what makes
		// a document's stray markup newlines collapse, and of `list-style-type` what
		// makes list markers appear. Stating them on :root keeps the reset's meaning
		// identical while making it explicit rather than accidental.
		':root{white-space:normal;list-style:none;quotes:none}';

	// ── Property selection ───────────────────────────────────────────────────────

	// Properties that never survive into a static snapshot, or that duplicate one
	// that does. Dropped before anything else, because they are pure weight:
	// animations and transitions have no meaning in a frozen page, the -webkit-
	// aliases repeat their standard counterparts verbatim, and the interaction
	// properties (cursor, user-select, touch-action) describe behaviour a reader
	// of a captured page has no way to exercise.
	const DROP_PROPS = new Set([
		'cursor', 'pointer-events', 'user-select', '-webkit-user-select', 'touch-action',
		'will-change', 'view-transition-name', 'content-visibility', 'contain-intrinsic-size',
		'scroll-behavior', 'scroll-margin', 'scroll-padding', 'overscroll-behavior',
		'transition-property', 'transition-duration', 'transition-timing-function',
		'transition-delay', 'transition-behavior',
		'animation-name', 'animation-duration', 'animation-timing-function',
		'animation-delay', 'animation-iteration-count', 'animation-direction',
		'animation-fill-mode', 'animation-play-state', 'animation-composition',
		'animation-timeline', 'animation-range-start', 'animation-range-end',
		'offset-path', 'offset-distance', 'offset-rotate', 'offset-anchor', 'offset-position',
		'speak', 'speak-as', '-webkit-locale', '-webkit-font-smoothing',
		'-webkit-tap-highlight-color', '-webkit-text-fill-color', '-webkit-text-stroke-color',
		'-webkit-text-stroke-width', '-webkit-border-image', '-webkit-box-align',
		'-webkit-rtl-ordering', '-webkit-user-drag', '-webkit-user-modify',
		'-webkit-app-region', '-webkit-highlight', '-webkit-line-break',
		'-webkit-text-orientation', '-webkit-text-security', '-webkit-writing-mode',
		'-webkit-print-color-adjust', 'print-color-adjust', 'color-adjust',
		'perspective-origin', 'transform-style', 'backface-visibility',
		'block-size', 'inline-size', 'min-block-size', 'min-inline-size',
		'max-block-size', 'max-inline-size',
		'timeline-scope', 'anchor-name', 'position-anchor', 'position-try-order',
		'field-sizing', 'interactivity', 'reading-flow', 'reading-order',
	]);

	// A stricter allowlist for `props:'visual'`: the properties that actually make
	// a page look like itself. Everything outside it is dropped even if it differs
	// from the baseline. This is the aggressive setting — it trades a little
	// fidelity (writing modes, exotic text layout, print styling) for a lot of
	// bytes, and run.mjs measures both so the trade is visible rather than assumed.
	const VISUAL_PROPS = new Set([
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
		'columns', 'column-count', 'column-width', 'column-gap', 'column-rule-width',
		'column-rule-style', 'column-rule-color', 'appearance', 'accent-color', 'resize',
		'content', 'quotes', 'clip-path', 'mask-image', 'stroke', 'fill', 'stroke-width',
	]);

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

	// Size properties. getComputedStyle resolves these to *used* values — a `width`
	// comes back as the px the box actually occupies, never the `auto` or `50%` the
	// author wrote. Copying them reproduces the layout exactly and pins it to the
	// capture viewport; not copying them lets the capture reflow but loses every
	// width the cascade computed rather than inherited. Which of those is right is
	// what `sizing` chooses, and run.mjs measures all four.
	// Display values that make a box a normal in-flow block: one whose width, left
	// to itself, fills the containing block. Used by the `smart` sizing mode.
	const IN_FLOW_BLOCK = new Set(['block', 'flow-root', 'list-item', 'table-caption']);

	// Elements whose rendering is not expressible in CSS properties at all.
	const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'object', 'embed', 'picture']);

	// Never walked into; contribute nothing a reader can see.
	const SKIP_TAGS = new Set([
		'script', 'style', 'link', 'meta', 'base', 'noscript', 'template', 'title', 'head',
	]);

	// Attributes worth keeping. Everything else (data-*, aria-*, class, id, event
	// handlers, framework bookkeeping) is dropped — the generated classes carry all
	// the styling, so the original class attribute is dead weight.
	const KEEP_ATTRS = new Set([
		'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'span',
		'start', 'reversed', 'value', 'datetime', 'lang', 'dir', 'type',
	]);

	// ── Value shortening ─────────────────────────────────────────────────────────

	const NUM_RE = /(-?\d+\.\d+)/g;

	/**
	 * Shorten a computed value without changing what it means. Computed values are
	 * uniformly verbose — `rgb(255, 255, 255)` for white, `0px` for zero,
	 * `12.8000001907px` for a rounded em — and there are tens of thousands of them
	 * in a capture, so this is worth a few hundred bytes of code.
	 * @param {string} prop
	 * @param {string} value
	 * @returns {string}
	 */
	function shorten(prop, value) {
		let v = value;

		// Sub-hundredth-of-a-pixel precision is below what any display can show and
		// is an artifact of em/rem arithmetic, not a decision the page made.
		if (v.includes('.')) {
			v = v.replace(NUM_RE, (n) => String(Math.round(parseFloat(n) * 100) / 100));
		}

		// `rgb(a, b, c)` → `#rrggbb` → `#rgb`. Roughly a 50% saving on what is by
		// some distance the most common value shape in a capture.
		if (v.startsWith('rgb')) v = shortenColorsIn(v);
		else if (v.includes('rgb')) v = shortenColorsIn(v);

		// A zero is a zero in every unit CSS accepts here.
		if (v === '0px' || v === '0%' || v === '0em' || v === '0rem') return '0';

		// Whitespace after commas is free to drop inside function arguments and
		// between font-family entries.
		if (v.includes(', ')) v = v.replace(/,\s+/g, ',');

		// Computed font-family quotes anything with a space; most of those names
		// don't actually need quoting, but stripping is only safe for the simple
		// cases, so leave it — the win is small and the failure mode is silent.
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
			const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
			if (a === 1) {
				const h = hex(r) + hex(g) + hex(b);
				// #aabbcc → #abc
				if (h[0] === h[1] && h[2] === h[3] && h[4] === h[5]) return '#' + h[0] + h[2] + h[4];
				return '#' + h;
			}
			// Alpha survives as an 8-digit hex, which is still shorter than rgba().
			const h = hex(r) + hex(g) + hex(b) + hex(a * 255);
			return '#' + h;
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
	 */
	function createBaseline() {
		const frame = document.createElement('iframe');
		frame.setAttribute('aria-hidden', 'true');
		frame.style.cssText =
			'position:absolute;left:-99999px;top:0;width:1024px;height:768px;border:0;visibility:hidden';
		document.body.appendChild(frame);
		const doc = frame.contentDocument;
		if (!doc) throw new Error('baseline iframe has no document');
		doc.open();
		doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${RESET}</style></head><body></body></html>`);
		doc.close();

		/** @type {Map<string, Record<string, string>>} */
		const cache = new Map();

		// Tags that only get their real UA treatment inside a particular ancestor.
		// A bare <td> outside a table is an inline box; inside one it is a table-cell,
		// and every box property differs.
		const CONTEXT = {
			td: ['table', 'tbody', 'tr'], th: ['table', 'thead', 'tr'],
			tr: ['table', 'tbody'], tbody: ['table'], thead: ['table'], tfoot: ['table'],
			caption: ['table'], colgroup: ['table'], col: ['table', 'colgroup'],
			li: ['ul'], dt: ['dl'], dd: ['dl'], option: ['select'], optgroup: ['select'],
			figcaption: ['figure'], summary: ['details'], legend: ['fieldset'],
			source: ['picture'], track: ['video'], rt: ['ruby'], rp: ['ruby'],
		};

		return {
			/**
			 * @param {string} tag
			 * @returns {Record<string, string>}
			 */
			get(tag) {
				const hit = cache.get(tag);
				if (hit) return hit;

				let host = doc.body;
				for (const wrapper of CONTEXT[tag] ?? []) {
					const next = doc.createElement(wrapper);
					host.appendChild(next);
					host = next;
				}
				const probe = doc.createElement(tag);
				// Some boxes collapse to nothing when empty, and a zero-area box reports
				// different used values than the same box with content in it.
				probe.textContent = 'x';
				host.appendChild(probe);

				const computed = doc.defaultView.getComputedStyle(probe);
				/** @type {Record<string, string>} */
				const out = {};
				for (let i = 0; i < computed.length; i++) {
					const name = computed[i];
					out[name] = computed.getPropertyValue(name);
				}

				// Leave the document as we found it, or the next probe inherits this one's
				// siblings (an <li> after an <li> is a different list item).
				while (doc.body.firstChild) doc.body.removeChild(doc.body.firstChild);

				cache.set(tag, out);
				return out;
			},
			destroy() {
				frame.remove();
			},
		};
	}

	// ── Style extraction ─────────────────────────────────────────────────────────

	/**
	 * The declarations that are actually load-bearing for one element: everything
	 * whose computed value differs from what the output document would produce on
	 * its own, given RESET and the parent's already-emitted styles.
	 *
	 * @param {Element} el
	 * @param {CSSStyleDeclaration} computed
	 * @param {CSSStyleDeclaration | null} parentComputed
	 * @param {number} parentWidth
	 * @param {Record<string, string>} baseline
	 * @param {Options} opts
	 * @returns {string[]} `prop:value` strings
	 */
	function extractStyles(el, computed, parentComputed, parentWidth, baseline, opts) {
		const tag = el.tagName.toLowerCase();
		const emitSize = shouldEmitSize(tag, computed, parentComputed, parentWidth, opts);
		/** @type {string[]} */
		const decls = [];

		for (let i = 0; i < computed.length; i++) {
			const prop = computed[i];
			if (DROP_PROPS.has(prop)) continue;
			if (opts.props === 'visual' && !VISUAL_PROPS.has(prop)) continue;
			if (prop === 'width' && !emitSize.width) continue;
			if (prop === 'height' && !emitSize.height) continue;

			const value = computed.getPropertyValue(prop);
			if (!value) continue;

			// The two diffs. An inherited property is compared against the parent
			// because the output will inherit it; everything else against the tag's
			// baseline because the output will fall back to it.
			const expected =
				INHERITED.has(prop) && parentComputed && opts.inheritPrune
					? parentComputed.getPropertyValue(prop)
					: baseline[prop];

			if (value === expected) continue;

			// A used-value `auto` margin: the page centred this box and the browser
			// told us the answer in px. Emitting the px pins it to the capture width;
			// recognising the pattern keeps the box centred at any width AND is
			// shorter. Only horizontal, only when both sides agree — a vertical or
			// asymmetric match is far more likely to be a coincidence than an `auto`.
			if (prop === 'margin-left' && opts.restoreAuto && isCentred(computed)) {
				decls.push('margin-inline:auto');
				continue;
			}
			if (prop === 'margin-right' && opts.restoreAuto && isCentred(computed)) continue;

			// Fluid mode rewrites the two properties that carry a used pixel value the
			// author never wrote — a box's width and a grid's track sizes — into the
			// relative form the author probably did write. Both resolve to the same
			// pixels at capture width, so nothing moves; both follow the container
			// when it changes, so the capture survives being read on a phone.
			if (opts.sizing === 'fluid') {
				if (prop === 'width' && emitSize.relative) {
					const relative = asPercentage(computed, parentWidth);
					if (relative) {
						decls.push('width:' + relative);
						continue;
					}
				}
				if (prop === 'grid-template-columns' || prop === 'grid-template-rows') {
					const tracks = asFractions(value);
					if (tracks) {
						decls.push(prop + ':' + tracks);
						continue;
					}
				}
			}

			decls.push(prop + ':' + shorten(prop, value));
		}

		return decls;
	}

	/**
	 * An in-flow box's border-box width as a percentage of its containing block.
	 *
	 * Percentages resolve against the containing block's content width, and the
	 * generated stylesheet puts everything in `border-box`, so the numerator is the
	 * content width plus padding and borders. Returns null where a percentage would
	 * not mean the same thing — an out-of-flow box (whose containing block is not
	 * the parent), a degenerate parent, or a value that rounds to something that is
	 * no shorter than the pixels it replaces.
	 *
	 * @param {CSSStyleDeclaration} computed
	 * @param {number} parentWidth
	 * @returns {string | null}
	 */
	function asPercentage(computed, parentWidth) {
		if (!(parentWidth > 0)) return null;
		// The generated stylesheet puts everything in border-box, but the captured
		// page's own `box-sizing` is copied along with everything else, and under
		// content-box a percentage width means the content box instead. Measure
		// whichever box the output will actually apply the percentage to.
		const borderBox = computed.boxSizing !== 'content-box';
		const border = borderBox
			? parseFloat(computed.width) +
				parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight) +
				parseFloat(computed.borderLeftWidth) + parseFloat(computed.borderRightWidth)
			: parseFloat(computed.width);
		if (!Number.isFinite(border)) return null;
		const ratio = (border / parentWidth) * 100;
		if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 100.5) return null;
		// Two decimals is finer than a pixel at any realistic container width, and
		// `100%` — by far the most common answer — collapses to four characters.
		const rounded = Math.round(ratio * 100) / 100;
		return (rounded >= 99.99 ? 100 : rounded) + '%';
	}

	/**
	 * Rewrite a used grid track list (`213.33px 213.33px 213.33px`) as fractions.
	 *
	 * The browser reports the pixels it chose, which freezes the grid at the width
	 * it was measured at. Proportional `fr` units reproduce exactly those pixels in
	 * a container of the same width and track the container everywhere else, which
	 * is what the author's `repeat(3, 1fr)` or `2fr 1fr` did in the first place.
	 * Only all-pixel lists are converted: anything with a keyword, a name, or a
	 * function in it is already relative, or is too subtle to second-guess.
	 *
	 * @param {string} value
	 * @returns {string | null}
	 */
	function asFractions(value) {
		if (!value || value === 'none') return null;
		const parts = value.trim().split(/\s+/);
		if (parts.length < 2) return null;
		if (!parts.every((p) => /^-?[\d.]+px$/.test(p))) return null;
		const sizes = parts.map(parseFloat);
		const smallest = Math.min(...sizes);
		if (!(smallest > 0)) return null;
		const fractions = sizes.map((size) => {
			const f = Math.round((size / smallest) * 1000) / 1000;
			return f + 'fr';
		});
		// `repeat()` is shorter than the list as soon as there are three equal tracks.
		const uniform = fractions.every((f) => f === fractions[0]);
		return uniform && fractions.length > 2
			? `repeat(${fractions.length},${fractions[0]})`
			: fractions.join(' ');
	}

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
	 * Whether to copy this element's used width and height.
	 *
	 * This is the single most consequential knob in the whole capture — it is worth
	 * roughly ten percentage points of pixel fidelity and roughly ten percent of the
	 * link — so all four settings exist and are measured:
	 *
	 *   none     — never. Smallest, and the layout is rebuilt from the box
	 *              properties alone. Reflows freely; drifts visibly.
	 *   replaced — only where nothing else could determine a size: images, out-of-
	 *              flow boxes. Barely better than `none` in practice.
	 *   smart    — everywhere except where the width is provably redundant, i.e.
	 *              where an in-flow block already fills its containing block and
	 *              would compute the same width unaided. Keeps reflow for exactly
	 *              the boxes that reflow correctly.
	 *   fluid    — `smart`, plus: the widths it does keep are written as a
	 *              percentage of the containing block rather than as pixels, and
	 *              used grid track lists become `fr`. The aim is `all`'s fidelity
	 *              with `none`'s ability to reflow.
	 *   all      — always, in pixels. Pixel-exact at capture width, frozen at that
	 *              width.
	 *
	 * `smart` is the interesting one and the reason `parentWidth` is threaded down
	 * the walk. A block box in normal flow has `width:auto` resolve to "whatever is
	 * left of the containing block after my own margins, borders and padding", and
	 * that is a sum we can check: if the element's outer width already equals the
	 * parent's content width, its width carries no information the output cannot
	 * re-derive, and dropping it costs nothing while restoring the ability to
	 * reflow. If it doesn't match, the width came from somewhere — a percentage, a
	 * flex basis, a table column, a `max-width` interacting with centring — and is
	 * kept.
	 *
	 * Heights are treated far more conservatively than widths: a block's height is
	 * `auto` far more often than its width is, and a wrong height is a clipped or
	 * gaping box rather than a slightly narrow one. Under `smart`, height is copied
	 * only where the box is scrollable or clipped, out of flow, or replaced.
	 *
	 * @param {string} tag
	 * @param {CSSStyleDeclaration} computed
	 * @param {CSSStyleDeclaration | null} parentComputed
	 * @param {number} parentWidth content-box width of the containing block, in px
	 * @param {Options} opts
	 * @returns {{ width: boolean, height: boolean, relative: boolean }}
	 */
	function shouldEmitSize(tag, computed, parentComputed, parentWidth, opts) {
		if (opts.sizing === 'all') return { width: true, height: true, relative: false };
		if (opts.sizing === 'none') return { width: false, height: false, relative: false };

		const outOfFlow = computed.position === 'absolute' || computed.position === 'fixed';
		const replaced = REPLACED.has(tag);

		if (opts.sizing === 'replaced') {
			const on = replaced || outOfFlow;
			return { width: on, height: on, relative: false };
		}

		// `smart` and `fluid` share every decision about *whether* to emit a size and
		// differ only in what units the width is written in.
		const relative = opts.sizing === 'fluid';

		// A height is copied only where nothing else could produce it. Unlike widths,
		// block heights are `auto` almost always, and a copied height that should
		// have been auto clips or stretches its content instead of merely being a bit
		// narrow — so the bar for keeping one is higher.
		const clipped = computed.overflowY !== 'visible' || computed.overflowX !== 'visible';
		const height = replaced || outOfFlow || clipped;

		// Out-of-flow boxes are positioned against a containing block that is not
		// necessarily the parent, so a percentage would mean something different.
		if (replaced || outOfFlow) return { width: true, height, relative: false };

		// A flex or grid item's width is an *output* of its container's layout, and
		// the inputs — flex-grow, flex-shrink, flex-basis, the track list, gap — are
		// all copied. Re-stating the result as a width fights the algorithm that
		// produced it, which is exactly where the first attempt at fluid mode went
		// wrong: percentages and flex sizing disagreed, and the disagreement showed
		// up as a few percent of drifted pixels on every flex-heavy page.
		const parentDisplay = parentComputed?.display ?? '';
		if (parentDisplay.includes('flex') || parentDisplay.includes('grid')) {
			return { width: false, height, relative: false };
		}

		if (!IN_FLOW_BLOCK.has(computed.display) || computed.float !== 'none') {
			return { width: true, height, relative: false };
		}

		// Does `width:auto` already give this box the width it has?
		const outer =
			parseFloat(computed.width) +
			parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight) +
			parseFloat(computed.borderLeftWidth) + parseFloat(computed.borderRightWidth) +
			parseFloat(computed.marginLeft) + parseFloat(computed.marginRight);

		// Half a pixel of slack: used values are fractional and the sum of six of
		// them accumulates rounding the browser itself does not care about.
		const redundant = Number.isFinite(outer) && Math.abs(outer - parentWidth) < 0.6;
		return { width: !redundant, height, relative };
	}

	/**
	 * Styles for an element's ::before/::after, if it has any.
	 *
	 * Worth the second and third getComputedStyle call per element: pseudo-elements
	 * are where icon fonts, quote marks, dividers, focus rings, and most of a design
	 * system's decorative layer live. A capture without them is visibly missing
	 * things in a way that reads as "broken" rather than "simplified".
	 * @param {Element} el
	 * @param {Record<string, string>} baseline
	 * @param {Options} opts
	 * @returns {{ before: string[] | null, after: string[] | null }}
	 */
	function extractPseudo(el, baseline, opts) {
		/** @param {'::before' | '::after'} which */
		const read = (which) => {
			const computed = getComputedStyle(el, which);
			const content = computed.getPropertyValue('content');
			// `none` is "no pseudo element"; `normal` is what non-generating contexts
			// report. Either way there is nothing to draw.
			if (!content || content === 'none' || content === 'normal') return null;

			/** @type {string[]} */
			const decls = [];
			for (let i = 0; i < computed.length; i++) {
				const prop = computed[i];
				if (DROP_PROPS.has(prop)) continue;
				if (opts.props === 'visual' && !VISUAL_PROPS.has(prop)) continue;
				const value = computed.getPropertyValue(prop);
				if (!value) continue;
				// A pseudo-element inherits from its originating element, so that is the
				// right comparison for inherited properties; the baseline covers the rest.
				const expected = INHERITED.has(prop)
					? getComputedStyle(el).getPropertyValue(prop)
					: baseline[prop];
				if (value === expected) continue;
				decls.push(prop + ':' + shorten(prop, value));
			}
			return decls.length ? decls : null;
		};

		return { before: read('::before'), after: read('::after') };
	}

	// ── Class name generation ────────────────────────────────────────────────────

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

	// ── Class assignment strategies ──────────────────────────────────────────────

	/**
	 * Turn per-element declaration lists into a stylesheet plus a class list per
	 * element. This is step 4 of the idea and the part with genuine design space,
	 * so all four candidates are implemented and measured rather than argued about.
	 *
	 *   inline  — no classes at all, `style=""` on every element. The control.
	 *   exact   — one class per distinct declaration *set*. What snapDOM's compress
	 *             mode does. Markup is minimal (one token per element); the
	 *             stylesheet repeats every declaration once per distinct set.
	 *   atomic  — one class per distinct *declaration*. Tailwind/StyleX shape. The
	 *             stylesheet is minimal (every declaration appears once); the markup
	 *             pays for it, with dozens of class tokens per element.
	 *   merged  — the hybrid. Declarations that appear on exactly the same set of
	 *             elements are emitted as one multi-declaration class, so the
	 *             stylesheet still holds each declaration once but the markup spends
	 *             one token per *group* instead of one per declaration. Groups used
	 *             by a single element are folded back into `style=""`, where they
	 *             cost nothing to name.
	 *
	 * `merged` is the one worth explaining. Grouping declarations by the set of
	 * elements carrying them is, in effect, rediscovering the page's original CSS
	 * rules from their effects: every declaration that shared a selector in the
	 * source shares an element set here, and comes back out as one class. It needs
	 * no cost model and no search — the grouping is an equivalence relation, so it
	 * is exact and linear. The greedy biclique-cover step that would squeeze the
	 * *partially* overlapping groups further is deliberately not implemented; see
	 * the README for why the measurements say it isn't worth it.
	 *
	 * @param {string[][]} styleSets per-element declaration lists
	 * @param {'inline' | 'exact' | 'atomic' | 'merged'} strategy
	 * @returns {{ rules: string[], classesFor: (string[] | null)[], inlineFor: (string | null)[] }}
	 */
	function assignClasses(styleSets, strategy) {
		const count = styleSets.length;
		/** @type {(string[] | null)[]} */
		const classesFor = Array.from({ length: count }, () => null);
		/** @type {(string | null)[]} */
		const inlineFor = Array.from({ length: count }, () => null);

		if (strategy === 'inline') {
			for (let i = 0; i < count; i++) {
				if (styleSets[i].length) inlineFor[i] = styleSets[i].join(';');
			}
			return { rules: [], classesFor, inlineFor };
		}

		if (strategy === 'exact') {
			/** @type {Map<string, number[]>} */
			const bySignature = new Map();
			for (let i = 0; i < count; i++) {
				if (!styleSets[i].length) continue;
				const signature = styleSets[i].join(';');
				const bucket = bySignature.get(signature);
				if (bucket) bucket.push(i);
				else bySignature.set(signature, [i]);
			}
			// Most-used signature gets the shortest name.
			const ordered = [...bySignature.entries()].sort((a, b) => b[1].length - a[1].length);
			const rules = [];
			ordered.forEach(([signature, members], index) => {
				const name = className(index);
				rules.push(`.${name}{${signature}}`);
				for (const member of members) classesFor[member] = [name];
			});
			return { rules, classesFor, inlineFor };
		}

		// Both `atomic` and `merged` start from the same index: declaration → the
		// elements carrying it. A string key per element set is enough to group by —
		// element indices are emitted in ascending order, so equal sets produce equal
		// keys without any set comparison.
		/** @type {Map<string, number[]>} */
		const owners = new Map();
		for (let i = 0; i < count; i++) {
			for (const decl of styleSets[i]) {
				const bucket = owners.get(decl);
				if (bucket) bucket.push(i);
				else owners.set(decl, [i]);
			}
		}

		/** @type {{ decls: string[], members: number[] }[]} */
		let groups;

		if (strategy === 'atomic') {
			groups = [...owners.entries()].map(([decl, members]) => ({ decls: [decl], members }));
		} else {
			// Declarations whose element sets are identical always travel together, so
			// they can share one class with no loss and no search.
			/** @type {Map<string, { decls: string[], members: number[] }>} */
			const byMembers = new Map();
			for (const [decl, members] of owners) {
				const key = members.join(',');
				const hit = byMembers.get(key);
				if (hit) hit.decls.push(decl);
				else byMembers.set(key, { decls: [decl], members });
			}
			groups = [...byMembers.values()];
		}

		// A group used by one element would spend a class name, a rule, and a markup
		// token to say something `style=""` says once. Fold those back inline.
		/** @type {string[][]} */
		const inlineDecls = Array.from({ length: count }, () => []);
		const shared = [];
		for (const group of groups) {
			if (group.members.length === 1) {
				inlineDecls[group.members[0]].push(...group.decls);
			} else {
				shared.push(group);
			}
		}

		// Sort by how many markup tokens the name will be written into, so the
		// shortest names go where they are repeated most.
		shared.sort((a, b) => b.members.length - a.members.length);

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

	// ── Serialization ────────────────────────────────────────────────────────────

	const VOID_TAGS = new Set([
		'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
		'link', 'meta', 'source', 'track', 'wbr',
	]);

	/** @param {string} s @returns {string} */
	function escapeText(s) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	/** @param {string} s @returns {string} */
	function escapeAttr(s) {
		return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
	}

	/**
	 * Render the captured tree as ordinary HTML.
	 * @param {CapNode} node
	 * @returns {string}
	 */
	function toHtml(node) {
		if (node.kind === 'text') return escapeText(node.text);
		if (node.kind === 'raw') return node.html;

		let attrs = '';
		if (node.classes?.length) attrs += ` class="${node.classes.join(' ')}"`;
		if (node.inline) attrs += ` style="${escapeAttr(node.inline)}"`;
		for (const [name, value] of node.attrs) attrs += ` ${name}="${escapeAttr(value)}"`;

		if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrs}>`;
		const children = node.children.map(toHtml).join('');
		return `<${node.tag}${attrs}>${children}</${node.tag}>`;
	}

	/**
	 * Render the captured tree in the compact s-expression form:
	 *
	 *   (div.a.b "Hello "(i.a.c "world"))
	 *
	 * The grammar is whitespace-free and self-delimiting, which is the whole point:
	 * `(` starts an element, `"` starts a text node, `)` closes, and nothing else
	 * needs a separator. `div` is the most common tag on essentially every page, so
	 * it is the default and written as nothing at all — `(.a.b ...)` is a div.
	 *
	 *   element := "(" tag? ("." class)* ("{" attr ("|" attr)* "}")? child* ")"
	 *   text    := '"' escaped '"'
	 *   raw     := "!" '"' escaped '"'      (an untouched HTML island, e.g. <svg>)
	 *
	 * Escaping is `\` before a `"` or `\` inside a string, and before `|`, `}` or
	 * `\` inside an attribute value.
	 *
	 * @param {CapNode} node
	 * @returns {string}
	 */
	function toSexp(node) {
		if (node.kind === 'text') return '"' + node.text.replace(/[\\"]/g, '\\$&') + '"';
		if (node.kind === 'raw') return '!"' + node.html.replace(/[\\"]/g, '\\$&') + '"';

		let out = '(' + (node.tag === 'div' ? '' : node.tag);
		if (node.classes?.length) out += '.' + node.classes.join('.');

		const attrs = [...node.attrs];
		if (node.inline) attrs.unshift(['style', node.inline]);
		if (attrs.length) {
			out += '{' + attrs.map(([n, v]) => n + '=' + v.replace(/[\\|}]/g, '\\$&')).join('|') + '}';
		}

		for (const child of node.children) out += toSexp(child);
		return out + ')';
	}

	// ── The walk ─────────────────────────────────────────────────────────────────

	/**
	 * @typedef {{ kind: 'el', tag: string, attrs: [string, string][], children: CapNode[],
	 *             classes: string[] | null, inline: string | null, index: number }
	 *          | { kind: 'text', text: string }
	 *          | { kind: 'raw', html: string }} CapNode
	 *
	 * @typedef {{
	 *   strategy: 'inline' | 'exact' | 'atomic' | 'merged',
	 *   tree: 'html' | 'sexp',
	 *   props: 'visual' | 'all',
	 *   sizing: 'none' | 'replaced' | 'smart' | 'fluid' | 'all',
	 *   pseudo: boolean,
	 *   inheritPrune: boolean,
	 *   restoreAuto: boolean,
	 *   fitViewport: boolean,
	 * }} Options
	 */

	/** @type {Options} */
	const DEFAULTS = {
		strategy: 'merged',
		tree: 'html',
		props: 'visual',
		sizing: 'all',
		pseudo: true,
		inheritPrune: true,
		restoreAuto: true,
		fitViewport: true,
	};

	/**
	 * @param {string} value
	 * @param {string} base
	 * @returns {string}
	 */
	function absolutize(value, base) {
		const trimmed = value.trim();
		if (!trimmed || trimmed.startsWith('#') || /^(data|blob|javascript|mailto):/i.test(trimmed)) {
			return value;
		}
		try {
			return new URL(trimmed, base).href;
		} catch {
			return value;
		}
	}

	/**
	 * Capture the page.
	 * @param {Partial<Options>} [options]
	 * @returns {{ css: string, tree: string, doc: string, stats: object }}
	 */
	function capture(options = {}) {
		/** @type {Options} */
		const opts = { ...DEFAULTS, ...options };
		const started = performance.now();
		const base = document.baseURI || location.href;
		const baseline = createBaseline();

		/** @type {string[][]} */
		const styleSets = [];
		/** @type {{ index: number, which: '::before' | '::after', decls: string[] }[]} */
		const pseudoStyles = [];
		let rawIslands = 0;
		let skippedInvisible = 0;

		/**
		 * @param {Node} node
		 * @param {CSSStyleDeclaration | null} parentComputed
		 * @param {number} parentWidth content-box width of the containing block
		 * @returns {CapNode | null}
		 */
		function walk(node, parentComputed, parentWidth) {
			if (node.nodeType === Node.TEXT_NODE) {
				const text = node.nodeValue ?? '';
				return text ? { kind: 'text', text } : null;
			}
			if (node.nodeType !== Node.ELEMENT_NODE) return null;

			const el = /** @type {Element} */ (node);
			const tag = el.tagName.toLowerCase();
			if (SKIP_TAGS.has(tag)) return null;

			// SVG is geometry, not style: the shape lives in `d`, `points` and
			// `viewBox` attributes that no amount of computed CSS reconstructs. Keep
			// the subtree verbatim and move on — it is the one place this method has
			// to fall back to copying markup.
			if (tag === 'svg') {
				rawIslands++;
				return { kind: 'raw', html: el.outerHTML };
			}

			const computed = getComputedStyle(el);

			// An element the browser decided not to draw contributes nothing but its
			// subtree's absence. `display:none` is the common case (mobile nav, modals,
			// tab panels) and skipping it is most of the difference between capturing a
			// page and capturing every state a page can be in.
			if (computed.display === 'none') {
				skippedInvisible++;
				return null;
			}

			const index = styleSets.length;
			styleSets.push(
				extractStyles(el, computed, parentComputed, parentWidth, baseline.get(tag), opts),
			);

			if (opts.pseudo) {
				const { before, after } = extractPseudo(el, baseline.get(tag), opts);
				if (before) pseudoStyles.push({ index, which: '::before', decls: before });
				if (after) pseudoStyles.push({ index, which: '::after', decls: after });
			}

			/** @type {[string, string][]} */
			const attrs = [];
			for (const attr of el.attributes) {
				const name = attr.name.toLowerCase();
				if (!KEEP_ATTRS.has(name)) continue;
				let value = attr.value;
				if (name === 'href' || name === 'src') value = absolutize(value, base);
				if (value) attrs.push([name, value]);
			}

			// The containing block for ordinary children is this element's content box.
			const ownWidth = parseFloat(computed.width);

			/** @type {CapNode[]} */
			const children = [];
			for (const child of el.childNodes) {
				const built = walk(child, computed, ownWidth);
				if (built) children.push(built);
			}

			return { kind: 'el', tag, attrs, children, classes: null, inline: null, index };
		}

		// `body` is the output's root element, so for inheritance purposes it has no
		// parent to prune against — but it does have a containing block, and the
		// `smart` sizing check needs its width.
		const rootWidth = parseFloat(getComputedStyle(document.documentElement).width);
		const root = walk(document.body, null, rootWidth);
		baseline.destroy();
		if (!root || root.kind !== 'el') throw new Error('nothing to capture');

		const walked = performance.now();

		// Pseudo-element rules are assigned their own classes: they cannot share the
		// element pool because they need a different selector, and there are few
		// enough of them that a separate exact-match pass is all they need.
		const { rules, classesFor, inlineFor } = assignClasses(styleSets, opts.strategy);
		const pseudoRules = [];
		/** @type {Map<number, string[]>} */
		const pseudoClasses = new Map();
		/** @type {Map<string, string>} */
		const pseudoNames = new Map();
		for (const { index, which, decls } of pseudoStyles) {
			const signature = which + '{' + decls.join(';') + '}';
			let name = pseudoNames.get(signature);
			if (!name) {
				name = 'p' + className(pseudoNames.size);
				pseudoNames.set(signature, name);
				pseudoRules.push(`.${name}${which}{${decls.join(';')}}`);
			}
			const list = pseudoClasses.get(index);
			if (list) list.push(name);
			else pseudoClasses.set(index, [name]);
		}

		// Hand the assigned names back to the tree.
		(function apply(node) {
			if (node.kind !== 'el') return;
			const own = classesFor[node.index] ?? [];
			const pseudo = pseudoClasses.get(node.index) ?? [];
			const all = own.concat(pseudo);
			node.classes = all.length ? all : null;
			node.inline = inlineFor[node.index];
			for (const child of node.children) apply(child);
		})(root);

		const css = RESET + rules.join('') + pseudoRules.join('');
		const tree = opts.tree === 'sexp' ? toSexp(root) : toHtml(root);

		const declCount = styleSets.reduce((sum, set) => sum + set.length, 0);
		const distinctDecls = new Set();
		for (const set of styleSets) for (const decl of set) distinctDecls.add(decl);

		return {
			css,
			tree,
			doc: buildDocument(css, tree, opts, window.innerWidth),
			stats: {
				elements: styleSets.length,
				skippedInvisible,
				rawIslands,
				declarations: declCount,
				distinctDeclarations: distinctDecls.size,
				declarationsPerElement: +(declCount / Math.max(1, styleSets.length)).toFixed(1),
				classes: rules.length,
				pseudoRules: pseudoRules.length,
				msWalk: Math.round(walked - started),
				msTotal: Math.round(performance.now() - started),
			},
		};
	}

	// The s-expression decoder, shipped inside any capture that uses the compact
	// tree. Written as a string rather than a function so it can go into the output
	// document verbatim; it is the fixed cost the format has to earn back.
	const DECODER = `(()=>{const s=document.getElementById('t').textContent;let i=0;
const T=(q)=>{let o='';i++;for(;s[i]!==q;i++){if(s[i]==='\\\\')i++;o+=s[i]}i++;return o};
const N=(p)=>{for(;i<s.length;){const c=s[i];
if(c===')'){i++;return}
if(c==='"'){p.appendChild(document.createTextNode(T('"')));continue}
if(c==='!'){i++;const d=document.createElement('div');d.innerHTML=T('"');p.append(...d.childNodes);continue}
i++;let t='';for(;/[a-z0-9-]/i.test(s[i]);i++)t+=s[i];
const e=document.createElementNS(t==='svg'?'http://www.w3.org/2000/svg':'http://www.w3.org/1999/xhtml',t||'div');
while(s[i]==='.'){i++;let n='';for(;/[\\w-]/.test(s[i]);i++)n+=s[i];e.classList.add(n)}
if(s[i]==='{'){i++;for(;;){let k='';for(;s[i]!=='=';i++)k+=s[i];i++;let v='';
for(;s[i]!=='|'&&s[i]!=='}';i++){if(s[i]==='\\\\')i++;v+=s[i]}e.setAttribute(k,v);
if(s[i]==='}'){i++;break}i++}}
N(e);p.appendChild(e)}};
N(document.body)})()`;

	/**
	 * Wrap a capture into a standalone document, exactly as a link would carry it.
	 * @param {string} css
	 * @param {string} tree
	 * @param {Options} opts
	 * @param {number} width the viewport width the capture was taken at
	 * @returns {string}
	 */
	function buildDocument(css, tree, opts, width) {
		// A computed-style capture is a snapshot at one width and cannot be anything
		// else: `@media` rules are not part of a computed style, so by the time the
		// walk runs the browser has already collapsed "three columns above 992px, one
		// below" into "three columns", and what it would take to undo that is gone.
		// Relaxing the widths anyway doesn't make it responsive, it just makes it
		// wrong — which is exactly what sizing:smart and sizing:fluid measure.
		//
		// So the capture declares the width it was taken at instead of claiming to be
		// device-width, and a phone lays it out at that width and scales the result to
		// fit. The reader gets the same page, smaller, which is what a snapshot of a
		// desktop page should look like on a phone; `width=device-width` would instead
		// promise a reflow the document cannot perform and deliver a sideways scroll.
		const viewport = opts.fitViewport
			? `width=${Math.round(width)}`
			: 'width=device-width,initial-scale=1';

		const head =
			'<!doctype html><html><head><meta charset="utf-8">' +
			`<meta name="viewport" content="${viewport}">` +
			'<meta name="referrer" content="no-referrer">' +
			`<style>${css}</style></head>`;

		if (opts.tree === 'html') return `${head}<body>${tree}</body></html>`;

		// The compact tree is not markup, so it travels in a script tag the parser
		// will not touch and is turned into DOM by the decoder. `</script>` is the
		// only sequence that could end the block early — spelled in pieces here so
		// that this file can itself be inlined into a page without the same problem.
		const close = '<' + '/script>';
		return (
			head +
			'<body><script type="text/plain" id="t">' +
			tree.replace(/<\/script/gi, '<\\/script') +
			close + '<script>' + DECODER + close + '</body></html>'
		);
	}

	globalThis.__linkifyScrape = { capture, DECODER, RESET };
})();
