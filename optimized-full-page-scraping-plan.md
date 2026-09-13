# Optimized Full-Page Scraping — Plan

## High-Level Description

The browser extension's **full** capture mode currently snapshots a page by
shipping its markup plus its stylesheets. This proposal replaces that with a
capture that ships neither: walk the DOM, ask the browser what it actually
decided for every element via `getComputedStyle`, and rebuild a new, standalone
document from those answers.

The change is motivated by two failures of the current approach that pull
against each other:

- **Links are too big.** A full capture is 120–140 KB of mostly-unused CSS and
  JS, which comes out as **37,000–38,000 characters** of URL. Nothing in that
  range survives a chat client.
- **Pages still render wrong.** Cross-origin stylesheets cannot be read from a
  content script, so they survive as `<link>` tags pointing at the original host.
  The capture looks correct for as long as that host is up, reachable from
  wherever the link is opened, and not blocking hotlinks. Then it doesn't.

Rebuilding from computed styles fixes both at once, because the two problems
have the same root cause: the capture is carrying a *description of how to
compute the page's appearance* (selectors, cascade, media queries, imports)
when all it needs is *the appearance*.

A working demo with full measurements lives in
[`demo/scrape-compress/`](demo/scrape-compress/). This document is the plan; that
directory is the evidence.

Measured against the current capture, the rebuild alone is worth **6–11×**. Two
further levers, both of which depend on linkify.ink controlling the code at both
ends of a link, are worth another **20–30%** on top: a zstd dictionary (step 7,
the bigger of the two) and the compact tree encoding (step 5).

---

## Status

**Validated by demo, not yet implemented.** Nothing in `extension/` has changed.
The numbers below come from `demo/scrape-compress/run.mjs`, which captures real
pages in headless Chromium, packs the result through the real `LinkifyInk`
pipeline, and pixel-diffs the rebuilt page against the live one.

The one caveat that matters: the corpus is five hand-written pages over
**unmodified shipped stylesheets** (Bootstrap 5.3, Bulma 1.0, Pico 2.1,
github-markdown-css, and a utility sheet) — not five real scraped pages. The
environment the demo was built in could not reach the live web. See
[Open Questions](#open-questions).

---

## The Method

### Step 1–2 — Walk the DOM, read computed styles

For every element, call `getComputedStyle`. This is the whole idea, and on its
own it is unusable: a computed style is ~400 declarations, so a 550-element page
would be several megabytes of CSS.

### Step 2a — Diff, which is what actually makes it work

Almost every one of those 400 declarations is noise, for exactly two reasons:

1. it is the value the element would have had anyway with no author CSS, or
2. it is an **inherited** property whose value is already the parent's, so the
   element would inherit it for free.

So the capture diffs rather than dumps. Non-inherited properties are compared
against a **per-tag baseline** measured in a hidden, styleless iframe; inherited
properties are compared against the **parent's computed value**. Only what
survives is emitted.

Measured across the corpus, this takes ~400 declarations per element down to
**19**. It is the single highest-leverage part of the design, and everything
downstream is packaging.

### Step 2b — The reset, which is what makes the diff *sound*

For "differs from the baseline" to mean "load-bearing in the output", the output
document must sit on the same foundation the baseline was measured against. That
is a reset rule, emitted as the first rule of every capture and injected into the
baseline iframe.

It does two different jobs, and which job a property gets depends on one thing
only — whether it inherits:

- **Inherited properties are set to `inherit`.** Author styles beat the UA
  stylesheet regardless of specificity, so this erases every per-tag UA override
  of an inherited value (`a{color:-webkit-link}`, `h1{font-size:2em}`,
  `code{font-family:monospace}`, `pre{white-space:pre}`) and makes inheritance
  genuinely transparent. *That* is what licenses dropping any inherited property
  matching the parent.
- **Non-inherited properties are flattened to their initial values**, so the UA's
  per-tag box decisions stop varying and the per-tag baselines collapse to
  nearly one table.

Getting that split wrong is not a size regression, it is a rendering bug. The
demo shipped with `white-space:normal` on `*` for a while, which looks harmless
and makes **every `<pre>` in every capture lose its line breaks** — the `<code>`
inside is also matched by `*` and re-collapses what its parent just preserved.
It cost 0.3% of pixels: invisible in the metric, obvious in the screenshot. Any
implementation needs to treat the reset as load-bearing and test it directly.

### Step 3 — Turn styles into CSS classes

Group the per-element declaration sets into shared classes and emit a stylesheet.

### Step 4 — Share classes between elements *(keep only the cheap form — see below)*

Merge declarations across elements so a declaration appears once in the
stylesheet rather than once per element that uses it.

### Step 5 — Compact tree encoding *(worth doing, but not first — see below)*

Replace HTML with a denser custom form, e.g.

```
(div.a.b "Hello "(i.a.c "world"))
```

decoded back to `<div class="a b">Hello <i class="a c">world</i></div>`. The
decoder lives in linkify.ink's own preview code, not in the payload.

### Step 6 — Declare the capture width

Emit `<meta name="viewport" content="width=1280">` (the width the capture was
taken at) rather than `width=device-width`. See
[Responsiveness](#responsiveness-is-not-recoverable).

### Step 7 — A zstd dictionary *(not in the original sketch; the largest single lever)*

Compress with a fixed dictionary shipped in the extension and the preview, so
every link stops paying for the reset rule, the document boilerplate, and the
several hundred CSS property names and values that every capture contains.

---

## Research — what already exists

The individual pieces are all prior art. The combination — computed styles
rebuilt into a self-contained document, optimised for *compressed* size — does
not appear to exist.

| Project | What it does that we want | What it doesn't do |
| --- | --- | --- |
| [SingleFile](https://github.com/gildas-lormeau/SingleFile) | The production-grade version of today's approach. Inlines every subresource; prunes unused rules by matching selectors against the DOM. The reference point for "do the current thing properly". | Keeps the page's stylesheets rather than rebuilding from computed values, so its floor is the size of the *used* CSS — much larger than the size of the *resulting appearance*. |
| [snapDOM](https://github.com/zumerlab/snapdom) | Steps 1–3, almost exactly: deep-clones a subtree, snapshots `getComputedStyle` per node, and in `compress` mode maps each distinct style string to a generated class. Closest existing thing to this proposal. | Dedupes only on *whole* style strings — no partial sharing (our step 4). Aimed at rendering into `<foreignObject>` to produce an image, not at emitting a standalone document. No inheritance or UA-default diffing, so its output is far larger per element. |
| [OptiCSS](https://github.com/linkedin/opticss) / [css-blocks](https://github.com/linkedin/css-blocks) | Step 4 done properly. Its `mergeDeclarations` pass finds declarations shared across rules, factors them into new classes, and rewrites the markup so the cascade resolves identically. The algorithm we would want if step 4 were worth doing. | A build-time Node/PostCSS tool driven by static template analysis. Not something to run in a content script, and the measurements below say the win it chases isn't there for us anyway. |
| [StyleX](https://stylexjs.com/), Tailwind, Atomizer | Step 4's opposite corner: one declaration per class, dedupe by construction. | The original hunch about StyleX — that one-class-per-rule wastes characters repeating class names in the markup — is **confirmed and then some**. Atomic is the *worst* of four strategies measured, 12–18% behind. |
| [rrweb](https://github.com/rrweb-io/rrweb) | Step 5: a compact non-HTML DOM serialization with a decoder at the far end. | Optimised for incremental mutation replay over a session, not for one-shot compressed size. |
| [Pug](https://pugjs.org/) via [html2pug](https://github.com/donpark/html2pug) | Step 5, off the shelf — and it genuinely works. `html2pug` emits real Pug (`h2.a.b.c Heading 1`, closing tags dropped) and `pug.render` returns HTML that renders at 0.0% pixel difference, for 4–5% smaller links. | It is a Turing-complete template engine: `pug.render` on a link payload is arbitrary code execution in the preview origin. **Rejected on security, not on size.** See below. |
| [zstd dictionaries](https://github.com/facebook/zstd#the-case-for-small-data-compression) | Step 7. Not in the original sketch and the biggest lever found: 9–31% off every link, with no change to the payload format. The vendored `@bokuweb/zstd-wasm` already exports `compressUsingDict`/`decompressUsingDict`. | Needs a versioned dictionary that can never be retired without breaking every link that used it. |

Two things worth noting from the search that shaped the design:

- **`getDefaultComputedStyle()`** exists (Firefox-only, non-standard) and would
  give per-tag UA defaults directly. Chrome has no equivalent, hence the hidden
  baseline iframe.
- The general form of step 4 is a **minimum biclique cover** over an
  (elements × declarations) bipartite graph, which is NP-hard. Every practical
  implementation is a greedy heuristic. This mattered less than expected — see
  below.

---

## Measured Results

Corpus: five pages, 146–645 elements, over real shipped stylesheets. Link
lengths are through the real `tar → zstd-19 → base64url` pipeline.

### Headline

| fixture | current | computed-style | vs current | pixel diff | pixel diff **offline** |
| --- | ---: | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 38,589 | **6,552** | 17% | 0.0% | 0.0% |
| bulma-landing | 37,703 | **5,827** | 15% | 0.1% | 0.1% |
| pico-docs | 37,625 | **5,151** | 14% | 0.1% | 0.1% |
| markdown-article | 37,408 | **3,996** | 11% | 1.0% | 1.0% |
| utility-app | 38,300 | **3,456** | 9% | 0.0% | 0.0% |

**6–11× shorter links at 0.0–1.0% pixel difference from the live page.**

The `offline` column is the one that addresses "sites still end up looking
different". The current capture *also* scores 0.0% — while the origin is
reachable. Block its outbound requests and it goes to **12.8% / 35.6% / 13.2% /
8.9% / 0.0%**, because its styling is still a `<link>` to the origin. The
computed-style capture's two columns are identical because there is nothing left
to fetch.

### Where the size went

Ablations off the recommended configuration, one change at a time:

| change | effect on link | effect on rendering |
| --- | --- | --- |
| copy every computed property instead of a ~120-property visual allowlist | **+11% to +185%** | none |
| drop inheritance pruning | ±1% | **1.2% / 1.7% of pixels wrong** on two fixtures |
| drop `::before`/`::after` | 0% to −8% | decorative layer disappears |
| drop `margin:auto` recovery | ±0.1% | none |

Only the property allowlist moves the number, and it moves it enormously — Bulma
goes from 5,827 to 16,597 characters when every computed property is copied.

Inheritance pruning is the interesting entry: it barely affects the *link* (zstd
is already compressing the repetition) but it is load-bearing for correctness and
it cuts the raw document enough to matter for capture-time memory. Dropping
pseudo-elements is the only saving in the table that buys nothing — what it
removes is visible.

### Capture cost

| fixture | elements | decls/element | wall clock |
| --- | ---: | ---: | ---: |
| utility-app | 141 | 20.8 | 60 ms |
| bulma-landing | 232 | 21.3 | 193 ms |
| markdown-article | 638 | 18.5 | 231 ms |
| bootstrap-dashboard | 544 | 18.9 | 236 ms |
| pico-docs | 640 | 19.8 | 368 ms |

Three `getComputedStyle` calls per element (element + both pseudo-elements),
each forcing layout, against a detached baseline iframe. 60–370 ms on the user's
tab, growing linearly. Fine for a click-to-capture action; would need chunking
before it could run anywhere automatic.

---

## Steps 4, 5 and 7 — what to keep, drop and add

Steps 4 and 5 were both in the original sketch; both were implemented and
measured. Step 4 is worth much less than it looks. Step 5 is worth a solid 5–7%
— once its decoder is hosted in the preview rather than shipped in every link,
which is a correction to the first version of this plan. Step 7 was not in the
sketch at all and is worth more than either.

### Step 4 — class sharing is worth ~0% on small pages

Four strategies were implemented and measured:

- **inline** — no classes; `style=""` on every element. The control.
- **exact** — one class per distinct declaration *set* (what snapDOM does).
- **atomic** — one class per distinct *declaration* (StyleX/Tailwind shape).
- **merged** — declarations appearing on exactly the same set of elements become
  one multi-declaration class; single-use groups fold back into `style=""`.

| fixture | `style=""` | exact | atomic | merged |
| --- | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 245 KB → **6,300** | 58 KB → 6,492 | 49 KB → 7,223 | 40 KB → 6,552 |
| bulma-landing | 117 KB → **5,577** | 45 KB → 5,811 | 30 KB → 6,581 | 24 KB → 5,827 |
| pico-docs | 335 KB → **4,977** | 55 KB → 5,005 | 65 KB → 5,633 | 53 KB → 5,151 |
| markdown-article | 305 KB → 3,909 | 39 KB → **3,867** | 54 KB → 4,341 | 42 KB → 3,996 |
| utility-app | 68 KB → **3,356** | 19 KB → 3,380 | 16 KB → 3,832 | 12 KB → 3,456 |

*raw document size → link characters*

Class sharing shrinks the raw document by up to **7×** and the link by roughly
**nothing**. On four of the five fixtures, stuffing every declaration into a
`style` attribute and letting zstd sort it out produces the *smallest link of
all*.

**Why:** classes and zstd are two implementations of the same idea, and zstd's is
better. A class factors out a repeated declaration block and pays for it with a
name that must be invented, written into the stylesheet, and written again into
every element that uses it. zstd factors out *any* repeated byte sequence — the
same declaration blocks, plus tag names, attribute syntax, and text — and pays
nothing, because the back-reference *is* the encoding. Putting a naming layer
underneath mostly hands the compressor a harder problem.

This also explains the atomic result. One-declaration-per-class moves the
repetition out of the stylesheet and into the class attributes, where there is
*more* of it, not less — exactly the concern in the original note about StyleX.

**But it flips on large pages.** Same stylesheet, more content:

| elements | `style=""` | exact | atomic | merged |
| ---: | ---: | ---: | ---: | ---: |
| 544 | **6,300** | 6,492 | 7,223 | 6,552 |
| 1,864 | 8,028 | **7,721** | 8,527 | 7,868 |
| 4,504 | 9,651 | **8,789** | 9,727 | 8,933 |

Inline styles grow with the number of *elements*; classes grow with the number of
*distinct styles*, which flattens out. Somewhere between 550 and 1,900 elements
classes start winning, and by 4,500 they are ~9% ahead. Real pages live at the
right end of that table.

**Recommendation: keep step 4, but only in its cheap form, and stop there.**
`merged` grouping is an equivalence relation over "which elements carry this
declaration" — it is exact, linear, needs no cost model and no search, and it
is in effect rediscovering the page's original CSS rules from their effects.
The greedy biclique-cover refinement that OptiCSS performs (factoring out
*partially* overlapping groups) should **not** be built: the gap between
`merged` and the theoretical optimum is bounded above by the gap between
`merged` and `inline`, which the table shows is ~1%. That is not worth an
NP-hard search running in a content script.

### Step 5 — the compact tree encoding is worth ~6%, but a dictionary is worth ~3–5× that

The first measurement of step 5 put the decoder *inside* the payload and
concluded it was a net loss: the format saved 104–200 characters and the decoder
cost 725. **That framing was wrong.** linkify.ink owns the preview code, so a
decoder ships there once instead of in every link, and a format only has to be
smaller — not smaller by 725 characters.

Re-measured with the decoder hosted (`demo/scrape-compress/encoding-test.mjs`),
every payload carrying the same information and verified to render to the same
pixels before being priced:

| fixture | HTML | s-expr | | Pug | | Pug round-trip |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| bootstrap-dashboard | 6,552 | 6,217 | −5.1% | 6,248 | −4.6% | 0.0% pixel diff |
| bulma-landing | 5,827 | 5,528 | −5.1% | 5,576 | −4.3% | 0.0% pixel diff |
| pico-docs | 5,151 | 4,813 | −6.6% | 4,885 | −5.2% | 0.0% pixel diff |
| markdown-article | 3,996 | 3,728 | −6.7% | 3,828 | −4.2% | 0.0% pixel diff |
| utility-app | 3,456 | 3,224 | −6.7% | 3,283 | −5.0% | 0.0% pixel diff |

So the format is worth a real **5–7%**.

#### Pug works, and should still be rejected

Using an existing format rather than inventing one is the right instinct, and Pug
delivers: `html2pug` → `pug.render` round-trips these captures at **0.0% pixel
difference** for 4–5% smaller links, most of the bespoke format's win with none
of the bespoke format's maintenance.

It is still the wrong choice here, for a reason that has nothing to do with size.
Pug is a Turing-complete template engine, and link payloads are untrusted by
definition:

```
$ node -e "pug.render(\"- globalThis.__PWNED = 'yes'\np= 1+1\")"
__PWNED = yes
```

Compiling a payload with Pug is arbitrary code execution in the preview origin,
which defeats the sandbox's `nojs` default outright. A safe Pug path would mean
driving `pug-lexer`/`pug-parser` directly and rejecting every code node — at
which point it is no longer "just use Pug", and the bespoke decoder is ~40 lines
with no `eval`, saves slightly more, and adds 23 MB less to the preview bundle.

**Recommendation: keep the s-expression format, but ship it after step 7.**

### Step 7 — a zstd dictionary, the lever the sketch missed

The "we control both ends" argument that rescues step 5 applies just as well to
compression, and pays much better. zstd accepts a **raw content dictionary** —
arbitrary bytes, no training format required — and the already-vendored
`@bokuweb/zstd-wasm` exports `compressUsingDict`/`decompressUsingDict`. No new
dependency.

Same HTML payload, same pipeline, different compressor state:

| fixture | zstd-19 | + house dict | + corpus dict | *(prose leak)* | brotli-11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 6,552 | 5,964 (−9.0%) | 5,304 (−19.0%) | *4,948* | 5,585 (−14.8%) |
| bulma-landing | 5,827 | 5,256 (−9.8%) | 4,653 (−20.1%) | *4,320* | 5,053 (−13.3%) |
| pico-docs | 5,151 | 4,629 (−10.1%) | 3,799 (−26.2%) | *3,517* | 4,383 (−14.9%) |
| markdown-article | 3,996 | 3,460 (−13.4%) | 2,767 (−30.8%) | *2,441* | 3,281 (−17.9%) |
| utility-app | 3,456 | 2,876 (−16.8%) | 2,572 (−25.6%) | *2,213* | 2,828 (−18.2%) |

- **house dict** is a hand-written ~2 KB constant: the reset rule verbatim, the
  document boilerplate, and the CSS property names and values a computed-style
  capture emits by the hundred. It contains no fixture content, so this number is
  clean and shippable as-is.
- **corpus dict** is every *other* fixture's capture concatenated, standing in for
  a dictionary trained on real captures.
- The *prose leak* column is the same measurement done carelessly, and is here as
  a warning rather than a result. All five fixtures draw from one prose pool, so
  a merely held-out dictionary still contains the test page's sentences verbatim
  — worth 6–10 points of imaginary saving. Holding out the fixture was not
  enough; a dictionary that has already seen the article it is compressing is a
  cache, not a dictionary.

**brotli-11 beating zstd-19 by 13–18% with no dictionary at all is the same
finding restated**: brotli ships a static dictionary of common HTML fragments,
which is exactly what the house dictionary hand-builds. Confirmation of the
mechanism, not a separate option — a zstd dictionary beats it, and switching
codec would break every existing link.

### The two stack

| fixture | HTML | s-expr | HTML+house | s-expr+house | s-expr+corpus |
| --- | ---: | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 6,552 | 6,217 | 5,964 | 5,716 | **5,253** (−19.8%) |
| bulma-landing | 5,827 | 5,528 | 5,256 | 5,056 | **4,644** (−20.3%) |
| pico-docs | 5,151 | 4,813 | 4,629 | 4,380 | **3,820** (−25.8%) |
| markdown-article | 3,996 | 3,728 | 3,460 | 3,281 | **2,817** (−29.5%) |
| utility-app | 3,456 | 3,224 | 2,876 | 2,773 | **2,577** (−25.4%) |

Together they would take the corpus from 3,456–6,552 characters to roughly
**2,600–5,300**, on top of the 6–11× already won against the current capture.

### What both of them cost

A payload that needs a hosted dictionary is exactly as un-openable-on-its-own as
one that needs a hosted decoder. Both trade the project's "a link is a file you
can decode anywhere" property for size; the dictionary is the better trade only
because it buys 3–5× more per unit given up. Two consequences either way:

- **Versioning is permanent.** The format version already lives in the flag byte
  (`FORMAT_VERSION`, currently 1). A dictionary or tree-format version must go
  there too, and once shipped it **can never be retired** — every link minted
  under it would stop decoding. Both should be published alongside the format
  description so the README's claim that the decoding logic is simple enough to
  reimplement stays true.
- **The dictionary is not scrape-specific.** It would help every linkify.ink
  payload, and a generic one helps less than a scrape-tuned one. Worth selecting
  per content type with a byte rather than shipping a single compromise.

---

## Responsiveness is not recoverable

`getComputedStyle().width` returns the **used** value — the pixels the box
occupies, not the `auto` or `50%` the author wrote. Copying those pins the
layout. Four sizing policies were measured:

| mode | link (bootstrap) | pixel diff, across corpus |
| --- | ---: | --- |
| `none` — never copy width/height | 5,884 | 0.0–11.8% |
| `smart` — drop provably-redundant widths | 6,149 | 0.0–11.9% |
| `fluid` — widths as percentages, grid tracks as `fr` | 6,183 | 0.1–11.9% |
| `all` — copy everything | 6,552 | **0.0–1.0%** |

`smart` and `fluid` were both attempts to keep the capture responsive. Both fail,
for a reason that is fundamental rather than fixable: **`@media` rules are not
part of a computed style.** By the time the walk runs, "three columns above
992px, one below" has already collapsed to "three columns", and nothing recovers
the breakpoint. Relaxing the widths does not make the capture responsive; it just
makes it wrong.

The right move is to stop pretending. The capture declares the width it was taken
at — `<meta name="viewport" content="width=1280">` — and a phone lays it out at
that width and scales the result to fit. Measured on an emulated 390px phone,
sideways scroll goes from **3.28× to 1.00×**, and the tag is *shorter* than the
`width=device-width` it replaces.

This is a real regression in one narrow sense — today's capture keeps the
original page's media queries and genuinely reflows — and an improvement in the
sense that matters, since today's capture only reflows correctly when its
`<link>`ed stylesheet still loads.

---

## Recommended Configuration

```js
{
  strategy: 'merged',     // step 4, cheap equivalence-grouping form only
  tree: 'html',           // step 5: switch to 'sexp' once the preview hosts a decoder
  props: 'visual',        // ~120-property allowlist; the one big lever in the capture
  sizing: 'all',          // pixel-exact; @media is unrecoverable anyway
  pseudo: true,           // ::before/::after
  inheritPrune: true,
  restoreAuto: true,
  fitViewport: true,      // <meta viewport content="width=<capture width>">
}
```

Plus, at the pipeline rather than the capture: a versioned zstd dictionary
(step 7). That is worth 9–31% on its own against the 5–7% the tree format buys,
for the same kind of commitment, so it should ship first.

---

## Known Gaps

These are properties of the method, not bugs to be fixed before shipping. Several
are also true of the current capture.

- **Form controls.** `<input>` keeps its box but loses placeholder, value and
  native appearance. Visible in the Bootstrap fixture's search field.
- **`<svg>` is copied verbatim.** Geometry lives in attributes (`d`, `points`,
  `viewBox`), not in CSS, so this is the one place the method falls back to
  shipping markup. **Icon-heavy pages will do worse than this corpus suggests** —
  the biggest unmeasured risk in the proposal.
- **`<canvas>`, `<video>`, `<iframe>`** become empty boxes. A chart drawn to a
  canvas is lost. (Today's capture loses these too.)
- **`:hover`, `:focus`, `@media`, `@keyframes`** are gone by construction. Only
  the state the page was in at capture time survives. This is arguably correct
  for a snapshot.
- **`display:none` subtrees are dropped.** Mobile navs, modals and inactive tab
  panels do not ship. This is most of the difference between capturing a page and
  capturing every state a page can be in, and it is a size win — but it means a
  capture cannot be interacted with.
- **Webfonts.** `font-family` is copied but `@font-face` is not, so a page in a
  webfont renders in the reader's fallback. The `@font-face` rules *are* readable
  from the CSSOM, but the font files are far too large for a URL, so it is a
  substitution either way. Worth emitting the `@font-face` rules with absolute
  URLs so the font loads when the network is available.
- **Images** are untouched by this experiment; the existing link-or-inline choice
  carries over unchanged, and every number above is link-mode.

---

## Open Questions

1. **Does this hold on real pages?** The corpus is synthetic markup over real
   stylesheets. It covers the three CSS architectures that matter (component,
   element-selector, utility), but real pages have deeper trees, more SVG, more
   `display:none`, and far more junk. **Re-measure before building.** The
   harness takes a URL as easily as a fixture; it only needs an environment with
   egress.
2. **Where is the crossover for step 4, really?** Measured between 550 and 1,900
   elements on one fixture. If real pages sit below it, `inline` is simpler
   *and* smaller and step 4 can be dropped entirely.
3. **How bad is the SVG fallback?** An icon-heavy app page could plausibly spend
   more on inline SVG than on everything else combined.
4. **Should article mode change too?** Probably not — it is small already, and
   its value is that it *discards* the page's design rather than reproducing it.
5. **Capture-time cost on a slow device.** 370 ms was measured in headless
   Chromium on a server. A mid-range phone could be several times that.
6. **How much does a dictionary generalise?** The house dictionary was written
   against this corpus's captures. A real corpus will have different common
   values (design-system colours, different font stacks), and the honest test is
   a dictionary built from one set of real pages and measured on another.
7. **Is giving up self-containment acceptable at all?** Both step 5 and step 7
   make a payload undecodable without linkify.ink's own constants. That is a
   product decision, not a technical one, and it should be made once — before
   either ships — rather than drifted into.

---

## Task Breakdown

### Phase 1 — Validate against real pages

- **1.1** Point `demo/scrape-compress/run.mjs` at a list of real URLs instead of
  local fixtures (it already takes the same code path; only the server and the
  fixture list are local).
- **1.2** Measure 20–30 real pages across categories: news, docs, blog, SPA
  dashboard, e-commerce, icon-heavy marketing.
- **1.3** Report: link-size distribution, pixel diff distribution, SVG share of
  payload, capture time. **Decision gate** — if the median link is not
  dramatically better than today's, stop here.
- **1.4** Re-check the step-4 crossover against the real element-count
  distribution, and drop `merged` for `inline` if real pages sit below it.

### Phase 2 — Productionise the capture

- **2.1** Move `demo/scrape-compress/capture.js` into `extension/content/` as a
  third mode alongside `article` and `full`, reusing the existing URL
  absolutization and image handling in `extension/content/capture.js` rather than
  duplicating them.
- **2.2** Emit `@font-face` rules with absolute URLs (Known Gaps).
- **2.3** Chunk the walk with `requestIdleCallback` or explicit yields so a large
  page cannot freeze the tab.
- **2.4** Handle the `<svg>` fallback deliberately: strip presentational
  attributes already covered by computed styles, and consider a size cap that
  drops oversized inline SVG.
- **2.5** Decide the capture viewport. Capturing at the user's current window
  width is simplest; capturing at a fixed width would make links more consistent
  but requires resizing the tab.

### Phase 3 — Compression (step 7), the largest remaining win

- **3.1** Add a dictionary slot to the payload format: a version byte alongside
  `FORMAT_VERSION`, `0` meaning "no dictionary" so every existing link keeps
  decoding untouched.
- **3.2** Ship the hand-written house dictionary (−9% to −17%, measured) as a
  committed constant used by both `extension/` and the preview. Route it through
  `compressUsingDict`/`decompressUsingDict`, which the vendored wasm already
  exports.
- **3.3** Once Phase 1 has a corpus of real captures, train a dictionary on it
  and measure against a properly held-out set — held out of *content*, not just
  of page identity. Expect somewhere near the −19% to −31% measured here, and
  treat any number closer to the prose-leak column as a bug in the experiment.
- **3.4** Publish the dictionary and its version alongside the format
  description, so a link stays decodable by a reimplementation.

### Phase 4 — Surface it

- **4.1** Extension UI: this becomes the default for full-page capture, with the
  current behaviour kept as an escape hatch (it preserves interactivity and media
  queries, which this does not).
- **4.2** Tell the user what they get — a static snapshot at a given width, with
  no scripts and no external dependencies.
- **4.3** Playwright coverage: a fixture page, a capture, and a pixel-diff
  assertion, so the reset rule cannot silently regress the way `white-space` did.

### Phase 5 — Step 5, and other follow-ups

- **5.1** The s-expression tree (−5% to −7%): decoder in the preview, another
  version byte, and the same never-retire commitment as the dictionary. Worth
  doing, worth doing last — it is the smallest win of the three for the same
  loss of self-containment.
- **5.2** Full-page-height capture: scroll the page to trigger lazy-loaded
  content before walking.
- **5.3** An element-scoped version of the same method, to pair with the existing
  **Pick an element** flow — likely a very large win, since a single component
  carries a tiny fraction of a page's distinct styles.
