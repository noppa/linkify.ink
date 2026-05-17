// @ts-check
import { h } from '../libraries.bundle.js';
import { useEffect, useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import { marked } from '../libraries.bundle.js';

const html = htm.bind(h);

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

const SANDBOX_ORIGIN = null; // set to sandbox origin when deployed; null = blob URL fallback

/**
 * @param {{
 *   files: FileEntry[],
 *   activeFile: FileEntry | null,
 * }} props
 */
export default function Preview({ files, activeFile }) {
	const iframeRef = useRef(/** @type {HTMLIFrameElement | null} */ (null));
	const blobUrlRef = useRef(/** @type {string | null} */ (null));

	useEffect(() => {
		if (!activeFile) return;
		const iframe = iframeRef.current;
		if (!iframe) return;

		// Clean up previous blob URL
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
		}

		const ext = activeFile.name.split('.').pop()?.toLowerCase() ?? '';

		if (ext === 'md') {
			// Render markdown
			const mdText = new TextDecoder().decode(activeFile.content);
			const rendered = /** @type {string} */ (marked.parse(mdText));
			const blob = new Blob([rendered], { type: 'text/html' });
			const url = URL.createObjectURL(blob);
			blobUrlRef.current = url;
			iframe.src = url;
		} else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) {
			const type = activeFile.type || `image/${ext}`;
			const blob = new Blob([activeFile.content], { type });
			const url = URL.createObjectURL(blob);
			blobUrlRef.current = url;
			iframe.src = url;
		} else if (ext === 'html' || ext === 'htm') {
			// Build a virtual filesystem from all files using blob URLs + srcdoc
			const html = buildHtmlPreview(files, activeFile);
			const blob = new Blob([html], { type: 'text/html' });
			const url = URL.createObjectURL(blob);
			blobUrlRef.current = url;
			iframe.src = url;
		} else {
			// Plain text
			const text = new TextDecoder().decode(activeFile.content);
			const blob = new Blob([`<pre style="margin:0;padding:10px;font-family:monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`], { type: 'text/html' });
			const url = URL.createObjectURL(blob);
			blobUrlRef.current = url;
			iframe.src = url;
		}

		return () => {
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
	}, [activeFile, files]);

	return html`
		<div class="panel preview-panel">
			<div class="panel-header">
				<i class="ti ti-eye"></i> preview${activeFile ? ` — ${activeFile.name}` : ''}
			</div>
			<iframe
				ref=${iframeRef}
				class="preview-iframe"
				sandbox="allow-scripts allow-same-origin"
				title="File preview"
			></iframe>
		</div>
	`;
}

/**
 * @param {FileEntry[]} files
 * @param {FileEntry} mainFile
 * @returns {string}
 */
function buildHtmlPreview(files, mainFile) {
	// Inject all sibling files as blob-URL-based resources via a simple base-rewrite trick.
	// For simplicity, serve the raw HTML. Cross-file references won't resolve in blob sandbox,
	// but this is a best-effort preview.
	return new TextDecoder().decode(mainFile.content);
}

/** @param {string} str */
function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
