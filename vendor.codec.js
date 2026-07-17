// Vendored dependencies for the linkify.ink codec (compression + crypto). Bundled
// into vendor.codec.bundle.js. This is the only vendor bundle the lib
// (linkify.ink.js) needs — the UI's rendering deps live in libraries.bundle.js.
// Anything that only wants to create/read links (an AI agent, a CLI tool) imports
// this bundle plus linkify.ink.js and needs nothing else.
export * as ZstdWasm from './node_modules/@bokuweb/zstd-wasm/dist/esm/index.web';
// @ts-ignore
export { default as zstdWasmBase64DataUrl } from './node_modules/@bokuweb/zstd-wasm/dist/web/zstd.wasm';
export * as Argon2 from 'argon2-browser';
// @ts-ignore
export { default as argon2WasmBase64DataUrl } from './node_modules/argon2-browser/dist/argon2.wasm';
