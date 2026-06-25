import { h } from '../libraries.bundle.js';
import { useEffect, useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import { marked } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';
import { guessType } from '../lib/filetypes.js';

const html = htm.bind(h);

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * Live connection to a running sandbox iframe, kept alive across edits so we can
 * push new files without tearing down (and re-registering) its service worker.
 * @typedef {{
 *   origin: string,
 *   entry: string,
 *   ready: boolean,
 *   onMessage: (event: MessageEvent) => void,
 * }} Sandbox
 */

/** @param {FileEntry} file @returns {boolean} */
function isHtmlFile(file) {
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	return ext === 'html' || ext === 'htm';
}

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
	const sandboxRef = useRef(/** @type {Sandbox | null} */ (null));
	// Always-current file list, so the sandbox message handlers (which outlive a
	// single render) send the latest contents rather than a stale snapshot.
	const filesRef = useRef(files);
	filesRef.current = files;
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
		// Edits are already debounced upstream (DebouncedTextarea commits at most
		// once per idle interval), so render straight away. This also makes
		// preview switches — opening a different file — instant.
		renderPreview(
			iframeRef.current,
			previewFile,
			filesRef,
			sandboxRef,
			blobUrlRef,
		);
	}, [previewFile, files]);

	// Final teardown on unmount: revoke any blob URL and unregister the sandbox SW.
	useEffect(
		() => () => {
			revokeBlob(blobUrlRef);
			teardownSandbox(iframeRef.current, sandboxRef);
		},
		[],
	);

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
 * @param {HTMLIFrameElement} iframe
 * @param {FileEntry} file
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 * @param {{ current: string | null }} blobUrlRef
 */
function renderPreview(iframe, file, filesRef, sandboxRef, blobUrlRef) {
	// TODO: Create utility function getFileExtension
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

	// TODO: Create a function getFileType, which returns a string union.
	// Then exhaustively switch case over it instead of using if/else.
	if (ext === 'html' || ext === 'htm') {
		revokeBlob(blobUrlRef);
		const sandbox = sandboxRef.current;
		if (sandbox && sandbox.entry === file.name) {
			// Same page already running — just push the edited files into it.
			pushFiles(iframe, sandbox, filesRef);
		} else {
			// First render, or the entry HTML changed — (re)create the sandbox.
			teardownSandbox(iframe, sandboxRef);
			initSandbox(iframe, file.name, filesRef, sandboxRef);
		}
		return;
	}

	// Non-HTML previews render straight into the iframe via a blob URL, so any
	// running sandbox (and its service worker) is no longer needed.
	teardownSandbox(iframe, sandboxRef);
	revokeBlob(blobUrlRef);

	if (ext === 'md') {
		const rendered = /** @type {string} */ (
			marked.parse(new TextDecoder().decode(file.content))
		);
		showBlob(
			iframe,
			blobUrlRef,
			`<html><body style="font-family:sans-serif;padding:16px;max-width:720px">${rendered}</body></html>`,
		);
	} else if (
		// TODO: Create utility function isImage
		['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)
	) {
		const url = URL.createObjectURL(
			new Blob([file.content], {
				type: file.type || guessType(file.name, 'image/png'),
			}),
		);
		blobUrlRef.current = url;
		iframe.src = url;
	} else {
		const text = escapeHtml(new TextDecoder().decode(file.content));
		showBlob(
			iframe,
			blobUrlRef,
			`<pre style="margin:0;padding:10px;font-family:monospace;white-space:pre-wrap">${text}</pre>`,
		);
	}
}

/**
 * Build the {name: bytes} payload the sandbox service worker serves from.
 * @param {FileEntry[]} files
 * @returns {Record<string, Uint8Array>}
 */
function buildFilesData(files) {
	/** @type {Record<string, Uint8Array>} */
	const filesData = {};
	for (const f of files) {
		filesData[f.name] = f.content;
	}
	return filesData;
}

/**
 * Create a sandboxed iframe using a *.sandbox.linkify.ink service worker and
 * record it in sandboxRef. Files are sent once the loader reports it's ready.
 * @param {HTMLIFrameElement} iframe
 * @param {string} entry
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 */
function initSandbox(iframe, entry, filesRef, sandboxRef) {
	// Local dev: the sandbox runs on editor port + 1 (see dev-server.mjs), a distinct
	// origin so its service worker can't hijack the editor. Hosted: a throwaway UUID
	// subdomain. Either way the origin is fixed for this sandbox's lifetime so we can
	// keep messaging it as the user edits.
	const origin = isHosted
		? `https://${crypto.randomUUID()}.${SANDBOX_BASE}`
		: `${location.protocol}//${location.hostname}:${Number(location.port) + 1}`;

	/** @type {Sandbox} */
	const sandbox = { origin, entry, ready: false, onMessage: () => {} };

	/** @param {MessageEvent} event */
	sandbox.onMessage = (event) => {
		if (event.origin !== origin) return;
		if (event.data?.type !== 'sandbox-ready') return;
		// The loader is up and controlled by its SW — send the current files.
		sandbox.ready = true;
		iframe.contentWindow?.postMessage(
			{ type: 'files', files: buildFilesData(filesRef.current), entry },
			origin,
		);
	};

	window.addEventListener('message', sandbox.onMessage);
	sandboxRef.current = sandbox;
	// Pass the editor origin so the loader knows who to trust (the hosted Cloudflare
	// loader hardcodes it instead; the query param is for the local dev loader).
	iframe.src = origin + '/?parent=' + encodeURIComponent(location.origin);
}

/**
 * Push the latest files into an already-running sandbox. The loader forwards them
 * to its service worker and reloads its nested content iframe.
 * @param {HTMLIFrameElement} iframe
 * @param {Sandbox} sandbox
 * @param {{ current: FileEntry[] }} filesRef
 */
function pushFiles(iframe, sandbox, filesRef) {
	// Not ready yet — initSandbox's sandbox-ready handler will send the latest files.
	if (!sandbox.ready) return;
	iframe.contentWindow?.postMessage(
		{
			type: 'files',
			files: buildFilesData(filesRef.current),
			entry: sandbox.entry,
		},
		sandbox.origin,
	);
}

/**
 * Tear down a running sandbox: stop listening and navigate the iframe away so the
 * loader's pagehide handler unregisters its service worker.
 * @param {HTMLIFrameElement | null} iframe
 * @param {{ current: Sandbox | null }} sandboxRef
 */
function teardownSandbox(iframe, sandboxRef) {
	const sandbox = sandboxRef.current;
	if (!sandbox) return;
	window.removeEventListener('message', sandbox.onMessage);
	sandboxRef.current = null;
	if (iframe) iframe.src = 'about:blank';
}

/**
 * @param {HTMLIFrameElement} iframe
 * @param {{ current: string | null }} blobUrlRef
 * @param {string} src
 */
function showBlob(iframe, blobUrlRef, src, type = 'text/html') {
	const url = URL.createObjectURL(new Blob([src], { type }));
	blobUrlRef.current = url;
	iframe.src = url;
}

/** @param {{ current: string | null }} blobUrlRef */
function revokeBlob(blobUrlRef) {
	if (blobUrlRef.current) {
		URL.revokeObjectURL(blobUrlRef.current);
		blobUrlRef.current = null;
	}
}

/** @param {string} str */
function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
