# Computed-style page capture — a demo

An experiment in replacing full-page capture in the extension. Nothing here is
wired into `extension/`; it is a standalone harness that captures pages, packs
them through the real `LinkifyInk` pipeline, and measures what comes out.

```
node demo/scrape-compress/setup-fixtures.mjs   # fetch the real stylesheets, once
node demo/scrape-compress/run.mjs              # measure  → out/report.md
node demo/scrape-compress/snapshot.mjs         # eyeball  → out/side-by-side.png
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
are worth nothing on a small page and about 9% on a large one, and step 5 is a
net loss.

## What already exists

| | what it does | what it doesn't |
| --- | --- | --- |
| [SingleFile](https://github.com/gildas-lormeau/SingleFile) | The production-grade version of today's approach: inlines every subresource, prunes unused rules by matching selectors against the DOM. | Keeps the page's stylesheets rather than rebuilding from computed values, so the floor is the size of the used CSS. |
| [snapDOM](https://github.com/zumerlab/snapdom) | Steps 1–3 almost exactly: clones a subtree, snapshots `getComputedStyle` per node, and in `compress` mode maps each distinct style string to a generated class. | Dedupes only on *whole* style strings; no partial sharing. Aimed at rendering into `<foreignObject>` for an image, not at a standalone document. |
| [OptiCSS](https://github.com/linkedin/opticss) | Step 4, done properly. Its `mergeDeclarations` pass finds declarations shared across rules, factors them into new classes, and rewrites the markup to match. | A Node build-time tool over PostCSS ASTs, given static template analysis. Not something to run in a content script. |
| [StyleX](https://stylexjs.com/), Tailwind, Atomizer | Step 4's opposite corner: one declaration per class, dedupe by construction. | As the original note guessed — the markup pays for it. Measured below: atomic is the *worst* of the four strategies. |
| [rrweb](https://github.com/rrweb-io/rrweb) | Step 5: a compact non-HTML DOM serialization with a decoder at the other end. | Optimised for incremental mutation replay, not for one-shot size. |

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

### The compact tree encoding loses

The s-expression form from the original sketch, isolated from everything else
(same capture, serialized both ways, compressed alone):

| fixture | HTML | s-expr | saving |
| --- | ---: | ---: | ---: |
| bootstrap-dashboard | 4,019 | 3,819 | 200 |
| bulma-landing | 3,435 | 3,283 | 152 |
| pico-docs | 3,069 | 2,887 | 182 |
| markdown-article | 2,324 | 2,180 | 144 |
| utility-app | 2,157 | 2,053 | 104 |

The encoding is 20% smaller raw and **4–6% smaller compressed** — again because
zstd was already handling `</div>`. The decoder needed to read it back costs
**725 characters**. It is a net loss on every fixture in the corpus, and it stays
one until a page is several times larger than these.

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

`merged` over `inline` because real pages are past the crossover; `html` over
`sexp` because the decoder costs more than the encoding saves.

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
