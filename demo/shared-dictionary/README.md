# Shared-dictionary compression

How the shared zstd dictionary in [`dictionaries/`](../../dictionaries/) was
built, and what it is worth. linkify.ink writes and reads every link, so a
dictionary loaded once by the app can prime the compressor with text most links
contain anyway: general web text, HTML tags and attributes, CSS, JS, common
English, and the commonest words of 40 other languages. No link then has to
spell that text out itself.

This started as an experiment on the lib alone. It is now link format 2: see
`linkify.ink.js` and [`dictionaries/README.md`](../../dictionaries/README.md) for
how it's wired in and versioned.

```sh
pip install zstandard
python3 demo/shared-dictionary/train-dictionary.py     # ~25 s → out/trained-1024k.raw
node demo/shared-dictionary/count-words.mjs            # ~2 min, clones ~300 MB → out/words-5000.json
node demo/shared-dictionary/build-dictionary.mjs       # → out/dictionary.bin (3.5 MB)
node demo/shared-dictionary/fetch-corpus.mjs           # held-out documents → out/corpus/
node demo/shared-dictionary/measure.mjs [page.html ...] # → out/report.md
```

`measure.mjs` measures the published `dictionaries/v2.dict.zst`, and the
variants below when their build inputs are in `out/`. Every document goes through
`LinkifyInk.createLink` and back through `readLink`, with the variant handed to
the lib the same way the app hands it the real one.

The build depends on what is in `node_modules` (both the word counts and the
trained section come from there) and on the current state of the repositories
`count-words.mjs` clones, so rebuilding later is not expected to reproduce `v2`
byte for byte. That's fine: a
dictionary is built once and frozen.
`build-dictionary.mjs --write dictionaries/vN.dict.zst` does the freezing and
refuses to overwrite a published one.

## The dictionary

A **raw content dictionary** is just bytes. zstd references earlier bytes by
their distance back, and the dictionary sits just before the input, so the end
of the dictionary is the cheapest place to reference. It is laid out
**least-valuable-first**: the other languages' words first (most of them are in
a language any one link isn't), the big trained section next, the long tail of
word lists after that, and the most common vocabulary and the document shell
last. So any shorter dictionary is just the tail of the full one.

None of it comes from the documents it is measured on:

| part | size | source | rendered as |
| --- | ---: | --- | --- |
| languages | 2,012 KB | the 5,000 commonest words of 41 languages, English included, counted by `count-words.mjs` (below) | ` der die und ist in Die ` |
| trained | 1,024 KB | fragments of the HTML, CSS, JS and Markdown in `node_modules`, chosen by zstd's own trainer (COVER, `k=1024 d=8`) | as is |
| phrases | 307 KB | two- and three-word phrases counted over the Markdown docs in `node_modules` and the MDN prose in `lib.dom.d.ts`, ranked by count × length | ` of the in order to ` |
| English | 48 KB | word frequencies over the same prose (top 6,000) | ` the of and to ` |
| CSS | 9 KB | every property in `lib.dom.d.ts`, plus common whole declarations and values | `grid-template-columns:`, `display:flex;` |
| HTML | 4 KB | tag names from `lib.dom.d.ts`, plus hand-ordered common tags, attributes and entities | `<div class="`, ` href="`, `&lt;` |
| JS | 2 KB | highlight.js's JS/TS keyword lists, plus common code phrases | `function `, `.map((` |
| boilerplate | 1 KB | the `<!DOCTYPE html>…` shell, pretty-printed and minified | as is |

Words are written with the punctuation and spacing they appear with in real
documents. zstd's shortest match is 3 bytes, so a bare `div` is useless but
`<div class="` is not.

### Words in other languages

`count-words.mjs` counts words in text that anyone may build on:

| source | licence | what it is |
| --- | --- | --- |
| [Common Voice](https://github.com/common-voice/common-voice) `server/data/` | CC0 | everyday sentences contributed or extracted for Mozilla's voice dataset; the bulk of the text for most languages |
| [VS Code language packs](https://github.com/microsoft/vscode-loc) | MIT | UI and developer vocabulary in 13 languages; most of the text for Japanese, Korean and Chinese, where Common Voice is small |
| [Firefox localizations](https://github.com/mozilla-l10n/firefox-l10n) | MPL-2.0 | UI strings in ~100 languages; fills in Finnish and other languages Common Voice has little of |

Only word counts come out of them, never text. Words are counted as written, so
German nouns keep their capitals (worth a point on German over a lowercase
list). Chinese and Japanese aren't written with spaces, so their frequent
two- to four-character runs stand in for words. Languages with little text get
fewer than 5,000 words: only words seen three times or more count.

The first version used [wordfreq](https://github.com/rspeer/wordfreq)'s lists
instead. They are CC BY-SA 4.0, which would have made the dictionary share-alike
too; these counts do better anyway (below): 10.1% / 12.0% / 15.8% off other
languages' links against wordfreq's 9.4% / 11.1% / 14.7%. Part of that is the
test documents being technical, like the VS Code and Firefox strings.
Tatoeba, Wikipedia dumps, Europarl and Gutenberg weren't reachable from the
build machine; Wikipedia and MDN are CC BY-SA anyway.

The trained section is the content of a regular `zstd --train` dictionary with
its header (ID and entropy tables) cut off. Raw content keeps the dictionary ID
out of every frame, and those entropy tables are tuned to the samples, not to
the vocabulary that follows.

## Results

Link length saved, unencrypted, zstd level 19, over held-out documents:

- **English, 35 documents:** READMEs and docs, Python, Go, TypeScript, shell,
  config, a novel chapter, single-file HTML pages, two articles rendered the way
  the extension captures them, and this repo's own files.
- **Other languages, 27 documents:** MDN's Spanish, French, Japanese, Korean,
  Brazilian Portuguese, Russian and Chinese translations of a glossary entry
  (1.5–2.5 KB), a guide and a tutorial; two chapters of the German Rust book; four
  pages of the Finnish Full Stack Open course.

"Mean" weighs every document the same, so a 2 KB note counts as much as an 80 KB
RFC. "Small" is the mean over the ten documents under 4 KB in each group.

| dictionary | size | English total | mean | small | other languages total | mean | small | `createLink` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| none | | 241,914 chars | | | 184,778 chars | | | 7 ms |
| v2's last 64 KB (the first experiment) | 64 KB | −8.9% | −11.7% | −16.4% | −3.1% | −3.0% | −2.9% | 8 ms |
| v2's last 256 KB | 256 KB | −10.4% | −12.9% | −17.1% | −3.1% | −3.1% | −3.0% | 40 ms |
| v2 without other languages (the first v2) | 1,395 KB | −13.2% | −16.6% | −22.9% | −4.6% | −5.1% | −6.1% | 348 ms |
| v2 with wordfreq's lists instead | 3,332 KB | −13.3% | −16.7% | −22.9% | −9.4% | −11.1% | −14.7% | 809 ms |
| **v2** | 3,407 KB | **−13.3%** | **−16.7%** | **−23.0%** | **−10.1%** | **−12.0%** | **−15.8%** | 828 ms |
| v2 with 10,000 words per language | 4,983 KB | −13.4% | −16.7% | −23.0% | −11.3% | −13.3% | −17.3% | 1,279 ms |

Selected documents with v2:

| document | size | no dictionary | v2 |
| --- | ---: | ---: | ---: |
| h5bp.html | 851 | 636 | 428 (−32.7%) |
| an AI-generated report page (`corpus/ai-report.html`) | 7,127 | 3,745 | 2,713 (−27.6%) |
| rust-README.md | 3,304 | 1,977 | 1,448 (−26.8%) |
| sandbox-loader.html | 10,154 | 5,445 | 4,296 (−21.1%) |
| vscode-arrays.ts | 28,305 | 10,396 | 8,892 (−14.5%) |
| rfc-2094-nll.md | 83,823 | 34,889 | 32,039 (−8.2%) |
| ru.mdn-glossary-api.md | 1,505 | 1,025 | 708 (−30.9%) |
| ja.mdn-glossary-api.md | 2,409 | 1,796 | 1,491 (−17.0%) |
| zh-cn.mdn-http-overview.md | 15,475 | 9,145 | 8,076 (−11.7%) |
| fi.fullstackopen-osa1a.md | 23,332 | 10,899 | 9,956 (−8.7%) |
| de.rustbook-ch04.md | 33,245 | 15,061 | 14,172 (−5.9%) |

What each part is worth, in points of the total saving lost by dropping it
(English / other languages): other languages' words 0.1 / 5.5, trained 2.3 /
0.3, phrases 0.5 / 0.0, English 0.8 / 0.2.

The first experiment also measured a 234 KB AI-generated code review page that
isn't checked in: the 64 KB vocabulary took 6.9% off the whole page and 23% off
its first 4 KB. Pass it (or any page) to `measure.mjs` to see its prefixes.

## What this says

- **Size keeps paying, slowly.** Every doubling of the dictionary buys roughly
  another point off the total, and more off small documents. linkify.ink's budget
  is URL length, not bytes downloaded, so v2 goes well past where the first
  experiment stopped (64 KB), to where the next step costs more than it's worth:
  2 MB of trained content saved English links 0.7 more points, and 10,000 words
  per language saved other languages 1.2 more, each for about 1.5–2 times the
  compression time.
- **Other languages were the biggest gap.** The first v2 took 13% off English
  links and 5% off everything else. Adding every language's commonest words
  doubled the saving for other languages (16% on short notes) and cost English
  nothing, because those words sit at the far end of the dictionary, where only
  a link that uses them pays for the longer references.
- **Trained content is what scales.** Word lists run out: beyond the 64 KB core,
  more English words (general or technical) and code keyword lists for other
  languages each gained well under a point. Real fragments of text carry
  whole idioms, sentences and markup structure, and cover what no list does.
  Phrases are the one list that still paid.
- **The smaller the document, the bigger the gain.** A dictionary helps until the
  document has built up its own history. Small notes and pages, which is most of
  what gets shared, gain 23% on average; an 80 KB document gains 8%.
- **Prose outside tech gains least.** A novel chapter gains 8%: most of the
  dictionary is technical. German gains least of all (6%): its long compounds
  rarely match a word list.

## Costs

- **Download.** `v2.dict.zst` is 1.1 MB, and 1.5 MB as the base64 data URL in
  `vendor.codec.bundle.js`, which every visitor loads. Word lists compress far
  worse than text. Unpacking it takes about 60 ms, once, on first use.
- **Compression time.** zstd loads the dictionary for every `createLink`: about
  0.8 s at level 19, instead of ~10 ms. It only runs when a link is
  made. The zstd-wasm build doesn't expose `ZSTD_createCDict`, which would pay
  that once. Reading a link stays fast.
- **Old readers.** A copy of the app from before format 2 cannot read format-2
  links. Links made before format 2 keep working everywhere.

## Ideas not tried

- Trained content in languages other than English, and code in more languages
  than `node_modules` has.
- Combining the vocabulary with trained entropy tables
  (`ZDICT_finalizeDictionary`), which python-zstandard doesn't expose. It would
  also put a dictionary ID in every frame.
- A corpus of real shared links, to train on and to order the lists by.
