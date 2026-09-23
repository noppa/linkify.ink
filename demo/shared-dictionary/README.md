# Shared-dictionary compression

How the shared zstd dictionary in [`dictionaries/`](../../dictionaries/) was
built, and what it is worth. linkify.ink writes and reads every link, so a
dictionary loaded once by the app can prime the compressor with text most links
contain anyway: general web text, HTML tags and attributes, CSS, JS, common
English. No link then has to spell that text out itself.

This started as an experiment on the lib alone. It is now link format 2: see
`linkify.ink.js` and [`dictionaries/README.md`](../../dictionaries/README.md) for
how it's wired in and versioned.

```sh
pip install zstandard
python3 demo/shared-dictionary/train-dictionary.py     # ~25 s → out/trained-1024k.raw
node demo/shared-dictionary/build-dictionary.mjs       # → out/dictionary.bin (1.4 MB)
node demo/shared-dictionary/fetch-corpus.mjs           # held-out documents → out/corpus/
node demo/shared-dictionary/measure.mjs [page.html ...] # → out/report.md
```

`measure.mjs` measures the published `dictionaries/v2.dict.zst`, and the
variants below when their build inputs are in `out/`. Every document goes through
`LinkifyInk.createLink` and back through `readLink`, with the variant handed to
the lib the same way the app hands it the real one.

The build depends on what is in `node_modules` (both the word counts and the
trained section come from there), so rebuilding is not expected to reproduce
`v2` byte for byte. That's fine: a dictionary is built once and frozen.
`build-dictionary.mjs --write dictionaries/vN.dict.zst` does the freezing and
refuses to overwrite a published one.

## The dictionary

A **raw content dictionary** is just bytes. zstd references earlier bytes by
their distance back, and the dictionary sits just before the input, so the end
of the dictionary is the cheapest place to reference. It is laid out
**least-valuable-first**: the big trained section first, the long tail of word
lists next, and the most common vocabulary and the document shell last. So any
shorter dictionary is just the tail of the full one.

None of it comes from the documents it is measured on:

| part | size | source | rendered as |
| --- | ---: | --- | --- |
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

The trained section is the content of a regular `zstd --train` dictionary with
its header (ID and entropy tables) cut off. Raw content keeps the dictionary ID
out of every frame, and those entropy tables are tuned to the samples, not to
the vocabulary that follows.

## Results

Link length saved, unencrypted, zstd level 19, over 35 held-out documents:
READMEs and docs, Python, Go, TypeScript, shell, config, a novel chapter,
single-file HTML pages, two articles rendered the way the extension captures
them, and this repo's own files. "Mean" weighs every document the same, so a
2 KB note counts as much as an 80 KB RFC.

| dictionary | size | total | mean | smallest ten docs¹ | `createLink` |
| --- | ---: | ---: | ---: | ---: | ---: |
| none | | 241,467 chars | | | 9 ms |
| v2's last 64 KB (the first experiment) | 64 KB | −8.9% | −11.7% | −16.4% | 11 ms |
| v2's last 256 KB | 256 KB | −10.4% | −12.9% | −17.1% | 45 ms |
| v2 without the trained section | 372 KB | −10.8% | −13.2% | −17.3% | 70 ms |
| **v2** | 1,395 KB | **−13.2%** | **−16.6%** | **−22.9%** | 354 ms |
| v2 with a 2 MB trained section | 2,419 KB | −13.9% | −17.3% | −23.7% | 742 ms |

¹ 0.8–3.4 KB each: `compose.yaml`, `h5bp.html`, `node-ci.yml`, `app.js`,
`go-CONTRIBUTING.md`, `punk-bands.html`, `minimal-theme.html`,
`django-README.rst`, `rust-README.md`, `index.html`. Mean saving.

Selected documents with v2:

| document | size | no dictionary | v2 |
| --- | ---: | ---: | ---: |
| h5bp.html | 851 | 636 | 428 (−32.7%) |
| an AI-generated report page (`corpus/ai-report.html`) | 7,127 | 3,745 | 2,707 (−27.7%) |
| rust-README.md | 3,304 | 1,977 | 1,448 (−26.8%) |
| sandbox-loader.html | 10,154 | 5,445 | 4,304 (−21.0%) |
| vscode-arrays.ts | 28,305 | 10,396 | 8,901 (−14.4%) |
| react-19.md as article.html | 39,881 | 14,187 | 12,304 (−13.3%) |
| strings.go | 34,676 | 12,132 | 10,759 (−11.3%) |
| pride-and-prejudice.txt | 12,000 | 6,828 | 6,297 (−7.8%) |
| rfc-2094-nll.md | 83,823 | 34,889 | 32,060 (−8.1%) |

What each part is worth, in points of the total saving lost by dropping it:
trained 2.4, phrases 0.4, English 0.9, CSS 0.0 (but 2.5 on `styles.css`).

The first experiment also measured a 234 KB AI-generated code review page that
isn't checked in: the 64 KB vocabulary took 6.9% off the whole page and 23% off
its first 4 KB. Pass it (or any page) to `measure.mjs` to see its prefixes.

## What this says

- **Size keeps paying, slowly.** Every doubling of the dictionary buys roughly
  another point off the total, and more off small documents. linkify.ink's budget
  is URL length, not bytes downloaded, so v2 goes well past where the first
  experiment stopped (64 KB), to where the next step costs more than it's worth:
  2 MB of trained content would save 0.7 more points, for 400 KB more download
  and twice the compression time.
- **Trained content is what scales.** Word lists run out: beyond the 64 KB core,
  more English words (general or technical) and code keyword lists for other
  languages each gained well under a point. Real fragments of text carry
  whole idioms, sentences and markup structure, and cover what no list does.
  Phrases are the one list that still paid.
- **The smaller the document, the bigger the gain.** A dictionary helps until the
  document has built up its own history. Small notes and pages, which is most of
  what gets shared, gain 23% on average; an 80 KB document gains 8%.
- **Prose outside tech gains least.** A novel chapter gains 8%: the corpus behind
  every part is technical. A general-English corpus would help it, but the ones
  tried (word lists from Google n-grams and OpenSubtitles) came with licences that
  don't fit a file shipped with the app.

## Costs

- **Download.** `v2.dict.zst` is 434 KB, and 578 KB as the base64 data URL in
  `vendor.codec.bundle.js`, which every visitor loads. Unpacking it takes about
  30 ms, once, on first use.
- **Compression time.** zstd loads the dictionary for every `createLink`: about
  a third of a second at level 19, instead of ~10 ms. It only runs when a link is
  made. The zstd-wasm build doesn't expose `ZSTD_createCDict`, which would pay
  that once. Reading a link stays fast.
- **Old readers.** A copy of the app from before format 2 cannot read format-2
  links. Links made before format 2 keep working everywhere.

## Ideas not tried

- A cleaner, permissively licensed general-English corpus for the trained
  section, and code in more languages than `node_modules` has.
- Combining the vocabulary with trained entropy tables
  (`ZDICT_finalizeDictionary`), which python-zstandard doesn't expose. It would
  also put a dictionary ID in every frame.
- A corpus of real shared links, to train on and to order the lists by.
