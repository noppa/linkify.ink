// Shared types for the extension, plus the globals its three contexts use to
// reach each other. A .d.ts rather than the JSDoc-in-.js style used in lib/, for
// the one thing JSDoc can't express: `declare global`. content/capture.js hangs
// its entry point on the page's globalThis because a classic injected script has
// no exports, and background.js exposes a smoke test for the worker console.

/**
 * What content/capture.js hands back. `html` is the finished article.html —
 * self-contained only when images were embedded; otherwise its `<img>` tags point
 * at the original host. `images` is empty unless embedding was requested, in which
 * case each entry names an archive path the worker still has to fill with bytes.
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
	images: { name: string; url: string }[];
	/** Kept in the markup as absolute URLs, to be fetched when the link is read. */
	linkedImages: number;
	/** Had no usable source (data:/blob:, or an unresolved placeholder). */
	droppedImages: number;
}

export interface CaptureOptions {
	/** 'article' runs Readability; 'full' falls back to the whole body. */
	mode?: 'article' | 'full';
	/** 'link' keeps the original URLs; 'inline' packs the bytes into the link. */
	images?: 'link' | 'inline';
}

declare global {
	/** Temporary cleanup hook installed by the page element picker. */
	var __linkifyInkElementPickerCleanup: (() => void) | undefined;
}

declare global {
	/** Defined by content/capture.js once injected into a page. */
	var __linkifyInkCapture: (options?: CaptureOptions) => Capture;
	/** Defined by background.js; for manual use from the worker's console. */
	var __linkifySmokeTest: () => Promise<string>;
}
