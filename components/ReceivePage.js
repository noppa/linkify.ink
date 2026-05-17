// @ts-check
import { h, Fragment } from '../libraries.bundle.js';
import { useState, useEffect } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import { decode } from '../lib/codec.js';
import { decode as b64decode } from '../lib/base64url.js';

const html = htm.bind(h);

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

export default function ReceivePage() {
	const hash = window.location.hash;
	const [password, setPassword] = useState('');
	const [files, setFiles] = useState(/** @type {FileEntry[] | null} */ (null));
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [needsPassword, setNeedsPassword] = useState(false);

	// Try auto-decode on load if no password needed
	useEffect(() => {
		if (!hash) return;
		// Peek at flag byte to detect encryption type
		try {
			const raw = hash.startsWith('#') ? hash.slice(1) : hash;
			const buf = b64decode(raw);
			const encType = (buf[0] >> 6) & 0x03;
			if (encType === 0) {
				// Unencrypted, decode immediately
				handleDecode();
			} else {
				setNeedsPassword(encType === 1);
			}
		} catch {
			// ignore
		}
	}, []);

	async function handleDecode() {
		setLoading(true);
		setError('');
		try {
			const result = await decode(hash, { password: password || undefined });
			const typedFiles = result.files.map((f) => ({
				name: f.name,
				type: guessType(f.name),
				content: f.data,
			}));
			setFiles(typedFiles);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}

	function openInEditor() {
		if (!files) return;
		// Encode as state in sessionStorage and navigate to editor
		const serialized = JSON.stringify(
			files.map((f) => ({ name: f.name, type: f.type, content: Array.from(f.content) })),
		);
		sessionStorage.setItem('linkify-received-files', serialized);
		window.location.href = '/';
	}

	function downloadAll() {
		if (!files) return;
		for (const f of files) {
			const blob = new Blob([f.content], { type: f.type });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = f.name;
			a.click();
			URL.revokeObjectURL(a.href);
		}
	}

	return html`
		<div class="receive-page">
			<div class="logo" style="font-size:18px;font-weight:700">
				<div class="logo-dot"></div>
				linkify.ink
			</div>

			${!files && html`
				<div class="receive-card">
					<div style="font-weight:600">Receive files</div>
					${!hash && html`<p style="color:var(--text-muted)">No payload in URL.</p>`}
					${hash && html`<>
						${needsPassword && html`
							<div class="modal-row">
								<label>Password</label>
								<input
									type="password"
									value=${password}
									onInput=${(e) => setPassword(e.target.value)}
									placeholder="Enter password"
									onKeyDown=${(e) => e.key === 'Enter' && handleDecode()}
								/>
							</div>
						`}
						${error && html`<div style="color:tomato">${error}</div>`}
						<div class="modal-actions">
							<button class="btn btn-primary" onClick=${handleDecode} disabled=${loading}>
								${loading ? 'Decrypting…' : 'Decrypt & Open'}
							</button>
						</div>
					</>`}
				</div>
			`}

			${files && html`
				<div class="receive-card">
					<div style="font-weight:600">${files.length} file${files.length !== 1 ? 's' : ''} received</div>
					<ul style="list-style:none;display:flex;flex-direction:column;gap:4px">
						${files.map((f) => html`
							<li style="display:flex;align-items:center;gap:6px;font-size:12px">
								<i class="ti ti-file"></i> ${f.name}
								<span style="color:var(--text-muted);margin-left:auto">${humanSize(f.content.length)}</span>
							</li>
						`)}
					</ul>
					<div class="modal-actions">
						<button class="btn" onClick=${downloadAll}>
							<i class="ti ti-download"></i> Download all
						</button>
						<button class="btn btn-primary" onClick=${openInEditor}>
							<i class="ti ti-pencil"></i> Open in editor
						</button>
					</div>
				</div>
			`}
		</div>
	`;
}

/** @param {string} name */
function guessType(name) {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	const map = {
		html: 'text/html', htm: 'text/html', css: 'text/css',
		js: 'text/javascript', mjs: 'text/javascript', ts: 'text/typescript',
		json: 'application/json', md: 'text/markdown', txt: 'text/plain',
		svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
		jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
		avif: 'image/avif',
	};
	return map[ext] || 'application/octet-stream';
}

/** @param {number} n */
function humanSize(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
