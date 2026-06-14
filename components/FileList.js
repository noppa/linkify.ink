import { h } from '../libraries.bundle.js';
import { useRef, useState } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';
import { guessType, iconForFile } from '../lib/filetypes.js';

const html = htm.bind(h);

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * @param {{
 *   files: FileEntry[],
 *   activeIndex: number,
 *   onSelect: (i: number) => void,
 *   onAdd: (files: FileEntry[]) => void,
 *   onDelete: (i: number) => void,
 *   onRename: (i: number, newName: string) => void,
 *   collapsed: boolean,
 *   onToggleCollapse: () => void,
 * }} props
 */
export default function FileList({
	files,
	activeIndex,
	onSelect,
	onAdd,
	onDelete,
	onRename,
	collapsed,
	onToggleCollapse,
}) {
	const uploadRef = useRef(/** @type {HTMLInputElement | null} */ (null));

	/** @type {[{ mode: 'rename', index: number, value: string } | { mode: 'create', value: string } | null, Function]} */
	const [editing, setEditing] = useState(null);

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

	function commitEdit() {
		if (!editing) return;
		const name = editing.value.trim();
		if (editing.mode === 'rename') {
			if (name && name !== files[editing.index].name) {
				onRename(editing.index, name);
			}
		} else {
			if (name) {
				// New blank files default to text so they open in the editor, not the binary notice.
				onAdd([
					{
						name,
						type: guessType(name, 'text/plain'),
						content: new Uint8Array(0),
					},
				]);
			}
		}
		setEditing(null);
	}

	function handleEditKey(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitEdit();
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			setEditing(null);
		}
	}

	return html`
		<aside class="sidebar ${collapsed ? 'collapsed' : ''}">
			<div class="sidebar-header">
				<span class="sidebar-title">Files</span>
				<button
					class="btn btn-icon"
					aria-label="Toggle sidebar"
					onClick=${onToggleCollapse}
				>
					<${Icon} name=${collapsed ? 'sidebar-expand' : 'sidebar-collapse'} />
				</button>
			</div>
			<ul class="file-list">
				${files.map((f, i) => {
					const isRenaming = editing?.mode === 'rename' && editing.index === i;
					return html`
						<li
							key=${f.name}
							class="file-item ${i === activeIndex ? 'active' : ''}"
							onClick=${() => !isRenaming && onSelect(i)}
						>
							<${Icon} name=${iconForFile(f.name)} />
							${isRenaming
								? html`<input
										class="file-item-rename-input"
										autofocus
										value=${editing.value}
										onInput=${(e) =>
											setEditing((prev) => ({
												...prev,
												value: e.target.value,
											}))}
										onKeyDown=${handleEditKey}
										onBlur=${commitEdit}
									/>`
								: html`<span
										class="file-item-name"
										onDblClick=${(e) => {
											e.stopPropagation();
											setEditing({ mode: 'rename', index: i, value: f.name });
										}}
										>${f.name}</span
									>`}
							${!isRenaming &&
							html`<button
								class="file-item-action"
								aria-label="Rename file"
								onClick=${(e) => {
									e.stopPropagation();
									setEditing({ mode: 'rename', index: i, value: f.name });
								}}
							>
								<${Icon} name="pencil" />
							</button>`}
							<button
								class="file-item-action"
								aria-label="Delete file"
								onClick=${(e) => {
									e.stopPropagation();
									onDelete(i);
								}}
							>
								<${Icon} name="x" />
							</button>
						</li>
					`;
				})}
				${editing?.mode === 'create' &&
				html`
					<li class="file-item">
						<${Icon} name="file" />
						<input
							class="file-item-rename-input"
							autofocus
							value=${editing.value}
							placeholder="filename.txt"
							onInput=${(e) =>
								setEditing((prev) => ({ ...prev, value: e.target.value }))}
							onKeyDown=${handleEditKey}
							onBlur=${commitEdit}
						/>
					</li>
				`}
			</ul>
			<div class="add-file">
				<button
					class="add-file-btn"
					onClick=${() => setEditing({ mode: 'create', value: '' })}
				>
					<${Icon} name="plus" /> new
				</button>
				<button
					class="add-file-btn"
					onClick=${() => uploadRef.current?.click()}
				>
					<${Icon} name="upload" /> upload
				</button>
				<input
					ref=${uploadRef}
					type="file"
					multiple
					class="file-input-hidden"
					onChange=${handleFileInput}
				/>
			</div>
		</aside>
	`;
}
