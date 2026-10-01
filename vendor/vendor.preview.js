// Libraries used only by the preview panel (not on the critical path for
// encoding/decoding a URL or rendering the editor UI). Bundled separately and
// lazy-loaded so they stay out of the main vendor.ui.bundle.js.
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js/lib/common';
import mermaid from 'mermaid';

let diagramId = 0;
/** @type {Promise<unknown>} */
let mermaidQueue = Promise.resolve();

/**
 * Render Mermaid source to inert SVG. The caller puts the result into the
 * isolated preview document; no script needs to run inside that document.
 * Mermaid bakes its theme's colors into the SVG, so the caller picks the theme.
 * @param {string} source
 * @param {boolean} [darkMode]
 * @returns {Promise<string>}
 */
export function renderMermaid(source, darkMode = false) {
	const id = `linkify-mermaid-${++diagramId}`;
	// The theme is global Mermaid config, so renders run one at a time: a render
	// for the other theme must not reconfigure Mermaid while this one is drawing.
	const rendered = mermaidQueue.then(async () => {
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			suppressErrorRendering: true,
			theme: darkMode ? 'dark' : 'default',
		});
		const { svg } = await mermaid.render(id, source);
		return svg;
	});
	mermaidQueue = rendered.catch(() => {});
	return rendered;
}

/**
 * Render Markdown, replacing fenced `mermaid` code blocks with static SVG.
 * Marked's code renderer is synchronous, so it first leaves unguessable
 * placeholders and Mermaid fills them after the rest of the document is parsed.
 * @param {string} source
 * @param {boolean} [darkMode] Render Mermaid diagrams with the dark theme
 * @returns {Promise<string>}
 */
export async function renderMarkdown(source, darkMode = false) {
	/** @type {{ placeholder: string, source: string }[]} */
	const diagrams = [];
	const nonce = crypto.randomUUID();
	const renderer = new Renderer();
	renderer.code = (token) => {
		const language = token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase();
		if (language !== 'mermaid') return renderHighlightedCode(token.text, language);

		const placeholder = `<div data-linkify-mermaid="${nonce}-${diagrams.length}"></div>`;
		diagrams.push({ placeholder, source: token.text });
		return placeholder;
	};

	let output = /** @type {string} */ (marked.parse(source, { renderer }));
	for (const diagram of diagrams) {
		let rendered;
		try {
			rendered = `<div class="mermaid-diagram">${await renderMermaid(diagram.source, darkMode)}</div>`;
		} catch (error) {
			rendered = renderMermaidError(error);
		}
		output = output.replace(diagram.placeholder, rendered);
	}
	return output;
}

/**
 * Render source as escaped, highlighted HTML. Highlight.js uses the requested
 * language when it recognises it and auto-detects among its common languages
 * for unlabelled or unfamiliar code.
 * @param {string} source
 * @param {string | undefined} language
 * @returns {string}
 */
export function renderHighlightedCode(source, language) {
	const requested = language?.trim().toLowerCase();
	const result = requested && hljs.getLanguage(requested)
		? hljs.highlight(source, { language: requested, ignoreIllegals: true })
		: hljs.highlightAuto(source);
	const languageClass = result.language ? ` language-${result.language}` : '';
	return `<pre><code class="hljs${languageClass}">${result.value}</code></pre>`;
}

/** @param {unknown} error */
function renderMermaidError(error) {
	const message = error instanceof Error ? error.message : String(error);
	return `<div class="mermaid-error" role="alert"><strong>Could not render Mermaid diagram</strong><pre>${escapeHtml(message)}</pre></div>`;
}

/** @param {string} value */
function escapeHtml(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
