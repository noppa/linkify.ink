// Vendored dependency for the browser extension's page capture: Mozilla's
// Readability, the same article extractor Firefox Reader Mode uses. Bundled into
// vendor.readability.bundle.js.
//
// This bundle is only ever loaded by the extension's content script, where a real
// document exists — Readability walks and mutates a DOM, so unlike the codec it
// cannot run in a worker or in Node without one. It is deliberately kept out of
// both libraries.bundle.js and vendor.codec.bundle.js so neither the site nor a
// link-reading script pays for an extractor they never call.
//
// `isProbablyReaderable` is the cheap pre-check: it estimates whether a page has
// an extractable article at all, so the extension can say "this doesn't look like
// an article" instead of producing an empty capture.
export { Readability, isProbablyReaderable } from '@mozilla/readability';
