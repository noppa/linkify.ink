// Vendored dependencies for the linkify.ink codec (compression + crypto). Bundled
// into vendor.codec.bundle.js. This is the only vendor bundle the lib
// (linkify.ink.js) needs — the UI's rendering deps live in vendor.ui.bundle.js.
// Anything that only wants to create/read links (an AI agent, a CLI tool) imports
// this bundle plus linkify.ink.js and needs nothing else:
//
//   import { linkifyInkCodecDependencies } from './vendor.codec.bundle.js';
//   import { LinkifyInk } from './linkify.ink.js';
//   const linkify = new LinkifyInk(linkifyInkCodecDependencies);
//
// The individual exports are kept for callers that want to swap one dependency
// out; `linkifyInkCodecDependencies` is the ready-made bundle to hand straight to
// the constructor.
// Must stay the first import: it patches the environment the vendor modules read
// as they evaluate. See vendor.codec.shim.js.
import './vendor.codec.shim.js';
import * as ZstdWasm from '../node_modules/@bokuweb/zstd-wasm/dist/esm/index.web';
// @ts-ignore
import zstdWasmBase64DataUrl from '../node_modules/@bokuweb/zstd-wasm/dist/web/zstd.wasm';
import * as Argon2 from 'argon2-browser';
// @ts-ignore
import argon2WasmBase64DataUrl from '../node_modules/argon2-browser/dist/argon2.wasm';
// The shared zstd dictionary links are compressed with, keyed by the link format
// version that uses it. Committed and frozen: see dictionaries/README.md.
// @ts-ignore
import zstdDictionaryV2DataUrl from '../dictionaries/v2.dict.zst';

export { ZstdWasm, zstdWasmBase64DataUrl, Argon2, argon2WasmBase64DataUrl };

/**
 * Every dependency `LinkifyInk` needs, in the shape its constructor expects.
 * Spread it to add or override fields, e.g.
 * `{ ...linkifyInkCodecDependencies, origin }`.
 */
export const linkifyInkCodecDependencies = {
	zstd: ZstdWasm,
	zstdWasmUrl: zstdWasmBase64DataUrl,
	argon2: Argon2,
	argon2WasmUrl: argon2WasmBase64DataUrl,
	zstdDictionaryUrls: { 2: zstdDictionaryV2DataUrl },
};
