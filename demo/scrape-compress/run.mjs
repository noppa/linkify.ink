// run.mjs — measure the computed-style capture against the one the extension ships.
//
//   node demo/scrape-compress/setup-fixtures.mjs     # once
//   node demo/scrape-compress/run.mjs                # ~2 minutes
//   node demo/scrape-compress/run.mjs --keep         # also write the captures to out/
//
// What it measures, and why each measurement is here:
//
//   size     — bytes through the real linkify.ink pipeline (tar → zstd-19 →
//              base64url), not an estimate. The number that decides whether a page
//              fits in a link is the URL length, and only the real encoder knows it.
//   fidelity — a pixel diff of the capture against the live page at the same
//              viewport. Size without fidelity is trivially optimised (ship
//              nothing), so the two only mean something together.
//   cost     — wall-clock time in the page, because getComputedStyle on every
//              element forces layout and this runs on the user's tab.
//
// Everything is measured per strategy rather than argued: the point of the demo is
// to find out whether the idea works, and which of the four class-assignment
// schemes is worth implementing for real.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { FIXTURES, makeFixtures, renderFixture } from './fixtures/index.mjs';
import { linkifyInkCodecDependencies } from '../../vendor.codec.bundle.js';
import { LinkifyInk } from '../../linkify.ink.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const out = join(here, 'out');
const KEEP = process.argv.includes('--keep');
const PORT = 8431;
const VIEWPORT = { width: 1280, height: 900 };

// The CA the session's egress proxy re-signs with. Chromium is told to trust this
// one key rather than to skip verification; without it every https request in the
// page fails. Harmless when the pages are local, kept so the same script works
// against real URLs wherever the network allows it.
const PROXY_CA_SPKI = 'KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk=';

const linkify = new LinkifyInk({ ...linkifyInkCodecDependencies, origin: 'https://linkify.ink' });
const encoder = new TextEncoder();

/**
 * Length of the real shareable link for a set of files. Not `bytes * 4 / 3`: the
 * tar layer pads every entry to a 512-byte boundary and the metadata block rides
 * along, both of which matter at the sizes in play here.
 * @param {{ name: string, data: Uint8Array }[]} files
 * @returns {Promise<number>}
 */
async function linkLength(files) {
	const url = await linkify.createLink(files, { encryption: 'none' });
	return url.length;
}

// ── Static server ────────────────────────────────────────────────────────────

const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };

/** @type {Map<string, string>} */
const served = new Map();

const server = createServer(async (req, res) => {
	const path = (req.url ?? '/').split('?')[0];
	try {
		if (served.has(path)) {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			res.end(served.get(path));
			return;
		}
		if (path.startsWith('/vendor/')) {
			const body = await readFile(join(here, 'fixtures', path.slice(1)));
			res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
			res.end(body);
			return;
		}
		res.writeHead(404).end('not found');
	} catch {
		res.writeHead(500).end('error');
	}
});

// ── Image comparison ─────────────────────────────────────────────────────────

/**
 * Fraction of pixels that visibly differ between two screenshots.
 *
 * Compared over the overlapping region rather than resized to match: a capture
 * that renders 40px taller than the original is not wrong everywhere, it is
 * right with a different amount of trailing whitespace, and stretching one to
 * fit the other would report that as total failure. The height difference is
 * reported separately so it can't hide either.
 *
 * The 24/255 per-channel threshold ignores antialiasing and subpixel text
 * rendering, which differ run to run even between two screenshots of the same
 * page, while still catching any real colour, position or size change.
 *
 * @param {Buffer} a @param {Buffer} b
 * @returns {Promise<{ diff: number, heightRatio: number }>}
 */
async function compareImages(a, b) {
	const [imgA, imgB] = await Promise.all([
		sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
		sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
	]);
	const width = Math.min(imgA.info.width, imgB.info.width);
	const height = Math.min(imgA.info.height, imgB.info.height);
	let differing = 0;

	for (let y = 0; y < height; y++) {
		const rowA = y * imgA.info.width * 4;
		const rowB = y * imgB.info.width * 4;
		for (let x = 0; x < width; x++) {
			const i = rowA + x * 4;
			const j = rowB + x * 4;
			if (
				Math.abs(imgA.data[i] - imgB.data[j]) > 24 ||
				Math.abs(imgA.data[i + 1] - imgB.data[j + 1]) > 24 ||
				Math.abs(imgA.data[i + 2] - imgB.data[j + 2]) > 24
			) {
				differing++;
			}
		}
	}

	return {
		diff: differing / (width * height),
		heightRatio: imgB.info.height / imgA.info.height,
	};
}

// ── The matrix ───────────────────────────────────────────────────────────────

/**
 * The four class-assignment strategies plus the compact-tree variant, which is
 * the set of things the demo is actually deciding between. All at the default
 * `sizing:'all'`, so the fidelity column is comparable across the row.
 * @type {{ id: string, label: string, opts: object }[]}
 */
const STRATEGIES = [
	{ id: 'inline', label: 'computed · style=""', opts: { strategy: 'inline' } },
	{ id: 'exact', label: 'computed · exact classes', opts: { strategy: 'exact' } },
	{ id: 'atomic', label: 'computed · atomic classes', opts: { strategy: 'atomic' } },
	{ id: 'merged', label: 'computed · merged classes', opts: { strategy: 'merged' } },
	{ id: 'merged-sexp', label: 'computed · merged + s-expr tree', opts: { strategy: 'merged', tree: 'sexp' } },
];

/**
 * One-variable-at-a-time ablations off the merged baseline, to attribute the
 * saving to the individual tricks rather than to the pile of them.
 * @type {{ id: string, label: string, opts: object }[]}
 */
const ABLATIONS = [
	{ id: 'abl-base', label: 'merged (baseline)', opts: { strategy: 'merged' } },
	{ id: 'abl-allprops', label: '+ every property', opts: { strategy: 'merged', props: 'all' } },
	{ id: 'abl-noinherit', label: '− inheritance pruning', opts: { strategy: 'merged', inheritPrune: false } },
	{ id: 'abl-nopseudo', label: '− ::before/::after', opts: { strategy: 'merged', pseudo: false } },
	{ id: 'abl-noauto', label: '− margin:auto recovery', opts: { strategy: 'merged', restoreAuto: false } },
];

/**
 * The sizing sweep, kept separate because it is the one option that trades
 * fidelity for size rather than buying both at once.
 * @type {{ id: string, label: string, opts: object }[]}
 */
const SIZING = [
	{ id: 'size-none', label: 'sizing:none', opts: { strategy: 'merged', sizing: 'none' } },
	{ id: 'size-replaced', label: 'sizing:replaced', opts: { strategy: 'merged', sizing: 'replaced' } },
	{ id: 'size-smart', label: 'sizing:smart', opts: { strategy: 'merged', sizing: 'smart' } },
	{ id: 'size-fluid', label: 'sizing:fluid', opts: { strategy: 'merged', sizing: 'fluid' } },
	{ id: 'size-all', label: 'sizing:all', opts: { strategy: 'merged', sizing: 'all' } },
	{ id: 'size-all-nofit', label: 'sizing:all, width=device-width', opts: { strategy: 'merged', sizing: 'all', fitViewport: false } },
];

/** @param {number} n @param {number} [w] */
const kb = (n, w = 8) => (n / 1024).toFixed(1).padStart(w - 3) + ' KB';
/** @param {number} n */
const pct = (n) => (n * 100).toFixed(1) + '%';

async function main() {
	await mkdir(out, { recursive: true });
	await new Promise((resolve) => server.listen(PORT, resolve));

	for (const fixture of FIXTURES) served.set('/f/' + fixture.name, renderFixture(fixture));

	const browser = await chromium.launch({
		executablePath: '/opt/pw-browsers/chromium',
		args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${PROXY_CA_SPKI}`],
	});
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
	// A separate context that emulates a phone. `isMobile` is what makes Chromium
	// honour the viewport meta tag at all — without it the tag is inert and every
	// capture looks like it fails to fit, whatever it declares.
	const phone = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 1,
		isMobile: true,
		hasTouch: true,
	});

	const captureSource = await readFile(join(here, 'capture.js'), 'utf8');
	const readabilitySource = await readFile(join(repo, 'vendor.readability.bundle.js'), 'utf8');
	const extensionSource = await readFile(join(repo, 'extension', 'content', 'capture.js'), 'utf8');

	/** @type {object[]} */
	const results = [];

	for (const fixture of FIXTURES) {
		process.stderr.write(`\n${fixture.name}\n`);
		const page = await context.newPage();
		await page.goto(`http://localhost:${PORT}/f/${fixture.name}`, { waitUntil: 'load' });
		await page.evaluate(() => document.fonts.ready);

		const reference = await page.screenshot({ fullPage: true });
		const pageStats = await page.evaluate(() => ({
			elements: document.querySelectorAll('*').length,
			sheetRules: [...document.styleSheets].reduce((n, s) => {
				try { return n + s.cssRules.length; } catch { return n; }
			}, 0),
		}));

		/** @type {object[]} */
		const rows = [];

		/**
		 * Render a capture and screenshot it.
		 *
		 * `offline` is the measurement that separates a self-contained capture from
		 * one that merely looks self-contained: every request that leaves the page is
		 * aborted, which is what a reader gets when the original host is down, has
		 * moved the file, blocks hotlinking, or simply isn't reachable from wherever
		 * the link was opened. A capture that still references the origin's
		 * stylesheets scores perfectly online and falls apart here.
		 *
		 * @param {string} doc
		 * @param {{ offline?: boolean, width?: number }} [how]
		 */
		const render = async (doc, how = {}) => {
			const view = await (how.phone ? phone : context).newPage();
			if (how.offline) {
				await view.route('**', (route) =>
					/^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort(),
				);
			}
			await view.setContent(doc, { waitUntil: how.offline ? 'domcontentloaded' : 'load' });
			await view.evaluate(() => document.fonts.ready).catch(() => {});
			const image = await view.screenshot({ fullPage: true });
			// How far the page scrolls sideways. On the phone context 1.00 means the
			// whole page is visible without panning — either because it reflowed or
			// because it declared its width and was scaled to fit.
			const overflow = await view.evaluate(
				() => document.documentElement.scrollWidth / document.documentElement.clientWidth,
			);
			await view.close();
			return { image, overflow };
		};

		/**
		 * Measure one capture: size through the real pipeline, then fidelity.
		 * @param {string} id @param {string} label
		 * @param {{ html: string, css?: string, doc: string }} capture
		 * @param {object} [stats]
		 * @param {boolean} [deep] also measure offline fidelity and phone-width reflow
		 */
		const measure = async (id, label, capture, stats, deep = false) => {
			const files = [{ name: 'page.html', data: encoder.encode(capture.doc) }];
			const [url, online] = await Promise.all([linkLength(files), render(capture.doc)]);
			const { diff, heightRatio } = await compareImages(reference, online.image);

			let offlineDiff = null;
			let narrowOverflow = null;
			if (deep) {
				const offline = await render(capture.doc, { offline: true });
				offlineDiff = (await compareImages(reference, offline.image)).diff;
				narrowOverflow = (await render(capture.doc, { phone: true })).overflow;
			}

			if (KEEP) {
				await writeFile(join(out, `${fixture.name}.${id}.html`), capture.doc);
				await writeFile(join(out, `${fixture.name}.${id}.png`), online.image);
			}
			rows.push({
				id, label,
				html: capture.html.length,
				css: (capture.css ?? '').length,
				raw: capture.doc.length,
				url,
				diff,
				offlineDiff,
				narrowOverflow,
				heightRatio,
				...stats,
			});
			process.stderr.write(
				`  ${label.padEnd(30)} raw ${kb(capture.doc.length)}  url ${String(url).padStart(7)}` +
				`  diff ${pct(diff).padStart(6)}` +
				(offlineDiff === null ? '' : `  offline ${pct(offlineDiff).padStart(6)}`) + '\n',
			);
		};

		// Baseline 1: the raw page, as a crude floor on "just send the markup".
		const rawHtml = await page.evaluate(() => '<!doctype html>' + document.documentElement.outerHTML);
		await measure('raw', 'raw outerHTML', { html: rawHtml, doc: rawHtml }, undefined, true);

		// Baseline 2: what the extension produces today, from the extension's own code.
		await page.addScriptTag({ content: readabilitySource });
		await page.addScriptTag({ content: extensionSource });
		const current = await page.evaluate(() =>
			globalThis.__linkifyInkCapture({ mode: 'full', images: 'link' }),
		);
		await measure('current', 'CURRENT extension (full)', { html: current.html, doc: current.html }, undefined, true);

		// The candidate, in each of its shapes.
		await page.addScriptTag({ content: captureSource });
		for (const { id, label, opts } of [...STRATEGIES, ...ABLATIONS, ...SIZING]) {
			const capture = await page.evaluate((o) => globalThis.__linkifyScrape.capture(o), opts);
			// The strategy and sizing tables are the ones whose fidelity claims carry
			// weight, so those get the offline render and the phone-width check.
			const deep = !id.startsWith('abl-');
			await measure(
				id, label,
				{ html: capture.tree, css: capture.css, doc: capture.doc },
				capture.stats, deep,
			);
		}

		// Isolate the tree encoding from everything shipped alongside it: the same
		// capture, serialized both ways, compressed as a bare file with no stylesheet
		// and no decoder. This is the only way to see whether the s-expression form
		// is actually smaller once zstd has had its say, rather than smaller on paper.
		const encodings = {};
		for (const tree of ['html', 'sexp']) {
			const capture = await page.evaluate(
				(t) => globalThis.__linkifyScrape.capture({ strategy: 'merged', tree: t }),
				tree,
			);
			encodings[tree] = {
				raw: capture.tree.length,
				url: await linkLength([{ name: 't', data: encoder.encode(capture.tree) }]),
			};
		}
		encodings.decoderRaw = await page.evaluate(() => globalThis.__linkifyScrape.DECODER.length);
		encodings.decoderUrl = await linkLength([
			{ name: 't', data: encoder.encode(await page.evaluate(() => globalThis.__linkifyScrape.DECODER)) },
		]);

		await page.close();
		results.push({ fixture: fixture.name, description: fixture.description, pageStats, rows, encodings });
	}

	// Does the class-sharing result hold as pages get bigger? The fixtures are
	// smaller than most real pages, and the answer could plausibly flip either way:
	// more elements means more repetition for the compressor to find, but also more
	// distinct declaration sets for classes to factor out. Measured on one fixture
	// at three sizes rather than assumed.
	const scaling = [];
	for (const scale of [1, 4, 10]) {
		const big = makeFixtures(scale).find((f) => f.name === 'bootstrap-dashboard');
		served.set('/f/scale', renderFixture(big));
		const page = await context.newPage();
		await page.goto(`http://localhost:${PORT}/f/scale`, { waitUntil: 'load' });
		await page.addScriptTag({ content: captureSource });
		const row = { scale, elements: 0, urls: {} };
		for (const { id, opts } of STRATEGIES) {
			const capture = await page.evaluate((o) => globalThis.__linkifyScrape.capture(o), opts);
			row.elements = capture.stats.elements;
			row.urls[id] = await linkLength([{ name: 'page.html', data: encoder.encode(capture.doc) }]);
		}
		await page.close();
		scaling.push(row);
		process.stderr.write(`  scale ${scale}× — ${row.elements} elements\n`);
	}

	await phone.close();
	await browser.close();
	server.close();

	await writeFile(join(out, 'results.json'), JSON.stringify({ results, scaling }, null, '\t'));
	await writeFile(join(out, 'report.md'), report(results, scaling));
	process.stderr.write(`\nwrote ${join(out, 'report.md')}\n`);
	console.log(report(results, scaling));
}

/**
 * @param {object[]} results
 * @param {object[]} scaling
 * @returns {string}
 */
function report(results, scaling) {
	const lines = ['# Results', ''];

	lines.push('## Size and fidelity by strategy', '');
	lines.push('`link chars` is the length of the real linkify.ink URL. `offline` is the');
	lines.push('pixel diff with every outbound request blocked — what a reader sees when the');
	lines.push('original host is gone. `phone` is how far the page scrolls sideways on an');
	lines.push('emulated 390px phone; 1.00× means it all fits.', '');
	for (const { fixture, description, pageStats, rows, encodings } of results) {
		const current = rows.find((r) => r.id === 'current');
		lines.push(`### ${fixture}`, '');
		lines.push(`*${description}* — ${pageStats.elements} elements, ${pageStats.sheetRules} CSS rules in the page`, '');
		lines.push('| capture | html | css | total | link chars | vs current | diff | offline | phone |');
		lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
		for (const row of rows) {
			if (row.id.startsWith('abl-') || row.id.startsWith('size-')) continue;
			const ratio = current ? row.url / current.url : 1;
			lines.push(
				`| ${row.label} | ${kb(row.html)} | ${row.css ? kb(row.css) : '—'} | ${kb(row.raw)} | ` +
				`${row.url} | ${row.id === 'current' ? '—' : (ratio * 100).toFixed(0) + '%'} | ` +
				`${pct(row.diff)} | ${row.offlineDiff === null ? '—' : pct(row.offlineDiff)} | ` +
				`${row.narrowOverflow === null ? '—' : row.narrowOverflow.toFixed(2) + '×'} |`,
			);
		}
		lines.push('');
		lines.push(
			`Tree encoding, compressed on its own (no stylesheet, no decoder): ` +
			`HTML ${encodings.html.url} chars from ${kb(encodings.html.raw).trim()}, ` +
			`s-expr ${encodings.sexp.url} chars from ${kb(encodings.sexp.raw).trim()}. ` +
			`The decoder costs ${encodings.decoderUrl} chars (${encodings.decoderRaw} B raw).`,
		);
		lines.push('');
	}

	lines.push('## Sizing: the fidelity/size trade', '');
	lines.push('| fixture | ' + SIZING.map((a) => a.label).join(' | ') + ' |');
	lines.push('| --- |' + SIZING.map(() => ' ---: |').join(''));
	for (const { fixture, rows } of results) {
		const cells = SIZING.map((a) => {
			const row = rows.find((r) => r.id === a.id);
			return row ? `${row.url} · ${pct(row.diff)} · ${row.narrowOverflow.toFixed(2)}×` : '—';
		});
		lines.push(`| ${fixture} | ${cells.join(' | ')} |`);
	}
	lines.push('', '*link characters · pixel diff · sideways scroll on a 390px phone*', '');

	lines.push('## Ablations (merged strategy, one change at a time)', '');
	lines.push('| fixture | ' + ABLATIONS.map((a) => a.label).join(' | ') + ' |');
	lines.push('| --- |' + ABLATIONS.map(() => ' ---: |').join(''));
	for (const { fixture, rows } of results) {
		const cells = ABLATIONS.map((a) => {
			const row = rows.find((r) => r.id === a.id);
			return row ? `${row.url} (${pct(row.diff)})` : '—';
		});
		lines.push(`| ${fixture} | ${cells.join(' | ')} |`);
	}
	lines.push('', '*link characters (pixel diff)*', '');

	lines.push('## Capture cost and shape', '');
	lines.push('| fixture | elements kept | skipped (display:none) | decls | decls/el | distinct | classes | pseudo rules | walk ms | total ms |');
	lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
	for (const { fixture, rows } of results) {
		const row = rows.find((r) => r.id === 'merged');
		if (!row) continue;
		lines.push(
			`| ${fixture} | ${row.elements} | ${row.skippedInvisible} | ${row.declarations} | ` +
			`${row.declarationsPerElement} | ${row.distinctDeclarations} | ${row.classes} | ` +
			`${row.pseudoRules} | ${row.msWalk} | ${row.msTotal} |`,
		);
	}
	lines.push('');

	lines.push('## Does class sharing matter more as pages grow?', '');
	lines.push('Bootstrap dashboard, same stylesheet, more content. Link characters:', '');
	lines.push('| elements | ' + STRATEGIES.map((s) => s.label.replace('computed · ', '')).join(' | ') + ' |');
	lines.push('| --- |' + STRATEGIES.map(() => ' ---: |').join(''));
	for (const row of scaling) {
		lines.push(`| ${row.elements} | ` + STRATEGIES.map((s) => row.urls[s.id]).join(' | ') + ' |');
	}
	lines.push('');

	// One headline number, so the summary does not have to be read off five tables.
	const best = results.map(({ rows }) => {
		const current = rows.find((r) => r.id === 'current');
		const merged = rows.find((r) => r.id === 'merged');
		return { ratio: merged.url / current.url, current: current.url, merged: merged.url };
	});
	const mean = best.reduce((sum, b) => sum + b.ratio, 0) / best.length;
	lines.push('## Headline', '');
	lines.push(
		`Across the corpus the merged computed-style capture takes **${(mean * 100).toFixed(0)}%** ` +
		`of the current extension's link length ` +
		`(${Math.min(...best.map((b) => b.merged))}–${Math.max(...best.map((b) => b.merged))} chars ` +
		`against ${Math.min(...best.map((b) => b.current))}–${Math.max(...best.map((b) => b.current))}).`,
		'',
	);

	return lines.join('\n');
}

main().catch((error) => {
	console.error(error);
	server.close();
	process.exit(1);
});
