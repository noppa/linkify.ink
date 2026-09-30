# linkify.ink

Share files without uploading them anywhere.

**linkify.ink** packs files into a compressed, optionally encrypted payload and encodes the whole thing into a URL. There's no upload, no storage bucket, no account, and no expiry date. Anyone who opens the link gets the files decoded right in their browser. Browsers don't send the part of a URL after `#` to the server, so linkify.ink never sees your files: they exist only in the links you share and the browsers that open them.

**[Try it: a three-file web page in about 800 characters](https://linkify.ink/#AgACe30otS_9YAAR_REAkggdGVDXA7Dltf__KqYlS15v03CpEfVLUDXCewq1-DgiGIbPEyiicY__s_9_gdC6LGrJhxQq0DPgq9IDvqAiCFKr69jEnUGhH5JG-bE75ypvNwrgZCPWHJsPBm5QId3JZsfaZD3TtPsAHbvr2E8_cekee86PjQOAnqhAa5sOQQiDGOSUAClklUgw1gOCUCQcJLHQGGMcmUAkmFAkKj8KojwgoUEpOK5QkKyIjqLf6z2qCKUc2DfbwgaPepGIE9GfRqY-42nAw50clILjZ9ByE9GwsQOG1LBDiV5gciFK5-2SneEgpXudzsGP4TByTtD0lMyf6g-3XNY-UvqIdFNuXMzoX7UOMIMgc2mKcDjMVZ-5pArcfYhLRKiE1Gp1jJFa4qRVYJgHWhT5ezZkOjRDc5CBYG57h0pF2-BI3asD2GCL5M9nLujmKEPox1XOiUdPW0zo6vHgsp7XyXZlQrlssZiVoicb1SEqb8bFz280c9uLTjK_aWzRAap2wISgPXeU0yayOUdQZdXLKOJM2U-zIjK2Y-3v1rHLLTbgoTAEKkqwfVAKRmjohHLG9nua4OCwXBSAiK_VDL5TRNOR_cSo8bbvCXCucPGVf2nkPv8xpLvbrmQzrjeBLzBZiEffyrUxud7cUGWwhh5eHHnXquQnuWvYseb_fN8l5HZNrlvrIQEaHql3Samf9xIbB3VHAmqqCO_34mWNZBAXjCzZx8EFvcSOB_q6kBzQRTjxVFTA9YsRF0oTuvlWk0wSkCPNlA4)**

It's handy for the stuff that usually ends up in a pastebin or a chat attachment: a code snippet, a config file, an HTML mockup, a markdown note. Anything you want to hand to someone as a single link.

## Features

- **In-browser editor.** Create and edit files in a multi-file editor with a sidebar, or drop in existing files from disk. Text, images, and binary files are all supported.
- **Live preview.** Markdown, images, and even multi-file HTML/CSS/JS projects render in a sandboxed preview pane.
- **Three sharing modes:**
  - **Public:** a plain link; anyone who has it can open it.
  - **Password:** the payload is encrypted with AES-256-GCM, using a key derived from your password with Argon2id.
  - **Recipient key (ECDH):** the recipient opens the `/receive` page, which generates an ephemeral keypair in their browser. They send you their public key, and you encrypt directly to it. Only they can decrypt, and there is no password to leak.
- **Receive page.** Decrypts incoming payloads and lets the recipient download everything or open the files in the editor. It also handles payloads too large to survive as clickable links: paste the raw fragment in directly.
- **Browser extension.** Turns the page you're reading into a link (see [below](#browser-extension)).

## Privacy and security

linkify.ink itself never receives your files, but the URL still passes through whatever you share it on. Chat apps store it, link-preview bots fetch it, and browsers sync history. **For a public link, whoever holds the URL holds the file.** Use password or recipient-key mode for anything you wouldn't post in the open.

A password-protected link can be attacked offline: anyone with the link can try passwords as fast as their hardware allows, with no server to rate-limit them. The key is derived with Argon2id (64 MiB of memory, 3 iterations, parallelism 1, 16-byte random salt), which makes each guess expensive, but it can't save a weak password. Use a long one.

Recipient-key mode has no password to guess. The private key is generated on the receive page and never leaves that browser tab.

## Limits

A link's size is bounded by how long a URL the tools along the way will carry:

- **About 32,000 characters** is where the share dialog starts warning. Past that, some browsers truncate the URL, and most chat clients mangle or cut long links well before browsers do.
- That budget holds roughly 24 KB of compressed data. Text compresses well, so tens of kilobytes of prose or code fit comfortably. Images and other already-compressed files don't shrink at all, so a single photo usually won't fit.
- For payloads too long to share as a clickable link, send the fragment as text (a file, or a paste) and have the recipient paste it into the [`/receive`](https://linkify.ink/receive) page.

## How it works

The encoding pipeline is:

```
files → tar → zstd + shared dictionary → [encrypt] → base64url → https://linkify.ink/#<payload>
```

The payload starts with a flag byte (encryption type + format version), followed by mode-specific headers (salt + IV for password mode, ephemeral public key + IV for ECDH), then the ciphertext or plain payload: a small JSON metadata block and the compressed tar archive. Compression uses zstd primed with a shared dictionary of common text (see [`dictionaries/`](dictionaries/)), so links don't have to spell out what both ends already have.

All encoding, encryption and decoding runs client-side using web platform primitives:

- **WebCrypto** for AES-GCM and ECDH (P-256)
- **Argon2id** (via WASM) for password key derivation
- **zstd** (via WASM) for compression
- A minimal, dependency-free **ustar tar** implementation for bundling files

The only server-side code is a small Cloudflare Worker for the preview sandbox (below). It serves the sandbox loader page and its service worker script; it never receives file contents, which the editor posts to the sandbox frame in the browser.

## Using the library

The codec that creates and reads links works without the UI and has no other dependencies. It's two plain ES modules: `linkify.ink.js` and `vendor/vendor.codec.bundle.js`. They run in any JS runtime with WebCrypto and `fetch()`, such as Node 20+, Deno or Bun, so a script or a command-line agent can create and read links without a browser. You can get the files:

- **from linkify.ink:**

  ```sh
  curl -s -o linkify.ink.mjs         https://linkify.ink/linkify.ink.js
  curl -s -o vendor.codec.bundle.mjs https://linkify.ink/vendor/vendor.codec.bundle.js
  ```

- **from GitHub:**

  ```sh
  curl -s -o linkify.ink.mjs         https://raw.githubusercontent.com/noppa/linkify.ink/main/linkify.ink.js
  curl -s -o vendor.codec.bundle.mjs https://raw.githubusercontent.com/noppa/linkify.ink/main/vendor/vendor.codec.bundle.js
  ```

- **by cloning this repository:** both files are committed, so no build step is needed.

(Renaming them to `.mjs` just tells Node they're ES modules.)

```js
import { linkifyInkCodecDependencies } from './vendor.codec.bundle.mjs';
import { LinkifyInk } from './linkify.ink.mjs';

const linkify = new LinkifyInk(linkifyInkCodecDependencies);

// Encode: files are { name, data } with data as a Uint8Array.
const link = await linkify.createLink(
	[{ name: 'notes.md', data: new TextEncoder().encode('# hello') }],
	{ encryption: 'password', password: 'hunter2' }, // optional
);
console.log(link); // https://linkify.ink/#...

// Decode: pass the whole URL or just the fragment.
const { files } = await linkify.readLink(link, { password: 'hunter2' });
for (const f of files) {
	console.log(f.name, new TextDecoder().decode(f.data));
}
```

To find out what a link needs before decoding it, call `linkify.peekEncryptionType(link)`. It returns `LinkifyInk.ENC_NONE`, `ENC_PASSWORD` (pass `{ password }`) or `ENC_ECDH` (pass `{ privateKey }`, the recipient's key).

## Design goals

- **No server-side state.** The hash fragment never leaves the browser, so the service has nothing to store, leak, or take down. A shared link works as long as the static site is up, and the decoding logic is simple enough to reimplement if it isn't.
- **Honest end-to-end encryption.** Encryption keys are derived and used entirely in the browser. In ECDH mode, the private key is generated fresh on the receive page and never serialized anywhere.
- **Minimal moving parts.** The app is plain JavaScript with Preact + htm: no JSX, and no build step for the app code itself. Only the vendored npm dependencies are bundled with esbuild, into a few committed `*.bundle.js` files. Types are checked from JSDoc annotations with `tsc --noEmit`.
- **Sandboxed previews.** Untrusted HTML/JS from a link never runs on the main origin (see next section).

### How the preview sandbox works

Previews execute on a `sandbox-<hash>.linkify.ink` subdomain backed by the Cloudflare Worker, with files served by a service worker inside the sandbox. Being a different origin, a preview's scripts can't touch the editor, its storage, or anything else on linkify.ink.

The subdomain is named after a hash of the previewed files. That hash is salted per browser, so nobody else can match a hostname to a link. As a result, storage persists per app: opening the same app again lands on the same origin and finds its `localStorage` and IndexedDB where it left them. Only those exact files can run there, so no other link can reach that storage, and changing a single byte of the app moves it to a new origin with empty storage.

**Browser notes:** Safari refuses service workers in a cross-origin frame, which the sandbox is. There the loader renders the files from `blob:` URLs it creates itself instead. It's the same sandbox origin with the same isolation, but references made from inside a stylesheet or a JS module can't be resolved.

## Browser extension

`extension/` holds a Chrome extension that snapshots the page you're reading, either just the article or the full page, and turns it into a link for sharing. Build and install instructions and details are in [`extension/README.md`](extension/README.md).

## Development

Requires Node.js 22 (what CI uses).

```sh
npm install
npm start                # local dev server
npm test                 # Playwright end-to-end tests
npm run typecheck        # type-check JSDoc annotations
npm run lint             # oxlint
npm run bundle-libs      # rebuild the vendored bundles after changing deps
npm run build:extension  # rebuild bundles + assemble extension/vendor/
```

Before the first `npm test`, install the browser with `npx playwright install chromium`.

`extension/vendor/` is gitignored and assembled by `build-extension.mjs`. `npm run typecheck` covers `extension/` and needs it in place, which is why CI builds it first.

## License

MIT, see [LICENSE](LICENSE).

## AI disclosure

This project was built with heavy use of AI tools, mostly Claude.  
You could even say it was "vibe coded", as I haven't actually read all of the code.  
Take that as you will.
