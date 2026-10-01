import { h } from '../vendor/vendor.ui.bundle.js';
import { useState, useEffect, useRef } from '../vendor/vendor.ui.bundle.js';
import { htm } from '../vendor/vendor.ui.bundle.js';
import Icon from '../lib/icons.js';
import DebouncedTextarea from './DebouncedTextarea.js';
import { guessType, isTextFile, isImageFile, isCodeFile } from '../lib/filetypes.js';

const html = htm.bind(h);

// Each press shrinks the image to 75% of its current size.
const DOWNSCALE_FACTOR = 0.75;
// Stop offering downscale once either dimension would drop to/below this.
const MIN_DIMENSION = 16;

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * Every text file opened so far keeps its own textarea mounted (hidden while
 * another file is active), so the browser's native undo history survives
 * switching between files.
 *
 * @param {{
 *   files: FileEntry[],
 *   activeIndex: number,
 *   onChange: (index: number, content: Uint8Array) => void,
 *   onReplace?: (index: number, file: FileEntry) => void,
 * }} props
 */
export default function Editor({ files, activeIndex, onChange, onReplace }) {
	// Names of text files opened at least once. Deleted files drop out on their
	// own because we only render names still present in `files`.
	const openedRef = useRef(/** @type {Set<string>} */ (new Set()));
	const file = files[activeIndex] ?? null;
	const isText = !!file && isTextFile(file);
	if (file && isText) openedRef.current.add(file.name);

	const textareas = files.map((f, index) =>
		openedRef.current.has(f.name) && isTextFile(f)
			? html`<${DebouncedTextarea}
					key=${f.name}
					file=${f}
					hidden=${index !== activeIndex}
					onChange=${(content) => onChange(index, content)}
					syntaxHighlighted=${isCodeFile(f)}
				/>`
			: null,
	);

	let header = html`<${Icon} name="code" /> editor`;
	let content = null;
	if (!file) {
		content = html`<div class="editor-body editor-empty">
			<p>Add a file to start editing.</p>
		</div>`;
	} else if (isImageFile(file)) {
		header = html`<${Icon} name="image" /> ${file.name}`;
		content = html`<${ImageViewer}
			file=${file}
			onReplace=${onReplace && ((newFile) => onReplace(activeIndex, newFile))}
		/>`;
	} else {
		header = html`<${Icon} name="code" /> ${file.name}`;
		if (!isText) {
			content = html`<div class="editor-body">
				<div class="editor-binary-notice">
					Binary file — not editable as text
				</div>
			</div>`;
		}
	}

	return html`
		<div class="panel editor-panel">
			<div class="panel-header">${header}</div>
			${content}
			<div class="editor-body" hidden=${!isText}>${textareas}</div>
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
	const [processing, setProcessing] = useState(false);
	const [convertFailed, setConvertFailed] = useState(false);
	const [dims, setDims] = useState(/** @type {{width: number, height: number} | null} */ (null));
	// Current size relative to `original`, compounded across downscales.
	const [scale, setScale] = useState(1);
	// The pristine version of this image, kept only in local component state.
	const [original, setOriginal] = useState(file);
	// Tracks the FileEntry we most recently produced ourselves, so the effect
	// below can tell "we replaced the file" apart from "a different file was
	// selected" and only reset `original` in the latter case.
	const producedRef = useRef(/** @type {FileEntry | null} */ (null));

	useEffect(() => {
		if (file !== producedRef.current) {
			setOriginal(file);
			setDims(null);
			setScale(1);
			setConvertFailed(false);
		}
		producedRef.current = null;
	}, [file]);

	useEffect(() => {
		if (!file.content.length) return;
		const type = file.type || guessType(file.name, 'image/png');
		const url = URL.createObjectURL(new Blob([file.content], { type }));
		setBlobUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [file.content, file.type]);

	/** @param {FileEntry} newFile */
	function apply(newFile) {
		producedRef.current = newFile;
		if (onReplace) onReplace(newFile);
	}

	async function convertToWebp() {
		if (!onReplace) return;
		setProcessing(true);
		try {
			const result = await transformImage(file, { format: 'image/webp' });
			// Browsers that can't encode WebP (older Safari) silently return a
			// PNG, which is lossless and usually larger; discard it.
			if (result?.type === 'image/webp') apply(result);
			else if (result) setConvertFailed(true);
		} finally {
			setProcessing(false);
		}
	}

	async function downscale() {
		if (!onReplace) return;
		setProcessing(true);
		try {
			const result = await transformImage(file, { scale: DOWNSCALE_FACTOR });
			if (result) {
				apply(result);
				setScale((s) => s * DOWNSCALE_FACTOR);
			}
		} finally {
			setProcessing(false);
		}
	}

	function restoreOriginal() {
		if (!onReplace || file === original) return;
		apply(original);
		setScale(1);
	}

	const canDownscale =
		!dims || Math.min(dims.width, dims.height) * DOWNSCALE_FACTOR > MIN_DIMENSION;
	const canRestore = file !== original;
	// Uploads without a MIME type are stored as application/octet-stream; use the
	// filename in that case so a .webp still hides its own conversion action.
	const sourceType = file.type.startsWith('image/')
		? file.type
		: guessType(file.name, 'image/png');
	const canConvertToWebp = sourceType !== 'image/webp';

	return html`
		<div class="editor-image-viewer">
			${blobUrl &&
			html`<img
				src=${blobUrl}
				alt=${file.name}
				class="editor-image"
				onLoad=${(e) =>
					setDims({
						width: e.target.naturalWidth,
						height: e.target.naturalHeight,
					})}
			/>`}
			${onReplace &&
			html`
				<div class="editor-image-actions">
					<button
						class="btn"
						onClick=${downscale}
						disabled=${processing || !canDownscale}
						title="Shrink the image to 75% of its current size"
					>
						${processing ? 'Working…' : 'Downscale'}
					</button>
					${scale < 1 &&
					html`<span
						class="editor-image-hint"
						title=${`Downscaled to ${Math.round(scale * 100)}% of the original`}
						>${Math.round(scale * 100)}%</span
					>`}
					<button
						class="btn"
						onClick=${restoreOriginal}
						disabled=${processing || !canRestore}
						title="Restore the image as it was before any edits"
					>
						Restore original
					</button>
					${canConvertToWebp &&
					html`
						<button
							class="btn"
							onClick=${convertToWebp}
							disabled=${processing || convertFailed}
							title=${convertFailed
								? "This browser can't encode WebP images"
								: undefined}
						>
							Convert to WebP
						</button>
					`}
				</div>
			`}
		</div>
	`;
}

// MIME types canvas.toBlob() can lossily re-encode; others (png, gif, ...) are lossless.
const LOSSY_TYPES = new Set(['image/jpeg', 'image/webp', 'image/avif']);

/**
 * Re-encode an image via canvas.toBlob(), optionally converting format and/or
 * scaling its dimensions.
 * @param {FileEntry} file
 * @param {{ format?: string, scale?: number }} options
 * @returns {Promise<FileEntry | null>}
 */
async function transformImage(file, { format, scale = 1 } = {}) {
	return new Promise((resolve) => {
		const sourceType = file.type || guessType(file.name, 'image/png');
		const targetType = format || sourceType;
		const blob = new Blob([file.content], { type: sourceType });
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
			canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				URL.revokeObjectURL(url);
				resolve(null);
				return;
			}
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			canvas.toBlob(
				(result) => {
					URL.revokeObjectURL(url);
					if (!result) {
						resolve(null);
						return;
					}
					// Some browsers silently fall back to PNG for formats they can't
					// encode (e.g. gif); trust what toBlob() actually produced.
					const actualType = result.type || targetType;
					const reader = new FileReader();
					reader.onload = () => {
						resolve({
							name: renameForType(file.name, sourceType, actualType),
							type: actualType,
							content: new Uint8Array(
								/** @type {ArrayBuffer} */ (reader.result),
							),
						});
					};
					reader.readAsArrayBuffer(result);
				},
				targetType,
				LOSSY_TYPES.has(targetType) ? 0.85 : undefined,
			);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};
		img.src = url;
	});
}

/** @param {string} name @param {string} fromType @param {string} toType @returns {string} */
function renameForType(name, fromType, toType) {
	if (toType === fromType) return name;
	const ext = toType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
	return name.replace(/\.[^.]+$/, '') + '.' + ext;
}
