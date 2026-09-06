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
- **Compression** — files are tar-packed and compressed with zstd (level 19) to squeeze the most out of the URL length budget.

## How it works

The encoding pipeline is:

```
files → tar → zstd → [encrypt] → base64url → https://linkify.ink/#<payload>
```

The payload starts with a flag byte (encryption type + format version), followed by mode-specific headers (salt + IV for password mode, ephemeral public key + IV for ECDH), then the ciphertext or plain payload: a small JSON metadata block and the compressed tar archive.

Everything runs client-side using web platform primitives:

- **WebCrypto** for AES-GCM and ECDH (P-256)
- **Argon2id** (via WASM) for password key derivation
- **zstd** (via WASM) for compression
- A minimal, dependency-free **ustar tar** implementation for bundling files

## Design goals

- **No server-side state.** The hash fragment never leaves the browser, so the "service" has nothing to store, leak, or take down. A shared link works as long as the static site is up — and the decoding logic is simple enough to reimplement if it isn't.
- **Honest end-to-end encryption.** Encryption keys are derived and used entirely in the browser. In ECDH mode, the private key is generated fresh on the receive page and never serialized anywhere.
- **Minimal moving parts.** The app is plain JavaScript with Preact + htm — no JSX, no build step for the app code itself. Only the vendored npm dependencies are bundled (with esbuild) into a single committed `libraries.bundle.js`. Types are checked from JSDoc annotations with `tsgo --noEmit`.
- **Sandboxed previews.** Untrusted HTML/JS from a link never runs on the main origin. Previews execute on a `*.sandbox.linkify.ink` wildcard subdomain backed by a tiny Cloudflare Worker, with files served by a per-tab service worker.

## Browser extension

`extension/` holds a Chrome (MV3) extension that turns the page you're reading into a link. It extracts the article with [Readability](https://github.com/mozilla/readability) — the same extractor Firefox Reader Mode uses — writes it as a standalone `article.html`, and packs it through the same `LinkifyInk` class the site uses. Nothing is uploaded; the extension is just another consumer of the library.

Use **Pick an element** when you only need one section of a busy page. It highlights
the element under the pointer; click to make a link containing that element's exact
`outerHTML`, or press Escape to cancel. Reopen the popup after choosing it to copy
or open the finished link.

```sh
npm run build:extension   # bundles deps and assembles extension/vendor/
```

Then load it: `chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/`.

The whole design is shaped by URL length. Measured on real prose, a capture ends up at roughly **half the character count of its markup** after zstd — so a typical article lands around 8,000–15,000 characters and a very long one approaches the 32,000 mark where the site starts warning about truncation. Two consequences:

- **Article-only mode is the default.** Full-page capture is available for pages Readability can't parse, but it's much larger — on an ad-heavy news site it can be forty times the practical URL limit, so it's a tool for simple pages rather than a general fallback.
- **Images keep their original URLs by default.** An absolute URL costs a hundred-odd characters where the bytes behind it would cost tens of thousands — images are already compressed, so zstd gains nothing on them and every byte costs ~1.33 characters of URL. The reader sees the article as written; the cost is that the capture needs the network and rots if the host moves the file.

Ticking **embed images** makes the capture self-contained instead: each image is re-encoded to WebP (downscaled to 1280px on its longest edge) and stored as a sibling archive entry — `assets/img-0.webp` — which the preview sandbox serves like any other project file. There's no cap on how many or how large; the popup shows the resulting character count, and how long a link is worth sharing is your call. Anything that can't be fetched silently keeps its original URL. Embedding requests host permission at the moment you enable it, since it means fetching from whatever hosts the article points at.

Images with no usable source — a `data:` URI, or a lazy-loading placeholder that never resolved — are the one case that's genuinely dropped, and their alt text is kept in place.

### The two capture modes

They're deliberate opposites, and the split is most of the design.

**Article mode** curates. Readability picks the content out, then the markup is sanitized before it's packed — scripts, styles, embeds and event handlers stripped, attributes reduced to an allowlist, links absolutized — and rebuilt around a small reader stylesheet. Defence in depth on top of the preview sandbox, not a replacement for it.

**Full mode** snapshots. Scripts, styles, iframes, ads, inline handlers: everything, as it stands. It doesn't filter, because a full mode that decides what counts as clutter is just a bad ad blocker bolted onto a worse version of article mode. Run your own blocker and capture what survives; the extension scrapes what's on the page.

What full mode *does* do is fidelity work, without which a snapshot isn't one:

- **URLs are absolutized** — `src`, `href`, `srcset`, `poster`, and `url()` inside stylesheets and style attributes. Otherwise every relative path in the capture is dead.
- **CSSOM-only stylesheets are recovered.** CSS-in-JS libraries (styled-components, Emotion) insert rules through `CSSStyleSheet.insertRule` in production, which leaves the `<style>` element in the DOM empty; `adoptedStyleSheets` has no element at all. Serializing the DOM misses both, and the capture renders as unstyled text. Cross-origin sheets can't be read, so their `<link>` survives instead and the reader fetches it.
- **Open shadow roots are serialized** as declarative `<template shadowrootmode>`, so pages built from web components don't come out as a set of empty custom-element tags. Closed roots are unreachable and lost.

### Scripts, and who decides

Full-page captures keep scripts, but whether they *run* is a read-time decision, not a capture-time one. The preview nests two iframes: an outer one that loads the sandbox loader (whose own script registers the service worker serving every file — that one has to run), and a nested one holding the actual content. The nested frame is where `allow-scripts` is granted or withheld, and sandbox flags only ever narrow going inward, so withholding it is enforced by the browser rather than by cooperation from the page.

Extension captures set `nojs: 1` in the link's metadata, so they open with scripts off. The preview header shows a **js on/off** toggle and the reader can flip it either way. This is a default, not a boundary — metadata is written by whoever made the link, and a hostile one can simply omit it. The isolation that actually holds is the throwaway `sandbox-*.linkify.ink` origin, which applies regardless.

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
