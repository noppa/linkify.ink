// snapshot.mjs — render each fixture next to its capture, for eyeballing.
//
// The pixel diff in run.mjs is a number, and a number can be right for the wrong
// reason. This writes out/side-by-side.png so the two can be looked at, which is
// how the <pre> newline bug was found: 1.3% of pixels is a rounding error in a
// table and also a code block that has lost every line break.
//
//   node demo/scrape-compress/snapshot.mjs

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { FIXTURES, renderFixture } from './fixtures/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8435;
const WIDTH = 1280;
const HEIGHT = 900;
const GUTTER = 10;

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

await mkdir(join(here, 'out'), { recursive: true });
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const captureSource = await readFile(join(here, 'capture.js'), 'utf8');
const clip = { x: 0, y: 0, width: WIDTH, height: HEIGHT };

/** @type {Buffer[]} */
const panels = [];
for (const fixture of FIXTURES) {
	const page = await context.newPage();
	await page.goto(`http://localhost:${PORT}/f/${fixture.name}`, { waitUntil: 'load' });
	const original = await page.screenshot({ clip });
	await page.addScriptTag({ content: captureSource });
	const capture = await page.evaluate(() => globalThis.__linkifyScrape.capture());
	await page.close();

	const view = await context.newPage();
	await view.setContent(capture.doc, { waitUntil: 'load' });
	const rebuilt = await view.screenshot({ clip });
	await view.close();

	// Magenta gutter: any seam that isn't exactly where the gutter is, is a
	// difference between the two panels rather than a difference in the montage.
	const pair = await sharp({
		create: { width: WIDTH * 2 + GUTTER, height: HEIGHT, channels: 3, background: '#f0f' },
	})
		.composite([
			{ input: original, left: 0, top: 0 },
			{ input: rebuilt, left: WIDTH + GUTTER, top: 0 },
		])
		.png()
		.toBuffer();
	panels.push(await sharp(pair).resize({ width: 1200 }).png().toBuffer());
	process.stderr.write(`  ${fixture.name}\n`);
}

const panelHeight = Math.round((HEIGHT * 1200) / (WIDTH * 2 + GUTTER));
const montage = await sharp({
	create: { width: 1200, height: panelHeight * panels.length, channels: 3, background: '#fff' },
})
	.composite(panels.map((input, i) => ({ input, left: 0, top: i * panelHeight })))
	.png()
	.toBuffer();

await writeFile(join(here, 'out', 'side-by-side.png'), montage);
process.stderr.write(`wrote ${join(here, 'out', 'side-by-side.png')} — original left, capture right\n`);

await browser.close();
server.close();
