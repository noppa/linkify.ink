// @ts-check
import { h, Fragment } from '../libraries.bundle.js';
import { useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';

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
		if (['html', 'htm', 'js', 'mjs', 'css', 'ts'].includes(ext)) return 'file-code';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
		if (ext === 'md') return 'markdown';
		return 'file';
	}

	return html`
		<aside class="sidebar ${collapsed ? 'collapsed' : ''}">
			<div class="sidebar-header">
				<span class="sidebar-title">Files</span>
				<button class="btn btn-icon" aria-label="Toggle sidebar" onClick=${onToggleCollapse}>
					<${Icon} name=${collapsed ? 'sidebar-expand' : 'sidebar-collapse'} />
				</button>
			</div>
			<ul class="file-list">
				${files.map((f, i) => html`
					<li
						key=${f.name}
						class="file-item ${i === activeIndex ? 'active' : ''}"
						onClick=${() => onSelect(i)}
					>
						<${Icon} name=${iconForFile(f.name)} />
						<span class="file-item-name">${f.name}</span>
						<button
							class="file-item-delete"
							aria-label="Delete file"
							onClick=${(e) => { e.stopPropagation(); onDelete(i); }}
						>
							<${Icon} name="x" />
						</button>
					</li>
				`)}
			</ul>
			<div class="add-file">
				<button class="add-file-btn" onClick=${() => inputRef.current?.click()}>
					<${Icon} name="plus" /> add file
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
