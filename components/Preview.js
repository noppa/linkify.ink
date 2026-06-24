import { h } from '../libraries.bundle.js';
import { useEffect, useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import { marked } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';
import { guessType } from '../lib/filetypes.js';

const html = htm.bind(h);

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/** @param {FileEntry} file @returns {boolean} */
function isHtmlFile(file) {
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	return ext === 'html' || ext === 'htm';
}

const HOSTED_ORIGIN = 'linkify.ink';
const SANDBOX_BASE = 'sandbox.linkify.ink';

const isHosted = location.hostname === HOSTED_ORIGIN;

// Bumped on every sandbox rebuild so the loader URL is always unique. Without this,
// editing CSS/JS in local dev re-assigns iframe.src to the identical loader URL
// (the origin is a fixed port there), which doesn't reload the iframe — so the
// service worker never receives the edited files and keeps serving the originals.
let sandboxNonce = 0;

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
	// Name of the most recently *opened* HTML file. Once a project has HTML files
	// the preview sticks to this one even while the user edits JS/CSS, so the
	// rendered page doesn't disappear when you open its stylesheet or script.
	const lastHtmlNameRef = useRef(/** @type {string | null} */ (null));

	if (activeFile && isHtmlFile(activeFile)) {
		lastHtmlNameRef.current = activeFile.name;
	}

	// Resolve which file the preview actually shows. When a non-HTML file is open
	// but the project has HTML, keep showing the last-opened HTML file (or the
	// first HTML file if none was opened yet). Otherwise just follow activeFile.
	let previewFile = activeFile;
	if (activeFile && !isHtmlFile(activeFile)) {
		previewFile =
			files.find((f) => f.name === lastHtmlNameRef.current) ??
			files.find(isHtmlFile) ??
			activeFile;
	}

	useEffect(() => {
		if (!previewFile || !iframeRef.current) return;
		// Declared (non-null) type so the nested helpers below keep the narrowing.
		/** @type {HTMLIFrameElement} */
		const iframe = iframeRef.current;
		const file = previewFile;

		// Revoke the current blob URL / tear down the current sandbox listener.
		function cleanup() {
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
			if (sandboxCleanupRef.current) {
				sandboxCleanupRef.current();
				sandboxCleanupRef.current = null;
			}
		}

		/** @param {string} src */
		function showBlob(src, type = 'text/html') {
			const url = URL.createObjectURL(new Blob([src], { type }));
			blobUrlRef.current = url;
			iframe.src = url;
		}

		function renderPreview() {
			const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
			if (ext === 'md') {
				const rendered = /** @type {string} */ (
					marked.parse(new TextDecoder().decode(file.content))
				);
				showBlob(
					`<html><body style="font-family:sans-serif;padding:16px;max-width:720px">${rendered}</body></html>`,
				);
			} else if (
				['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)
			) {
				const url = URL.createObjectURL(
					new Blob([file.content], {
						type: file.type || guessType(file.name, 'image/png'),
					}),
				);
				blobUrlRef.current = url;
				iframe.src = url;
			} else if (ext === 'html' || ext === 'htm') {
				sandboxCleanupRef.current = setupSandboxIframe(iframe, files, file);
			} else {
				const text = escapeHtml(new TextDecoder().decode(file.content));
				showBlob(
					`<pre style="margin:0;padding:10px;font-family:monospace;white-space:pre-wrap">${text}</pre>`,
				);
			}
		}

		// Debounce so rapid edits don't thrash the preview — rebuilding the sandbox
		// iframe on every keystroke is expensive.
		const timer = setTimeout(renderPreview, 600);
		return () => {
			clearTimeout(timer);
			cleanup();
		};
	}, [previewFile, files]);

	return html`
		<div class="panel preview-panel">
			<div class="panel-header">
				<${Icon} name="eye" /> preview${previewFile
					? ` — ${previewFile.name}`
					: ''}
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
 * Set up a sandboxed iframe using *.sandbox.linkify.ink service worker.
 * Returns a cleanup function.
 * @param {HTMLIFrameElement} iframe
 * @param {FileEntry[]} files
 * @param {FileEntry} mainFile
 * @returns {() => void}
 */
function setupSandboxIframe(iframe, files, mainFile) {
	// Local dev: the sandbox runs on editor port + 1 (see dev-server.mjs), a distinct
	// origin so its service worker can't hijack the editor.
	const sandboxOrigin = isHosted
		? `https://${crypto.randomUUID()}.${SANDBOX_BASE}`
		: `${location.protocol}//${location.hostname}:${Number(location.port) + 1}`;

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
	// Pass the editor origin so the loader knows who to trust (the hosted Cloudflare
	// loader hardcodes it instead; the query param is for the local dev loader). The
	// `v` nonce guarantees a fresh URL so the iframe actually reloads on every rebuild.
	iframe.src =
		sandboxOrigin +
		'/?parent=' +
		encodeURIComponent(location.origin) +
		'&v=' +
		++sandboxNonce;

	return () => window.removeEventListener('message', onMessage);
}

/** @param {string} str */
function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
