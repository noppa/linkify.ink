// Libraries used only by the preview panel (not on the critical path for
// encoding/decoding a URL or rendering the editor UI). Bundled separately and
// lazy-loaded so they stay out of the main libraries.bundle.js.
import { marked, Renderer } from 'marked';
import mermaid from 'mermaid';

mermaid.initialize({
	startOnLoad: false,
	securityLevel: 'strict',
	suppressErrorRendering: true,
});

let diagramId = 0;

/**
 * Render Mermaid source to inert SVG. The caller puts the result into the
 * isolated preview document; no script needs to run inside that document.
 * @param {string} source
 * @returns {Promise<string>}
 */
export async function renderMermaid(source) {
	const id = `linkify-mermaid-${++diagramId}`;
	const { svg } = await mermaid.render(id, source);
	return svg;
}

/**
 * Render Markdown, replacing fenced `mermaid` code blocks with static SVG.
 * Marked's code renderer is synchronous, so it first leaves unguessable
 * placeholders and Mermaid fills them after the rest of the document is parsed.
 * @param {string} source
 * @returns {Promise<string>}
 */
export async function renderMarkdown(source) {
	/** @type {{ placeholder: string, source: string }[]} */
	const diagrams = [];
	const nonce = crypto.randomUUID();
	const renderer = new Renderer();
	const renderCode = renderer.code.bind(renderer);
	renderer.code = (token) => {
		const language = token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase();
		if (language !== 'mermaid') return renderCode(token);

		const placeholder = `<div data-linkify-mermaid="${nonce}-${diagrams.length}"></div>`;
		diagrams.push({ placeholder, source: token.text });
		return placeholder;
	};

	let output = /** @type {string} */ (marked.parse(source, { renderer }));
	for (const diagram of diagrams) {
		let rendered;
		try {
			rendered = `<div class="mermaid-diagram">${await renderMermaid(diagram.source)}</div>`;
		} catch (error) {
			rendered = renderMermaidError(error);
		}
		output = output.replace(diagram.placeholder, rendered);
	}
	return output;
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
