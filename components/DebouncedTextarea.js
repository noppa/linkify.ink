import { h } from '../vendor/vendor.ui.bundle.js';
import { useEffect, useRef } from '../vendor/vendor.ui.bundle.js';
import { htm } from '../vendor/vendor.ui.bundle.js';

const html = htm.bind(h);

// The syntax font renders slowly in browsers for large textareas and makes
// the editror unresponsive. Opt out of syntax highlighting for large files.
const MAX_SYNTAX_HIGHLIGHTED_CHARACTERS = 10_000;

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * Textarea that buffers keystrokes locally and only commits the edited content
 * upward after a short idle delay (or on blur/unmount). This keeps EditorPage —
 * and everything it renders, including Preview — from re-rendering on every
 * keypress.
 *
 * Keyed by file name in the parent, which keeps one mounted (and merely
 * hidden) per opened file so the browser's undo history survives switching
 * files. The unmount flush below commits any buffered edit when the file is
 * removed or renamed, so nothing is lost.
 *
 * @param {{
 *   file: FileEntry,
 *   onChange: (content: Uint8Array) => void,
 *   hidden?: boolean,
 *   syntaxHighlighted?: boolean,
 *   delay?: number,
 * }} props
 */
export default function DebouncedTextarea({
	file,
	onChange,
	hidden = false,
	syntaxHighlighted = false,
	delay = 600,
}) {
	const ref = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
	const timerRef = useRef(
		/** @type {ReturnType<typeof setTimeout> | null} */ (null),
	);
	// Keep the latest commit closure reachable so blur/unmount flush the current
	// textarea value through the current onChange without re-subscribing effects.
	const commitRef = useRef(/** @type {() => void} */ (() => {}));

	// Every opened file re-renders on each edit; only decode when content changes.
	const decodedRef = useRef(
		/** @type {{ content: Uint8Array, text: string } | null} */ (null),
	);
	if (decodedRef.current?.content !== file.content) {
		decodedRef.current = {
			content: file.content,
			text: new TextDecoder().decode(file.content),
		};
	}
	const text = decodedRef.current.text;
	const usesSyntaxFont =
		syntaxHighlighted && text.length <= MAX_SYNTAX_HIGHLIGHTED_CHARACTERS;

	function commit() {
		if (timerRef.current === null) return; // nothing buffered
		clearTimeout(timerRef.current);
		timerRef.current = null;
		const el = ref.current;
		if (el) onChange(new TextEncoder().encode(el.value));
	}
	commitRef.current = commit;

	function handleInput(event) {
		const textarea = /** @type {HTMLTextAreaElement} */ (event.currentTarget);
		textarea.classList.toggle(
			'syntax-highlighted',
			syntaxHighlighted &&
				textarea.value.length <= MAX_SYNTAX_HIGHLIGHTED_CHARACTERS,
		);
		if (timerRef.current !== null) clearTimeout(timerRef.current);
		// Go through commitRef so a late flush uses the latest onChange, whose
		// file index may have shifted since (e.g. another file was deleted).
		timerRef.current = setTimeout(() => commitRef.current(), delay);
	}

	// Re-sync if the file's content changes underneath us (e.g. a shared link
	// finishes decoding into the same file name) without disturbing the cursor
	// during normal typing: our own commits leave el.value === text, a no-op here.
	useEffect(() => {
		const el = ref.current;
		if (el && el.value !== text) el.value = text;
	}, [text]);

	// Flush any buffered edit before this textarea unmounts (file removed/renamed).
	useEffect(() => () => commitRef.current(), []);

	return html`<textarea
		ref=${ref}
		class="editor-textarea${usesSyntaxFont ? ' syntax-highlighted' : ''}"
		defaultValue=${text}
		hidden=${hidden}
		onInput=${handleInput}
		onBlur=${commit}
		spellcheck=${false}
	></textarea>`;
}
