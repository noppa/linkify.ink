# linkify.ink

Share files without uploading them anywhere.

**linkify.ink** packs files into a compressed, optionally encrypted payload and encodes the whole thing into a URL. The link *is* the file — there's no upload, no storage bucket, no account, and no expiry date. Anyone who opens the link gets the files decoded right in their browser, and because the payload lives in the URL hash fragment, it's never even sent to a server. The files exist only in the URLs you share and the browsers that open them.

This makes it a natural fit for the kind of small, ephemeral sharing that usually ends up in a pastebin or a chat attachment: a snippet of code, a config file, an HTML mockup, a markdown note — anything you want to hand to someone with a single link and zero infrastructure.

## Features

- **In-browser editor** — create and edit files in a multi-file editor with a sidebar, or drop in existing files from disk. Text, images, and binary files are all supported.
- **Live preview** — markdown, images, and even multi-file HTML/CSS/JS projects render in a sandboxed preview pane. Web projects run in an isolated iframe on a separate origin, served by a service worker that maps requests back to your in-memory files.
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

## Development

```sh
npm install
npm start          # local dev server
npm run typecheck  # type-check JSDoc annotations
npm run lint       # oxlint
npm run bundle-libs  # rebuild libraries.bundle.js after changing deps
```

## License

See [LICENSE](LICENSE).
