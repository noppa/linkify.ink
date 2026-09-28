// encoding-test.mjs — is there a payload format cheaper than HTML, once the
// decoder no longer has to ride along in the link?
//
//   npm install --no-save --prefix demo/scrape-compress/.npm-staging html2pug@4 pug@3
//   node demo/scrape-compress/encoding-test.mjs
//
// run.mjs measured the s-expression tree with its decoder inside the payload,
// which made it a net loss: it saved 104-200 characters and the decoder cost 725.
// That framing was wrong. linkify.ink owns the code that renders a preview, so a
// decoder can be shipped there once instead of in every link, and a format only
// has to be smaller — not smaller by 725 characters.
//
// So this re-runs the comparison with the decoder treated as free, adds Pug as an
// off-the-shelf alternative to a bespoke format, and — since the same "we control
// both ends" argument applies to compression as much as to serialization — adds
// zstd dictionaries, which turn out to matter far more than the format does.
//
// Every payload below carries the same information and is verified to render to
// the same pixels before its size is counted.

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, constants, zstdCompressSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { FIXTURES, PROSE, renderFixture } from './fixtures/index.mjs';
import { linkifyInkCodecDependencies } from '../../vendor/vendor.codec.bundle.js';
import { LinkifyInk } from '../../linkify.ink.js';

const here = dirname(fileURLToPath(import.meta.url));
const staged = join(here, '.npm-staging', 'node_modules');
const { default: html2pug } = await import(join(staged, 'html2pug', 'src', 'index.js'));
const { default: pug } = await import(join(staged, 'pug', 'lib', 'index.js'));

const PORT = 8436;
const VIEWPORT = { width: 1280, height: 900 };
const ORIGIN = 'https://linkify.ink';
const encoder = new TextEncoder();

// ── Link length for an arbitrary codec ───────────────────────────────────────
//
// The real pipeline is tar -> zstd-19 -> [flag][metaLen][meta][compressed] ->
// base64url. To price a *different* codec the tar bytes are needed, and they are
// built inside LinkifyInk — so the zstd dependency is wrapped on the way past to
// capture its input. That keeps the tar byte-identical to the real thing rather
// than reimplementing ustar and hoping.

let lastTar = null;
const linkify = new LinkifyInk({
	...linkifyInkCodecDependencies,
	origin: ORIGIN,
	zstd: {
		...linkifyInkCodecDependencies.zstd,
		compress(data, level) {
			lastTar = Uint8Array.prototype.slice.call(data);
			return linkifyInkCodecDependencies.zstd.compress(data, level);
		},
	},
});

/**
 * The exact tar bytes the real pipeline would compress for these files, plus the
 * real link length, so the arithmetic below can be checked against ground truth.
 * @param {{ name: string, data: Uint8Array }[]} files
 */
async function tarOf(files) {
	const url = await linkify.createLink(files, { encryption: 'none' });
	return { tar: lastTar, realLength: url.length };
}

// flag byte + uint16 metadata length + `{}` + the compressed payload, base64url
// encoded without padding, after `https://linkify.ink/#`.
const PREFIX = ORIGIN.length + 2;
const ENVELOPE = 1 + 2 + 2;
/** @param {number} compressedBytes @returns {number} */
const linkChars = (compressedBytes) => PREFIX + Math.ceil(((ENVELOPE + compressedBytes) * 4) / 3);

// ── Codecs ───────────────────────────────────────────────────────────────────

/**
 * A dictionary linkify.ink could actually ship: a fixed, auditable, versioned
 * string rather than a trained binary blob. zstd accepts any bytes as a raw
 * content dictionary, and the best content to put in one is whatever every
 * capture contains verbatim — the reset rule, the document boilerplate, and the
 * property names and values a computed-style capture emits by the hundred.
 *
 * Ordered least-valuable-first: zstd searches a dictionary from its end, so the
 * bytes most likely to match belong closest to it.
 *
 * @param {string} reset the capture's reset rule, verbatim
 * @returns {Buffer}
 */
function houseDictionary(reset) {
	const properties = [
		'background-color', 'border-bottom-color', 'border-bottom-left-radius',
		'border-bottom-right-radius', 'border-bottom-style', 'border-bottom-width',
		'border-left-color', 'border-left-style', 'border-left-width',
		'border-right-color', 'border-right-style', 'border-right-width',
		'border-top-color', 'border-top-left-radius', 'border-top-right-radius',
		'border-top-style', 'border-top-width', 'box-shadow', 'box-sizing', 'color',
		'column-rule-color', 'display', 'flex-basis', 'flex-direction', 'flex-grow',
		'flex-shrink', 'flex-wrap', 'font-family', 'font-size', 'font-weight',
		'height', 'justify-content', 'align-items', 'letter-spacing', 'line-height',
		'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-width',
		'outline-color', 'overflow-x', 'overflow-y', 'padding-bottom', 'padding-left',
		'padding-right', 'padding-top', 'position', 'text-align',
		'text-decoration-color', 'text-decoration-line', 'text-wrap-mode',
		'transform-origin', 'vertical-align', 'white-space-collapse', 'width', 'z-index',
	].map((property) => property + ':').join('');

	const values = [
		'0', '1px', '2px', '4px', '6px', '8px', '12px', '16px', '24px', '32px',
		'100%', 'auto', 'none', 'solid', 'block', 'inline-block', 'flex', 'grid',
		'relative', 'absolute', 'static', 'center', 'left', 'right', 'nowrap',
		'border-box', 'content-box', 'currentColor', 'transparent', 'inherit',
		'#000', '#fff', '#333', '#666', '#999', '#ccc', '#eee',
		'rgba(0,0,0,.1)', 'ui-monospace,monospace',
		'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
	].map((value) => value + ';').join('');

	const boilerplate =
		'<!doctype html><html><head><meta charset="utf-8">' +
		'<meta name="viewport" content="width=1280">' +
		'<meta name="referrer" content="no-referrer"><style>' +
		'</style></head><body></body></html>' +
		'<div class="' + '"></div><span class="' + '"></span><a class="' + '" href="';

	return Buffer.from(boilerplate + values + properties + reset, 'utf8');
}

/** @param {Uint8Array} tar @param {Buffer} [dictionary] @returns {number} */
const zstd = (tar, dictionary) =>
	zstdCompressSync(Buffer.from(tar), {
		params: { [constants.ZSTD_c_compressionLevel]: 19 },
		...(dictionary ? { dictionary } : {}),
	}).length;

/** @param {Uint8Array} tar @returns {number} */
const brotli = (tar) =>
	brotliCompressSync(Buffer.from(tar), {
		params: {
			[constants.BROTLI_PARAM_QUALITY]: 11,
			[constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
			[constants.BROTLI_PARAM_SIZE_HINT]: tar.length,
		},
	}).length;

// ── Setup ────────────────────────────────────────────────────────────────────

const served = new Map(FIXTURES.map((f) => ['/f/' + f.name, renderFixture(f)]));
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

const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const captureSource = await readFile(join(here, 'capture.js'), 'utf8');

/** @param {Buffer} a @param {Buffer} b @returns {Promise<number>} */
async function pixelDiff(a, b) {
	const [x, y] = await Promise.all([
		sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
		sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
	]);
	const width = Math.min(x.info.width, y.info.width);
	const height = Math.min(x.info.height, y.info.height);
	let differing = 0;
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
	return differing / (width * height);
}

/** @param {string} doc @returns {Promise<Buffer>} */
async function shoot(doc) {
	const view = await context.newPage();
	await view.setContent(doc, { waitUntil: 'load' });
	await view.evaluate(() => document.fonts.ready).catch(() => {});
	const image = await view.screenshot({ fullPage: true });
	await view.close();
	return image;
}

// ── Measure ──────────────────────────────────────────────────────────────────

/** @type {object[]} */
const rows = [];
/** @type {Map<string, string>} */
const htmlByFixture = new Map();

for (const fixture of FIXTURES) {
	const page = await context.newPage();
	await page.goto(`http://localhost:${PORT}/f/${fixture.name}`, { waitUntil: 'load' });
	await page.addScriptTag({ content: captureSource });

	const asHtml = await page.evaluate(() => globalThis.__linkifyScrape.capture({ tree: 'html' }));
	const asSexp = await page.evaluate(() => globalThis.__linkifyScrape.capture({ tree: 'sexp' }));
	const reset = await page.evaluate(() => globalThis.__linkifyScrape.RESET);
	await page.close();

	htmlByFixture.set(fixture.name, asHtml.doc);

	// The payload each format would actually put in the link.
	//
	//   html — the standalone document, as today.
	//   sexp — the stylesheet and the tree, with no decoder: the preview supplies
	//          it. The same two pieces of information, one separator between them.
	//   pug  — the whole document through html2pug. The preview compiles it back.
	const payloads = {
		html: asHtml.doc,
		sexp: asSexp.css + ' ' + asSexp.tree,
		pug: html2pug(asHtml.doc, { tabs: false, fragment: false }),
	};

	// Verify before pricing: a format that renders differently is not cheaper, it
	// is broken. The s-expression path is already exercised by run.mjs, so the one
	// actually under test here is Pug.
	const reference = await shoot(asHtml.doc);
	let pugDiff = null;
	let pugError = null;
	try {
		pugDiff = await pixelDiff(reference, await shoot(pug.render(payloads.pug, { pretty: false })));
	} catch (error) {
		pugError = error.message.split('\n')[0].slice(0, 80);
	}

	const dictionary = houseDictionary(reset);
	const row = { fixture: fixture.name, pugDiff, pugError, sizes: {}, raw: {} };

	for (const [name, text] of Object.entries(payloads)) {
		const { tar, realLength } = await tarOf([
			{ name: 'page.' + name, data: encoder.encode(text) },
		]);
		row.raw[name] = text.length;
		row.sizes[name] = {
			zstd: linkChars(zstd(tar)),
			zstdDict: linkChars(zstd(tar, dictionary)),
			brotli: linkChars(brotli(tar)),
			real: realLength,
			tar,
		};
	}

	// Sanity check: the model must reproduce what LinkifyInk actually returns.
	const drift = row.sizes.html.zstd - row.sizes.html.real;
	if (Math.abs(drift) > 2) {
		process.stderr.write(`  ! link length model off by ${drift} on ${fixture.name}\n`);
	}

	rows.push(row);
	process.stderr.write(`  ${fixture.name}\n`);
}

// A held-out dictionary: every *other* fixture's capture, concatenated. It stands
// in for a dictionary trained on a corpus of real captures, and being held out is
// the whole point — a dictionary containing the page it is compressing would
// report a number nobody could reproduce in production.
//
// Holding out the fixture is not enough here, because the fixtures share a prose
// pool: four captures contain the fifth's sentences word for word, and text is a
// large share of a payload. A dictionary that has already seen the article it is
// about to compress is not a dictionary, it is a cache. So the shared prose is
// stripped, and both numbers are reported — the gap between them is the size of
// the leak, and a reminder of how easy it is to measure the wrong thing.
for (const row of rows) {
	const others = [...htmlByFixture.entries()]
		.filter(([name]) => name !== row.fixture)
		.map(([, doc]) => doc)
		.join('\n');
	const deleaked = PROSE.reduce((text, sentence) => text.split(sentence).join(''), others);

	// 64KB, keeping the tail: zstd matches backwards from the end of a dictionary.
	const leaky = Buffer.from(others.slice(-65536), 'utf8');
	const heldOut = Buffer.from(deleaked.slice(-65536), 'utf8');
	for (const format of Object.keys(row.sizes)) {
		row.sizes[format].zstdCorpusLeaky = linkChars(zstd(row.sizes[format].tar, leaky));
		row.sizes[format].zstdCorpus = linkChars(zstd(row.sizes[format].tar, heldOut));
		delete row.sizes[format].tar;
	}
}

await browser.close();
server.close();

// ── Report ───────────────────────────────────────────────────────────────────

/** @param {number} value @param {number} base @returns {string} */
const pct = (value, base) => ((value / base - 1) * 100).toFixed(1) + '%';

/** @type {string[]} */
const out = [];
/** @param {string} [line] */
const say = (line = '') => {
	out.push(line);
	console.log(line);
};

say('\n## Format, with the decoder hosted in the preview\n');
say('| fixture | HTML | s-expr | vs HTML | Pug | vs HTML | Pug renders |');
say('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
for (const row of rows) {
	const base = row.sizes.html.zstd;
	const verdict = row.pugError
		? 'FAILED: ' + row.pugError
		: (row.pugDiff * 100).toFixed(1) + '% pixel diff';
	say(
		`| ${row.fixture} | ${base} | ${row.sizes.sexp.zstd} | ${pct(row.sizes.sexp.zstd, base)} | ` +
		`${row.sizes.pug.zstd} | ${pct(row.sizes.pug.zstd, base)} | ${verdict} |`,
	);
}

say('\n## Compression, same HTML payload\n');
say('| fixture | zstd-19 | + house dict | + corpus dict | + corpus dict (prose leak) | brotli-11 |');
say('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const row of rows) {
	const h = row.sizes.html;
	say(
		`| ${row.fixture} | ${h.zstd} | ${h.zstdDict} (${pct(h.zstdDict, h.zstd)}) | ` +
		`${h.zstdCorpus} (${pct(h.zstdCorpus, h.zstd)}) | ` +
		`${h.zstdCorpusLeaky} (${pct(h.zstdCorpusLeaky, h.zstd)}) | ` +
		`${h.brotli} (${pct(h.brotli, h.zstd)}) |`,
	);
}

say('\n## Do format and dictionary stack?\n');
say('| fixture | HTML | s-expr | HTML+house | s-expr+house | s-expr+corpus | best |');
say('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
for (const row of rows) {
	const options = {
		HTML: row.sizes.html.zstd,
		's-expr': row.sizes.sexp.zstd,
		'HTML+dict': row.sizes.html.zstdDict,
		's-expr+dict': row.sizes.sexp.zstdDict,
		's-expr+corpus': row.sizes.sexp.zstdCorpus,
	};
	const [name, value] = Object.entries(options).sort((a, b) => a[1] - b[1])[0];
	say(
		`| ${row.fixture} | ${options.HTML} | ${options['s-expr']} | ${options['HTML+dict']} | ` +
		`${options['s-expr+dict']} | ${options['s-expr+corpus']} | ` +
		`**${name}** ${value} (${pct(value, options.HTML)}) |`,
	);
}

say('\n## Raw payload sizes (pre-compression)\n');
say('| fixture | HTML | s-expr | Pug |');
say('| --- | ---: | ---: | ---: |');
for (const row of rows) {
	say(`| ${row.fixture} | ${row.raw.html} | ${row.raw.sexp} | ${row.raw.pug} |`);
}
say();

await mkdir(join(here, 'out'), { recursive: true });
await writeFile(join(here, 'out', 'encoding-report.md'), '# Encoding and compression\n' + out.join('\n'));
process.stderr.write(`wrote ${join(here, 'out', 'encoding-report.md')}\n`);
