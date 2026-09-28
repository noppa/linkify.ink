// Unlike the other bundles this one is built as an IIFE, not an ES module:
// chrome.scripting.executeScript injects classic scripts, so the content script
// reaches Readability through a global rather than an import.
import type * as Readability from './vendor.readability.js';

declare global {
	const LinkifyReadability: typeof Readability;
}

export {};
