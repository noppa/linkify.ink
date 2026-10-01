// @ts-check
import { test, expect } from '@playwright/test';
import * as path from 'node:path';

// The extension's full-page capture rebuilds a page from computed styles. The
// method is only sound if the reset rule it emits agrees with the baseline it
// diffs against — get that wrong and the failure is silent: the capture still
// looks plausible, and every <pre> has lost its line breaks. So this test does
// not pixel-diff (fonts and antialiasing make that brittle); it measures the box,
// colours and text of a set of probe elements in a fixture page, captures it,
// renders the capture in the same viewport, and demands the same numbers back.

// Playwright loads specs through its CommonJS transform (package.json has no
// "type": "module"), where import.meta is a syntax error.
const root = path.join(__dirname, '..');

// Every probe is reachable from a fragment link, which is the condition under
// which the capture keeps an element's id.
const PROBES = [
	'p-heading', 'p-para', 'p-em', 'p-pre', 'p-flex', 'p-flex-item', 'p-grid-cell',
	'p-table-cell', 'p-list-item', 'p-deco', 'p-slotted', 'p-icon', 'p-img', 'p-check',
];

const FIXTURE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Capture fixture</title>
<style>
	html { background: #f4f1ea; font: 18px/1.5 sans-serif; color: #222; }
	body { max-width: 720px; margin: 32px auto; padding: 0 24px; }
	nav a { margin-right: 6px; font-size: 12px; }
	h1 { color: #7a1f1f; letter-spacing: 0.04em; font-size: 2em; margin: 0.5em 0; }
	.lede { color: #444; }
	.lede em { color: #0b5cad; font-style: normal; font-weight: 700; }
	pre { background: #1e1e1e; color: #eee; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
	code { font-family: monospace; font-size: 0.9em; }
	.row { display: flex; gap: 12px; margin: 16px 0; }
	.row > div { flex: 1; padding: 10px; background: #fff; border: 1px solid #ccc; border-radius: 8px; }
	.grid { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
	.grid > div { background: #e6efff; padding: 6px; }
	table { border-collapse: collapse; width: 100%; }
	td, th { border: 1px solid #999; padding: 4px 8px; text-align: left; }
	ul { padding-left: 1.5em; list-style: square; }
	.deco::before { content: "★ "; color: #c08a00; }
	.deco::after { content: ""; display: block; height: 4px; background: #c08a00; margin-top: 4px; }
	.hidden { display: none; }
	.icon { width: 24px; height: 24px; fill: #0b5cad; vertical-align: middle; }
	.thumb { width: 120px; height: 80px; object-fit: cover; background: #ddd; }
</style>
</head>
<body>
<nav>${PROBES.map((id) => `<a href="#${id}">${id}</a>`).join('')}</nav>
<svg class="hidden" xmlns="http://www.w3.org/2000/svg"><symbol id="sprite-icon" viewBox="0 0 10 10"><rect width="10" height="10" rx="2"/></symbol></svg>
<h1 id="p-heading">A fixture for the capture</h1>
<p id="p-para" class="lede">Inherited colour, with <em id="p-em">an emphasised run</em> that is not.</p>
<pre id="p-pre"><code>line one
    line two, indented
line three</code></pre>
<div id="p-flex" class="row"><div id="p-flex-item">one</div><div>two</div><div>three</div></div>
<div class="grid"><div id="p-grid-cell">wide</div><div>narrow</div></div>
<table><tr><th>k</th><th>v</th></tr><tr><td id="p-table-cell">key</td><td>value</td></tr></table>
<ul><li id="p-list-item">first</li><li>second</li></ul>
<p id="p-deco" class="deco">Decorated by pseudo-elements</p>
<p class="hidden">HIDDEN-TEXT-MUST-NOT-SHIP</p>
<x-card><span id="p-slotted">Slotted text</span></x-card>
<p><svg id="p-icon" class="icon"><use href="#sprite-icon"></use></svg> icon via sprite</p>
<img id="p-img" class="thumb" src="https://example.invalid/never-loads.png" alt="thumb">
<label><input id="p-check" type="checkbox"> ticked at capture time</label>
<script>
	customElements.define('x-card', class extends HTMLElement {
		constructor() {
			super();
			this.attachShadow({ mode: 'open' }).innerHTML =
				'<style>:host{display:block;border:2px solid #7a1f1f;padding:8px;margin:12px 0}.inner{color:#0b5cad}</style>' +
				'<div class="inner"><slot></slot></div>';
		}
	});
	document.getElementById('p-check').checked = true;
</script>
</body>
</html>`;

/**
 * @param {import('@playwright/test').Page} page
 * @param {string[]} ids
 */
function measure(page, ids) {
	return page.evaluate((ids) =>
		ids.map((id) => {
			const el = document.getElementById(id);
			if (!el) return { id, missing: true };
			const rect = el.getBoundingClientRect();
			const style = getComputedStyle(el);
			return {
				id,
				x: rect.x, y: rect.y, width: rect.width, height: rect.height,
				color: style.color,
				background: style.backgroundColor,
				fontSize: style.fontSize,
				fontWeight: style.fontWeight,
				whiteSpace: style.whiteSpace,
				before: getComputedStyle(el, '::before').content,
				after: getComputedStyle(el, '::after').content,
				text: el.textContent,
			};
		}), ids);
}

test('full-page capture reproduces the rendered page', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.setContent(FIXTURE);
	const live = await measure(page, PROBES);

	// Same injection order as the service worker's CAPTURE_FILES.
	await page.addScriptTag({ path: path.join(root, 'vendor', 'vendor.readability.bundle.js') });
	await page.addScriptTag({ path: path.join(root, 'extension', 'content', 'capture.js') });
	const capture = await page.evaluate(() =>
		globalThis.__linkifyInkCapture({ mode: 'full' }),
	);

	expect(capture.mode).toBe('full');
	expect(capture.width).toBe(1280);
	expect(capture.linkedImages).toBe(1);
	expect(capture.html).toContain('content="width=1280"');
	expect(capture.html).toContain('<title>Capture fixture</title>');
	// Nothing of the page's own machinery ships: no scripts, no stylesheets, no
	// class names that point at them, no hidden subtrees.
	expect(capture.html).not.toContain('<script');
	expect(capture.html).not.toContain('<link');
	expect(capture.html).not.toMatch(/class="[^"]*\b(lede|row|grid|deco|icon|thumb)\b/);
	expect(capture.html).not.toContain('HIDDEN-TEXT-MUST-NOT-SHIP');
	// The sprite reference was inlined rather than left pointing at a symbol that
	// no longer exists, and the shadow tree was flattened.
	expect(capture.html).toContain('<rect');
	expect(capture.html).not.toContain('<use');
	expect(capture.html).not.toContain('<slot');
	expect(capture.html).not.toContain('<x-card>');
	// Live form state, and fragment targets, survive.
	expect(capture.html).toMatch(/<input[^>]*checked=""/);
	expect(capture.html).toContain('href="#p-pre"');
	expect(capture.html).toContain('id="p-pre"');

	await page.setContent(capture.html);
	const rebuilt = await measure(page, PROBES);

	for (const [i, expected] of live.entries()) {
		const actual = rebuilt[i];
		expect(actual, expected.id).toBeDefined();
		if ('missing' in expected || 'missing' in actual) {
			throw new Error(`${expected.id}: missing in ${'missing' in expected ? 'live' : 'rebuilt'} page`);
		}
		// Used values are written to two decimals, so a box may land a fraction of a
		// pixel off; anything past a pixel is a real difference.
		for (const key of /** @type {const} */ (['x', 'y', 'width', 'height'])) {
			expect(Math.abs(actual[key] - expected[key]), `${expected.id}.${key}`).toBeLessThanOrEqual(1);
		}
		// Font sizes are rounded to two decimals too: a form control's default
		// 13.3333px comes back as 13.33px.
		const fontSizeDiff = Math.abs(parseFloat(actual.fontSize) - parseFloat(expected.fontSize));
		expect(fontSizeDiff, `${expected.id}.fontSize`).toBeLessThanOrEqual(0.005);
		for (const key of /** @type {const} */ ([
			'color', 'background', 'fontWeight', 'whiteSpace', 'before', 'after', 'text',
		])) {
			expect(actual[key], `${expected.id}.${key}`).toBe(expected[key]);
		}
	}
});

test('full-page capture drops base64 images', async ({ page }) => {
	// A real (tiny) SVG, base64-encoded, so the live page actually renders it.
	const svg = btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');
	const b64 = `data:image/svg+xml;base64,${svg}`;
	const utf8 = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E`;
	await page.setContent(`<!doctype html>
<html><head><style>
	.bg { width: 20px; height: 20px; background: url("${b64}") no-repeat, linear-gradient(red, blue); }
	.mask { width: 20px; height: 20px; background: #000; mask-image: url("${b64}"); }
	.plain { width: 20px; height: 20px; background-image: url("${utf8}"); }
	li { list-style-image: url("${b64}"); }
	.deco::before { content: url("${b64}"); }
</style></head><body>
<img id="inline" src="${b64}" alt="inline logo" width="40" height="20">
<img src="https://example.invalid/linked.png" alt="linked">
<div class="bg"></div><div class="mask"></div><div class="plain"></div>
<ul><li>item</li></ul>
<p class="deco">decorated</p>
<svg width="10" height="10"><image href="${b64}" width="10" height="10"/></svg>
</body></html>`);

	await page.addScriptTag({ path: path.join(root, 'vendor', 'vendor.readability.bundle.js') });
	await page.addScriptTag({ path: path.join(root, 'extension', 'content', 'capture.js') });
	const capture = await page.evaluate(() => globalThis.__linkifyInkCapture({ mode: 'full' }));

	expect(capture.html).not.toContain('base64');
	expect(capture.droppedImages).toBe(1);
	expect(capture.linkedImages).toBe(1);
	// The image keeps its alt text, and the other layers of a multi-layer
	// background survive the one that was dropped.
	expect(capture.html).toMatch(/<img[^>]*alt="inline logo"/);
	expect(capture.html).toContain('linear-gradient');
	// A dropped mask hides what it masked rather than revealing a solid box.
	expect(capture.html).toContain('mask-image:linear-gradient(transparent,transparent)');
	// Percent-encoded data: URIs are plain text and stay.
	expect(capture.html).toContain('data:image/svg+xml,');

	// And the result is still a page that parses into the same structure.
	await page.setContent(capture.html);
	expect(await page.locator('img').count()).toBe(2);
	expect(await page.locator('svg image').count()).toBe(1);
});
