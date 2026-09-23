# Shared-dictionary compression

Can a zstd dictionary shipped with linkify.ink make links shorter? linkify.ink
writes and reads every link, so a dictionary loaded once by the app could prime the
compressor with text most links contain anyway: HTML tags and attributes, CSS
property names, JS keywords, common English. No link would then have to spell
that text out itself.

This is an experiment on the lib only. Nothing in the app uses it yet.

```sh
node demo/shared-dictionary/build-dictionary.mjs        # → out/dictionary.txt (66 KB)
pip install zstandard
python3 demo/shared-dictionary/train-dictionary.py      # optional, ~8 min → out/trained-*.dict
node demo/shared-dictionary/measure.mjs page.html ...   # → out/report.md
```

`measure.mjs` sends every document through `LinkifyInk.createLink` and back
through `readLink`, checking the bytes match. The lib takes its zstd module as a
dependency, so the dictionary goes in as a zstd object whose `compress` and
`decompress` call the vendored `compressUsingDict` / `decompressUsingDict`. The
lib itself is unchanged.

## The dictionary

`build-dictionary.mjs` builds a plain-text **raw content dictionary**. It uses
only general sources that are already installed. None of it comes from the
documents it is measured on:

| part | source | rendered as |
| --- | --- | --- |
| HTML | tag names from TypeScript's `lib.dom.d.ts`, plus hand-ordered common tags, attributes and entities | `<div></div>`, `<div class="`, ` href="`, `&lt;` |
| CSS | every property in `lib.dom.d.ts`, plus common whole declarations and values | `grid-template-columns:`, `display:flex;`, `  align-items: center;` |
| JS | highlight.js's JS/TS keyword and built-in lists, plus common code phrases | `function `, `.map((`, `document.querySelector('` |
| English | word frequencies counted over the Markdown docs in `node_modules` and the MDN prose in `lib.dom.d.ts` (top 6,000) | ` the of and to ` |
| boilerplate | the `<!DOCTYPE html>…` shell, pretty-printed and minified | as is |

Words are written with the punctuation and spacing they appear with in real
documents. zstd's shortest match is 3 bytes, so a bare `div` is useless but
`<div class="` is not.

zstd references earlier bytes by their distance back, and the dictionary sits
just before the input, so the end of the dictionary is the cheapest place to
reference. The dictionary is laid out **least-valuable-first**: the long tail
(rare English, the full CSS property list) comes first and the boilerplate comes
last. Reversing that order costs about 1%. It also means any smaller dictionary
is just the tail of the full one.

## Results

Link length in characters (the full URL), unencrypted, zstd level 19. The
`care-plan-branch-review.html` rows are a real 234 KB AI-generated page: a code
review with ~107 KB of escaped TypeScript diffs in `<pre>`, 14 KB of CSS and a lot
of prose. It isn't checked in, so pass it (or any page) to `measure.mjs`. Its
"first N KB" rows show how the saving depends on size. The other rows are this
repo's own files, held out from both dictionaries.

| document | size | no dict | vocab 4 KB | vocab 16 KB | vocab 32 KB | **vocab 64 KB** | trained 16 KB | trained 64 KB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| care-plan review, first 4 KB | 4,096 | 2,519 | −8.7% | −20.1% | −21.1% | **−23.0%** | −5.1% | −8.2% |
| care-plan review, first 16 KB | 16,384 | 6,696 | −4.5% | −13.6% | −14.5% | **−16.4%** | −4.0% | −6.1% |
| care-plan review, first 64 KB | 65,536 | 18,207 | −2.1% | −7.4% | −8.8% | **−9.8%** | −3.5% | −6.1% |
| care-plan review, whole page | 233,911 | 39,320 | −1.2% | −4.6% | −6.0% | **−6.9%** (36,625) | −2.3% | −4.5% |
| index.html | 3,366 | 2,221 | −9.3% | −14.5% | −16.4% | **−17.1%** | −10.3% | −14.8% |
| sandbox-loader.html | 10,154 | 5,445 | −4.7% | −11.2% | −13.5% | **−14.4%** | −8.0% | −13.0% |
| styles.css | 15,446 | 5,148 | −2.6% | −11.2% | −12.1% | **−13.5%** | −5.0% | −7.2% |
| app.js | 927 | 655 | −1.8% | −16.5% | −16.9% | −16.9% | −18.8% | **−24.9%** |
| components/EditorPage.js | 12,529 | 5,299 | −2.6% | −7.4% | −8.8% | −9.4% | −7.4% | **−10.2%** |
| README.md | 11,211 | 6,696 | −2.2% | −7.3% | −10.7% | **−12.1%** | −5.0% | −8.3% |
| linkify-ink-plan.md | 22,216 | 11,119 | −2.7% | −8.0% | −9.7% | **−10.8%** | −5.5% | −8.4% |
| **total** | 395,776 | 103,325 | −2.5% | −7.7% | −9.2% | **−10.3%** | −4.2% | −6.9% |

What each part is worth (percentage points lost by dropping it from the 64 KB
dictionary, on the whole page / over all documents):

| dropped | whole page | all documents |
| --- | ---: | ---: |
| English | 3.6 | 4.6 |
| CSS | 1.1 | 1.6 |
| HTML | 0.4 | 0.3 |
| JS | 0.4 | 0.4 |
| boilerplate | 0.2 | 0.4 |

## What this says

- **It works, and it's worth doing.** A 64 KB plain-text dictionary takes 7% off
  the whole review page, 10–17% off typical pages of 3–20 KB, and over 20% off
  small ones. It's free on the lib side: the vendored zstd-wasm already has the
  dictionary functions.
- **The smaller the document, the bigger the gain.** A dictionary only helps
  until the document has built up its own history. On a 234 KB page it's all
  used up in the first few KB, which is why the page gains 7% while its first
  4 KB gains 23%. Most shared pages are much smaller than this one.
- **English matters most**, which is not what one would guess. Markup and code
  keywords repeat within a document, so the document soon supplies them itself.
  Prose words mostly appear once or twice and never get that chance. CSS
  comes second, because property names are long and each is used only a few
  times.
- **Hand-built beats trained** at the same size (−10.3% vs −6.9% overall). The
  trained dictionary only wins on JS source, where the npm corpus is exactly the
  right domain. The vocabulary dictionary is also readable plain text, so it's
  easy to audit.
- **Past 64 KB it stops paying.** More English words (to ~86 KB) gained a
  further 0.2%. There isn't much left to find in word lists.

## If this goes into the app

- The dictionary becomes part of the link format. Record its version in the
  payload (the flag byte's `FORMAT_VERSION` bits are the natural place), and never
  change or delete a published dictionary, or old links break. A better
  dictionary is a new version, not an edit.
- The app has to ship it: 66 KB raw, about 28 KB gzipped, once per visitor. It
  could be lazy-loaded only for links that need it.
- The generated `dictionary.txt` depends on what's in `node_modules`, since the
  English counts come from there. Build it once, commit it, and treat it as frozen.
- Ideas not tried: combining the vocabulary content with trained entropy tables
  (zstd's `ZDICT_finalizeDictionary`, which the Python binding doesn't expose);
  a cleaner general-English frequency list (the `node_modules` one leans toward
  library jargon like "iteratee"); and a corpus of real shared pages to order the
  high-value lists by measured frequency instead of by hand.
