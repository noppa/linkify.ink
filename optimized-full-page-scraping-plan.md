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

### Step 4 — Share classes between elements *(candidate for abandonment — see below)*

Merge declarations across elements so a declaration appears once in the
stylesheet rather than once per element that uses it.

### Step 5 — Compact tree encoding *(candidate for abandonment — see below)*

Replace HTML with a denser custom form, e.g.

```
(div.a.b "Hello "(i.a.c "world"))
```

decoded back to `<div class="a b">Hello <i class="a c">world</i></div>` by a
small script shipped inside the capture.

### Step 6 — Declare the capture width

Emit `<meta name="viewport" content="width=1280">` (the width the capture was
taken at) rather than `width=device-width`. See
[Responsiveness](#responsiveness-is-not-recoverable).

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

## Steps 4 and 5 — the parts we should probably abandon

Both were in the original sketch. Both were implemented and measured. Both are
worth less than they look, and step 5 is worth less than nothing.

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

### Step 5 — the compact tree encoding is a net loss

The s-expression form was implemented, along with an 891-byte decoder. Measuring
the encoding in isolation (same capture, serialized both ways, compressed alone,
no stylesheet, no decoder):

| fixture | HTML | s-expr | saving | saving % |
| --- | ---: | ---: | ---: | ---: |
| bootstrap-dashboard | 4,019 | 3,819 | 200 | 5.0% |
| bulma-landing | 3,435 | 3,283 | 152 | 4.4% |
| pico-docs | 3,069 | 2,887 | 182 | 5.9% |
| markdown-article | 2,324 | 2,180 | 144 | 6.2% |
| utility-app | 2,157 | 2,053 | 104 | 4.8% |

The encoding is ~20% smaller *raw* and only **4–6% smaller compressed**, for the
same reason as step 4: zstd was already handling `</div>`. The decoder costs
**725 characters** through the pipeline.

So the format must save >725 characters to break even, and it saves 104–200. It
is a **net loss on every fixture**, and stays one until a page is roughly four
times larger than the largest here.

**Recommendation: abandon step 5.** Revisit only if captures routinely exceed
~15,000 characters, where the 4–6% would clear the fixed decoder cost. Note that
at that size the link is already unusable for other reasons, so the honest read
is "abandon".

There is a second argument against it beyond size: HTML output means a capture is
inspectable, debuggable, and renders in any browser with no script at all. The
preview sandbox already blocks scripts by default (`nojs: 1`), and a tree
encoding would make the capture *depend* on script execution to display
anything.

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
  strategy: 'merged',     // step 4, cheap form only
  tree: 'html',           // step 5 abandoned
  props: 'visual',        // ~120-property allowlist; the one big lever
  sizing: 'all',          // pixel-exact; @media is unrecoverable anyway
  pseudo: true,           // ::before/::after
  inheritPrune: true,
  restoreAuto: true,
  fitViewport: true,      // <meta viewport content="width=<capture width>">
}
```

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

### Phase 3 — Surface it

- **3.1** Extension UI: this becomes the default for full-page capture, with the
  current behaviour kept as an escape hatch (it preserves interactivity and media
  queries, which this does not).
- **3.2** Tell the user what they get — a static snapshot at a given width, with
  no scripts and no external dependencies.
- **3.3** Playwright coverage: a fixture page, a capture, and a pixel-diff
  assertion, so the reset rule cannot silently regress the way `white-space` did.

### Phase 4 — Follow-ups worth considering

- **4.1** Full-page-height capture: scroll the page to trigger lazy-loaded
  content before walking.
- **4.2** An element-scoped version of the same method, to pair with the existing
  **Pick an element** flow — likely a very large win, since a single component
  carries a tiny fraction of a page's distinct styles.
