import { h } from '../libraries.bundle.js';
import { useState, useEffect } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';
import { guessType, isTextFile, isImageFile } from '../lib/filetypes.js';

const html = htm.bind(h);

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * @param {{
 *   file: FileEntry | null,
 *   onChange: (content: Uint8Array) => void,
 *   onReplace?: (file: FileEntry) => void,
 * }} props
 */
export default function Editor({ file, onChange, onReplace }) {
	if (!file) {
		return html`
			<div class="panel editor-panel">
				<div class="panel-header"><${Icon} name="code" /> editor</div>
				<div class="editor-body editor-empty">
					<p>Add a file to start editing.</p>
				</div>
			</div>
		`;
	}

	if (isImageFile(file)) {
		return html`<${ImageViewer} file=${file} onReplace=${onReplace} />`;
	}

	const isText = isTextFile(file);
	const text = isText ? new TextDecoder().decode(file.content) : '';

	/** @param {Event} e */
	function handleInput(e) {
		const value = /** @type {HTMLTextAreaElement} */ (e.target).value;
		onChange(new TextEncoder().encode(value));
	}

	return html`
		<div class="panel editor-panel">
			<div class="panel-header"><${Icon} name="code" /> ${file.name}</div>
			<div class="editor-body">
				${isText
					? html`<textarea
							class="editor-textarea"
							value=${text}
							onInput=${handleInput}
							spellcheck=${false}
						></textarea>`
					: html`<div class="editor-binary-notice">
							Binary file — not editable as text
						</div>`}
			</div>
		</div>
	`;
}

/**
 * @param {{
 *   file: FileEntry,
 *   onReplace?: (file: FileEntry) => void,
 * }} props
 */
function ImageViewer({ file, onReplace }) {
	const [blobUrl, setBlobUrl] = useState('');
	const [converting, setConverting] = useState(false);
	const [avifSupported, setAvifSupported] = useState(false);

	useEffect(() => {
		// Feature-detect AVIF encoding support
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		canvas.toBlob((blob) => setAvifSupported(!!blob), 'image/avif');
	}, []);

	useEffect(() => {
		if (!file.content.length) return;
		const type = file.type || guessType(file.name, 'image/png');
		const url = URL.createObjectURL(new Blob([file.content], { type }));
		setBlobUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [file.content, file.type]);

	/** @param {string} format */
	async function convert(format) {
		if (!onReplace) return;
		setConverting(true);
		try {
			const result = await recompress(file, format);
			if (result) onReplace(result);
		} finally {
			setConverting(false);
		}
	}

	return html`
		<div class="panel editor-panel">
			<div class="panel-header"><${Icon} name="image" /> ${file.name}</div>
			<div class="editor-image-viewer">
				${blobUrl &&
				html`<img src=${blobUrl} alt=${file.name} class="editor-image" />`}
				${onReplace &&
				html`
					<div class="editor-image-actions">
						<span class="editor-image-hint"
							>Lossy recompression (renames file):</span
						>
						<button
							class="btn"
							onClick=${() => convert('image/webp')}
							disabled=${converting}
						>
							${converting ? 'Converting…' : 'Convert to WebP'}
						</button>
						${avifSupported &&
						html`
							<button
								class="btn"
								onClick=${() => convert('image/avif')}
								disabled=${converting}
							>
								Convert to AVIF
							</button>
						`}
					</div>
				`}
			</div>
		</div>
	`;
}

/**
 * Recompress an image to WebP or AVIF via canvas.toBlob().
 * @param {FileEntry} file
 * @param {string} format  'image/webp' | 'image/avif'
 * @returns {Promise<FileEntry | null>}
 */
async function recompress(file, format) {
	return new Promise((resolve) => {
		const type = file.type || guessType(file.name, 'image/png');
		const blob = new Blob([file.content], { type });
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				URL.revokeObjectURL(url);
				resolve(null);
				return;
			}
			ctx.drawImage(img, 0, 0);
			canvas.toBlob(
				(result) => {
					URL.revokeObjectURL(url);
					if (!result) {
						resolve(null);
						return;
					}
					const ext = format === 'image/avif' ? 'avif' : 'webp';
					const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
					const reader = new FileReader();
					reader.onload = () => {
						resolve({
							name,
							type: format,
							content: new Uint8Array(
								/** @type {ArrayBuffer} */ (reader.result),
							),
						});
					};
					reader.readAsArrayBuffer(result);
				},
				format,
				0.85,
			);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};
		img.src = url;
	});
}
