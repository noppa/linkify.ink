import { h } from '../vendor/vendor.ui.bundle.js';
import { useEffect, useRef, useState } from '../vendor/vendor.ui.bundle.js';
import { htm } from '../vendor/vendor.ui.bundle.js';
import Icon from '../lib/icons.js';
import { isCodeFile } from '../lib/filetypes.js';

const html = htm.bind(h);

/**
 * Lazily load the preview-only library bundle (Markdown, syntax highlighting,
 * and diagrams). Kept out of the main bundle so the editor's critical path stays
 * small; the import is cached so it only fetches once.
 * @type {Promise<typeof import('../vendor/vendor.preview.bundle.js')> | null}
 */
let previewLibsPromise = null;
function loadPreviewLibs() {
	if (!previewLibsPromise) {
		previewLibsPromise = import('../vendor/vendor.preview.bundle.js');
	}
	return previewLibsPromise;
}

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * A rendered preview document that isn't one of the project's own files — e.g.
 * markdown compiled to HTML, or a plain-text file wrapped in a <pre>. It's
 * injected into the sandbox's file map under a reserved name so it, too, is
 * served (and thus isolated) from the separate sandbox origin rather than the
 * editor's origin.
 * @typedef {{ name: string, content: Uint8Array }} SyntheticFile
 */

/**
 * Live connection to a running sandbox iframe, kept alive across edits so we can
 * push new files without tearing down (and re-registering) its service worker.
 * @typedef {{
 *   origin: string,
 *   entry: string,
 *   extra: SyntheticFile | null,
 *   ready: boolean,
 *   onMessage: (event: MessageEvent) => void,
 * }} Sandbox
 */

/** @param {FileEntry} file @returns {boolean} */
export function isHtmlFile(file) {
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	return ext === 'html' || ext === 'htm';
}

/**
 * Whether `file` is a stylesheet or script — something an HTML page pulls in,
 * whose own preview matters less than the page it styles or drives.
 * @param {FileEntry} file @returns {boolean}
 */
function isPageAsset(file) {
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	return ['css', 'js', 'mjs', 'cjs'].includes(ext);
}

const HOSTED_ORIGIN = 'linkify.ink';
// Sandbox hosts are single-label subdomains (sandbox-<hash>.linkify.ink) so the
// free *.linkify.ink Universal SSL cert covers them; a second-level wildcard like
// *.sandbox.linkify.ink would need a paid Cloudflare cert. The worker runs on a
// *.linkify.ink route (Cloudflare disallows a sandbox-* route wildcard) and
// narrows to this prefix itself.
const SANDBOX_PREFIX = 'sandbox-';

const isHosted = location.hostname === HOSTED_ORIGIN;

// Reserved filename for rendered previews (markdown, plain text) that we inject
// into the sandbox. The leading dunder + suffix makes a real-file collision
// vanishingly unlikely; it must end in .html so the SW serves it as text/html.
const PREVIEW_ENTRY = '__linkify_preview__.html';

const HIGHLIGHT_LANGUAGE_BY_EXTENSION = {
	htm: 'xml',
	html: 'xml',
	cjs: 'javascript',
	js: 'javascript',
	jsx: 'javascript',
	mjs: 'javascript',
	sh: 'bash',
	ts: 'typescript',
	tsx: 'typescript',
	wat: 'wasm',
	yml: 'yaml',
};

/**
 * Which file the preview shows. When a stylesheet or script is open but the
 * project has HTML, keep showing the last-opened HTML file (or the first HTML
 * file if none was opened yet), so the rendered page doesn't disappear when you
 * edit what it loads. Any other file — markdown, images, etc. — previews itself.
 * @param {FileEntry[]} files
 * @param {FileEntry | null} activeFile
 * @param {string | null} [lastHtmlName]
 * @returns {FileEntry | null}
 */
export function resolvePreviewFile(files, activeFile, lastHtmlName = null) {
	if (!activeFile || !isPageAsset(activeFile)) return activeFile;
	return (
		files.find((f) => f.name === lastHtmlName) ??
		files.find(isHtmlFile) ??
		activeFile
	);
}

/**
 * @param {{
 *   files: FileEntry[],
 *   activeFile: FileEntry | null,
 *   followActiveFile?: boolean,
 * }} props — `followActiveFile` always previews the active file itself, even a
 *   stylesheet or script of an HTML page (the shared-link reader view, where
 *   picking a file means wanting to see it).
 */
export default function Preview({ files, activeFile, followActiveFile = false }) {
	const iframeRef = useRef(/** @type {HTMLIFrameElement | null} */ (null));
	const sandboxRef = useRef(/** @type {Sandbox | null} */ (null));
	// Always-current file list, so the sandbox message handlers (which outlive a
	// single render) send the latest contents rather than a stale snapshot.
	const filesRef = useRef(files);
	filesRef.current = files;
	// Name of the most recently *opened* HTML file, which the preview sticks to
	// while the user edits the project's other files.
	const lastHtmlNameRef = useRef(/** @type {string | null} */ (null));

	if (activeFile && isHtmlFile(activeFile)) {
		lastHtmlNameRef.current = activeFile.name;
	}

	const previewFile = followActiveFile
		? activeFile
		: resolvePreviewFile(files, activeFile, lastHtmlNameRef.current);
	const isHtmlPreview = Boolean(previewFile && isHtmlFile(previewFile));

	// Whether the running sandbox had to fall back to rendering from blob: URLs
	// because its service worker was refused (Safari blocks them in a
	// cross-origin frame). Only the HTML path notices — a rendered markdown, code
	// or text preview is a single self-contained document either way.
	const [swFallback, setSwFallback] = useState(false);
	useEffect(() => {
		/** @param {MessageEvent} event */
		function onSandboxReady(event) {
			if (event.data?.type !== 'sandbox-ready') return;
			if (event.origin !== sandboxRef.current?.origin) return;
			setSwFallback(event.data.serviceWorker === false);
		}
		window.addEventListener('message', onSandboxReady);
		return () => window.removeEventListener('message', onSandboxReady);
	}, []);

	// Warm up the preview-only bundle in the background as soon as the preview
	// mounts, so the first markdown render doesn't wait on a cold fetch.
	useEffect(() => {
		loadPreviewLibs();
	}, []);

	useEffect(() => {
		if (!previewFile || !iframeRef.current) return;
		// Edits are already debounced upstream (DebouncedTextarea commits at most
		// once per idle interval), so render straight away. This also makes
		// preview switches — opening a different file — instant.
		let cancelled = false;
		renderPreview(
			iframeRef.current,
			previewFile,
			filesRef,
			sandboxRef,
			() => cancelled,
		);
		// Guards the async markdown path: if the file changes (or we unmount)
		// before the lazy libs load, skip applying the now-stale render.
		return () => {
			cancelled = true;
		};
	}, [previewFile, files]);

	// Final teardown on unmount: unregister the sandbox service worker.
	useEffect(
		() => () => {
			teardownSandbox(iframeRef.current, sandboxRef);
		},
		[],
	);

	// The outer frame's flags are the ceiling for everything inside it.
	// allow-scripts is load-bearing here: this frame loads sandbox-loader.html,
	// whose script registers the service worker that serves every previewed file —
	// withhold it and there is no preview at all. Previewed documents always run
	// their scripts; the isolation is the separate sandbox origin. allow-popups
	// is needed for target=_blank links (which captured articles put on every
	// external link) to do anything when clicked; a nested frame cannot grant
	// itself what is withheld here.
	return html`
		<div class="panel preview-panel">
			<div class="panel-header">
				<${Icon} name="eye" /> preview${
					previewFile ? ` — ${previewFile.name}` : ''
				}
			</div>
			${swFallback &&
			isHtmlPreview &&
			html`<div class="preview-notice">
				<${Icon} name="info" /> Limited preview: this browser blocks the
				sandbox's service worker, so files requested from inside CSS or
				JavaScript won't load.
			</div>`}
			<iframe
				ref=${iframeRef}
				class="preview-iframe"
				sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
				title="File preview"
			></iframe>
		</div>
	`;
}

/**
 * Decide what document the preview should show and route it through the sandbox.
 *
 * Every preview type — HTML, markdown, images, plain text — is served from the
 * sandbox origin rather than the editor's own origin. Rendered
 * markdown in particular can contain arbitrary HTML/JS (author-supplied, or via
 * a bug in the markdown parser), so it must be isolated just like a hand-written
 * HTML file. HTML files are served as themselves; markdown, text, and images
 * are compiled into a synthetic HTML document injected into the sandbox.
 *
 * @param {HTMLIFrameElement} iframe
 * @param {FileEntry} file
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 * @param {() => boolean} isCancelled — true once this render is superseded
 */
function renderPreview(iframe, file, filesRef, sandboxRef, isCancelled) {
	// TODO: Create utility function getFileExtension
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

	// TODO: Create a function getFileType, which returns a string union.
	// Then exhaustively switch case over it instead of using if/else.
	if (ext === 'html' || ext === 'htm') {
		// The HTML file is the entry; the SW serves it (and its subresources) as-is.
		showInSandbox(iframe, file.name, null, filesRef, sandboxRef);
		return;
	}

	if (
		// TODO: Create utility function isImage
		['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)
	) {
		// Wrap the image in a synthetic HTML document rather than making it the
		// sandbox entry directly. A bare image response is rendered by the browser's
		// built-in "image document" viewer, which shows it at native pixel size with
		// no regard for the iframe's actual size — on a narrow mobile iframe that
		// means the image is left oversized and cropped (or, depending on the
		// browser's zoom heuristics, rendered tiny) instead of fitted to the frame.
		// The wrapper gives us a real viewport meta tag plus CSS to fit the image to
		// the iframe consistently. SVG is deliberately included in the image list
		// above — it can carry script, so it belongs in the sandbox too.
		const src = escapeHtml(file.name).replace(/"/g, '&quot;');
		const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#f5f5f5}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img src="${src}" alt="${src}"></body></html>`;
		showInSandbox(
			iframe,
			PREVIEW_ENTRY,
			syntheticFile(doc),
			filesRef,
			sandboxRef,
		);
		return;
	}

	if (ext === 'md') {
		// Marked and Mermaid live in the lazy preview bundle. Mermaid fences are
		// rendered to static SVG before this document enters the sandbox.
		loadPreviewLibs()
			.then(({ renderMarkdown }) =>
				renderMarkdown(new TextDecoder().decode(file.content)),
			)
			.then((rendered) => {
				if (isCancelled()) return;
				showInSandbox(
					iframe,
					PREVIEW_ENTRY,
					syntheticFile(previewDocument(rendered, 'markdown-preview')),
					filesRef,
					sandboxRef,
				);
			})
			.catch((error) => {
				if (isCancelled()) return;
				showPreviewError(
					iframe,
					error,
					filesRef,
					sandboxRef,
					'Could not render Markdown preview',
				);
			});
		return;
	}

	if (ext === 'mermaid' || ext === 'mmd') {
		const source = new TextDecoder().decode(file.content);
		if (!source.trim()) {
			showInSandbox(
				iframe,
				PREVIEW_ENTRY,
				syntheticFile(previewDocument('', 'mermaid-preview')),
				filesRef,
				sandboxRef,
			);
			return;
		}
		loadPreviewLibs()
			.then(({ renderMermaid }) => renderMermaid(source))
			.then((rendered) => {
				if (isCancelled()) return;
				showInSandbox(
					iframe,
					PREVIEW_ENTRY,
					syntheticFile(
						previewDocument(
							`<div class="mermaid-diagram">${rendered}</div>`,
							'mermaid-preview',
						),
					),
					filesRef,
					sandboxRef,
				);
			})
			.catch((error) => {
				if (isCancelled()) return;
				showPreviewError(iframe, error, filesRef, sandboxRef);
			});
		return;
	}

	const source = new TextDecoder().decode(file.content);
	if (isCodeFile(file)) {
		const language = (HIGHLIGHT_LANGUAGE_BY_EXTENSION[ext] ?? ext) || undefined;
		loadPreviewLibs()
			.then(({ renderHighlightedCode }) => renderHighlightedCode(source, language))
			.then((rendered) => {
				if (isCancelled()) return;
				showInSandbox(
					iframe,
					PREVIEW_ENTRY,
					syntheticFile(previewDocument(rendered, 'code-preview')),
					filesRef,
					sandboxRef,
				);
			})
			.catch((error) => {
				if (isCancelled()) return;
				showPreviewError(
					iframe,
					error,
					filesRef,
					sandboxRef,
					'Could not highlight code',
				);
			});
		return;
	}

	// Unknown binary formats retain the existing best-effort raw preview.
	const text = escapeHtml(source);
	const doc = `<!doctype html><html><head><meta charset="utf-8"></head><body><pre style="margin:0;padding:10px;font-family:monospace;white-space:pre-wrap">${text}</pre></body></html>`;
	showInSandbox(
		iframe,
		PREVIEW_ENTRY,
		syntheticFile(doc),
		filesRef,
		sandboxRef,
	);
}

/** @param {string} htmlSource @returns {SyntheticFile} */
function syntheticFile(htmlSource) {
	return { name: PREVIEW_ENTRY, content: new TextEncoder().encode(htmlSource) };
}

const PREVIEW_STYLES = `
html { color-scheme: light; }
body { box-sizing: border-box; margin: 0; padding: 16px; font-family: sans-serif; color: #24292f; }
.markdown-preview { max-width: 720px; }
.markdown-preview :not(pre) > code { padding: 0.15em 0.35em; border-radius: 4px; background: #eff1f3; font: 0.875em ui-monospace, monospace; }
.code-preview { padding: 0; }
pre { margin: 16px 0; }
pre code.hljs { display: block; box-sizing: border-box; overflow-x: auto; padding: 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; color: #24292f; font: 13px/1.5 ui-monospace, monospace; tab-size: 2; }
.code-preview pre { min-height: 100vh; margin: 0; }
.code-preview pre code.hljs { min-height: 100vh; border: 0; border-radius: 0; }
.hljs-comment, .hljs-quote { color: #6e7781; font-style: italic; }
.hljs-doctag, .hljs-keyword, .hljs-meta .hljs-keyword, .hljs-template-tag, .hljs-type { color: #cf222e; }
.hljs-title, .hljs-title.class_, .hljs-title.function_ { color: #8250df; }
.hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id, .hljs-variable { color: #0550ae; }
.hljs-meta .hljs-string, .hljs-regexp, .hljs-string { color: #0a3069; }
.hljs-built_in, .hljs-symbol { color: #953800; }
.hljs-code, .hljs-formula, .hljs-name, .hljs-params, .hljs-property, .hljs-selector-pseudo, .hljs-selector-tag, .hljs-subst { color: #116329; }
.hljs-section { color: #0550ae; font-weight: 700; }
.hljs-bullet { color: #953800; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 700; }
.hljs-addition { color: #116329; background: #dafbe1; }
.hljs-deletion { color: #82071e; background: #ffebe9; }
.mermaid-preview { min-height: calc(100vh - 32px); display: grid; place-items: center; }
.mermaid-diagram { margin: 16px 0; overflow: auto; text-align: center; }
.mermaid-diagram:first-child { margin-top: 0; }
.mermaid-diagram:last-child { margin-bottom: 0; }
.mermaid-diagram svg { display: inline-block; max-width: 100%; height: auto; }
.mermaid-error { padding: 12px; border: 1px solid #cf222e; border-radius: 6px; background: #ffebe9; color: #82071e; text-align: left; }
.mermaid-error pre { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.45 monospace; }
`;

/** @param {string} body @param {string} className */
function previewDocument(body, className) {
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${PREVIEW_STYLES}</style></head><body class="${className}">${body}</body></html>`;
}

/**
 * @param {HTMLIFrameElement} iframe
 * @param {unknown} error
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 * @param {string} [title]
 */
function showPreviewError(
	iframe,
	error,
	filesRef,
	sandboxRef,
	title = 'Could not render Mermaid diagram',
) {
	const message = escapeHtml(error instanceof Error ? error.message : String(error));
	const body = `<div class="mermaid-error" role="alert"><strong>${title}</strong><pre>${message}</pre></div>`;
	showInSandbox(
		iframe,
		PREVIEW_ENTRY,
		syntheticFile(previewDocument(body, 'mermaid-preview')),
		filesRef,
		sandboxRef,
	);
}

/**
 * Show `entry` in the sandbox, reusing the running one when there is one: the
 * loader takes the entry along with every file push, so switching between a
 * project's files never needs a new sandbox. (Recreating one also raced in
 * local dev, where every sandbox shares one origin: the outgoing service worker
 * could answer the new loader's request for / with the project's index.html.)
 * @param {HTMLIFrameElement} iframe
 * @param {string} entry
 * @param {SyntheticFile | null} extra — rendered document to inject, if any
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 */
function showInSandbox(iframe, entry, extra, filesRef, sandboxRef) {
	const sandbox = sandboxRef.current;
	if (sandbox) {
		sandbox.entry = entry;
		sandbox.extra = extra;
		pushFiles(iframe, sandbox, filesRef);
	} else {
		initSandbox(iframe, entry, extra, filesRef, sandboxRef);
	}
}

/**
 * Build the {name: bytes} payload the sandbox service worker serves from,
 * including the injected synthetic document (if any).
 * @param {FileEntry[]} files
 * @param {SyntheticFile | null} extra
 * @returns {Record<string, Uint8Array>}
 */
function buildFilesData(files, extra) {
	/** @type {Record<string, Uint8Array>} */
	const filesData = {};
	for (const f of files) {
		filesData[f.name] = f.content;
	}
	if (extra) {
		filesData[extra.name] = extra.content;
	}
	return filesData;
}

/**
 * Create a sandboxed iframe using a sandbox-*.linkify.ink service worker and
 * record it in sandboxRef. Files are sent once the loader reports it's ready.
 * @param {HTMLIFrameElement} iframe
 * @param {string} entry
 * @param {SyntheticFile | null} extra
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 */
function initSandbox(iframe, entry, extra, filesRef, sandboxRef) {
	/** @type {Sandbox} */
	const sandbox = { origin: '', entry, extra, ready: false, onMessage: () => {} };
	// Recorded before the origin is known, so edits made while it's being hashed
	// update this sandbox (sent once it's ready) rather than starting another.
	sandboxRef.current = sandbox;

	sandboxOriginFor(filesRef.current).then((origin) => {
		// Torn down while the origin was being worked out.
		if (sandboxRef.current !== sandbox) return;
		sandbox.origin = origin;

		/** @param {MessageEvent} event */
		sandbox.onMessage = (event) => {
			if (event.origin !== origin) return;
			if (event.data?.type !== 'sandbox-ready') return;
			// The loader is up and controlled by its SW — send the current files.
			sandbox.ready = true;
			iframe.contentWindow?.postMessage(
				{
					type: 'files',
					files: buildFilesData(filesRef.current, sandbox.extra),
					entry: sandbox.entry,
				},
				origin,
			);
		};

		window.addEventListener('message', sandbox.onMessage);
		// Pass the editor origin so the loader knows who to trust (the hosted
		// Cloudflare loader hardcodes it instead; the query param is for the local
		// dev loader). __loader tells a service worker already controlling this
		// origin — another tab showing the same app — to let the loader itself
		// through to the network rather than answer / with the app's index.html.
		iframe.src = origin + '/?__loader&parent=' + encodeURIComponent(location.origin);
	});
}

/**
 * The origin a sandbox for `files` runs on. Local dev: editor port + 1 (see
 * dev-server.mjs), a distinct origin so its service worker can't hijack the
 * editor. Hosted: a subdomain named after a hash of the files, so opening the
 * same app again lands on the same origin and finds its localStorage, IndexedDB
 * etc. where it left them. Only those exact files can ever run there, so no other
 * link can reach that storage. The origin is fixed for the sandbox's lifetime, so
 * edits keep running on the one it started with.
 * @param {FileEntry[]} files
 * @returns {Promise<string>}
 */
async function sandboxOriginFor(files) {
	if (!isHosted) {
		return `${location.protocol}//${location.hostname}:${Number(location.port) + 1}`;
	}
	return `https://${SANDBOX_PREFIX}${await hashFiles(files)}.${HOSTED_ORIGIN}`;
}

// Bump to move every app to a fresh origin (and leave their old storage behind).
const SANDBOX_HASH_VERSION = 'linkify-sandbox-v1';
const SANDBOX_SALT_KEY = 'linkify.sandboxSalt';

/**
 * Hash the files into a DNS label: SHA-256 over the salt and a canonical,
 * length-prefixed encoding of the files sorted by name, truncated to 128 bits
 * and hex-encoded (hostnames are case-insensitive, so no base64).
 * @param {FileEntry[]} files
 * @returns {Promise<string>}
 */
async function hashFiles(files) {
	const encoder = new TextEncoder();
	/** @type {Uint8Array[]} */
	const parts = [encoder.encode(SANDBOX_HASH_VERSION), encoder.encode(sandboxSalt())];
	const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	for (const file of sorted) {
		parts.push(encoder.encode(file.name), file.content);
	}
	const length = parts.reduce((sum, part) => sum + 4 + part.length, 0);
	const buffer = new Uint8Array(length);
	const view = new DataView(buffer.buffer);
	let offset = 0;
	for (const part of parts) {
		view.setUint32(offset, part.length);
		buffer.set(part, offset + 4);
		offset += 4 + part.length;
	}
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
	return Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A random salt kept for this browser. The sandbox hostname is visible outside
 * the browser (DNS, TLS SNI, Cloudflare's logs) even though the link's contents
 * never are; without the salt anyone holding the same link could compute its
 * hostname and recognise it there. Storage is per-browser anyway, so salting per
 * browser costs nothing. If storage is unavailable, a salt for this page load.
 * @returns {string}
 */
function sandboxSalt() {
	if (sessionSalt) return sessionSalt;
	try {
		sessionSalt = localStorage.getItem(SANDBOX_SALT_KEY);
		if (!sessionSalt) {
			sessionSalt = crypto.randomUUID();
			localStorage.setItem(SANDBOX_SALT_KEY, sessionSalt);
		}
	} catch {
		sessionSalt ??= crypto.randomUUID();
	}
	return sessionSalt;
}
/** @type {string | null} */
let sessionSalt = null;

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
			files: buildFilesData(filesRef.current, sandbox.extra),
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

/** @param {string} str */
function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
