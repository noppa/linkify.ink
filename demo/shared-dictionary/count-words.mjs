// count-words.mjs — the multilingual section of the shared dictionary.
//
// Counts the most frequent words of 41 languages in text that is free to build
// on, and writes them as out/words-{N}.json. Only counts are taken, never text.
//
//   - Mozilla Common Voice's sentence corpus (CC0): everyday sentences, the bulk
//     of the text for most languages
//   - VS Code's language packs (MIT): UI and technical vocabulary, and most of
//     the text for Japanese, Korean and Chinese, where Common Voice is small
//   - Firefox's localizations (MPL-2.0): the same for every other language,
//     Finnish especially
//
// Words are counted as written, so German nouns and sentence starts keep their
// capitals. Chinese and Japanese aren't written with spaces between words, so
// for them the frequent two- to four-character runs of Chinese characters and
// kana stand in for words.
//
// The sources are cloned into out/sources/ (shallow, sparse: ~300 MB) on first
// run.
//
//   node demo/shared-dictionary/count-words.mjs [N]   → out/words-{N}.json

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sources = join(here, 'out', 'sources');

/** Words per language. */
export const WORDS_PER_LANGUAGE = 5000;

/**
 * The languages, by their Common Voice locale, with each source's name for them
 * where it has one. Roughly the most-used languages on the web, less those none
 * of the sources has enough text in.
 * @type {Record<string, { vscode?: string, firefox?: string }>}
 */
const LANGUAGES = {
	ar: { firefox: 'ar' }, bg: { firefox: 'bg' }, bn: { firefox: 'bn' }, ca: { firefox: 'ca' },
	cs: { vscode: 'cs', firefox: 'cs' }, da: { firefox: 'da' }, de: { vscode: 'de', firefox: 'de' },
	el: { firefox: 'el' }, en: {}, es: { vscode: 'es', firefox: 'es-ES' }, fa: { firefox: 'fa' },
	fi: { firefox: 'fi' }, fr: { vscode: 'fr', firefox: 'fr' }, he: { firefox: 'he' },
	hi: { firefox: 'hi-IN' }, hu: { firefox: 'hu' }, id: { firefox: 'id' },
	is: { firefox: 'is' }, it: { vscode: 'it', firefox: 'it' }, ja: { vscode: 'ja', firefox: 'ja' },
	ko: { vscode: 'ko', firefox: 'ko' }, lt: { firefox: 'lt' }, lv: { firefox: 'lv' },
	mk: { firefox: 'mk' }, 'nb-NO': { firefox: 'nb-NO' }, nl: { firefox: 'nl' },
	pl: { vscode: 'pl', firefox: 'pl' }, pt: { vscode: 'pt-BR', firefox: 'pt-BR' },
	ro: { firefox: 'ro' }, ru: { vscode: 'ru', firefox: 'ru' }, sk: { firefox: 'sk' },
	sl: { firefox: 'sl' }, sr: { firefox: 'sr' }, 'sv-SE': { firefox: 'sv-SE' },
	ta: { firefox: 'ta' }, tr: { vscode: 'tr', firefox: 'tr' }, uk: { firefox: 'uk' },
	ur: { firefox: 'ur' }, vi: { firefox: 'vi' }, 'zh-CN': { vscode: 'zh-hans', firefox: 'zh-CN' },
	'zh-TW': { vscode: 'zh-hant', firefox: 'zh-TW' },
};
const UNSPACED = new Set(['ja', 'zh-CN', 'zh-TW']);
/** Enough Common Voice text per language; the biggest (German, 140 MB) are cut. */
const MAX_CHARS = 30_000_000;

/** Shallow, sparse clone of `repo` with only `paths`, once. @param {string} name @param {string} repo @param {string[]} paths */
function checkout(name, repo, paths) {
	const dir = join(sources, name);
	if (existsSync(dir)) return dir;
	mkdirSync(sources, { recursive: true });
	const git = (/** @type {string[]} */ ...args) => execFileSync('git', args, { cwd: dir, stdio: 'inherit' });
	execFileSync('git', ['clone', '--depth=1', '--filter=blob:none', '--no-checkout', repo, dir], { stdio: 'inherit' });
	git('sparse-checkout', 'set', '--no-cone', ...paths);
	git('checkout');
	return dir;
}

/** @param {string} dir @param {(path: string) => void} fn */
const walk = (dir, fn) => {
	if (!existsSync(dir)) return;
	for (const name of readdirSync(dir).sort()) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, fn);
		else fn(path);
	}
};

/** @param {string} locale @param {{ vscode?: string, firefox?: string }} names */
function textOf(locale, { vscode, firefox }) {
	/** @type {string[]} */
	const texts = [];
	let chars = 0;
	walk(join(sources, 'common-voice', 'server', 'data', locale), (path) => {
		if (chars > MAX_CHARS) return;
		const text = readFileSync(path, 'utf8');
		chars += text.length;
		texts.push(text);
	});
	if (vscode)
		walk(join(sources, 'vscode-loc', 'i18n', `vscode-language-pack-${vscode}`, 'translations'), (path) => {
			if (!path.endsWith('.json')) return;
			/** @param {unknown} value */
			const strings = (value) => {
				if (typeof value === 'string') texts.push(value);
				else if (value && typeof value === 'object') Object.values(value).forEach(strings);
			};
			strings(JSON.parse(readFileSync(path, 'utf8')).contents);
		});
	if (firefox)
		walk(join(sources, 'firefox-l10n', firefox), (path) => {
			const source = readFileSync(path, 'utf8');
			const values = path.endsWith('.ftl')
				? source.matchAll(/^[ \t]*\.?[\w-]+[ \t]*=[ \t]*(.+)$/gm)
				: path.endsWith('.properties')
					? source.matchAll(/^[\w.-]+[ \t]*=[ \t]*(.+)$/gm)
					: [];
			// Placeables ({ $count }, %S) and markup are code, not language; access keys
			// are single letters.
			for (const [line, value] of values)
				if (!/accesskey/i.test(line.split('=')[0]))
					texts.push(value.replace(/\{[^}]*\}|<[^>]+>|%(\d\$)?[Sd]|\\n/g, ' '));
		});
	return texts.join('\n');
}

/**
 * The `n` most frequent words of `text`, most frequent first. Words seen fewer
 * than three times are noise and are left out, so a language with little text
 * gets fewer.
 * @param {string} text @param {boolean} unspaced @param {number} n
 */
function topWords(text, unspaced, n) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	const count = (/** @type {string} */ word) => counts.set(word, (counts.get(word) ?? 0) + 1);
	if (unspaced)
		for (const [run] of text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu)) {
			const chars = [...run];
			for (let size = 2; size <= 4; size++)
				for (let i = 0; i + size <= chars.length; i++) count(chars.slice(i, i + size).join(''));
		}
	else for (const [word] of text.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu)) count(word);
	return [...counts]
		.filter(([, c]) => c >= 3)
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([word]) => word);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const n = Number(process.argv[2] ?? WORDS_PER_LANGUAGE);
	const locales = Object.entries(LANGUAGES);
	checkout('common-voice', 'https://github.com/common-voice/common-voice.git',
		locales.map(([locale]) => `/server/data/${locale}/`));
	checkout('vscode-loc', 'https://github.com/microsoft/vscode-loc.git',
		locales.flatMap(([, { vscode }]) => (vscode ? [`/i18n/vscode-language-pack-${vscode}/`] : [])));
	checkout('firefox-l10n', 'https://github.com/mozilla-l10n/firefox-l10n.git',
		locales.flatMap(([, { firefox }]) => (firefox ? [`/${firefox}/`] : [])));

	/** @type {Record<string, string[]>} */
	const words = {};
	for (const [locale, names] of locales) {
		words[locale] = topWords(textOf(locale, names), UNSPACED.has(locale), n);
		console.log(`${locale}: ${words[locale].length} words (${words[locale].slice(0, 6).join(' ')} …)`);
	}
	const path = join(here, 'out', `words-${n}.json`);
	writeFileSync(path, JSON.stringify(words));
	console.log(path);
}
