// @ts-check
import { pack } from './tar.js';

/**
 * Download one file directly, or multiple files packed into a tar archive.
 * @param {{ name: string, content: Uint8Array, type: string }[]} files
 */
export function downloadFiles(files) {
	if (files.length === 0) return;
	if (files.length === 1) {
		const f = files[0];
		triggerDownload(new Blob([f.content], { type: f.type }), f.name);
	} else {
		const tar = pack(files.map((f) => ({ name: f.name, data: f.content })));
		triggerDownload(
			new Blob([tar], { type: 'application/x-tar' }),
			'files.tar',
		);
	}
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
	URL.revokeObjectURL(a.href);
}
