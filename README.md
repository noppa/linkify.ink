# linkify.ink

Share files without uploading them anywhere.

**linkify.ink** packs files into a compressed, optionally encrypted payload and encodes the whole thing into a URL. The link *is* the file — there's no upload, no storage bucket, no account, and no expiry date. Anyone who opens the link gets the files decoded right in their browser, and because the payload lives in the URL hash fragment, it's never even sent to a server. The files exist only in the URLs you share and the browsers that open them.

This makes it a natural fit for the kind of small, ephemeral sharing that usually ends up in a pastebin or a chat attachment: a snippet of code, a config file, an HTML mockup, a markdown note — anything you want to hand to someone with a single link and zero infrastructure.

## Features

- **In-browser editor** — create and edit files in a multi-file editor with a sidebar, or drop in existing files from disk. Text, images, and binary files are all supported.
- **Live preview** — markdown (including fenced Mermaid diagrams), standalone Mermaid files, images, and even multi-file HTML/CSS/JS projects render in a sandboxed preview pane. Web projects run in an isolated iframe on a separate origin, served by a service worker that maps requests back to your in-memory files.
- **Three sharing modes:**
  - **Public** — a plain link; anyone who has it can open it.
  - **Password** — the payload is encrypted with AES-256-GCM, using a key derived from your password with Argon2id.
  - **Recipient key (ECDH)** — the recipient opens the `/receive` page, which generates an ephemeral keypair in their browser. They send you their public key, you encrypt directly to it. Only they can decrypt — there is no password to leak.
- **Receive page** — decrypts incoming payloads, lets the recipient download everything or open the files in the editor. Also handles payloads too large to survive as clickable links: paste the raw fragment in directly.
- **Compression** — files are tar-packed and compressed with zstd (level 19) and a shared dictionary to squeeze the most out of the URL length budget.

## How it works

The encoding pipeline is:

```
files → tar → zstd + shared dictionary → [encrypt] → base64url → https://linkify.ink/#<payload>
```

The payload starts with a flag byte (encryption type + format version), followed by mode-specific headers (salt + IV for password mode, ephemeral public key + IV for ECDH), then the ciphertext or plain payload: a small JSON metadata block and the compressed tar archive.

The compressor is primed with a **shared dictionary**: 3.5 MB of text most links contain anyway — general web text picked by zstd's dictionary trainer, English words and phrases, the commonest words of 41 languages, HTML, CSS and JS vocabulary, the usual document shell. Both ends have it, so no link has to spell that text out itself. Over a held-out corpus it makes English links 13% shorter in total and small pages and notes 23% shorter; links in other languages get 10% and 16% shorter. It ships inside `vendor/vendor.codec.bundle.js`, is committed zstd-compressed in [`dictionaries/`](dictionaries/), and is frozen: it is part of the link format, so a better dictionary is a new format version, never an edit. Links made before it (format 1) still open. How it was built and measured: [`demo/shared-dictionary/`](demo/shared-dictionary/).

Everything runs client-side using web platform primitives:

- **WebCrypto** for AES-GCM and ECDH (P-256)
- **Argon2id** (via WASM) for password key derivation
- **zstd** (via WASM) for compression
- A minimal, dependency-free **ustar tar** implementation for bundling files

## Design goals

- **No server-side state.** The hash fragment never leaves the browser, so the "service" has nothing to store, leak, or take down. A shared link works as long as the static site is up — and the decoding logic is simple enough to reimplement if it isn't.
- **Honest end-to-end encryption.** Encryption keys are derived and used entirely in the browser. In ECDH mode, the private key is generated fresh on the receive page and never serialized anywhere.
- **Minimal moving parts.** The app is plain JavaScript with Preact + htm — no JSX, no build step for the app code itself. Only the vendored npm dependencies are bundled (with esbuild) into a single committed `libraries.bundle.js`. Types are checked from JSDoc annotations with `tsgo --noEmit`.
- **Sandboxed previews.** Untrusted HTML/JS from a link never runs on the main origin. Previews execute on a `sandbox-<hash>.linkify.ink` subdomain backed by a tiny Cloudflare Worker, with files served by a service worker. The subdomain is named after a hash of the previewed files (salted per browser, so the hostname can't be matched to a link by anyone else), which means opening the same app again lands on the same origin and finds its `localStorage` and IndexedDB where it left them. Only those exact files can run there, so no other link can reach that storage — and changing a single byte of the app moves it to a new origin with empty storage. Safari refuses service workers in a cross-origin frame, which the sandbox is, so there the loader renders the files from `blob:` URLs it mints itself instead — same sandbox origin, same isolation, minus the ability to resolve references made from inside a stylesheet or a module.

## Browser extension

`extension/` holds a Chrome (MV3) extension that turns the page you're reading into a link. It extracts the article with [Readability](https://github.com/mozilla/readability) — the same extractor Firefox Reader Mode uses — writes it as a standalone `article.html`, and packs it through the same `LinkifyInk` class the site uses. Nothing is uploaded; the extension is just another consumer of the library.

The extension makes public links only. To share a capture with a password or to a recipient key, open the link in the editor and share it again from there — the same flow the site uses for any file, rather than a second copy of it in the popup.

```sh
npm run build:extension   # bundles deps and assembles extension/vendor/
```

Then load it: `chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/`.

The whole design is shaped by URL length. Measured on real prose, a capture ends up at roughly **half the character count of its markup** after zstd — so a typical article lands around 8,000–15,000 characters and a very long one approaches the 32,000 mark where the site starts warning about truncation. Two consequences:

- **Article-only mode is the default.** Full-page capture is there for pages Readability can't parse, or where the design is the point. It is a static snapshot rebuilt from computed styles (see below), which keeps it in the same size range as an article on simple pages; a busy page with a lot of inline SVG still gets big.
- **Images keep their original URLs.** An absolute URL costs a hundred-odd characters where the bytes behind it would cost tens of thousands — images are already compressed, so zstd gains nothing on them and every byte costs ~1.33 characters of URL; one photo outweighs the whole article. The reader sees the page as written; the cost is that the capture needs the network and rots if the host moves the file. That's the deal: a link carries the page, not an archive of it. If you want something that survives the original site going away, that's a job for [SingleFile](https://github.com/gildas-lormeau/SingleFile), not a URL.

Images with no usable source — a `data:` URI, or a lazy-loading placeholder that never resolved — are the one case that's genuinely dropped, and their alt text is kept in place.

### The two capture modes

They're deliberate opposites, and the split is most of the design.

**Article mode** curates. Readability picks the content out, then the markup is sanitized before it's packed — scripts, styles, embeds and event handlers stripped, attributes reduced to an allowlist, links absolutized — and rebuilt around a small reader stylesheet. Defence in depth on top of the preview sandbox, not a replacement for it.

**Full mode** snapshots the page as rendered — and ships neither its markup nor its stylesheets. Both were tried: a page's CSS is 120–140 KB of mostly unused rules (37,000+ characters of URL, past what any chat client survives), and the cross-origin sheets a content script can't read stayed as `<link>`s to the origin, so the capture only looked right while that host was up. Instead, full mode walks the DOM, asks the browser what it decided for every visible element via `getComputedStyle`, and rebuilds a new document from the answers. Measured on the corpus in `demo/scrape-compress/`, that is **6–11× shorter** than shipping the page, at 0–1% pixel difference from the live page — online or offline, because there is nothing left to fetch.

What makes it small enough to be viable: the capture *diffs* rather than dumps. A computed style is ~400 declarations per element, nearly all of which are either the UA default for that tag or an inherited value the parent already has. Non-inherited properties are compared against a per-tag baseline measured in a hidden iframe carrying only a reset rule, inherited ones against the parent — and only what survives is emitted, around 19 declarations per element. Declarations shared by the same set of elements become one class; the rest go inline. The same reset rule is the first thing in the generated stylesheet, so "differs from the baseline" means exactly "load-bearing in the output". `tests/capture.spec.js` guards that agreement.

Full mode does not filter, because a full mode that decides what counts as clutter is just a bad ad blocker bolted onto a worse version of article mode. Run your own blocker and capture what survives. It does do the fidelity work a snapshot needs:

- **Open shadow roots are flattened** into the composed tree the browser actually draws, slots replaced by what was slotted into them.
- **SVG ships verbatim** — geometry lives in attributes, not CSS — with `<use href="#…">` sprite references resolved, since the sprite sheet itself is `display:none` and would otherwise be dropped.
- **`@font-face` rules for the fonts in use** are emitted with absolute URLs, so a page set in a webfont loads it while its host serves it. Same trade as images.
- **Live form state** — what was typed, ticked and selected — is what the snapshot keeps.
- **The capture declares the width it was taken at.** `@media` rules are not part of a computed style, so a rebuilt page cannot reflow; a phone lays it out at the capture width and scales it to fit rather than scrolling sideways.

What it cannot do, by construction: `:hover`, `@keyframes`, `display:none` subtrees (menus, modals, inactive tabs) and anything behind a breakpoint are gone — only the state the page was in at capture time survives. `<canvas>`, `<video>` and `<iframe>` keep their box and lose their content. Scripts are never copied.

### Scripts

Neither mode ships scripts. Previews of any link always run whatever scripts it does carry: the preview is served from its own `sandbox-*.linkify.ink` origin, so a page's scripts can't reach the editor or anything else on linkify.ink.

## Development

```sh
npm install
npm start          # local dev server
npm run typecheck  # type-check JSDoc annotations
npm run lint       # oxlint
npm run bundle-libs  # rebuild the vendored bundles after changing deps
npm run build:extension  # rebuild bundles + assemble extension/vendor/
```

`extension/vendor/` is gitignored and assembled by `build-extension.mjs`; `npm run typecheck` covers `extension/` and needs it in place, which is why CI builds it first.

## License

See [LICENSE](LICENSE).
