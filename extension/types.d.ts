// Shared types for the extension, plus the globals its contexts use to reach
// each other. A .d.ts rather than the JSDoc-in-.js style used in lib/, for
// the one thing JSDoc can't express: `declare global`. content/capture.js hangs
// its entry point on the page's globalThis because a classic injected script has
// no exports, and background.js exposes a smoke test for the worker console.

/**
 * What content/capture.js hands back. `html` is the finished article.html. Its
 * `<img>` tags (and, in full mode, any `@font-face` sources) point at the
 * original host: a link carries the page, not its media.
 */
export interface Capture {
	html: string;
	title: string;
	byline: string;
	siteName: string;
	excerpt: string;
	textLength: number;
	readerable: boolean;
	mode: 'article' | 'full';
	/** Kept in the markup as absolute URLs, to be fetched when the link is read. */
	linkedImages: number;
	/** Had no usable source (data:/blob:, or an unresolved placeholder). */
	droppedImages: number;
	/** Viewport width a full capture was laid out at, in CSS px; 0 in article mode. */
	width: number;
}

export interface CaptureOptions {
	/** 'article' runs Readability; 'full' rebuilds the rendered page from computed styles. */
	mode?: 'article' | 'full';
}

declare global {
	/** Defined by content/capture.js once injected into a page. */
	var __linkifyInkCapture: (options?: CaptureOptions) => Promise<Capture>;
	/** Defined by background.js; for manual use from the worker's console. */
	var __linkifySmokeTest: () => Promise<string>;
}
