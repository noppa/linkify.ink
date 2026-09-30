// measure.mjs — how much shorter does the shared zstd dictionary make a link?
//
// Every number here is a real link: the document goes through LinkifyInk's own
// createLink, and back through readLink to prove it round-trips. Each variant is
// handed to the lib the way the app hands it the published one, as the format-2
// entry of `zstdDictionaryUrls`.
//
//   node demo/shared-dictionary/fetch-corpus.mjs            (once; held-out docs)
//   node demo/shared-dictionary/measure.mjs [extra.html ...] → out/report.md
//
// Variants other than the published dictionary need the build inputs
// (out/trained-*.raw, out/words-*.json); the ones that are missing are skipped.
// Documents fetch-corpus.mjs names by language (`fi.…`) are reported separately.
// Documents passed on the command line are measured alongside the corpus, and also
// as prefixes (the first 4/16/64 KB) to show how the saving depends on size.

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { linkifyInkCodecDependencies } from '../../vendor/vendor.codec.bundle.js';
import { LinkifyInk } from '../../linkify.ink.js';
import { buildSections, joinSections, readLanguages, readTrained, truncateDictionary } from './build-dictionary.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const { zstd, zstdWasmUrl } = linkifyInkCodecDependencies;
await zstd.init(zstdWasmUrl);

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
for (const dir of [join(here, 'corpus'), join(here, 'out', 'corpus')])
	if (existsSync(dir))
		for (const name of readdirSync(dir).sort()) add(name, new Uint8Array(readFileSync(join(dir, name))));
// What the extension's article mode produces: rendered prose in a bare shell.
for (const name of ['react-19.md', 'rustbook-ch04.md']) {
	const path = join(here, 'out', 'corpus', name);
	if (!existsSync(path)) continue;
	const body = marked.parse(readFileSync(path, 'utf8'), { async: false });
	const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title></head><body><article>${body}</article></body></html>`;
	add(`${name} as article.html`, new TextEncoder().encode(html));
}
// This repo's own files. Nothing in the dictionary comes from them either.
for (const path of ['index.html', 'sandbox-loader.html', 'styles.css', 'app.js',
	'components/EditorPage.js', 'README.md'])
	add(path, new Uint8Array(readFileSync(join(root, path))));

// ── Dictionaries ─────────────────────────────────────────────────────────────

const published = zstd.decompress(new Uint8Array(readFileSync(join(root, 'dictionaries', 'v2.dict.zst'))));
const v2 = Buffer.from(published.buffer, published.byteOffset, published.byteLength);

/** @type {{ name: string, dictionary?: Uint8Array }[]} */
const variants = [{ name: 'no dictionary' }];
for (const kb of [64, 256])
	variants.push({ name: `v2's last ${kb} KB`, dictionary: truncateDictionary(v2, kb * 1024) });
variants.push({ name: 'v2', dictionary: v2 });

const trained = readTrained();
const languages = readLanguages();
if (trained && languages) {
	const sections = buildSections({ trained, languages });
	for (const category of ['languages', 'trained', 'phrases', 'english'])
		variants.push({
			name: `v2 − ${category}`,
			dictionary: joinSections(sections.filter((s) => s.category !== category)),
		});
	const more = readLanguages(10000);
	if (more) variants.push({ name: 'v2 with 10k words per language', dictionary: joinSections(buildSections({ trained, languages: more })) });
}

// ── Measuring ────────────────────────────────────────────────────────────────

/** A LinkifyInk whose format-2 dictionary is `dictionary`. @param {Uint8Array} [dictionary] */
function linkifyWith(dictionary) {
	const url = dictionary && `data:application/octet-stream;base64,${Buffer.from(zstd.compress(dictionary, 19)).toString('base64')}`;
	return new LinkifyInk({ ...linkifyInkCodecDependencies, zstdDictionaryUrls: url ? { 2: url } : {} });
}

/** @param {Uint8Array} a @param {Uint8Array} b */
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** @type {Map<string, { lengths: number[], ms: number }>} */
const results = new Map();
for (const variant of variants) {
	const linkify = linkifyWith(variant.dictionary);
	await linkify.createLink([]); // loads the dictionary, so it isn't timed
	const lengths = [];
	let ms = 0;
	for (const doc of documents) {
		const name = doc.name.includes('.html') ? 'index.html' : doc.name;
		const start = performance.now();
		const url = await linkify.createLink([{ name, data: doc.bytes }]);
		ms += performance.now() - start;
		const { files } = await linkify.readLink(url);
		if (!same(files[0].data, doc.bytes)) throw new Error(`${variant.name} failed to round-trip ${doc.name}`);
		lengths.push(url.length);
	}
	results.set(variant.name, { lengths, ms: ms / documents.length });
	console.error(`${variant.name}: done`);
}

// ── Report ───────────────────────────────────────────────────────────────────

const baseline = /** @type {{ lengths: number[] }} */ (results.get('no dictionary')).lengths;
/** @param {number} n @param {number} base */
const pct = (n, base) => `${n < base ? '−' : '+'}${(Math.abs(1 - n / base) * 100).toFixed(1)}%`;
const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US');
const total = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0);
const lengthsOf = (/** @type {string} */ name) => /** @type {{ lengths: number[] }} */ (results.get(name)).lengths;
const isOtherLanguage = (/** @type {{ name: string }} */ doc) => /^[a-z]{2}(-[a-z]{2})?\./.test(doc.name);

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
		const n = lengthsOf(v.name)[i];
		return v.dictionary ? `${fmt(n)} (${pct(n, baseline[i])})` : fmt(n);
	});
	lines.push(`| ${doc.name} | ${fmt(doc.bytes.length)} | ${cells.join(' | ')} |`);
});
/** Total and per-document savings over the documents `pick` selects. @param {string} label @param {(doc: { name: string }) => boolean} pick */
const summary = (label, pick) => {
	const idx = documents.flatMap((doc, i) => (pick(doc) ? [i] : []));
	const sum = (/** @type {number[]} */ xs) => total(idx.map((i) => xs[i]));
	return [
		`| **${label}: total** | ${fmt(total(idx.map((i) => documents[i].bytes.length)))} | ` +
			variants.map((v) => (v.dictionary ? `${fmt(sum(lengthsOf(v.name)))} (${pct(sum(lengthsOf(v.name)), sum(baseline))})` : fmt(sum(baseline)))).join(' | ') + ' |',
		// Every document counts the same here, so a short note weighs as much as an RFC.
		`| **${label}: mean per document** | | ` +
			variants.map((v) => {
				if (!v.dictionary) return '';
				const saving = total(idx.map((i) => 1 - lengthsOf(v.name)[i] / baseline[i])) / idx.length;
				return `−${(saving * 100).toFixed(1)}%`;
			}).join(' | ') + ' |',
	];
};
lines.push(
	...summary('English', (doc) => !isOtherLanguage(doc)),
	...summary('other languages', isOtherLanguage),
	`| dictionary size | | ${variants.map((v) => (v.dictionary ? `${fmt(Math.round(v.dictionary.length / 1024))} KB` : '')).join(' | ')} |`,
	`| createLink, ms per document | | ${variants.map((v) => /** @type {{ ms: number }} */ (results.get(v.name)).ms.toFixed(0)).join(' | ')} |`,
);

const report = lines.join('\n') + '\n';
mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out', 'report.md'), report);
console.log(report);
