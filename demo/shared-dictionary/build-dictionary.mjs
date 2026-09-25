// build-dictionary.mjs — build a zstd raw-content dictionary from general web
// vocabulary.
//
// The idea: linkify.ink controls both ends of every link, so a dictionary shipped
// once with the app can prime the compressor with text almost every link contains
// (HTML tags, attributes, CSS properties, JS keywords, common English), and no link
// has to spell that text out on its own.
//
// Nothing here is derived from the documents we measure against. Every word comes
// from a general source that is already installed:
//
//   - HTML tag names and CSS property names: TypeScript's lib.dom.d.ts
//   - JS / TS keywords, literals and built-ins: highlight.js's language definitions
//   - English word and phrase frequencies: counted over the Markdown docs in
//     node_modules and the MDN prose in lib.dom.d.ts's JSDoc comments, i.e.
//     technical English
//   - a zstd-trained section: fragments of the HTML, CSS, JS and Markdown that
//     ship in node_modules, picked by zstd's own trainer (train-dictionary.py)
//   - the most frequent words of 41 languages, counted over Common Voice's
//     sentences and VS Code's and Firefox's translations (count-words.mjs), so
//     links in any of them get shorter too
//
// plus hand-ordered "most common" lists for the high-value end.
//
// zstd accepts any bytes as a raw content dictionary. It finds matches by offset
// back from the current position, and the dictionary sits right before the input,
// so bytes near the END of the dictionary are the cheapest to reference. The
// dictionary is therefore laid out least-valuable-first, which also means a
// smaller dictionary is just the tail of a bigger one (see `truncateDictionary`).
//
//   python3 demo/shared-dictionary/train-dictionary.py  → out/trained-1024k.raw
//   node demo/shared-dictionary/count-words.mjs         → out/words-5000.json
//   node demo/shared-dictionary/build-dictionary.mjs    → out/dictionary.bin
//   node demo/shared-dictionary/build-dictionary.mjs --write dictionaries/vN.dict.zst

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const require = createRequire(import.meta.url);

/** Size of the trained section, in KB of zstd-trained raw content. */
export const TRAINED_KB = 1024;
/** Words per language in the languages section. */
export const LANGUAGE_WORDS = 5000;

// ── Sources ──────────────────────────────────────────────────────────────────

const libDom = readFileSync(join(root, 'node_modules/typescript/lib/lib.dom.d.ts'), 'utf8');

/** Every HTML tag name, from `interface HTMLElementTagNameMap`. */
function allTagNames() {
	const block = libDom.match(/^interface HTMLElementTagNameMap \{([\s\S]*?)^\}/m);
	if (!block) throw new Error('HTMLElementTagNameMap not found in lib.dom.d.ts');
	return [...block[1].matchAll(/"([a-z0-9]+)":/g)].map((m) => m[1]);
}

/** Every standard CSS property name, from `interface CSSStyleProperties`. */
function allCssProperties() {
	const block = libDom.match(/^interface CSSStyleProperties [^{]*\{([\s\S]*?)^\}/m);
	if (!block) throw new Error('CSSStyleProperties not found in lib.dom.d.ts');
	return [...block[1].matchAll(/^ {4}([a-z][A-Za-z]*): string;/gm)]
		.map((m) => m[1].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))
		.filter((name) => !name.startsWith('webkit'));
}

/** JavaScript + TypeScript keyword lists, from highlight.js. */
export function jsVocabulary() {
	const hljs = require('highlight.js/lib/core');
	/** @param {string} name */
	const keywords = (name) => require(`highlight.js/lib/languages/${name}`)(hljs).keywords;
	const words = new Set();
	for (const lang of ['javascript', 'typescript']) {
		const kw = keywords(lang);
		for (const group of ['keyword', 'literal', 'built_in', 'variable.language'])
			for (const word of kw[group] ?? []) words.add(word);
	}
	return [...words];
}

/**
 * The prose in every Markdown file in node_modules plus the MDN descriptions in
 * lib.dom.d.ts, with code and URLs taken out: technical English, which is the
 * kind that gets shared as a link (docs, reports, reviews). Only counts are taken
 * from it, never the text itself.
 */
function technicalProse() {
	/** @type {string[]} */
	const texts = [];
	/** @param {string} dir */
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			const stat = statSync(path, { throwIfNoEntry: false });
			if (!stat) continue;
			if (stat.isDirectory()) walk(path);
			else if (/\.md$/i.test(name) && stat.size < 2_000_000) texts.push(readFileSync(path, 'utf8'));
		}
	};
	walk(join(root, 'node_modules'));
	texts.push(...[...libDom.matchAll(/^\s*\* (.+)$/gm)].map((m) => m[1]));
	return texts.map((text) =>
		text
			.replace(/```[\s\S]*?```/g, ' ') // fenced code
			.replace(/`[^`]*`/g, ' ') // inline code
			.replace(/\]\([^)]*\)/g, ']') // link targets
			.replace(/https?:\/\/\S+/g, ' '),
	);
}

/** English words ranked by how often they appear in technical prose. */
export function englishByFrequency() {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const prose of technicalProse())
		for (const [word] of prose.matchAll(/\b[a-z]{2,}(?:'[a-z]+)?\b/g))
			counts.set(word, (counts.get(word) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1]).map(([word]) => word);
}

/**
 * Two- and three-word phrases ("of the", "in order to", "is used,"), ranked by
 * how many bytes they would save: count × length. A phrase is a longer match than
 * any of its words, and English is mostly made of a few thousand of them. Phrases
 * seen three times or fewer are noise and are left out.
 */
export function phrasesByFrequency() {
	/** @type {Map<string, number>} */
	const counts = new Map();
	/** @param {string} phrase */
	const count = (phrase) => counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
	for (const prose of technicalProse())
		for (const sentence of prose.split(/[.!?;:()[\]\n]+/)) {
			const w = sentence.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|,/g) ?? [];
			for (let i = 0; i + 1 < w.length; i++) {
				if (w[i] === ',') continue;
				const two = w[i] + (w[i + 1] === ',' ? ',' : ' ' + w[i + 1]);
				count(two);
				if (i + 2 < w.length && w[i + 1] !== ',' && w[i + 2] !== ',') count(two + ' ' + w[i + 2]);
			}
		}
	return [...counts]
		.filter(([, n]) => n > 3)
		.sort((a, b) => b[1] * b[0].length - a[1] * a[0].length)
		.map(([phrase]) => phrase);
}

// ── Hand-ordered high-value lists ────────────────────────────────────────────
// Roughly most-common-first (by web usage stats and experience). These go at the
// end of the dictionary, where references are cheapest.

const COMMON_TAGS = [
	'div', 'span', 'a', 'p', 'li', 'ul', 'img', 'script', 'style', 'meta', 'link',
	'button', 'input', 'h1', 'h2', 'h3', 'h4', 'section', 'header', 'footer', 'nav',
	'main', 'article', 'aside', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code',
	'pre', 'strong', 'em', 'small', 'label', 'form', 'select', 'option', 'textarea',
	'svg', 'path', 'details', 'summary', 'figure', 'figcaption', 'blockquote', 'ol',
	'dl', 'dt', 'dd', 'hr', 'br', 'b', 'i', 'kbd', 'time', 'mark', 'title', 'head', 'body',
];

const COMMON_ATTRIBUTES = [
	'class', 'id', 'href', 'src', 'alt', 'type', 'name', 'value', 'style', 'title',
	'rel', 'target', 'content', 'width', 'height', 'role', 'aria-label', 'aria-hidden',
	'aria-expanded', 'aria-controls', 'aria-labelledby', 'aria-describedby',
	'aria-current', 'data-id', 'data-type', 'data-value', 'tabindex', 'placeholder',
	'disabled', 'checked', 'selected', 'for', 'action', 'method', 'loading', 'lang',
	'charset', 'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'xmlns', 'colspan',
	'open', 'hidden', 'onclick', 'crossorigin', 'integrity', 'defer', 'async',
];

// Whole declarations, as a hand-written or minified stylesheet spells them.
const COMMON_DECLARATIONS = [
	'display:flex', 'display:grid', 'display:block', 'display:none', 'display:inline-block',
	'align-items:center', 'justify-content:center', 'justify-content:space-between',
	'flex-direction:column', 'flex-wrap:wrap', 'flex:1', 'gap:8px', 'gap:12px', 'gap:16px',
	'position:relative', 'position:absolute', 'position:fixed', 'position:sticky', 'top:0',
	'left:0', 'right:0', 'bottom:0', 'margin:0', 'padding:0', 'margin:0 auto',
	'box-sizing:border-box', 'width:100%', 'height:100%', 'max-width:100%',
	'min-height:100vh', 'overflow:hidden', 'overflow:auto', 'cursor:pointer',
	'text-align:center', 'text-decoration:none', 'font-weight:600', 'font-weight:700',
	'font-weight:bold', 'font-size:14px', 'font-size:16px', 'font-size:12px',
	'line-height:1.5', 'line-height:1.6', 'white-space:nowrap', 'text-overflow:ellipsis',
	'border:none', 'border:0', 'border:1px solid', 'border-radius:4px', 'border-radius:8px',
	'border-radius:50%', 'background:none', 'background:transparent', 'color:inherit',
	'font:inherit', 'list-style:none', 'outline:none', 'opacity:0', 'opacity:1',
	'z-index:1', 'transition:all .2s ease', 'transform:translateY(-50%)',
	'grid-template-columns:repeat(', 'minmax(0,1fr)', 'var(--', 'calc(100% - ',
	'rgba(0,0,0,', 'box-shadow:0 1px 3px rgba(0,0,0,.1)',
	'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
	'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
	'@media (max-width:', '@media (prefers-color-scheme:dark)', ':root{', '*{box-sizing:border-box}',
	':hover{', ':focus-visible{', '::before{', '::after{', ':first-child', ':last-child',
	':nth-child(', '!important',
];

const COMMON_CSS_VALUES = [
	'auto', 'none', 'inherit', 'initial', 'transparent', 'currentColor', 'center',
	'block', 'inline', 'flex', 'grid', 'solid', 'dashed', 'hidden', 'visible', 'pointer',
	'relative', 'absolute', 'normal', 'bold', 'nowrap', 'wrap', 'uppercase', 'ease',
	'ease-in-out', 'linear', 'space-between', 'flex-start', 'flex-end', 'column', 'row',
	'1px', '2px', '4px', '8px', '10px', '12px', '14px', '16px', '20px', '24px', '32px',
	'.5rem', '1rem', '1.5rem', '2rem', '100%', '50%', '#fff', '#000',
];

// Code phrases, with the punctuation and spacing they actually appear with.
const COMMON_JS = [
	'function ', 'return ', 'const ', 'let ', 'var ', 'if (', '} else {', 'else if (',
	'for (const ', ' of ', 'while (', 'switch (', 'case ', 'break;', 'continue;',
	'new ', 'this.', 'await ', 'async ', 'async function ', 'export ', 'export default ',
	'export function ', 'export const ', 'import ', ' from \'', 'import { ', ' } from \'',
	'type ', 'interface ', 'extends ', 'implements ', ': string', ': number', ': boolean',
	'readonly ', 'private ', 'public ', 'undefined', 'null', 'true', 'false', 'typeof ',
	'instanceof ', 'try {', '} catch (', 'throw new Error(', 'Promise<', 'Array<',
	'Record<string, ', '.length', '.map((', '.filter((', '.forEach((', '.reduce((',
	'.find((', '.some((', '.push(', '.join(\'', '.slice(', '.split(\'', '.includes(',
	'.toString()', 'Object.keys(', 'Object.entries(', 'Array.from(', 'Array.isArray(',
	'JSON.stringify(', 'JSON.parse(', 'Math.max(', 'Math.min(', 'Math.round(',
	'Math.floor(', 'console.log(', 'document.querySelector(\'', 'document.querySelectorAll(\'',
	'document.getElementById(\'', 'document.createElement(\'', '.addEventListener(\'click\', ',
	'.classList.add(\'', '.classList.remove(\'', '.classList.toggle(\'', '.textContent = ',
	'.innerHTML = ', '.appendChild(', '.setAttribute(\'', '.getAttribute(\'', '.dataset.',
	'window.', 'localStorage.getItem(\'', 'setTimeout(() => ', 'fetch(', '.then((', ' => {',
	') => ', '});', '() {', ' === ', ' !== ', ' && ', ' || ', ' ?? ', '?.', '...',
];

// Escapes for text and code embedded in HTML (a <pre> of source is all entities).
const ENTITIES = [
	'&amp;', '&lt;', '&gt;', '&quot;', '&#39;', '&#x27;', '&nbsp;', '&mdash;', '&ndash;',
	'&hellip;', '&copy;', '&rarr;', '&larr;', '&times;', '&middot;', '&bull;',
];

// The document shell most single-file pages start with, in the two spellings
// generators actually emit. This is the single most valuable run of bytes: every
// link starts here, before the input has any history of its own.
const BOILERPLATE = [
	'<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n' +
		'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
		'  <title></title>\n  <style>\n    body {\n      margin: 0;\n      font-family: ' +
		'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n    }\n' +
		'  </style>\n</head>\n<body>\n  <div class="container">\n  </div>\n' +
		'  <script>\n  </script>\n</body>\n</html>\n',
	'<!doctype html><html lang="en"><head><meta charset="utf-8">' +
		'<meta name="viewport" content="width=device-width,initial-scale=1">' +
		'<title></title><style></style></head><body></body></html>',
];

// ── Rendering each vocabulary as the bytes it appears as ─────────────────────

/** @param {string[]} tags */
const renderTags = (tags) => tags.map((t) => `<${t}></${t}>`).join('') + tags.map((t) => `<${t} class="`).join('"');
/** @param {string[]} attrs */
const renderAttributes = (attrs) => attrs.map((a) => ` ${a}="`).join('"');
/** @param {string[]} props */
const renderCssProperties = (props) => props.map((p) => `${p}:`).join(';') + ';';
/** @param {string[]} decls */
const renderDeclarations = (decls) =>
	decls.join(';') + ';\n' + decls.slice(0, 40).map((d) => '  ' + d.replace(':', ': ') + ';\n').join('');
/** @param {string[]} words */
const renderWords = (words) => ' ' + words.join(' ') + ' ';
/** Sentence-initial spellings of the commonest words ("The ", "This "). @param {string[]} words */
const renderCapitalized = (words) =>
	' ' + words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') + ' ';

/**
 * Sections, least valuable first. Each has a `category` so the measurement can
 * drop one at a time and see what it was worth.
 *
 * `languages` is optional: the most frequent words of each language (see
 * count-words.mjs), one line of words per language. It is the least valuable
 * part for any single link, since most of it is languages the link isn't in, so
 * it goes first of all. That placement costs English links nothing, and moving
 * it closer gained other languages only half a point.
 *
 * `trained` is optional raw content from a zstd-trained dictionary (see
 * train-dictionary.py): real fragments of general web text, which cover what no
 * word list does (code idioms, Markdown structure, whole sentences). It is the
 * biggest section after the languages, and goes right after them.
 *
 * @param {{ englishWords?: number, trained?: Buffer, languages?: Record<string, string[]> }} [options]
 * @returns {{ category: string, text: string | Buffer }[]}
 */
export function buildSections({ englishWords = 6000, trained, languages } = {}) {
	const english = englishByFrequency();
	const commonTags = new Set(COMMON_TAGS);
	const commonProps = new Set(COMMON_DECLARATIONS.map((d) => d.split(':')[0]));
	const js = jsVocabulary();
	const commonJs = new Set(COMMON_JS.map((p) => p.trim()));

	return [
		...(languages
			? [{ category: 'languages', text: Object.values(languages).map(renderWords).join('\n') }]
			: []),
		...(trained ? [{ category: 'trained', text: trained }] : []),

		// The long tail: everything exhaustive, cheapest-to-lose first.
		{ category: 'phrases', text: renderWords(phrasesByFrequency().reverse()) },
		{ category: 'english', text: renderWords(english.slice(3000, englishWords)) },
		{ category: 'css', text: renderCssProperties(allCssProperties().filter((p) => !commonProps.has(p))) },
		{ category: 'html', text: renderTags(allTagNames().filter((t) => !commonTags.has(t))) },
		{ category: 'js', text: renderWords(js.filter((w) => !commonJs.has(w))) },
		{ category: 'english', text: renderWords(english.slice(1000, 3000)) },

		// The common core.
		{ category: 'english', text: renderWords(english.slice(250, 1000)) },
		{ category: 'css', text: renderCssProperties(COMMON_CSS_VALUES) },
		{ category: 'js', text: COMMON_JS.join('') },
		{ category: 'html', text: renderAttributes(COMMON_ATTRIBUTES) + ENTITIES.join(' ') },
		{ category: 'css', text: renderDeclarations(COMMON_DECLARATIONS) },
		{ category: 'html', text: renderTags(COMMON_TAGS) },
		{ category: 'english', text: renderCapitalized(english.slice(0, 60)) + renderWords(english.slice(0, 250)) },
		{ category: 'boilerplate', text: BOILERPLATE.join('') },
	];
}

/** @param {{ text: string | Buffer }[]} sections */
export const joinSections = (sections) =>
	Buffer.concat(sections.flatMap((s, i) => [...(i ? [Buffer.from('\n')] : []), Buffer.from(s.text)]));

/**
 * A smaller dictionary is the tail of the full one, because the tail is where the
 * most valuable bytes are. Cut on a space so no word is split.
 *
 * @param {Buffer} dictionary @param {number} size
 */
export function truncateDictionary(dictionary, size) {
	if (dictionary.length <= size) return dictionary;
	const start = dictionary.indexOf(0x20, dictionary.length - size);
	return dictionary.subarray(start === -1 ? dictionary.length - size : start);
}

/**
 * The word lists count-words.mjs left in out/, if it has been run.
 * @returns {Record<string, string[]> | undefined} language → words, most frequent first
 */
export function readLanguages(n = LANGUAGE_WORDS) {
	const path = join(here, 'out', `words-${n}.json`);
	return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

/** The trained content train-dictionary.py left in out/, if it has been run. */
export function readTrained(kb = TRAINED_KB) {
	const path = join(here, 'out', `trained-${kb}k.raw`);
	return existsSync(path) ? readFileSync(path) : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const trained = readTrained();
	if (!trained) console.warn(`out/trained-${TRAINED_KB}k.raw not found: run train-dictionary.py first, or this is the vocabulary only`);
	const languages = readLanguages();
	if (!languages) console.warn(`out/words-${LANGUAGE_WORDS}.json not found: run count-words.mjs first, or this has no other languages`);
	const sections = buildSections({ trained, languages });
	const dictionary = joinSections(sections);
	mkdirSync(join(here, 'out'), { recursive: true });
	writeFileSync(join(here, 'out', 'dictionary.bin'), dictionary);
	/** @type {Record<string, number>} */
	const byCategory = {};
	for (const s of sections) byCategory[s.category] = (byCategory[s.category] ?? 0) + Buffer.byteLength(s.text);
	console.log(`out/dictionary.bin: ${dictionary.length} bytes`, byCategory);

	// --write <path> freezes this build as a new dictionary version. Published
	// dictionaries are part of the link format and are never overwritten.
	const at = process.argv.indexOf('--write');
	if (at !== -1) {
		const target = join(process.cwd(), process.argv[at + 1] ?? '');
		if (existsSync(target)) throw new Error(`${target} exists; a published dictionary is never replaced`);
		// zstd would read the frame magic as a formatted dictionary, not raw content
		if (dictionary.readUInt32LE(0) === 0xec30a437) throw new Error('dictionary starts with the zstd dictionary magic');
		const { linkifyInkCodecDependencies } = await import('../../vendor.codec.bundle.js');
		const { zstd, zstdWasmUrl } = linkifyInkCodecDependencies;
		await zstd.init(zstdWasmUrl);
		const compressed = zstd.compress(dictionary, 22);
		writeFileSync(target, compressed);
		console.log(`${target}: ${compressed.length} bytes`);
	}
}
