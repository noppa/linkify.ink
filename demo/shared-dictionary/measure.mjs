// measure.mjs — how much shorter does a shared zstd dictionary make a link?
//
// Every number here is a real link: the document goes through LinkifyInk's own
// createLink, and back through readLink to prove it round-trips. The lib takes
// its zstd module as a dependency, so a dictionary is tried by handing it a zstd
// whose compress/decompress are the vendored *UsingDict variants. The lib itself
// is untouched.
//
//   node demo/shared-dictionary/build-dictionary.mjs
//   python3 demo/shared-dictionary/train-dictionary.py      (optional, slow)
//   node demo/shared-dictionary/measure.mjs [extra.html ...] → out/report.md
//
// Documents passed on the command line are measured alongside the held-out repo
// files, and also as prefixes (the first 4/16/64 KB) to show how the saving
// depends on document size.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkifyInkCodecDependencies } from '../../vendor.codec.bundle.js';
import { LinkifyInk } from '../../linkify.ink.js';
import { buildSections, joinSections, truncateDictionary } from './build-dictionary.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const { zstd } = linkifyInkCodecDependencies;

// ── Corpus ───────────────────────────────────────────────────────────────────

/** @type {{ name: string, bytes: Uint8Array }[]} */
const documents = [];
/** @param {string} name @param {Uint8Array} bytes */
const add = (name, bytes) => documents.push({ name, bytes });

for (const path of process.argv.slice(2)) {
	const bytes = new Uint8Array(readFileSync(path));
	const name = basename(path).replace(/^[0-9a-f]{8}-/, '');
	for (const kb of [4, 16, 64])
		if (bytes.length > kb * 1024 * 2) add(`${name} (first ${kb} KB)`, bytes.subarray(0, kb * 1024));
	add(name, bytes);
}
// Held out: the repo's own files. Nothing in either dictionary comes from them.
for (const path of ['index.html', 'sandbox-loader.html', 'styles.css', 'app.js',
	'components/EditorPage.js', 'README.md', 'linkify-ink-plan.md'])
	add(path, new Uint8Array(readFileSync(join(root, path))));

// ── Dictionaries ─────────────────────────────────────────────────────────────

const sections = buildSections();
const vocabulary = joinSections(sections);

/** @type {{ name: string, dictionary?: Uint8Array }[]} */
const variants = [{ name: 'no dictionary' }];
for (const kb of [4, 16, 32])
	variants.push({ name: `vocab ${kb} KB`, dictionary: truncateDictionary(vocabulary, kb * 1024) });
variants.push({ name: `vocab ${Math.round(vocabulary.length / 1024)} KB`, dictionary: vocabulary });
for (const category of new Set(sections.map((s) => s.category)))
	variants.push({
		name: `vocab − ${category}`,
		dictionary: joinSections(sections.filter((s) => s.category !== category)),
	});
for (const kb of [16, 64]) {
	const path = join(here, 'out', `trained-${kb}k.dict`);
	if (!existsSync(path)) continue;
	const trained = new Uint8Array(readFileSync(path));
	variants.push({ name: `trained ${kb} KB`, dictionary: trained });
}

// ── Measuring ────────────────────────────────────────────────────────────────

/** A LinkifyInk whose zstd uses `dictionary` in both directions. @param {Uint8Array} [dictionary] */
function linkifyWith(dictionary) {
	if (!dictionary) return new LinkifyInk(linkifyInkCodecDependencies);
	const cctx = zstd.createCCtx();
	const dctx = zstd.createDCtx();
	return new LinkifyInk({
		...linkifyInkCodecDependencies,
		zstd: {
			...zstd,
			/** @param {Uint8Array} data @param {number} level */
			compress: (data, level) => zstd.compressUsingDict(cctx, data, dictionary, level),
			/** @param {Uint8Array} data */
			decompress: (data) => zstd.decompressUsingDict(dctx, data, dictionary),
		},
	});
}

/** @param {Uint8Array} a @param {Uint8Array} b */
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

await linkifyWith().createLink([]); // loads the wasm, which createCCtx needs
/** @type {Map<string, number[]>} variant name → link length per document */
const results = new Map();
for (const variant of variants) {
	const linkify = linkifyWith(variant.dictionary);
	const lengths = [];
	for (const doc of documents) {
		const name = doc.name.endsWith('.html') || doc.name.includes('.html ') ? 'index.html' : doc.name;
		const url = await linkify.createLink([{ name, data: doc.bytes }]);
		const { files } = await linkify.readLink(url);
		if (!same(files[0].data, doc.bytes)) throw new Error(`${variant.name} failed to round-trip ${doc.name}`);
		lengths.push(url.length);
	}
	results.set(variant.name, lengths);
}

// ── Report ───────────────────────────────────────────────────────────────────

const baseline = /** @type {number[]} */ (results.get('no dictionary'));
/** @param {number} n @param {number} base */
const pct = (n, base) => `${n < base ? '−' : '+'}${(Math.abs(1 - n / base) * 100).toFixed(1)}%`;
const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US');

const lines = [
	'# Shared-dictionary link lengths',
	'',
	'Link length in characters (the whole `https://linkify.ink/#…` URL), unencrypted,',
	'zstd level 19, through `LinkifyInk.createLink` and verified with `readLink`.',
	'',
	`| document | size | ${variants.map((v) => v.name).join(' | ')} |`,
	`| --- | ---: | ${variants.map(() => '---:').join(' | ')} |`,
];
documents.forEach((doc, i) => {
	const cells = variants.map((v) => {
		const n = /** @type {number[]} */ (results.get(v.name))[i];
		return v.dictionary ? `${fmt(n)} (${pct(n, baseline[i])})` : fmt(n);
	});
	lines.push(`| ${doc.name} | ${fmt(doc.bytes.length)} | ${cells.join(' | ')} |`);
});
const total = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0);
lines.push(
	`| **total** | ${fmt(total(documents.map((d) => d.bytes.length)))} | ` +
		variants.map((v) => {
			const n = total(/** @type {number[]} */ (results.get(v.name)));
			return v.dictionary ? `${fmt(n)} (${pct(n, total(baseline))})` : fmt(n);
		}).join(' | ') + ' |',
);

const report = lines.join('\n') + '\n';
mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out', 'report.md'), report);
console.log(report);
