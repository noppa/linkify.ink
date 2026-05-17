// @ts-check
import { h, Fragment } from '../libraries.bundle.js';
import { useState } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import { encode } from '../lib/codec.js';

const html = htm.bind(h);

/** @typedef {{ name: string, type: string, content: Uint8Array }} FileEntry */

/**
 * @param {{
 *   files: FileEntry[],
 *   onClose: () => void,
 * }} props
 */
export default function ShareModal({ files, onClose }) {
	const [encryption, setEncryption] = useState(/** @type {'none' | 'password' | 'ecdh'} */ ('none'));
	const [password, setPassword] = useState('');
	const [url, setUrl] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [copied, setCopied] = useState(false);

	async function generate() {
		setLoading(true);
		setError('');
		setUrl('');
		try {
			const result = await encode(files, {
				encryption,
				...(encryption === 'password' ? { password } : {}),
			});
			setUrl(result);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}

	async function copyUrl() {
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	function openUrl() {
		window.open(url, '_blank');
	}

	function handleBackdropClick(e) {
		if (e.target === e.currentTarget) onClose();
	}

	return html`
		<div class="modal-backdrop" onClick=${handleBackdropClick}>
			<div class="modal">
				<div class="modal-title">
					<i class="ti ti-link"></i> Share files
				</div>

				<div class="modal-row">
					<label>Encryption</label>
					<select value=${encryption} onChange=${(e) => setEncryption(e.target.value)}>
						<option value="none">None (public link)</option>
						<option value="password">Password (Argon2id + AES-GCM)</option>
					</select>
				</div>

				${encryption === 'password' && html`
					<div class="modal-row">
						<label>Password</label>
						<input
							type="password"
							value=${password}
							onInput=${(e) => setPassword(e.target.value)}
							placeholder="Enter a strong password"
						/>
					</div>
				`}

				${error && html`<div class="modal-row" style="color: tomato">${error}</div>`}

				${url && html`
					<div class="modal-row">
						<label>Your link</label>
						<div class="modal-url">${url}</div>
					</div>
				`}

				<div class="modal-actions">
					<button class="btn" onClick=${onClose}>Cancel</button>
					${url && html`
						<button class="btn" onClick=${openUrl}>Open <i class="ti ti-external-link"></i></button>
						<button class="btn" onClick=${copyUrl}>${copied ? 'Copied!' : 'Copy link'}</button>
					`}
					<button class="btn btn-primary" onClick=${generate} disabled=${loading}>
						${loading ? 'Generating…' : 'Generate link'}
					</button>
				</div>
			</div>
		</div>
	`;
}
