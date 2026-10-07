// pug-test.mjs — does storing a capture as Pug instead of HTML make links shorter,
// now that links are compressed with the shared v2 dictionary?
//
//   npm install --no-save --prefix demo/scrape-compress/.npm-staging html2pug@4 pug@3
//   node demo/scrape-compress/setup-fixtures.mjs
//   node demo/scrape-compress/pug-test.mjs
//
// encoding-test.mjs found Pug 4–5% smaller, but it measured the demo capture.js
// through plain zstd-19. Two things have changed since: the extension ships its own
// capture, and every link is compressed with dictionaries/v2.dict.zst. A dictionary
// that already knows HTML could erase the saving, or Pug could keep it. This
// measures the shipped capture, both modes, through the real pipeline, with and
// without the dictionary.
//
// Pug's security problem (it compiles to JavaScript) would be handled by compiling
// inside the preview sandbox, so this script only asks the size question. Every Pug
// payload is checked to render to the same pixels as its HTML before it is counted.

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { makeFixtures, renderFixture } from './fixtures/index.mjs';
import { linkifyInkCodecDependencies } from '../../vendor/vendor.codec.bundle.js';
import { LinkifyInk } from '../../linkify.ink.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const out = join(here, 'out');
const staged = join(here, '.npm-staging', 'node_modules');
const { default: html2pug } = await import(join(staged, 'html2pug', 'src', 'index.js'));
const { default: pug } = await import(join(staged, 'pug', 'lib', 'index.js'));

const PORT = 8437;
const VIEWPORT = { width: 1280, height: 900 };
const encoder = new TextEncoder();

// Format 2 is what ships; format 1 is the same pipeline without a dictionary.
//
// One LinkifyInk only: every instance initialises the shared zstd wasm module, and
// a second init invalidates the first instance's compression context, which turns
// its output into garbage. So format 1 is priced from the same tar bytes, captured
// on their way into the dictionary compressor, with the same wasm zstd at level 19.
const { zstd } = linkifyInkCodecDependencies;
let lastTar = new Uint8Array();
let lastCompressed = 0;
const linkify = new LinkifyInk({
	...linkifyInkCodecDependencies,
	origin: 'https://linkify.ink',
	zstd: {
		...zstd,
		compressUsingDict(cctx, data, dictionary, level) {
			lastTar = Uint8Array.prototype.slice.call(data);
			const compressed = zstd.compressUsingDict(cctx, data, dictionary, level);
			lastCompressed = compressed.length;
			return compressed;
		},
	},
});

/**
 * Link length for one file, packed the way background.js packs a capture, with
 * (format 2, the real link) and without (format 1) the shared dictionary. The link
 * is decoded again to prove the format 2 number is a working link.
 * @param {string} name @param {string} text
 */
async function linkLengths(name, text) {
	const data = encoder.encode(text);
	const url = await linkify.createLink([{ name, data }], { encryption: 'none', metadata: { preview: name } });
	const { files } = await linkify.readLink(url);
	if (new TextDecoder().decode(files[0].data) !== text) throw new Error(`${name}: link did not round-trip`);
	// Everything in the link but the compressed payload is identical between the two
	// formats, so swap the payload and re-encode.
	const linkBytes = Math.floor((url.length - url.indexOf('#') - 1) * 3 / 4);
	const plainBytes = linkBytes - lastCompressed + zstd.compress(lastTar, 19).length;
	return { dict: url.length, plain: url.indexOf('#') + 1 + Math.ceil(plainBytes * 4 / 3) };
}

/** @param {Buffer} a @param {Buffer} b @returns {Promise<number>} */
async function pixelDiff(a, b) {
	const [x, y] = await Promise.all([
		sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
		sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
	]);
	const width = Math.min(x.info.width, y.info.width);
	const height = Math.min(x.info.height, y.info.height);
	let differing = Math.abs(x.info.height - y.info.height) * width;
	for (let row = 0; row < height; row++) {
		for (let column = 0; column < width; column++) {
			const i = (row * x.info.width + column) * 4;
			const j = (row * y.info.width + column) * 4;
			if (
				Math.abs(x.data[i] - y.data[j]) > 24 ||
				Math.abs(x.data[i + 1] - y.data[j + 1]) > 24 ||
				Math.abs(x.data[i + 2] - y.data[j + 2]) > 24
			) differing++;
		}
	}
	return differing / (width * Math.max(x.info.height, y.info.height));
}

// ── Setup ────────────────────────────────────────────────────────────────────

const SCALES = [1, 4];
/** @type {Map<string, string>} */
const served = new Map();
const fixtures = SCALES.flatMap((scale) =>
	makeFixtures(scale).map((fixture) => {
		const path = `/f/${scale}/${fixture.name}`;
		served.set(path, renderFixture(fixture));
		return { name: fixture.name, scale, path };
	}),
);

const server = createServer(async (req, res) => {
	const path = (req.url ?? '/').split('?')[0];
	if (served.has(path)) {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.end(served.get(path));
		return;
	}
	if (path.startsWith('/vendor/')) {
		res.writeHead(200, { 'content-type': 'text/css' });
		res.end(await readFile(join(here, 'fixtures', path.slice(1))));
		return;
	}
	res.writeHead(404).end();
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const readabilitySource = await readFile(join(repo, 'vendor', 'vendor.readability.bundle.js'), 'utf8');
const extensionSource = await readFile(join(repo, 'extension', 'content', 'capture.js'), 'utf8');

/** @param {string} doc @returns {Promise<Buffer>} */
async function shoot(doc) {
	const page = await context.newPage();
	// Captures never need the network; abort anything that tries.
	await page.route('**/*', (route) => route.abort());
	await page.setContent(doc, { waitUntil: 'load' });
	const png = await page.screenshot({ fullPage: true, timeout: 180_000 });
	await page.close();
	return png;
}

// ── Measure ──────────────────────────────────────────────────────────────────

const VARIANTS = /** @type {const} */ ([
	// html2pug's default: two-space indent.
	{ id: 'pug', options: { tabs: false, fragment: false } },
	// One byte of indent per level instead of two.
	{ id: 'pug-tabs', options: { tabs: true, fragment: false } },
]);

const rows = [];
await mkdir(out, { recursive: true });

for (const fixture of fixtures) {
	for (const mode of /** @type {const} */ (['full', 'article'])) {
		const page = await context.newPage();
		await page.goto(`http://localhost:${PORT}${fixture.path}`, { waitUntil: 'load' });
		await page.evaluate(() => document.fonts.ready);
		await page.addScriptTag({ content: readabilitySource });
		await page.addScriptTag({ content: extensionSource });
		/** @type {string} */
		let html;
		try {
			html = await page.evaluate((m) => globalThis.__linkifyInkCapture({ mode: m }).then((c) => c.html), mode);
		} catch (error) {
			process.stderr.write(`${fixture.name} ×${fixture.scale} ${mode}: capture failed (${error.message.split('\n')[0]})\n`);
			await page.close();
			continue;
		}
		await page.close();

		const reference = await shoot(html);
		const row = {
			fixture: fixture.name,
			scale: fixture.scale,
			mode,
			rawHtml: encoder.encode(html).length,
			html: await linkLengths('article.html', html),
		};

		for (const { id, options } of VARIANTS) {
			const source = html2pug(html, options);
			let diff = null;
			let error = null;
			try {
				diff = await pixelDiff(reference, await shoot(pug.render(source, { pretty: false })));
			} catch (e) {
				error = e.message.split('\n')[0].slice(0, 80);
			}
			if (fixture.scale === 1) {
				await writeFile(join(out, `${fixture.name}.${mode}.html`), html);
				await writeFile(join(out, `${fixture.name}.${mode}.${id}`), source);
			}
			row[id] = {
				raw: encoder.encode(source).length,
				...(await linkLengths('article.pug', source)),
				diff,
				error,
			};
		}

		rows.push(row);
		const pct = (a, b) => ((a / b - 1) * 100).toFixed(1).padStart(5) + '%';
		process.stderr.write(
			`${(fixture.name + ' ×' + fixture.scale).padEnd(24)} ${mode.padEnd(7)} ` +
			`html ${String(row.html.dict).padStart(6)}  ` +
			VARIANTS.map(({ id }) =>
				`${id} ${String(row[id].dict).padStart(6)} (${pct(row[id].dict, row.html.dict)})` +
				(row[id].error ? ' FAILED' : ` ${(row[id].diff * 100).toFixed(1)}%px`),
			).join('  ') +
			`   | no dict: html ${row.html.plain} pug ${row.pug.plain} (${pct(row.pug.plain, row.html.plain)})\n`,
		);
	}
}

await browser.close();
server.close();

// ── Report ───────────────────────────────────────────────────────────────────

const signed = (a, b) => {
	const p = (a / b - 1) * 100;
	return (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p).toFixed(1) + '%';
};
const n = (x) => x.toLocaleString('en-US');
const verdict = (v) => (v.error ? 'FAILED: ' + v.error : (v.diff * 100).toFixed(1) + '%');

const lines = [
	'# Pug vs HTML, shipped capture, real pipeline',
	'',
	'Link characters. "dict" is format 2 (shipped, v2 dictionary); "no dict" is format 1.',
	'Pixel diff is Pug compiled back to HTML vs the HTML capture, rendered offline.',
	'',
	'| fixture | scale | mode | raw HTML | HTML | Pug | | Pug (tabs) | | pixel diff | HTML no dict | Pug no dict | |',
	'| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
	...rows.map((r) =>
		`| ${r.fixture} | ×${r.scale} | ${r.mode} | ${n(r.rawHtml)} | ${n(r.html.dict)} | ` +
		`${n(r.pug.dict)} | ${signed(r.pug.dict, r.html.dict)} | ` +
		`${n(r['pug-tabs'].dict)} | ${signed(r['pug-tabs'].dict, r.html.dict)} | ` +
		`${verdict(r['pug-tabs'])} | ${n(r.html.plain)} | ${n(r.pug.plain)} | ${signed(r.pug.plain, r.html.plain)} |`,
	),
	'',
];
await writeFile(join(out, 'pug-report.md'), lines.join('\n'));
await writeFile(join(out, 'pug-report.json'), JSON.stringify(rows, null, 2));
process.stderr.write(`\nwrote ${join(out, 'pug-report.md')}\n`);
