// @ts-check
import { h } from '../libraries.bundle.js';
import { useEffect, useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import { marked } from '../libraries.bundle.js';

const html = htm.bind(h);

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

const HOSTED_ORIGIN = 'linkify.ink';
const SANDBOX_BASE = 'sandbox.linkify.ink';

const isHosted = location.hostname === HOSTED_ORIGIN;

/**
 * @param {{
 *   files: FileEntry[],
 *   activeFile: FileEntry | null,
 * }} props
 */
export default function Preview({ files, activeFile }) {
	const iframeRef = useRef(/** @type {HTMLIFrameElement | null} */ (null));
	const blobUrlRef = useRef(/** @type {string | null} */ (null));
	const sandboxCleanupRef = useRef(/** @type {(() => void) | null} */ (null));

	useEffect(() => {
		if (!activeFile) return;
		const iframe = iframeRef.current;
		if (!iframe) return;

		// Clean up previous blob URL and sandbox listener
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
		}
		if (sandboxCleanupRef.current) {
			sandboxCleanupRef.current();
			sandboxCleanupRef.current = null;
		}

		const ext = activeFile.name.split('.').pop()?.toLowerCase() ?? '';

		if (ext === 'md') {
			const mdText = new TextDecoder().decode(activeFile.content);
			const rendered = /** @type {string} */ (marked.parse(mdText));
			const blob = new Blob([`<html><body style="font-family:sans-serif;padding:16px;max-width:720px">${rendered}</body></html>`], { type: 'text/html' });
			const url = URL.createObjectURL(blob);
			blobUrlRef.current = url;
			iframe.src = url;
		} else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) {
			const type = activeFile.type || `image/${ext === 'svg' ? 'svg+xml' : ext}`;
			const blob = new Blob([/** @type {any} */ (activeFile.content)], { type });
			const url = URL.createObjectURL(blob);
			blobUrlRef.current = url;
			iframe.src = url;
		} else if (ext === 'html' || ext === 'htm') {
			if (isHosted) {
				sandboxCleanupRef.current = setupSandboxIframe(iframe, files, activeFile);
			} else {
				// Blob URL fallback for local dev (relative imports won't resolve)
				const content = new TextDecoder().decode(activeFile.content);
				const blob = new Blob([content], { type: 'text/html' });
				const url = URL.createObjectURL(blob);
				blobUrlRef.current = url;
				iframe.src = url;
			}
		} else {
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
			if (sandboxCleanupRef.current) {
				sandboxCleanupRef.current();
				sandboxCleanupRef.current = null;
			}
		};
	}, [activeFile, files]);

	const isHtml = activeFile
		? ['html', 'htm'].includes(activeFile.name.split('.').pop()?.toLowerCase() ?? '')
		: false;

	return html`
		<div class="panel preview-panel">
			<div class="panel-header">
				<i class="ti ti-eye"></i> preview${activeFile ? ` — ${activeFile.name}` : ''}
			</div>
			${!isHosted && isHtml && html`
				<div class="preview-notice">
					<i class="ti ti-info-circle"></i>
					Full HTML preview (with relative imports) requires the hosted version at linkify.ink.
				</div>
			`}
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
 * Set up a sandboxed iframe using *.sandbox.linkify.ink service worker.
 * Returns a cleanup function.
 * @param {HTMLIFrameElement} iframe
 * @param {FileEntry[]} files
 * @param {FileEntry} mainFile
 * @returns {() => void}
 */
function setupSandboxIframe(iframe, files, mainFile) {
	const uuid = crypto.randomUUID();
	const sandboxOrigin = `https://${uuid}.${SANDBOX_BASE}`;

	/** @type {Record<string, Uint8Array>} */
	const filesData = {};
	for (const f of files) {
		filesData[f.name] = f.content;
	}

	/** @param {MessageEvent} event */
	function onMessage(event) {
		if (event.origin !== sandboxOrigin) return;
		if (event.data?.type !== 'sandbox-ready') return;
		// SW is ready — send files
		iframe.contentWindow?.postMessage(
			{ type: 'files', files: filesData, entry: mainFile.name },
			sandboxOrigin,
		);
	}

	window.addEventListener('message', onMessage);
	iframe.src = sandboxOrigin + '/';

	return () => window.removeEventListener('message', onMessage);
}

/** @param {string} str */
function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
