import { h } from '../libraries.bundle.js';
import { useState, useEffect, useRef } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import FileList from './FileList.js';
import Editor from './Editor.js';
import Preview from './Preview.js';
import ShareModal from './ShareModal.js';
import Icon from '../lib/icons.js';
import { linkify, LinkifyInk } from '../lib/linkify.js';
import { guessType } from '../lib/filetypes.js';
import { downloadFiles } from '../lib/download.js';
import { takePendingFiles } from '../lib/transfer.js';
import { STARTERS, DEFAULT_STARTER } from '../lib/starters.js';

const html = htm.bind(h);

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

export default function EditorPage() {
	// Captured once on mount: whether these files arrived via a shared link (URL
	// hash, or handed off from ReceivePage), before takePendingFiles() consumes
	// the hand-off slot and the hash effect below clears the URL hash.
	const [initial] = useState(() => {
		const pending = takePendingFiles();
		const cameFromSharedLink =
			pending !== null || window.location.hash.length > 1;
		return {
			files: pending?.files ?? STARTERS[DEFAULT_STARTER].files(),
			metadata: pending?.metadata ?? null,
			cameFromSharedLink,
		};
	});
	const [files, setFiles] = useState(initial.files);
	// Metadata travels with the link, not with the files, so it survives edits —
	// a reader who opens a `nojs: 1` capture and tweaks a file keeps the preview's
	// scripts-off default rather than silently re-enabling them.
	const [metadata, setMetadata] = useState(
		/** @type {import('../lib/types.js').Metadata | null} */ (
			initial.metadata
		),
	);
	const [starter, setStarter] = useState(DEFAULT_STARTER);
	const [activeIndex, setActiveIndex] = useState(0);
	// Mobile-only editor/preview tab switcher; shared links start on the preview.
	const [mobileTab, setMobileTab] = useState(
		initial.cameFromSharedLink ? 'preview' : 'editor',
	);
	// On desktop a shared link first shows only its preview. Opening the editor
	// restores the normal side-by-side editor/preview workspace.
	const [sharedEditorOpen, setSharedEditorOpen] = useState(false);
	const [showShare, setShowShare] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(
		initial.files.length === 1,
	);
	const [hashError, setHashError] = useState('');
	const [hashPending, setHashPending] = useState(
		/** @type {string | null} */ (null),
	);
	const [hashPassword, setHashPassword] = useState('');
	const [hashLoading, setHashLoading] = useState(false);

	// Drag handle state
	const dividerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
	const rightRef = useRef(/** @type {HTMLDivElement | null} */ (null));
	const dragging = useRef(false);
	const dirty = useRef(false);
	console.log('EditorPage render');

	// Decode files from URL hash on first load
	useEffect(() => {
		const hash = window.location.hash;
		if (!hash || hash.length <= 1) return;
		const encType = linkify.peekEncryptionType(hash);
		if (encType === LinkifyInk.ENC_ECDH) {
			// ECDH: navigate to /receive which holds the private key for this session
			window.location.assign('/receive' + hash);
			return;
		}
		if (encType === LinkifyInk.ENC_PASSWORD) {
			// Password-encrypted: clear the hash from the URL and prompt before decoding
			window.history.replaceState(null, '', window.location.pathname);
			setHashPending(hash);
			return;
		}
		window.history.replaceState(null, '', window.location.pathname);
		linkify.readLink(hash)
			.then(({ files: decoded, metadata: decodedMetadata }) => {
				setFiles(
					decoded.map((f) => ({
						name: f.name,
						type: guessType(f.name),
						content: f.data,
					})),
				);
				setMetadata(decodedMetadata);
				setActiveIndex(0);
				setSidebarCollapsed(decoded.length === 1);
			})
			.catch((e) => {
				console.error(e);
				setHashError(e instanceof Error ? e.message : String(e));
			});
	}, []);

	// Keyboard shortcut Cmd/Ctrl+Shift+S → share
	useEffect(() => {
		function onKey(e) {
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
				e.preventDefault();
				// Blur the focused editor so DebouncedTextarea flushes its buffered
				// edit (via onBlur) before the share reads files — the click paths
				// blur naturally, but this keyboard shortcut wouldn't otherwise.
				if (document.activeElement instanceof HTMLElement) {
					document.activeElement.blur();
				}
				setShowShare(true);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	// beforeunload warning — only if the user has made changes
	useEffect(() => {
		function onUnload(e) {
			if (dirty.current) e.preventDefault();
		}
		window.addEventListener('beforeunload', onUnload);
		return () => window.removeEventListener('beforeunload', onUnload);
	}, []);

	// Drag-to-resize divider
	useEffect(() => {
		function onMouseMove(e) {
			if (!dragging.current || !rightRef.current) return;
			const rect = rightRef.current.getBoundingClientRect();
			const fraction = Math.max(
				0.1,
				Math.min(0.9, (e.clientY - rect.top) / rect.height),
			);
			rightRef.current.style.gridTemplateRows = `${fraction}fr 4px ${1 - fraction}fr`;
		}
		function onMouseUp() {
			dragging.current = false;
		}
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		return () => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		};
	}, []);

	async function decodeWithPassword() {
		if (!hashPending || !hashPassword) return;
		setHashLoading(true);
		setHashError('');
		try {
			const { files: decoded, metadata: decodedMetadata } =
				await linkify.readLink(hashPending, {
					password: hashPassword,
				});
			setFiles(
				decoded.map((f) => ({
					name: f.name,
					type: guessType(f.name),
					content: f.data,
				})),
			);
			setMetadata(decodedMetadata);
			setActiveIndex(0);
			setSidebarCollapsed(decoded.length === 1);
			setHashPending(null);
			setHashPassword('');
		} catch (e) {
			console.error(e);
			setHashError('Decryption failed. Wrong password?');
		} finally {
			setHashLoading(false);
		}
	}

	function startDrag() {
		dragging.current = true;
	}

	function applyStarter(key) {
		const choice = STARTERS[key];
		if (!choice) return;
		// Re-initializing replaces every open file, so confirm once the user has edits.
		if (
			dirty.current &&
			!window.confirm('Replace all files with this starter?')
		) {
			return;
		}
		dirty.current = false;
		setFiles(choice.files());
		setStarter(key);
		setActiveIndex(0);
	}

	function updateFile(index, content) {
		dirty.current = true;
		setFiles((prev) =>
			prev.map((f, i) => (i === index ? { ...f, content } : f)),
		);
	}

	function replaceFile(index, newFile) {
		dirty.current = true;
		setFiles((prev) => prev.map((f, i) => (i === index ? newFile : f)));
	}

	function addFiles(newFiles) {
		dirty.current = true;
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

	function renameFile(index, newName) {
		dirty.current = true;
		setFiles((prev) =>
			prev.map((f, i) =>
				i === index ? { ...f, name: newName, type: guessType(newName) } : f,
			),
		);
	}

	function deleteFile(index) {
		dirty.current = true;
		setFiles((prev) => {
			const next = prev.filter((_, i) => i !== index);
			if (activeIndex >= next.length)
				setActiveIndex(Math.max(0, next.length - 1));
			return next;
		});
	}

	const activeFile = files[activeIndex] ?? null;
	const showSharedPreviewOnly =
		initial.cameFromSharedLink && !sharedEditorOpen;

	return html`
		<div class="app">
			<div class="topbar">
				<a class="logo" href="/about">
					<div class="logo-dot"></div>
					linkify.ink
				</a>
				<div class="topbar-actions">
					${showSharedPreviewOnly &&
					html`<button
						class="btn open-editor-btn"
						onClick=${() => setSharedEditorOpen(true)}
					>
						<${Icon} name="pencil" /> Open editor
					</button>`}
					<button class="btn" onClick=${() => downloadFiles(files)}>
						<${Icon} name="download" /> Download
					</button>
					<button class="btn btn-primary" onClick=${() => setShowShare(true)}>
						<${Icon} name="link" /> Share
					</button>
				</div>
			</div>

			${hashError &&
			html`
				<div class="hash-error-bar">
					<${Icon} name="info" /> Failed to open shared link: ${hashError}
					<button class="hash-error-close" onClick=${() => setHashError('')}>
						<${Icon} name="x" />
					</button>
				</div>
			`}

			<div class="main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}">
				<${FileList}
					files=${files}
					activeIndex=${activeIndex}
					onSelect=${setActiveIndex}
					onAdd=${addFiles}
					onDelete=${deleteFile}
					onRename=${renameFile}
					starter=${starter}
					onApplyStarter=${applyStarter}
					collapsed=${sidebarCollapsed}
					onToggleCollapse=${() => setSidebarCollapsed((v) => !v)}
				/>

				<div
					class="right mobile-tab-${mobileTab} ${showSharedPreviewOnly
						? 'shared-link-preview'
						: ''}"
					ref=${rightRef}
				>
					<div class="mobile-tabs">
						<button
							class="mobile-tab ${mobileTab === 'editor' ? 'active' : ''}"
							onClick=${() => setMobileTab('editor')}
						>
							<${Icon} name="code" /> Editor
						</button>
						<button
							class="mobile-tab ${mobileTab === 'preview' ? 'active' : ''}"
							onClick=${() => setMobileTab('preview')}
						>
							<${Icon} name="eye" /> Preview
						</button>
					</div>
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
						metadata=${metadata}
					/>
				</div>
			</div>

			${showShare &&
			html`
				<${ShareModal} files=${files} onClose=${() => setShowShare(false)} />
			`}
			${hashPending &&
			html`
				<div class="modal-backdrop">
					<div class="modal">
						<div class="modal-title">
							<${Icon} name="lock" /> Password protected
						</div>
						<div class="modal-row">
							<label>Password</label>
							<input
								type="password"
								value=${hashPassword}
								onInput=${(e) => setHashPassword(e.target.value)}
								onKeyDown=${(e) => e.key === 'Enter' && decodeWithPassword()}
								autofocus
							/>
						</div>
						${hashError &&
						html`<div class="modal-row modal-error">${hashError}</div>`}
						<div class="modal-actions">
							<button
								class="btn"
								onClick=${() => {
									setHashPending(null);
									setHashPassword('');
									setHashError('');
								}}
							>
								Cancel
							</button>
							<button
								class="btn btn-primary"
								onClick=${decodeWithPassword}
								disabled=${hashLoading}
							>
								${hashLoading ? 'Decrypting…' : 'Open'}
							</button>
						</div>
					</div>
				</div>
			`}
		</div>
	`;
}
