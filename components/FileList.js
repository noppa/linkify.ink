// @ts-check
import { h, Fragment } from '../libraries.bundle.js';
import { useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';

const html = htm.bind(h);

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

/**
 * @param {{
 *   files: FileEntry[],
 *   activeIndex: number,
 *   onSelect: (i: number) => void,
 *   onAdd: (files: FileEntry[]) => void,
 *   onDelete: (i: number) => void,
 *   collapsed: boolean,
 *   onToggleCollapse: () => void,
 * }} props
 */
export default function FileList({ files, activeIndex, onSelect, onAdd, onDelete, collapsed, onToggleCollapse }) {
	const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

	function handleFileInput(e) {
		const input = /** @type {HTMLInputElement} */ (e.target);
		if (!input.files) return;
		const newFiles = Array.from(input.files).map((f) => {
			return new Promise((resolve) => {
				const reader = new FileReader();
				reader.onload = () => {
					resolve({
						name: f.name,
						type: f.type || 'application/octet-stream',
						content: new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)),
					});
				};
				reader.readAsArrayBuffer(f);
			});
		});
		Promise.all(newFiles).then((entries) => {
			onAdd(/** @type {FileEntry[]} */ (entries));
			input.value = '';
		});
	}

	function iconForFile(name) {
		const ext = name.split('.').pop()?.toLowerCase() ?? '';
		if (ext === 'html' || ext === 'htm') return 'ti-file-type-html';
		if (ext === 'js' || ext === 'mjs') return 'ti-file-type-js';
		if (ext === 'css') return 'ti-file-type-css';
		if (ext === 'ts') return 'ti-file-type-ts';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'ti-photo';
		if (ext === 'md') return 'ti-markdown';
		return 'ti-file';
	}

	return html`
		<aside class="sidebar ${collapsed ? 'collapsed' : ''}">
			<div class="sidebar-header">
				Files
				<button class="btn btn-icon" aria-label="Toggle sidebar" onClick=${onToggleCollapse}>
					<i class="ti ${collapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'}"></i>
				</button>
			</div>
			<ul class="file-list">
				${files.map((f, i) => html`
					<li
						key=${f.name}
						class="file-item ${i === activeIndex ? 'active' : ''}"
						onClick=${() => onSelect(i)}
					>
						<i class="ti ${iconForFile(f.name)}"></i>
						<span class="file-item-name">${f.name}</span>
						<button
							class="file-item-delete"
							aria-label="Delete file"
							onClick=${(e) => { e.stopPropagation(); onDelete(i); }}
						>
							<i class="ti ti-x"></i>
						</button>
					</li>
				`)}
			</ul>
			<div class="add-file">
				<button class="add-file-btn" onClick=${() => inputRef.current?.click()}>
					<i class="ti ti-plus"></i> add file
				</button>
				<input
					ref=${inputRef}
					type="file"
					multiple
					class="file-input-hidden"
					onChange=${handleFileInput}
				/>
			</div>
		</aside>
	`;
}
