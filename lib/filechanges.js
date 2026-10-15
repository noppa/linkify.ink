// @ts-check
// File changes a preview asks the editor to make (see the preview API in
// README.md). The preview runs whatever code the files contain, so its request is
// checked here before any of it reaches the editor's files.

import { guessType } from './filetypes.js';

/** @typedef {import('./types.js').FileEntry} FileEntry */

/**
 * File name → new contents, or null to delete the file.
 * @typedef {Map<string, Uint8Array<ArrayBuffer> | null>} FileChanges
 */

/**
 * Names under this prefix are reserved for documents the editor injects into
 * the sandbox (see PREVIEW_ENTRY in components/Preview.js).
 */
const RESERVED_PREFIX = '__linkify_';

/**
 * Check and normalize a preview's `files` object: `{ [name]: contents | null }`,
 * where contents is a string (stored as UTF-8), an ArrayBuffer or a typed array.
 * A leading `/` or `./` is dropped, so names match how the preview fetches them.
 * @param {unknown} files
 * @returns {FileChanges}
 * @throws {Error} describing the first invalid entry
 */
export function parseFileChanges(files) {
	if (typeof files !== 'object' || files === null || Array.isArray(files)) {
		throw new Error('files must be an object of { [name]: contents | null }');
	}
	/** @type {FileChanges} */
	const changes = new Map();
	for (const [rawName, value] of Object.entries(files)) {
		const name = rawName.replace(/^\.?\/+/, '');
		if (!name || name.split('/').some((part) => part === '' || part === '.' || part === '..')) {
			throw new Error(`invalid file name: ${JSON.stringify(rawName)}`);
		}
		if (name.startsWith(RESERVED_PREFIX)) {
			throw new Error(`file names starting with ${RESERVED_PREFIX} are reserved`);
		}
		changes.set(name, toBytes(name, value));
	}
	return changes;
}

/**
 * @param {string} name
 * @param {unknown} value
 * @returns {Uint8Array<ArrayBuffer> | null}
 */
function toBytes(name, value) {
	if (value === null) return null;
	if (typeof value === 'string') return new TextEncoder().encode(value);
	// Copied, so the editor never holds a buffer the sender could still change.
	if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
	if (ArrayBuffer.isView(value)) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
	}
	throw new Error(
		`contents of ${name} must be a string, an ArrayBuffer, a typed array or null`,
	);
}

/**
 * Apply `changes` to `files`: changed files keep their place in the list, new
 * ones are added at the end, and deleting a file that doesn't exist does
 * nothing.
 * @param {FileEntry[]} files
 * @param {FileChanges} changes
 * @returns {FileEntry[]}
 */
export function applyFileChanges(files, changes) {
	/** @type {FileEntry[]} */
	const next = [];
	for (const file of files) {
		if (!changes.has(file.name)) {
			next.push(file);
			continue;
		}
		const content = changes.get(file.name);
		if (content) next.push({ ...file, content });
	}
	const existing = new Set(files.map((f) => f.name));
	for (const [name, content] of changes) {
		if (content && !existing.has(name)) {
			next.push({ name, type: guessType(name), content });
		}
	}
	return next;
}
