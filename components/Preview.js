import { h } from '../libraries.bundle.js';
import { useEffect, useRef, useState } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';

const html = htm.bind(h);

/**
 * Lazily load the preview-only library bundle (markdown renderer, and any future
 * preview features). Kept out of the main bundle so the editor's critical path
 * stays small; the import is cached so it only fetches once.
 * @type {Promise<typeof import('../libraries-for-preview.bundle.js')> | null}
 */
let previewLibsPromise = null;
function loadPreviewLibs() {
	if (!previewLibsPromise) {
		previewLibsPromise = import('../libraries-for-preview.bundle.js');
	}
	return previewLibsPromise;
}

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * A rendered preview document that isn't one of the project's own files — e.g.
 * markdown compiled to HTML, or a plain-text file wrapped in a <pre>. It's
 * injected into the sandbox's file map under a reserved name so it, too, is
 * served (and thus isolated) from the throwaway sandbox origin rather than the
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
 *   nojs: boolean,
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
// Sandbox hosts are single-label subdomains (sandbox-<uuid>.linkify.ink) so the
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

/**
 * @param {{
 *   files: FileEntry[],
 *   activeFile: FileEntry | null,
 *   metadata?: import('../lib/types.js').Metadata | null,
 * }} props
 */
export default function Preview({ files, activeFile, metadata }) {
	const iframeRef = useRef(/** @type {HTMLIFrameElement | null} */ (null));
	const sandboxRef = useRef(/** @type {Sandbox | null} */ (null));
	// Whether to withhold allow-scripts from the previewed document. A link can ask
	// for this with `nojs: 1` (the browser extension sets it on every capture), but
	// the reader gets the final say in both directions — metadata is written by
	// whoever made the link, so it is a sensible default and nothing more. The real
	// isolation is the throwaway sandbox origin, which applies either way.
	const [noJs, setNoJs] = useState(Boolean(metadata?.nojs));

	// Metadata lands asynchronously — a link's files are decoded after this
	// component has already mounted with the editor's starter files — so the
	// initial state above is usually `false` and this is what actually applies the
	// link's preference. Keyed on the value rather than the object so a re-render
	// with an equivalent metadata object doesn't stomp the reader's own choice.
	const linkNoJs = Boolean(metadata?.nojs);
	useEffect(() => {
		setNoJs(linkNoJs);
	}, [linkNoJs]);
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
	const isHtmlPreview = Boolean(previewFile && isHtmlFile(previewFile));
	// Synthetic previews (markdown, text, and image wrappers) never need to run
	// scripts. Keep that policy separate from the reader's remembered HTML choice.
	const previewNoJs = isHtmlPreview ? noJs : true;

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
			previewNoJs,
			filesRef,
			sandboxRef,
			() => cancelled,
		);
		// Guards the async markdown path: if the file changes (or we unmount)
		// before the lazy libs load, skip applying the now-stale render.
		return () => {
			cancelled = true;
		};
	}, [previewFile, files, previewNoJs]);

	// Final teardown on unmount: unregister the sandbox service worker.
	useEffect(
		() => () => {
			teardownSandbox(iframeRef.current, sandboxRef);
		},
		[],
	);

	// The outer frame's flags are the ceiling for everything inside it, so they are
	// deliberately not the place to control scripts. allow-scripts is load-bearing
	// here: this frame loads sandbox-loader.html, whose script registers the service
	// worker that serves every previewed file — withhold it and there is no preview
	// at all. The loader re-applies a narrower set to the nested frame that actually
	// holds the content. allow-popups is needed for target=_blank links (which
	// captured articles put on every external link) to do anything when clicked; a
	// nested frame cannot grant itself what is withheld here.
	return html`
		<div class="panel preview-panel">
			<div class="panel-header">
				<${Icon} name="eye" /> preview${
					previewFile ? ` — ${previewFile.name}` : ''
				}
				${isHtmlPreview &&
				html`<button
					class="panel-header-toggle ${noJs ? 'off' : 'on'}"
					onClick=${() => setNoJs((v) => !v)}
					title=${
						noJs
							? "Scripts are not running in this preview. The link asked for this, or you did — click to run them."
							: 'Scripts are running in this preview. Click to reload it with scripts disabled.'
					}
				>
					<${Icon} name="code" /> js ${noJs ? 'off' : 'on'}
				</button>`}
			</div>
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
 * throwaway sandbox origin rather than the editor's own origin. Rendered
 * markdown in particular can contain arbitrary HTML/JS (author-supplied, or via
 * a bug in the markdown parser), so it must be isolated just like a hand-written
 * HTML file. HTML files are served as themselves; markdown, text, and images
 * are compiled into a synthetic HTML document injected into the sandbox.
 *
 * @param {HTMLIFrameElement} iframe
 * @param {FileEntry} file
 * @param {boolean} nojs — withhold allow-scripts from the previewed document
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 * @param {() => boolean} isCancelled — true once this render is superseded
 */
function renderPreview(iframe, file, nojs, filesRef, sandboxRef, isCancelled) {
	// TODO: Create utility function getFileExtension
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

	// TODO: Create a function getFileType, which returns a string union.
	// Then exhaustively switch case over it instead of using if/else.
	if (ext === 'html' || ext === 'htm') {
		// The HTML file is the entry; the SW serves it (and its subresources) as-is.
		showInSandbox(iframe, file.name, null, nojs, filesRef, sandboxRef);
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
			nojs,
			filesRef,
			sandboxRef,
		);
		return;
	}

	if (ext === 'md') {
		// Marked and Mermaid live in the lazy preview bundle. Mermaid fences are
		// rendered to static SVG before this document enters the scripts-off iframe.
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
					nojs,
					filesRef,
					sandboxRef,
				);
			})
			.catch((error) => {
				if (isCancelled()) return;
				showPreviewError(iframe, error, nojs, filesRef, sandboxRef);
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
				nojs,
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
					nojs,
					filesRef,
					sandboxRef,
				);
			})
			.catch((error) => {
				if (isCancelled()) return;
				showPreviewError(iframe, error, nojs, filesRef, sandboxRef);
			});
		return;
	}

	// Everything else: show the raw text in a <pre>.
	const text = escapeHtml(new TextDecoder().decode(file.content));
	const doc = `<!doctype html><html><head><meta charset="utf-8"></head><body><pre style="margin:0;padding:10px;font-family:monospace;white-space:pre-wrap">${text}</pre></body></html>`;
	showInSandbox(
		iframe,
		PREVIEW_ENTRY,
		syntheticFile(doc),
		nojs,
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
 * @param {boolean} nojs
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 */
function showPreviewError(iframe, error, nojs, filesRef, sandboxRef) {
	const message = escapeHtml(error instanceof Error ? error.message : String(error));
	const body = `<div class="mermaid-error" role="alert"><strong>Could not render Mermaid diagram</strong><pre>${message}</pre></div>`;
	showInSandbox(
		iframe,
		PREVIEW_ENTRY,
		syntheticFile(previewDocument(body, 'mermaid-preview')),
		nojs,
		filesRef,
		sandboxRef,
	);
}

/**
 * Show `entry` in the sandbox, reusing the running one when the entry is
 * unchanged (just push the latest files) and otherwise (re)creating it.
 * @param {HTMLIFrameElement} iframe
 * @param {string} entry
 * @param {SyntheticFile | null} extra — rendered document to inject, if any
 * @param {boolean} nojs — withhold allow-scripts from the previewed document
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 */
function showInSandbox(iframe, entry, extra, nojs, filesRef, sandboxRef) {
	const sandbox = sandboxRef.current;
	if (sandbox && sandbox.entry === entry) {
		// Same entry already running — just refresh the injected doc and push files.
		// Toggling scripts doesn't need a new sandbox: the loader rebuilds the nested
		// content frame under the new flags, and its service worker registration —
		// the expensive part to recreate — is unaffected.
		sandbox.extra = extra;
		sandbox.nojs = nojs;
		pushFiles(iframe, sandbox, filesRef);
	} else {
		// First render, or the entry changed — (re)create the sandbox.
		teardownSandbox(iframe, sandboxRef);
		initSandbox(iframe, entry, extra, nojs, filesRef, sandboxRef);
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
 * @param {boolean} nojs — withhold allow-scripts from the previewed document
 * @param {{ current: FileEntry[] }} filesRef
 * @param {{ current: Sandbox | null }} sandboxRef
 */
function initSandbox(iframe, entry, extra, nojs, filesRef, sandboxRef) {
	// Local dev: the sandbox runs on editor port + 1 (see dev-server.mjs), a distinct
	// origin so its service worker can't hijack the editor. Hosted: a throwaway UUID
	// subdomain. Either way the origin is fixed for this sandbox's lifetime so we can
	// keep messaging it as the user edits.
	const origin = isHosted
		? `https://${SANDBOX_PREFIX}${crypto.randomUUID()}.${HOSTED_ORIGIN}`
		: `${location.protocol}//${location.hostname}:${Number(location.port) + 1}`;

	/** @type {Sandbox} */
	const sandbox = { origin, entry, extra, nojs, ready: false, onMessage: () => {} };

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
				entry,
				nojs: sandbox.nojs,
			},
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
			files: buildFilesData(filesRef.current, sandbox.extra),
			entry: sandbox.entry,
			nojs: sandbox.nojs,
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
