// @ts-check
import { h } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';

const html = htm.bind(h);

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

/**
 * @param {{
 *   file: FileEntry | null,
 *   onChange: (content: Uint8Array) => void,
 * }} props
 */
export default function Editor({ file, onChange }) {
	if (!file) {
		return html`
			<div class="panel editor-panel">
				<div class="panel-header">
					<i class="ti ti-code"></i> editor
				</div>
				<div class="editor-body">
					<textarea class="editor-textarea" placeholder="No file selected" disabled></textarea>
				</div>
			</div>
		`;
	}

	const isText = isTextFile(file);
	const text = isText ? new TextDecoder().decode(file.content) : '';

	function handleInput(e) {
		const value = /** @type {HTMLTextAreaElement} */ (e.target).value;
		onChange(new TextEncoder().encode(value));
	}

	return html`
		<div class="panel editor-panel">
			<div class="panel-header">
				<i class="ti ti-code"></i> ${file.name}
			</div>
			<div class="editor-body">
				${isText
					? html`<textarea
							class="editor-textarea"
							value=${text}
							onInput=${handleInput}
							spellcheck=${false}
						></textarea>`
					: html`<div class="editor-binary-notice">Binary file — not editable as text</div>`
				}
			</div>
		</div>
	`;
}

/** @param {FileEntry} file */
function isTextFile(file) {
	if (file.type.startsWith('text/')) return true;
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	return ['html', 'htm', 'css', 'js', 'mjs', 'ts', 'json', 'md', 'txt', 'svg', 'xml'].includes(ext);
}
