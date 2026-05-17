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

### UI
- [x] Rewrote `index.html` — minimal app shell, mounts `#app`, imports `app.js`
- [x] Rewrote `styles.css` — full design system (CSS variables, dark/light via `color-scheme`, grid layout)
- [x] `app.js` — root Preact component, client-side routing (`/`, `/receive`, `/about`), auto-redirects to `/receive` when hash payload detected on `/`
- [x] `components/FileList.js` — sidebar file list with add (file picker), delete, active highlight, file-type icons
- [x] `components/Editor.js` — textarea editor, text/binary detection, decode `Uint8Array` → text for display
- [x] `components/Preview.js` — iframe preview with blob URLs; handles HTML, markdown (via `marked`), images, plain text
- [x] `components/ShareModal.js` — encryption chooser (none / password), calls `codec.encode()`, copy/open URL
- [x] `components/ReceivePage.js` — decrypts and shows received files, download all, open in editor (via sessionStorage handoff)
- [x] `components/AboutPage.js` — static about page
- [x] `components/EditorPage.js` — three-panel layout (sidebar + editor + preview), drag-to-resize divider, Cmd/Ctrl+Shift+S shortcut, `beforeunload` warning, loads files from sessionStorage if redirected from `/receive`
- [x] `sandbox-loader.html` — stub for sandboxed iframe preview on `*.sandbox.linkify.ink`

---

## Left To Do

### Correctness / bugs to verify
- [ ] Test encode/decode round-trip in browser (zstd init is async, verify it runs before first encode)
- [ ] Test password encryption round-trip end-to-end
- [ ] Verify `argon2-browser` works correctly in browser (the WASM bundle was inlined as dataurl — test it loads)
- [ ] Verify `ReceivePage` auto-detects unencrypted payloads and decodes immediately without showing password prompt
- [ ] Fix potential issue: ECDH encryption stores 65-byte ephemeral public key but the plan diagram says 32 bytes — confirm correct byte layout in codec

### Features not yet implemented
- [ ] Image conversion to WebP/AVIF via `canvas.toBlob()` when an image file is edited/added (plan: "replace file.content and file.name")
- [ ] ECDH encryption UI in `ShareModal` (UI only has none/password; ECDH logic exists in codec but no UI)
- [ ] `/receive` route: ECDH decryption (needs private key input — likely out of scope for MVP)
- [ ] Sidebar collapse button — CSS class toggling is wired but the collapsed sidebar still takes space; `grid-template-columns: 0 1fr` needs CSS to hide overflow

### Deployment / infrastructure
- [ ] Cloudflare Worker for `*.sandbox.linkify.ink` — serves `sandbox-loader.html` + a service worker (`sandbox-sw.js`) that intercepts fetches and serves the file payload via `postMessage`
- [ ] `sandbox-sw.js` — service worker for the sandbox iframe (intercepts fetch, serves files from in-memory map)
- [ ] `wrangler.toml` — Cloudflare Worker config for `*.sandbox.linkify.ink`
- [ ] Wire up `Preview.js` to post files to the sandbox iframe via `postMessage` instead of blob URLs (currently uses blob URLs as fallback)
- [ ] Add `Cross-Origin-Opener-Policy: same-origin` header for service worker support

### Polish / nice-to-haves
- [ ] Proper syntax highlighting in the editor (e.g. CodeMirror or highlight.js)
- [ ] New file creation dialog (currently only supports uploading existing files)
- [ ] Rename file support
- [ ] Mobile layout testing
- [ ] Error boundary around the whole app
- [ ] Loading indicator while zstd/argon2 WASM initialises on first encode
