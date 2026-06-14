// @ts-check
// Shared type definitions used across components.

/**
 * A file in the editor / received set. `content` is always backed by a plain
 * ArrayBuffer (never a SharedArrayBuffer), so it can be handed straight to
 * Blob / WebCrypto without casting.
 * @typedef {{ name: string, type: string, content: Uint8Array<ArrayBuffer> }} FileEntry
 */

export {};
