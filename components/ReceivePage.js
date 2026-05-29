// @ts-check
import { h, Fragment } from '../libraries.bundle.js';
import { useState, useEffect } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';
import { decode } from '../lib/codec.js';
import { decode as b64decode, encode as b64encode } from '../lib/base64url.js';
import { generateEcdhKeypair, exportPublicKey } from '../lib/crypto.js';

const html = htm.bind(h);

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

export default function ReceivePage() {
	const hash = window.location.hash;

	const [password, setPassword] = useState('');
	const [files, setFiles] = useState(/** @type {FileEntry[] | null} */ (null));
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [needsPassword, setNeedsPassword] = useState(false);
	const [isEcdh, setIsEcdh] = useState(false);

	// Ephemeral ECDH keypair for this session
	const [ecdhPublicKey, setEcdhPublicKey] = useState('');
	const [ecdhPrivateKey, setEcdhPrivateKey] = useState(/** @type {CryptoKey | null} */ (null));
	const [keyCopied, setKeyCopied] = useState(false);

	// Generate ephemeral ECDH keypair on mount (for the /receive → sender flow)
	useEffect(() => {
		generateEcdhKeypair().then(async ({ publicKey, privateKey }) => {
			const raw = await exportPublicKey(publicKey);
			setEcdhPublicKey(b64encode(raw));
			setEcdhPrivateKey(privateKey);
		}).catch(() => { /* ignore — ECDH simply won't be offered */ });
	}, []);

	// Auto-decode on load if no password/key needed
	useEffect(() => {
		if (!hash) return;
		try {
			const raw = hash.startsWith('#') ? hash.slice(1) : hash;
			const buf = b64decode(raw);
			const encType = (buf[0] >> 6) & 0x03;
			if (encType === 0) {
				handleDecode();
			} else if (encType === 1) {
				setNeedsPassword(true);
			} else if (encType === 2) {
				setIsEcdh(true);
			}
		} catch { /* ignore */ }
	}, []);

	async function handleDecode() {
		setLoading(true);
		setError('');
		try {
			/** @type {{ password?: string, privateKey?: CryptoKey }} */
			const opts = {};
			if (needsPassword) opts.password = password;
			if (isEcdh) {
				if (!ecdhPrivateKey) throw new Error('ECDH private key not ready — please wait a moment and try again');
				opts.privateKey = ecdhPrivateKey;
			}
			const result = await decode(hash, opts);
			const typedFiles = result.files.map((f) => ({
				name: f.name,
				type: guessType(f.name),
				content: f.data,
			}));
			setFiles(typedFiles);
		} catch (e) {
			console.error(e);
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}

	function openInEditor() {
		if (!files) return;
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

	async function copyKey() {
		await navigator.clipboard.writeText(ecdhPublicKey);
		setKeyCopied(true);
		setTimeout(() => setKeyCopied(false), 1500);
	}

	return html`
		<div class="receive-page">
			<a class="logo receive-logo" href="/">
				<div class="logo-dot"></div>
				linkify.ink
			</a>

			${!files && html`
				<div class="receive-card">
					${!hash && html`<>
						<div class="receive-section-title">Your receive session</div>
						<p class="receive-hint">
							Share this public key with the sender. They will use it to encrypt files for you.
							<strong>Do not reload this tab</strong> — your private key lives only in memory.
						</p>
						${ecdhPublicKey
							? html`
								<div class="receive-pubkey">${ecdhPublicKey}</div>
								<button class="btn" onClick=${copyKey}>
									${keyCopied ? 'Copied!' : 'Copy public key'}
								</button>
							`
							: html`<div class="receive-hint">Generating keypair…</div>`
						}
					</>`}

					${hash && html`<>
						<div class="receive-section-title">Receive files</div>

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

						${isEcdh && html`
							<p class="receive-hint">
								This payload was encrypted with your public key.
								Click decrypt to open it using your session's private key.
							</p>
						`}

						${error && html`<div class="modal-error">${error}</div>`}

						<div class="modal-actions" style="justify-content:flex-start">
							<button class="btn btn-primary" onClick=${handleDecode} disabled=${loading || (isEcdh && !ecdhPrivateKey)}>
								${loading ? 'Decrypting…' : 'Decrypt & Open'}
							</button>
						</div>
					</>`}
				</div>
			`}

			${files && html`
				<div class="receive-card">
					<div class="receive-section-title">${files.length} file${files.length !== 1 ? 's' : ''} received</div>
					<ul class="receive-file-list">
						${files.map((f) => html`
							<li>
								<${Icon} name="file" />
								<span>${f.name}</span>
								<span class="receive-file-size">${humanSize(f.content.length)}</span>
							</li>
						`)}
					</ul>
					<div class="modal-actions" style="justify-content:flex-start">
						<button class="btn" onClick=${downloadAll}>
							<${Icon} name="download" /> Download all
						</button>
						<button class="btn btn-primary" onClick=${openInEditor}>
							<${Icon} name="pencil" /> Open in editor
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
	/** @type {Record<string, string>} */
	const map = {
		html: 'text/html', htm: 'text/html', css: 'text/css',
		js: 'text/javascript', mjs: 'text/javascript', ts: 'text/typescript',
		json: 'application/json', md: 'text/markdown', txt: 'text/plain',
		svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
		jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
	};
	return map[ext] || 'application/octet-stream';
}

/** @param {number} n */
function humanSize(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
