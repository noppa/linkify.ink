# Shared-dictionary compression

How the shared zstd dictionary in [`dictionaries/`](../../dictionaries/) was
built, and what it is worth. linkify.ink writes and reads every link, so a
dictionary loaded once by the app can prime the compressor with text most links
contain anyway: general web text, HTML tags and attributes, CSS, JS, common
English, and the commonest words of 41 other languages. No link then has to
spell that text out itself.

This started as an experiment on the lib alone. It is now link format 2: see
`linkify.ink.js` and [`dictionaries/README.md`](../../dictionaries/README.md) for
how it's wired in and versioned.

```sh
pip install zstandard wordfreq
python3 demo/shared-dictionary/train-dictionary.py     # ~25 s → out/trained-1024k.raw
python3 demo/shared-dictionary/export-wordfreq.py      # → out/wordfreq-5000.json
node demo/shared-dictionary/build-dictionary.mjs       # → out/dictionary.bin (3.3 MB)
node demo/shared-dictionary/fetch-corpus.mjs           # held-out documents → out/corpus/
node demo/shared-dictionary/measure.mjs [page.html ...] # → out/report.md
```

`measure.mjs` measures the published `dictionaries/v2.dict.zst`, and the
variants below when their build inputs are in `out/`. Every document goes through
`LinkifyInk.createLink` and back through `readLink`, with the variant handed to
the lib the same way the app hands it the real one.

The build depends on what is in `node_modules` (both the word counts and the
trained section come from there) and on the wordfreq release, so rebuilding
elsewhere is not expected to reproduce `v2` byte for byte. That's fine: a
dictionary is built once and frozen.
`build-dictionary.mjs --write dictionaries/vN.dict.zst` does the freezing and
refuses to overwrite a published one.

## The dictionary

A **raw content dictionary** is just bytes. zstd references earlier bytes by
their distance back, and the dictionary sits just before the input, so the end
of the dictionary is the cheapest place to reference. It is laid out
**least-valuable-first**: the other languages' words first (most of them are in
a language any one link isn't), the big trained section next, the long tail of
word lists after that, and the most common vocabulary and the document shell last. So any
shorter dictionary is just the tail of the full one.

None of it comes from the documents it is measured on:

| part | size | source | rendered as |
| --- | ---: | --- | --- |
| wordfreq | 1,937 KB | the 5,000 commonest words of each of the 42 languages [wordfreq](https://github.com/rspeer/wordfreq) has a full list for, English included | ` die der und in das ` |
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

wordfreq lowercases its lists. Adding capitalized copies of each language's top
1,000 words (German nouns, sentence starts) gained nothing measurable.

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
| v2 without wordfreq (the first v2) | 1,395 KB | −13.2% | −16.6% | −22.9% | −4.6% | −5.1% | −6.1% | 336 ms |
| **v2** | 3,332 KB | **−13.3%** | **−16.7%** | **−22.9%** | **−9.4%** | **−11.1%** | **−14.7%** | 809 ms |
| v2 with 15,000 words per language | 7,611 KB | −13.4% | −16.7% | −22.9% | −10.7% | −12.7% | −16.6% | 2,465 ms |

Selected documents with v2:

| document | size | no dictionary | v2 |
| --- | ---: | ---: | ---: |
| h5bp.html | 851 | 636 | 428 (−32.7%) |
| an AI-generated report page (`corpus/ai-report.html`) | 7,127 | 3,745 | 2,707 (−27.7%) |
| rust-README.md | 3,304 | 1,977 | 1,449 (−26.7%) |
| sandbox-loader.html | 10,154 | 5,445 | 4,301 (−21.0%) |
| vscode-arrays.ts | 28,305 | 10,396 | 8,903 (−14.4%) |
| rfc-2094-nll.md | 83,823 | 34,889 | 32,039 (−8.2%) |
| ru.mdn-glossary-api.md | 1,505 | 1,025 | 749 (−26.9%) |
| ja.mdn-glossary-api.md | 2,409 | 1,796 | 1,473 (−18.0%) |
| zh-cn.mdn-http-overview.md | 15,475 | 9,145 | 8,115 (−11.3%) |
| fi.fullstackopen-osa1a.md | 23,332 | 10,899 | 9,955 (−8.7%) |
| de.rustbook-ch04.md | 33,245 | 15,061 | 14,361 (−4.6%) |

What each part is worth, in points of the total saving lost by dropping it
(English / other languages): wordfreq 0.1 / 4.8, trained 2.4 / 0.6, phrases
0.5 / 0.0, English 0.8 / 0.3.

The first experiment also measured a 234 KB AI-generated code review page that
isn't checked in: the 64 KB vocabulary took 6.9% off the whole page and 23% off
its first 4 KB. Pass it (or any page) to `measure.mjs` to see its prefixes.

## What this says

- **Size keeps paying, slowly.** Every doubling of the dictionary buys roughly
  another point off the total, and more off small documents. linkify.ink's budget
  is URL length, not bytes downloaded, so v2 goes well past where the first
  experiment stopped (64 KB), to where the next step costs more than it's worth:
  2 MB of trained content saved English links 0.7 more points, and 15,000 words
  per language saved other languages 1.3 more, each for twice or three times
  the compression time.
- **Other languages were the biggest gap.** The first v2 took 13% off English
  links and 5% off everything else. Adding every language's commonest words
  doubled the saving for other languages (15% on short notes) and cost English
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
  dictionary is technical. German gains least of all (5%): its compounds and
  capitalized nouns rarely match a lowercase word list.

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
- **Licence.** wordfreq's data is CC BY-SA 4.0, so the dictionary is too: see
  [`dictionaries/README.md`](../../dictionaries/README.md).

## Ideas not tried

- Trained content in languages other than English, and code in more languages
  than `node_modules` has.
- Combining the vocabulary with trained entropy tables
  (`ZDICT_finalizeDictionary`), which python-zstandard doesn't expose. It would
  also put a dictionary ID in every frame.
- A corpus of real shared links, to train on and to order the lists by.
