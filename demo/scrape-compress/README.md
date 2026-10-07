# Computed-style page capture — a demo

An experiment in replacing full-page capture in the extension — since adopted:
`extension/content/capture.js`'s full mode is now this method, in the
configuration recommended at the end. This directory is the standalone harness
that got it there: it captures pages, packs them through the real `LinkifyInk`
pipeline, and measures what comes out. The "current extension" rows below were
measured against the old serialize-the-page capture, which no longer exists;
`run.mjs`'s current-extension row now measures the shipped implementation.

```
node demo/scrape-compress/setup-fixtures.mjs   # fetch the real stylesheets, once
node demo/scrape-compress/run.mjs              # measure  → out/report.md
node demo/scrape-compress/snapshot.mjs         # eyeball  → out/side-by-side.png

# formats and dictionaries → out/encoding-report.md
npm install --no-save --prefix demo/scrape-compress/.npm-staging html2pug@4 pug@3
node demo/scrape-compress/encoding-test.mjs

# Pug vs HTML on the shipped capture, with the v2 dictionary → out/pug-report.md
node demo/scrape-compress/pug-test.mjs
```

## The problem

`extension/content/capture.js` full mode ships the page's markup plus its
stylesheets. That has two failure modes and they pull against each other:

- **Too big.** A capture is 120–140 KB of mostly-unused CSS and JS, which is
  37,000–38,000 characters of URL. Every link in the corpus below is far past
  what survives a chat client.
- **Still wrong.** Cross-origin stylesheets can't be read, so they stay as
  `<link>` tags pointing at the original host. The capture looks right while that
  host is reachable and serving, and falls apart when it isn't.

## The idea being tested

Don't ship the page's CSS. Ask the browser what it decided, and ship that.

1. Walk the DOM.
2. `getComputedStyle` every element.
3. Turn each element's styles into classes.
4. Share classes between elements that agree, to avoid repeating declarations.
5. Optionally, replace HTML with a compact tree encoding.

The results below say steps 1–2 are where essentially all the win is, steps 3–4
are worth nothing on a small page and about 9% on a large one, and step 5 is
worth 5–7% once the decoder is hosted rather than shipped in every link. A
zstd dictionary, which is the same "we control both ends" idea applied to
compression instead of serialization, is worth 9–31% and was not in the original
sketch at all.

## What already exists

| | what it does | what it doesn't |
| --- | --- | --- |
| [SingleFile](https://github.com/gildas-lormeau/SingleFile) | The production-grade version of today's approach: inlines every subresource, prunes unused rules by matching selectors against the DOM. | Keeps the page's stylesheets rather than rebuilding from computed values, so the floor is the size of the used CSS. |
| [snapDOM](https://github.com/zumerlab/snapdom) | Steps 1–3 almost exactly: clones a subtree, snapshots `getComputedStyle` per node, and in `compress` mode maps each distinct style string to a generated class. | Dedupes only on *whole* style strings; no partial sharing. Aimed at rendering into `<foreignObject>` for an image, not at a standalone document. |
| [OptiCSS](https://github.com/linkedin/opticss) | Step 4, done properly. Its `mergeDeclarations` pass finds declarations shared across rules, factors them into new classes, and rewrites the markup to match. | A Node build-time tool over PostCSS ASTs, given static template analysis. Not something to run in a content script. |
| [StyleX](https://stylexjs.com/), Tailwind, Atomizer | Step 4's opposite corner: one declaration per class, dedupe by construction. | As the original note guessed — the markup pays for it. Measured below: atomic is the *worst* of the four strategies. |
| [rrweb](https://github.com/rrweb-io/rrweb) | Step 5: a compact non-HTML DOM serialization with a decoder at the other end. | Optimised for incremental mutation replay, not for one-shot size. |
| [Pug](https://pugjs.org/) via [html2pug](https://github.com/donpark/html2pug) | Step 5 off the shelf, and it genuinely works: real Pug out, HTML back in, 0.0% pixel diff, 4–5% smaller links. | It is a Turing-complete template engine. `pug.render` on a link's payload is arbitrary code execution in the preview origin. Rejected on that at first; [re-measured below](#pug-re-measured-with-the-shipped-capture-and-dictionary): the security argument doesn't hold, but with the v2 dictionary the saving is 2–4% on full captures and about nothing on articles. |
| [zstd dictionaries](https://github.com/facebook/zstd#the-case-for-small-data-compression) | Not in the original sketch, and the largest single lever found: 9–31% off every link. The vendored `@bokuweb/zstd-wasm` already exports `compressUsingDict`. | Needs a versioned dictionary that can never be retired without breaking old links. |

So the pieces exist separately; the combination — computed styles rebuilt into a
self-contained document, optimised for compressed size — doesn't seem to.

## Method

`capture.js` is the whole implementation, injectable as a classic script the way
`extension/content/capture.js` is.

The trick that makes it viable: a raw `getComputedStyle` dump is ~400
declarations per element, which for a 550-element page is megabytes. Almost all
of it is noise, for exactly two reasons — the value is what the element would
have had anyway, or it's an inherited property whose value is already the
parent's. So the capture **diffs**: non-inherited properties against a per-tag
baseline measured in a hidden iframe, inherited properties against the parent's
computed value. Measured on the corpus, that takes ~400 declarations per element
down to **19**.

For the diff to be sound, the output document has to sit on the same foundation
the baseline was measured against. That's the `RESET` rule, and it is where the
one real bug in this demo lived: inherited properties in a reset must be set to
`inherit`, not to a fixed value. `white-space:normal` on `*` looks harmless and
makes every `<pre>` in every capture lose its line breaks, because the `<code>`
inside it is also matched by `*` and re-collapses what its parent just preserved.
That cost 0.3% of pixels — invisible in the metric, obvious in the screenshot.

## Results

Full tables in [`out/report.md`](out/report.md); side-by-side renders in
`out/side-by-side.png`. Corpus: five pages over unmodified shipped stylesheets
(Bootstrap 5.3, Bulma 1.0, Pico 2.1, github-markdown-css, and a Tailwind-shaped
utility sheet), 141–645 elements each.

### It is 6–11× smaller, and it is self-contained

| fixture | current extension | computed-style | vs current | pixel diff | pixel diff offline |
| --- | ---: | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 38,589 | **6,552** | 17% | 0.0% | 0.0% |
| bulma-landing | 37,703 | **5,827** | 15% | 0.1% | 0.1% |
| pico-docs | 37,625 | **5,151** | 14% | 0.1% | 0.1% |
| markdown-article | 37,408 | **3,996** | 11% | 1.0% | 1.0% |
| utility-app | 38,300 | **3,456** | 9% | 0.0% | 0.0% |

*link characters, through the real tar → zstd-19 → base64url pipeline*

The two diff columns are the point. The current capture also scores 0.0% —
*online*. Block its outbound requests and it goes to 12.8% / 35.6% / 13.2% /
8.9% / 0.0%, because its styling is still a `<link>` to the origin. The
computed-style capture has no outbound requests to block: the two columns are
the same number because there is nothing left to fetch.

### Class sharing is worth far less than it looks

This is the surprising one, and it answers the step-4 question directly.

| fixture | `style=""` | exact classes | atomic classes | merged classes |
| --- | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 245 KB → **6,300** | 58 KB → 6,492 | 49 KB → 7,223 | 40 KB → 6,552 |
| bulma-landing | 117 KB → **5,577** | 45 KB → 5,811 | 30 KB → 6,581 | 24 KB → 5,827 |
| pico-docs | 335 KB → **4,977** | 55 KB → 5,005 | 65 KB → 5,633 | 53 KB → 5,151 |
| markdown-article | 305 KB → 3,909 | 39 KB → **3,867** | 54 KB → 4,341 | 42 KB → 3,996 |
| utility-app | 68 KB → **3,356** | 19 KB → 3,380 | 16 KB → 3,832 | 12 KB → 3,456 |

*raw document size → link characters*

Sharing styles into classes shrinks the raw document by up to **7×** and the
link by roughly **nothing**. On four of the five fixtures, stuffing every
declaration into a `style` attribute and letting zstd sort it out produces the
*smallest link of all*.

The reason is that classes and zstd are two implementations of the same idea, and
zstd's is better. A class factors out a repeated declaration block and pays for
it with a name that has to be invented, written into the stylesheet, and written
again into every element that uses it. zstd factors out any repeated byte
sequence — the same declaration blocks, plus the tag names, the attribute
syntax, the text — and pays nothing, because the back-reference *is* the
encoding. Adding a naming layer underneath it mostly gives the compressor a
harder problem.

Atomic classes are consistently the worst of the four, 12–18% behind, which
confirms the original hunch about StyleX: one-declaration-per-class moves the
repetition out of the stylesheet and into the class attributes, where there is
more of it, not less.

**But it flips on large pages.** Same stylesheet, more content:

| elements | `style=""` | exact | atomic | merged |
| ---: | ---: | ---: | ---: | ---: |
| 544 | **6,300** | 6,492 | 7,223 | 6,552 |
| 1,864 | 8,028 | **7,721** | 8,527 | 7,868 |
| 4,504 | 9,651 | **8,789** | 9,727 | 8,933 |

Somewhere between 550 and 1,900 elements classes start winning, and by 4,500 they
are ~9% ahead. Inline styles grow with the number of elements; classes grow with
the number of *distinct* styles, which flattens out. Real pages live at the right
end of this table.

### The compact tree encoding wins — but a dictionary wins much more

The first version of this measurement put the s-expression decoder *inside* the
payload, which made the format a net loss: it saved 104–200 characters and the
decoder cost 725. That framing was wrong. linkify.ink owns the code that renders
a preview, so a decoder ships there once rather than in every link, and a format
only has to be smaller — not smaller by 725 characters.

Re-measured with the decoder hosted (`encoding-test.mjs`), every payload carrying
the same information and verified to render to the same pixels:

| fixture | HTML | s-expr | | Pug | | Pug round-trip |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| bootstrap-dashboard | 6,552 | 6,217 | −5.1% | 6,248 | −4.6% | 0.0% pixel diff |
| bulma-landing | 5,827 | 5,528 | −5.1% | 5,576 | −4.3% | 0.0% pixel diff |
| pico-docs | 5,151 | 4,813 | −6.6% | 4,885 | −5.2% | 0.0% pixel diff |
| markdown-article | 3,996 | 3,728 | −6.7% | 3,828 | −4.2% | 0.0% pixel diff |
| utility-app | 3,456 | 3,224 | −6.7% | 3,283 | −5.0% | 0.0% pixel diff |

So the format is worth a real **5–7%**, and **Pug gets most of it off the shelf**
— `html2pug` produces genuine Pug (`h2.a.b.c Heading 1`, closing tags dropped)
and `pug.render` takes it back to HTML that renders identically.

**This first rejected Pug on security, but that argument doesn't hold.** Pug is
a Turing-complete template engine, and these payloads are untrusted by definition:

```
$ node -e "pug.render(\"- globalThis.__PWNED = 'yes'\np= 1+1\")"
__PWNED = yes
```

That would matter if Pug compiled in the app's origin. But previewed documents
already run their own scripts (see `components/Preview.js`): the isolation is
the separate sandbox origin, and there is no no-JS mode. A link can already put
a `<script>` in its HTML, so compiling its Pug inside the sandbox grants nothing
new. The `nojs` default this paragraph used to cite doesn't exist. Pug is safe
as long as it only ever compiles in the sandbox, never in the editor, the
receive page or the extension.

So the real question is size, re-measured below against what ships now.

### Pug, re-measured with the shipped capture and dictionary

The table above measured the demo `capture.js` through plain zstd-19. Two things
have changed since: the extension ships its own capture, and every link is
compressed with the shared v2 dictionary (`dictionaries/`). `pug-test.mjs` runs
`extension/content/capture.js` in both modes over the fixtures at ×1 and ×4
content, converts each capture with `html2pug`, and prices both through the real
`LinkifyInk.createLink` (each link decoded again to prove it works). Every Pug
payload compiles back to HTML that renders the same: 0.0% pixel diff on full
captures, at most 0.4% on articles.

| fixture | scale | mode | HTML | Pug | | Pug, tab indent | | no dict: HTML → Pug |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | ×1 | full | 7,211 | 6,999 | −2.9% | 6,931 | −3.9% | −3.7% |
| bulma-landing | ×1 | full | 5,265 | 5,105 | −3.0% | 5,088 | −3.4% | −3.9% |
| pico-docs | ×1 | full | 4,513 | 4,329 | −4.1% | 4,336 | −3.9% | −4.9% |
| markdown-article | ×1 | full | 3,333 | 3,275 | −1.7% | 3,268 | −2.0% | −3.8% |
| utility-app | ×1 | full | 2,947 | 2,873 | −2.5% | 2,871 | −2.6% | −4.5% |
| bootstrap-dashboard | ×4 | full | 11,633 | 11,364 | −2.3% | 11,167 | −4.0% | −1.8% |
| bootstrap-dashboard | ×1 | article | 1,748 | 1,743 | −0.3% | 1,719 | −1.7% | −4.4% |
| bulma-landing | ×1 | article | 1,340 | 1,344 | +0.3% | 1,349 | +0.7% | −3.6% |
| pico-docs | ×1 | article | 2,171 | 2,129 | −1.9% | 2,097 | −3.4% | −6.0% |
| markdown-article | ×1 | article | 2,052 | 2,096 | +2.1% | 2,067 | +0.7% | −2.8% |
| utility-app | ×1 | article | 1,479 | 1,475 | −0.3% | 1,464 | −1.0% | −4.5% |

*link characters, format 2 (v2 dictionary) unless noted; all 20 rows in `out/pug-report.md`*

- **Full captures: 2–4% smaller**, 60–470 characters. With tab indentation
  (`html2pug --tabs`) it's consistently 2.0–4.0% across all ten full rows.
- **Articles: about nothing.** The median is −0.4% (−1.8% with tabs), and two
  of the ten come out larger. The dictionary already holds plenty of HTML, so
  the tags Pug drops were mostly free already. Without the dictionary Pug saves
  2–6% on the same articles. The dictionary absorbs most of that.
- **Cost:** the Pug compiler bundles to ~890 KB minified (~220 KB gzipped),
  mostly the Babel parser it compiles templates with. That's about a quarter
  the size of the whole 3.7 MB preview bundle. It also
  needs a new preview path (serve `.pug` as compiled HTML in the sandbox), and
  the tar holds a `.pug` file, so "download the files" hands the recipient a
  Pug template instead of a page.

A 2–4% saving on full captures doesn't pay for those costs, and articles gain
about nothing. A trained capture dictionary (−19–31% above, as a v3 format)
is the larger lever by an order of magnitude.

### Dictionaries beat formats by 3–5×

The "we control both ends" argument that rescues the tree format applies just as
well to compression, and pays much better. zstd accepts a **raw content
dictionary** — any bytes at all — and the vendored `@bokuweb/zstd-wasm` already
exports `compressUsingDict`/`decompressUsingDict`, so this needs no new
dependency.

Same HTML payload, same pipeline, different compressor state:

| fixture | zstd-19 | + house dict | + corpus dict | *(prose leak)* | brotli-11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 6,552 | 5,964 (−9.0%) | 5,304 (−19.0%) | *4,948* | 5,585 (−14.8%) |
| bulma-landing | 5,827 | 5,256 (−9.8%) | 4,653 (−20.1%) | *4,320* | 5,053 (−13.3%) |
| pico-docs | 5,151 | 4,629 (−10.1%) | 3,799 (−26.2%) | *3,517* | 4,383 (−14.9%) |
| markdown-article | 3,996 | 3,460 (−13.4%) | 2,767 (−30.8%) | *2,441* | 3,281 (−17.9%) |
| utility-app | 3,456 | 2,876 (−16.8%) | 2,572 (−25.6%) | *2,213* | 2,828 (−18.2%) |

- **house dict** is a hand-written 2 KB constant — the reset rule verbatim, the
  document boilerplate, and the CSS property names and values a computed-style
  capture emits by the hundred. It contains no fixture content at all, so this
  number is clean and shippable today.
- **corpus dict** is every *other* fixture's capture concatenated, standing in
  for a dictionary trained on real captures.
- The *prose leak* column is the same thing done carelessly. All five fixtures
  draw from one prose pool, so a merely held-out dictionary still contains the
  test page's sentences verbatim — worth 6–10 points of imaginary saving. The
  real column strips the shared prose first. Holding out the *fixture* was not
  enough; a dictionary that has already seen the article it is compressing is not
  a dictionary, it is a cache.

**brotli-11 beating zstd-19 by 13–18% with no dictionary is the same finding
again**: brotli ships a static dictionary of common HTML fragments, which is
precisely what the house dictionary hand-builds. It is confirmation of the
mechanism, not a separate result.

### They stack

| fixture | HTML | s-expr | HTML+house | s-expr+house | s-expr+corpus |
| --- | ---: | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 6,552 | 6,217 | 5,964 | 5,716 | **5,253** (−19.8%) |
| bulma-landing | 5,827 | 5,528 | 5,256 | 5,056 | **4,644** (−20.3%) |
| pico-docs | 5,151 | 4,813 | 4,629 | 4,380 | **3,820** (−25.8%) |
| markdown-article | 3,996 | 3,728 | 3,460 | 3,281 | **2,817** (−29.5%) |
| utility-app | 3,456 | 3,224 | 2,876 | 2,773 | **2,577** (−25.4%) |

Applied to the headline, a trained dictionary plus the compact tree would take
the corpus from 3,456–6,552 characters to roughly **2,600–5,300** — on top of
the 6–11× already won against the current capture.

**Both choices cost the same thing:** a payload that needs a hosted dictionary is
exactly as un-openable-on-its-own as one that needs a hosted decoder. The
dictionary is the better trade only because it buys 3–5× more per unit of
self-containment given up. Whichever ships, its version must be recorded in the
payload and **can never be deleted**, or old links break permanently.

### Where the size actually went

Ablations off the merged strategy, one change at a time:

| change | effect on link size |
| --- | --- |
| copy every property instead of a visual allowlist | **+11% to +185%** |
| drop inheritance pruning | ±1%, and 1.2–1.7% of pixels go wrong on two fixtures |
| drop `::before`/`::after` | 0% to −8%, and decorative elements disappear |
| drop `margin:auto` recovery | ±0.1% |

Only the property allowlist matters, and it matters enormously — Bulma goes from
5,827 to 16,597 characters when every computed property is copied instead of the
~120 visual ones. Inheritance pruning, interestingly, barely affects the *link*
(zstd again) but is load-bearing for correctness — without it Bootstrap and Pico
lose 1.2% and 1.7% of their pixels — and it cuts the raw document enough to
matter for capture-time memory. Dropping pseudo-elements does save a few percent,
but it is the one saving in the table that buys nothing: what it removes is
visible.

### Sizing is the fidelity knob

`getComputedStyle().width` is the *used* value — the pixels the box occupies, not
the `auto` or `50%` the author wrote. Copying them pins the layout:

| mode | typical pixel diff | notes |
| --- | ---: | --- |
| `none` | 0.0–11.8% | smallest, visibly drifts |
| `smart` (drop provably-redundant widths) | 0.0–11.9% | works on some pages, fails badly on others |
| `fluid` (widths as percentages, tracks as `fr`) | 0.1–11.9% | no better than `smart` |
| `all` | **0.0–1.0%** | +7–12% link size |

`smart` and `fluid` were attempts to keep the capture responsive. Both fail, for
a reason that is fundamental rather than fixable: **`@media` rules are not in the
computed style**. By the time the walk runs, "three columns above 992px, one
below" has already collapsed to "three columns", and nothing recovers the
breakpoint. Relaxing the widths doesn't make the capture responsive, it just
makes it wrong.

The right answer is to stop pretending. The capture declares the width it was
taken at — `<meta name="viewport" content="width=1280">` — and a phone lays it
out at that width and scales to fit. Sideways scroll on an emulated 390px phone
goes from **3.28× to 1.00×**, and the tag is *shorter* than the
`width=device-width` it replaces.

### Cost

| fixture | elements | decls/element | wall clock |
| --- | ---: | ---: | ---: |
| bootstrap-dashboard | 544 | 18.9 | 209 ms |
| pico-docs | 640 | 19.8 | 364 ms |
| utility-app | 141 | 20.8 | 61 ms |

Three `getComputedStyle` calls per element (the element plus both pseudo-elements)
against a detached baseline iframe. 60–370 ms on the user's tab, growing linearly.
Acceptable for a click-to-capture action; it would need chunking before it could
run anywhere automatic.

## If this were to ship

Recommended configuration, which is what `capture.js` defaults to:

```js
{ strategy: 'merged', props: 'visual', sizing: 'all',
  pseudo: true, inheritPrune: true, fitViewport: true, tree: 'html' }
```

`merged` over `inline` because real pages are past the crossover. `html` over
`sexp` only as a starting point: the compact tree is worth 5–7% once its decoder
lives in the preview, but a zstd dictionary is worth several times that for the
same kind of commitment, so it should ship first.

### Known gaps

- **Form controls.** `<input>` keeps its box but loses placeholder, value and
  native appearance. Visible in the Bootstrap fixture's search field.
- **`<svg>` is copied verbatim.** Geometry lives in attributes, not CSS, so it is
  the one place the method falls back to shipping markup. Icon-heavy pages will
  be worse than this corpus suggests.
- **`<canvas>`, `<video>`, `<iframe>`** become empty boxes. Charts drawn to a
  canvas are lost; today's capture loses them too.
- **`:hover`, `:focus`, `@media`, `@keyframes`** are all gone by construction.
  Only the state the page was in when captured survives.
- **Fonts.** `font-family` is copied but `@font-face` is not, so a page in a
  webfont renders in the reader's fallback. Fixable — the `@font-face` rules are
  readable from the CSSOM — but the font files themselves are far too big to
  embed in a URL, so it would be a substitution either way.
- **Images** are untouched by this experiment; it reuses the existing link-or-
  inline choice, and the numbers above are all link-mode.

### What this corpus is not

Five hand-written pages over real stylesheets, not five real pages. It covers the
three CSS architectures that matter here (component, element-selector, utility),
but the egress policy in the environment this was built in blocked every host
except github.com, so nothing was captured from the live web. **The numbers should
be re-measured against real scraped pages before anything is built on them** —
particularly the icon-heavy case, where the `<svg>` fallback is the obvious risk.
