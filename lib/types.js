// @ts-check
// Shared type definitions used across components.

/**
 * A file in the editor / received set. `content` is always backed by a plain
 * ArrayBuffer (never a SharedArrayBuffer), so it can be handed straight to
 * Blob / WebCrypto without casting.
 * @typedef {{ name: string, type: string, content: Uint8Array<ArrayBuffer> }} FileEntry
 */

/**
 * Metadata decoded from a shared link, re-exported from the library so components
 * can name the type without reaching past lib/ for it.
 * @typedef {import('../linkify.ink.js').Metadata} Metadata
 */

export {};
