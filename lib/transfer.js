// @ts-check
// In-memory transfer slot for passing received files to the editor without a page reload.

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

/** @type {FileEntry[] | null} */
let pending = null;

/** @param {FileEntry[]} files */
export function setPendingFiles(files) {
	pending = files;
}

/** @returns {FileEntry[] | null} */
export function takePendingFiles() {
	const files = pending;
	pending = null;
	return files;
}
