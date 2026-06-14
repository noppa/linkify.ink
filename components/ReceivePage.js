import { h } from '../libraries.bundle.js';
import { useState, useEffect } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';
import {
	decode,
	peekEncryptionType,
	ENC_PASSWORD,
	ENC_ECDH,
} from '../lib/codec.js';
import { encode as b64encode } from '../lib/base64url.js';
import { generateEcdhKeypair, exportPublicKey } from '../lib/crypto.js';
import { guessType } from '../lib/filetypes.js';
import { downloadFiles } from '../lib/download.js';
import { setPendingFiles } from '../lib/transfer.js';

const html = htm.bind(h);

const SESSION_KEY = 'linkify-ecdh-session';

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

export default function ReceivePage() {
	const [pasteInput, setPasteInput] = useState('');
	const [password, setPassword] = useState('');
	const [files, setFiles] = useState(/** @type {FileEntry[] | null} */ (null));
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const [ecdhPublicKey, setEcdhPublicKey] = useState('');
	const [ecdhPrivateKey, setEcdhPrivateKey] = useState(
		/** @type {CryptoKey | null} */ (null),
	);
	const [keyCopied, setKeyCopied] = useState(false);

	// Restore or generate ECDH keypair, persisted in sessionStorage so same-tab navigations preserve it.
	// This matters because the editor redirects ECDH links to /receive#<hash>, which would otherwise
	// generate a new keypair (unable to decrypt the payload encrypted with the original one).
	useEffect(() => {
		async function setup() {
			try {
				const stored = sessionStorage.getItem(SESSION_KEY);
				if (stored) {
					const { privateKeyJwk, publicKeyRaw } = JSON.parse(stored);
					const pk = await crypto.subtle.importKey(
						'jwk',
						privateKeyJwk,
						{ name: 'ECDH', namedCurve: 'P-256' },
						true,
						['deriveKey'],
					);
					setEcdhPrivateKey(pk);
					setEcdhPublicKey(publicKeyRaw);
					return;
				}
			} catch {
				/* fall through to generate */
			}

			const { publicKey, privateKey } = await generateEcdhKeypair();
			const rawPub = await exportPublicKey(publicKey);
			const pubBase64 = b64encode(rawPub);
			const jwk = await crypto.subtle.exportKey('jwk', privateKey);
			try {
				sessionStorage.setItem(
					SESSION_KEY,
					JSON.stringify({ privateKeyJwk: jwk, publicKeyRaw: pubBase64 }),
				);
			} catch {
				/* may fail in private mode */
			}
			setEcdhPublicKey(pubBase64);
			setEcdhPrivateKey(privateKey);
		}
		setup().catch(console.error);
	}, []);

	// Pre-fill the paste input when redirected from the editor (e.g. /receive#<ecdh-hash>)
	useEffect(() => {
		const hash = window.location.hash;
		if (hash && hash.length > 1) {
			setPasteInput(window.location.href);
			window.history.replaceState(null, '', window.location.pathname);
		}
	}, []);

	// Warn before closing the tab while the keypair is active and no files have been received yet
	useEffect(() => {
		if (!ecdhPrivateKey || files) return;
		function onBeforeUnload(e) {
			e.preventDefault();
		}
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	}, [ecdhPrivateKey, files]);

	/** @param {string} input @returns {string | null} */
	function parseHash(input) {
		const trimmed = input.trim();
		if (!trimmed) return null;
		// If '#' appears within the first 50 chars (i.e. as part of a URL), strip everything before it
		const hashIdx = trimmed.indexOf('#');
		if (hashIdx !== -1 && hashIdx < 50) {
			const rest = trimmed.slice(hashIdx);
			return rest.length > 1 ? rest : null;
		}
		// Looks like a URL but has no '#' — nothing to decode
		if (/^https?:\/\//i.test(trimmed)) return null;
		// Raw hash value without '#' prefix
		return '#' + trimmed;
	}

	const parsedHash = parseHash(pasteInput);
	const detectedEncType = parsedHash ? peekEncryptionType(parsedHash) : null;

	async function handleOpen() {
		if (!parsedHash) {
			setError('Paste a valid link or hash');
			return;
		}

		setLoading(true);
		setError('');

		try {
			/** @type {{ password?: string, privateKey?: CryptoKey }} */
			const opts = {};
			if (detectedEncType === ENC_ECDH) {
				if (!ecdhPrivateKey)
					throw new Error(
						'Keypair not ready — please wait a moment and try again',
					);
				opts.privateKey = ecdhPrivateKey;
			} else if (detectedEncType === ENC_PASSWORD) {
				if (!password) {
					setError('Enter the password');
					setLoading(false);
					return;
				}
				opts.password = password;
			}
			const result = await decode(parsedHash, opts);
			setFiles(
				result.files.map((f) => ({
					name: f.name,
					type: guessType(f.name),
					content: f.data,
				})),
			);
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			if (detectedEncType === ENC_ECDH) {
				setError(
					'Decryption failed. The link may not have been encrypted with your public key.',
				);
			} else if (detectedEncType === ENC_PASSWORD) {
				setError('Decryption failed. Wrong password?');
			} else {
				setError(msg);
			}
		} finally {
			setLoading(false);
		}
	}

	function openInEditor() {
		if (!files) return;
		setPendingFiles(files);
		history.pushState(null, '', '/');
		window.dispatchEvent(new PopStateEvent('popstate'));
	}

	function downloadAll() {
		if (files) downloadFiles(files);
	}

	async function copyKey() {
		await navigator.clipboard.writeText(ecdhPublicKey);
		setKeyCopied(true);
		setTimeout(() => setKeyCopied(false), 1500);
	}

	const openDisabled =
		loading || !pasteInput.trim() || (detectedEncType === 2 && !ecdhPrivateKey);

	return html`
		<div class="receive-page">
			<a class="logo receive-logo" href="/">
				<div class="logo-dot"></div>
				linkify.ink
			</a>

			${!files &&
			html`
				<div class="receive-card">
					<div class="receive-section-title">
						<${Icon} name="lock" /> Your public key
					</div>
					<p class="receive-hint">
						Copy this key and share it with the sender. They'll use it in the
						Share dialog to encrypt files exclusively for you.${' '}
						<strong>Do not close this tab</strong> — your private key exists
						only in this browser session.
					</p>
					${ecdhPublicKey
						? html`
								<div class="receive-pubkey">${ecdhPublicKey}</div>
								<button class="btn" onClick=${copyKey}>
									<${Icon} name=${keyCopied ? 'check' : 'copy'} />
									${keyCopied ? 'Copied!' : 'Copy public key'}
								</button>
							`
						: html`<p class="receive-hint">Generating keypair…</p>`}

					<div class="receive-divider"></div>

					<div class="receive-section-title">
						<${Icon} name="download" /> Open a shared link
					</div>
					<p class="receive-hint">
						Paste a link from the sender. Works for all link types —
						unencrypted, password-protected, or encrypted with your public key
						above.
					</p>
					<textarea
						class="modal-textarea"
						value=${pasteInput}
						onInput=${(e) => {
							setPasteInput(
								/** @type {HTMLTextAreaElement} */ (e.target).value,
							);
							setError('');
							setPassword('');
						}}
						placeholder="https://linkify.ink/#..."
						rows="3"
					></textarea>
					${detectedEncType === ENC_PASSWORD &&
					html`
						<div class="modal-row">
							<label>Password</label>
							<input
								type="password"
								value=${password}
								onInput=${(e) =>
									setPassword(/** @type {HTMLInputElement} */ (e.target).value)}
								onKeyDown=${(e) => e.key === 'Enter' && handleOpen()}
								autofocus
							/>
						</div>
					`}
					${error && html`<div class="modal-error">${error}</div>`}
					<div class="modal-actions" style="justify-content:flex-start">
						<button
							class="btn btn-primary"
							onClick=${handleOpen}
							disabled=${openDisabled}
						>
							${loading ? 'Opening…' : 'Open'}
						</button>
					</div>
				</div>
			`}
			${files &&
			html`
				<div class="receive-card">
					<div class="receive-section-title">
						${files.length} file${files.length !== 1 ? 's' : ''} received
					</div>
					<ul class="receive-file-list">
						${files.map(
							(f) => html`
								<li>
									<${Icon} name="file" />
									<span>${f.name}</span>
									<span class="receive-file-size"
										>${humanSize(f.content.length)}</span
									>
								</li>
							`,
						)}
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

/** @param {number} n */
function humanSize(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
