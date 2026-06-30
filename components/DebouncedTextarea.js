import { h } from '../libraries.bundle.js';
import { useEffect, useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';

const html = htm.bind(h);

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * Textarea that buffers keystrokes locally and only commits the edited content
 * upward after a short idle delay (or on blur/unmount). This keeps EditorPage —
 * and everything it renders, including Preview — from re-rendering on every
 * keypress.
 *
 * Keyed by file name in the parent, so switching files remounts this with the
 * new content; the unmount flush below commits any buffered edit to the
 * outgoing file first, so nothing is lost on switch.
 *
 * @param {{
 *   file: FileEntry,
 *   onChange: (content: Uint8Array) => void,
 *   delay?: number,
 * }} props
 */
export default function DebouncedTextarea({ file, onChange, delay = 600 }) {
	const ref = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
	const timerRef = useRef(
		/** @type {ReturnType<typeof setTimeout> | null} */ (null),
	);
	// Keep the latest commit closure reachable so blur/unmount flush the current
	// textarea value through the current onChange without re-subscribing effects.
	const commitRef = useRef(/** @type {() => void} */ (() => {}));

	const text = new TextDecoder().decode(file.content);

	function commit() {
		if (timerRef.current === null) return; // nothing buffered
		clearTimeout(timerRef.current);
		timerRef.current = null;
		const el = ref.current;
		if (el) onChange(new TextEncoder().encode(el.value));
	}
	commitRef.current = commit;

	function handleInput() {
		if (timerRef.current !== null) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(commit, delay);
	}

	// Re-sync if the file's content changes underneath us (e.g. a shared link
	// finishes decoding into the same file name) without disturbing the cursor
	// during normal typing: our own commits leave el.value === text, a no-op here.
	useEffect(() => {
		const el = ref.current;
		if (el && el.value !== text) el.value = text;
	}, [text]);

	// Flush any buffered edit before this textarea unmounts (switching files).
	useEffect(() => () => commitRef.current(), []);

	return html`<textarea
		ref=${ref}
		class="editor-textarea"
		defaultValue=${text}
		onInput=${handleInput}
		onBlur=${commit}
		spellcheck=${false}
	></textarea>`;
}
