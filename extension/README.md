# linkify.ink browser extension

A Chrome (MV3) extension that turns the page you're reading into a linkify.ink link. It packs the capture through the same `LinkifyInk` class the site uses. Nothing is uploaded; the extension is just another consumer of the library.

The extension makes public links only. To share a capture with a password or to a recipient key, open the link in the editor and share it again from there. That's the same flow the site uses for any file, so the popup doesn't need its own copy of it.

## Building and loading

```sh
npm run build:extension   # bundles deps and assembles extension/vendor/
```

Then load it: `chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/`.

## Why size shapes everything

The whole design is shaped by URL length (see [Limits](../README.md#limits) in the main README). Measured on real prose, a capture ends up at roughly **half the character count of its markup** after zstd. A typical article lands around 8,000–15,000 characters, and a very long one approaches the 32,000 mark where the site starts warning about truncation. Two consequences:

- **Article-only mode is the default.** Full-page capture is there for pages Readability can't parse, or where the design is the point. It is a static snapshot rebuilt from computed styles (see below), which keeps it in the same size range as an article on simple pages; a busy page with a lot of inline SVG still gets big.
- **Images keep their original URLs.** An absolute URL costs a hundred-odd characters; the image itself would cost tens of thousands. Images are already compressed, so zstd can't shrink them, and every byte becomes about 1.33 characters of URL. One photo outweighs the whole article. The reader sees the page as written, but the capture needs the network and breaks if the host moves the file. If you want something that survives the original site going away, use [SingleFile](https://github.com/gildas-lormeau/SingleFile) instead; a URL is the wrong container for an archive.

Images with no usable source (a `data:` URI, or a lazy-loading placeholder that never resolved) are the one case that's genuinely dropped. Their alt text is kept in place.

## The two capture modes

The two modes are deliberate opposites: one curates, the other copies what's on screen.

### Article mode

Article mode extracts the article with [Readability](https://github.com/mozilla/readability), the same extractor Firefox Reader Mode uses, and writes it as a standalone `article.html`. The markup is sanitized before it's packed: scripts, styles, embeds and event handlers are stripped, attributes are reduced to an allowlist, and links are absolutized. The result is rebuilt around a small reader stylesheet. The sanitizing is extra defense on top of the preview sandbox; the sandbox is still what keeps a capture isolated.

### Full mode

Full mode snapshots the page as rendered, but ships neither its markup nor its stylesheets. Both were tried. A page's CSS is 120–140 KB of mostly unused rules (37,000+ characters of URL, past what any chat client survives). And the cross-origin sheets a content script can't read stayed as `<link>`s to the origin, so the capture only looked right while that host was up.

Instead, full mode walks the DOM, asks the browser what it decided for every visible element via `getComputedStyle`, and rebuilds a new document from the answers. Measured on the corpus in `demo/scrape-compress/`, that is **6–11× shorter** than shipping the page, at 0–1% pixel difference from the live page. That holds online or offline, because there is nothing left to fetch.

What makes it small enough to be viable is that the capture *diffs* rather than dumps. A computed style is ~400 declarations per element, and nearly all of them are either the UA default for that tag or an inherited value the parent already has. Non-inherited properties are compared against a per-tag baseline measured in a hidden iframe carrying only a reset rule; inherited ones are compared against the parent. Only what survives is emitted, around 19 declarations per element. Declarations shared by the same set of elements become one class, and the rest go inline. The same reset rule is the first thing in the generated stylesheet, so "differs from the baseline" means exactly "load-bearing in the output". `tests/capture.spec.js` guards that agreement.

Full mode does not filter, because a full mode that decides what counts as clutter is just a bad ad blocker bolted onto a worse version of article mode. Run your own blocker and capture what survives. It does do the fidelity work a snapshot needs:

- **Open shadow roots are flattened** into the composed tree the browser actually draws, with slots replaced by what was slotted into them.
- **SVG ships verbatim**, since its geometry lives in attributes rather than CSS. `<use href="#…">` sprite references are resolved, because the sprite sheet itself is `display:none` and would otherwise be dropped.
- **`@font-face` rules for the fonts in use** are emitted with absolute URLs, so a page set in a webfont loads it while its host serves it. It's the same trade as images.
- **Live form state** (what was typed, ticked and selected) is what the snapshot keeps.
- **The capture declares the width it was taken at.** `@media` rules are not part of a computed style, so a rebuilt page cannot reflow. A phone lays it out at the capture width and scales it to fit rather than scrolling sideways.

What it cannot do, by construction: `:hover`, `@keyframes`, `display:none` subtrees (menus, modals, inactive tabs) and anything behind a breakpoint are gone. Only the state the page was in at capture time survives. `<canvas>`, `<video>` and `<iframe>` keep their box and lose their content.

## Scripts

Captures never include scripts, in either mode. Links made in the editor can, and their previews run them, but always on the sandbox origin, where they can't reach the editor or anything else on linkify.ink.
