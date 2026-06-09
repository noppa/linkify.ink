# linkify.ink — Implementation Progress

## Plan Summary

A browser-based file-sharing tool. Users create/edit files in a code editor, pack them into a
compressed + optionally encrypted binary payload, encode it as a URL hash, and share it.
Recipients open the URL and files are decoded/decrypted entirely client-side.

**Tech stack:** Preact + htm, esbuild (vendor bundle), TypeScript type-check only, zstd
compression, Argon2id + AES-GCM encryption, WebCrypto API.

---

## Done

### Foundation
- [x] Created `implement-plan` branch
- [x] Installed npm deps: `esbuild`, `@bokuweb/zstd-wasm`, `argon2-browser`, `marked`, `preact`, `htm`
- [x] Created `libraries.js` esbuild entrypoint (re-exports all npm deps)
- [x] Built and committed `libraries.bundle.js` vendor bundle
- [x] Updated `package.json` scripts (`bundle-libs`, `typecheck`, `lint`)
- [x] Updated `jsconfig.json` to cover all source JS files with strict type checking

### Binary format / lib files
- [x] `lib/base64url.js` — `encode(Uint8Array): string` / `decode(string): Uint8Array`
- [x] `lib/tar.js` — minimal ustar tar `pack()` / `unpack()` (no dependencies)
- [x] `lib/compress.js` — zstd `init()` / `compress()` / `decompress()` via `@bokuweb/zstd-wasm`
- [x] `lib/crypto.js` — `argon2Derive`, `aesEncrypt/Decrypt`, `generateEcdhKeypair`, `ecdhDerive`, `exportPublicKey/importPublicKey` via WebCrypto + argon2-browser
- [x] `lib/codec.js` — `encode(files, options): Promise<string>` / `decode(hash, options): Promise<{files, metadata}>` implementing the full binary format (none / password / ECDH encryption)
- [x] Fixed `codec.js` empty-metadata decode bug (`metaLen === 0` → return `{}` instead of `JSON.parse("")`)
- [x] Fixed `codec.js` file mapping bug — `ShareModal` now maps `content` → `data` before calling `encode()`

### UI
- [x] Rewrote `index.html` — minimal app shell, mounts `#app`, imports `app.js`
- [x] Rewrote `styles.css` — full design system (CSS variables, dark/light via `color-scheme`, grid layout)
- [x] `app.js` — root Preact component, client-side routing (`/`, `/receive`, `/about`), auto-redirects to `/receive` when hash payload detected on `/`
- [x] `components/FileList.js` — sidebar file list with add (file picker), delete, active highlight, file-type icons
- [x] `components/Editor.js` — textarea editor, text/binary detection, decode `Uint8Array` → text for display; **image viewer** with WebP/AVIF recompression via `canvas.toBlob()`
- [x] `components/Preview.js` — sandbox iframe on `linkify.ink` origin (postMessage protocol); blob-URL fallback for local dev; markdown, images, plain text, HTML all handled
- [x] `components/ShareModal.js` — encryption chooser (none / password / **ECDH**), calls `codec.encode()`, copy/open URL, URL length warning
- [x] `components/ReceivePage.js` — generates ephemeral ECDH keypair on mount, displays public key for sender, decrypts received files (none / password / ECDH), download all, open in editor
- [x] `components/AboutPage.js` — static about page
- [x] `components/EditorPage.js` — three-panel layout, drag-to-resize divider, Cmd/Ctrl+Shift+S shortcut, `beforeunload` warning, loads files from sessionStorage if redirected from `/receive`
- [x] Sidebar collapse — keeps 28px strip visible so expand button is always reachable
- [x] `sandbox-loader.html` — registers `sandbox-sw.js`, waits for SW to control page, tells parent "ready", forwards file map to SW, navigates to entry file once SW confirms
- [x] `sandbox-sw.js` — service worker: stores file map in memory, intercepts fetch, serves files with correct MIME type, returns 404 for unknown paths

### Deployment
- [x] `sandbox-worker.js` — Cloudflare Worker serving sandbox-loader.html + sandbox-sw.js for all `*.sandbox.linkify.ink` requests (with `Cross-Origin-Opener-Policy: same-origin`)
- [x] `wrangler.toml` — Cloudflare Worker config for `*.sandbox.linkify.ink` wildcard route

---

## Left To Do

### Correctness / testing (can't verify without a real browser)
- [ ] Test encode/decode round-trip in browser (zstd init is async, verify it runs before first encode)
- [ ] Test password encryption round-trip end-to-end
- [ ] Verify `argon2-browser` WASM initialises correctly in browser
- [ ] Smoke-test ECDH share → receive flow end-to-end
- [ ] Test sandbox iframe preview with a multi-file HTML project (HTML + CSS + JS)

### Features / polish
- [x] New file creation dialog (currently only supports uploading existing files via file picker)
- [x] Rename file support
- [ ] Error boundary around the whole app
- [ ] Loading indicator while zstd/argon2 WASM initialises on first encode
- [ ] Drag-and-drop file upload onto the editor area
- [ ] Accessible labels audit (icon-only buttons)
- [ ] Mobile layout testing

### Deployment / infrastructure
- [ ] Deploy `sandbox-worker.js` via `wrangler publish` and test wildcard subdomain routing
- [ ] Configure Cloudflare Pages for the main `linkify.ink` static site
- [ ] Verify `Cross-Origin-Opener-Policy` header is set correctly for service worker support
