// @ts-check
import { h, Fragment } from '../libraries.bundle.js';
import { useState, useEffect, useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import FileList from './FileList.js';
import Editor from './Editor.js';
import Preview from './Preview.js';
import ShareModal from './ShareModal.js';
import Icon from '../lib/icons.js';

const html = htm.bind(h);

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

const DEFAULT_FILES = [
	{
		name: 'index.html',
		type: 'text/html',
		content: new TextEncoder().encode(
			`<!doctype html>\n<html>\n<head>\n  <meta charset="UTF-8" />\n  <title>My project</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>Hello, world!</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
		),
	},
	{
		name: 'style.css',
		type: 'text/css',
		content: new TextEncoder().encode(`body {\n  font-family: sans-serif;\n  margin: 40px;\n}\n`),
	},
	{
		name: 'script.js',
		type: 'text/javascript',
		content: new TextEncoder().encode(`console.log('Hello from script.js');\n`),
	},
];

export default function EditorPage() {
	const [files, setFiles] = useState(() => loadInitialFiles());
	const [activeIndex, setActiveIndex] = useState(0);
	const [showShare, setShowShare] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

	// Drag handle state
	const dividerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
	const rightRef = useRef(/** @type {HTMLDivElement | null} */ (null));
	const dragging = useRef(false);

	// Keyboard shortcut Cmd/Ctrl+Shift+S → share
	useEffect(() => {
		function onKey(e) {
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
				e.preventDefault();
				setShowShare(true);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	// beforeunload warning
	useEffect(() => {
		function onUnload(e) {
			e.preventDefault();
		}
		window.addEventListener('beforeunload', onUnload);
		return () => window.removeEventListener('beforeunload', onUnload);
	}, []);

	// Drag-to-resize divider
	useEffect(() => {
		function onMouseMove(e) {
			if (!dragging.current || !rightRef.current) return;
			const rect = rightRef.current.getBoundingClientRect();
			const fraction = Math.max(0.1, Math.min(0.9, (e.clientY - rect.top) / rect.height));
			rightRef.current.style.gridTemplateRows = `${fraction}fr 4px ${1 - fraction}fr`;
		}
		function onMouseUp() { dragging.current = false; }
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		return () => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		};
	}, []);

	function startDrag() { dragging.current = true; }

	function updateFile(index, content) {
		setFiles((prev) => prev.map((f, i) => i === index ? { ...f, content } : f));
	}

	function replaceFile(index, newFile) {
		setFiles((prev) => prev.map((f, i) => i === index ? newFile : f));
	}

	function addFiles(newFiles) {
		setFiles((prev) => {
			const existing = new Set(prev.map((f) => f.name));
			const toAdd = newFiles.filter((f) => !existing.has(f.name));
			const updated = prev.map((f) => {
				const replacement = newFiles.find((n) => n.name === f.name);
				return replacement || f;
			});
			return [...updated, ...toAdd];
		});
	}

	function deleteFile(index) {
		setFiles((prev) => {
			const next = prev.filter((_, i) => i !== index);
			if (activeIndex >= next.length) setActiveIndex(Math.max(0, next.length - 1));
			return next;
		});
	}

	const activeFile = files[activeIndex] ?? null;

	return html`
		<div class="app">
			<div class="topbar">
				<a class="logo" href="/about">
					<div class="logo-dot"></div>
					linkify.ink
				</a>
				<div class="topbar-actions">
					<button class="btn btn-primary" onClick=${() => setShowShare(true)}>
						<${Icon} name="link" /> Share
					</button>
				</div>
			</div>

			<div class="main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}">
				<${FileList}
					files=${files}
					activeIndex=${activeIndex}
					onSelect=${setActiveIndex}
					onAdd=${addFiles}
					onDelete=${deleteFile}
					collapsed=${sidebarCollapsed}
					onToggleCollapse=${() => setSidebarCollapsed((v) => !v)}
				/>

				<div class="right" ref=${rightRef}>
					<${Editor}
						file=${activeFile}
						onChange=${(content) => updateFile(activeIndex, content)}
						onReplace=${(newFile) => replaceFile(activeIndex, newFile)}
					/>
					<div
						class="divider-handle"
						ref=${dividerRef}
						role="separator"
						aria-orientation="horizontal"
						onMouseDown=${startDrag}
					></div>
					<${Preview}
						files=${files}
						activeFile=${activeFile}
					/>
				</div>
			</div>

			${showShare && html`
				<${ShareModal}
					files=${files}
					onClose=${() => setShowShare(false)}
				/>
			`}
		</div>
	`;
}

function loadInitialFiles() {
	// Check if redirected from /receive with files in sessionStorage
	try {
		const stored = sessionStorage.getItem('linkify-received-files');
		if (stored) {
			sessionStorage.removeItem('linkify-received-files');
			const parsed = JSON.parse(stored);
			return parsed.map((f) => ({ ...f, content: new Uint8Array(f.content) }));
		}
	} catch { /* ignore */ }
	return DEFAULT_FILES;
}
