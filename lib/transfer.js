// In-memory transfer slot for passing received files to the editor without a page reload.

/** @typedef {import('./types.js').FileEntry} FileEntry */
/** @typedef {import('./types.js').Metadata} Metadata */

/**
 * Metadata rides along with the files rather than being re-read from the link,
 * because the editor never sees the link — ReceivePage decoded it and the hash is
 * already gone from the URL by the time the hand-off happens. Dropping it here
 * would silently re-enable scripts for a capture that asked for `nojs: 1`.
 * @type {{ files: FileEntry[], metadata: Metadata | null } | null}
 */
let pending = null;

/** @param {FileEntry[]} files @param {Metadata | null} [metadata] */
export function setPendingFiles(files, metadata = null) {
	pending = { files, metadata };
}

/** @returns {{ files: FileEntry[], metadata: Metadata | null } | null} */
export function takePendingFiles() {
	const taken = pending;
	pending = null;
	return taken;
}
