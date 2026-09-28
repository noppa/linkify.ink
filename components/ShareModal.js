import { h, Fragment } from '../libraries.bundle.js';
import { useState } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';
import Icon from '../lib/icons.js';
import { linkify, LinkifyInk } from '../lib/linkify.js';

const html = htm.bind(h);

/** @typedef {import('../lib/types.js').FileEntry} FileEntry */

/**
 * @param {{
 *   files: FileEntry[],
 *   onClose: () => void,
 *   onGenerated?: () => void,
 * }} props
 */
export default function ShareModal({ files, onClose, onGenerated }) {
	const [encryption, setEncryption] = useState(
		/** @type {'none' | 'password' | 'ecdh'} */ ('none'),
	);
	const [password, setPassword] = useState('');
	const [recipientKey, setRecipientKey] = useState('');
	const [url, setUrl] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [copied, setCopied] = useState(false);

	async function generate() {
		setLoading(true);
		setError('');
		setUrl('');
		try {
			/** @type {Parameters<typeof linkify.createLink>[1]} */
			const opts = { encryption };
			if (encryption === 'password') {
				if (!password) throw new Error('Enter a password');
				opts.password = password;
			} else if (encryption === 'ecdh') {
				if (!recipientKey.trim())
					throw new Error("Paste the recipient's public key");
				const raw = LinkifyInk.base64UrlDecode(recipientKey.trim());
				// Validate key by importing it
				await linkify.importPublicKey(raw);
				opts.recipientPublicKey = raw;
			}
			const result = await linkify.createLink(
				files.map((f) => ({ name: f.name, data: f.content })),
				opts,
			);
			setUrl(result);
			onGenerated?.();
		} catch (e) {
			console.error(e);
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}

	// For ECDH, share only the hash fragment — the receiver pastes it into /receive directly,
	// and opening the full URL would generate a new keypair that can't decrypt the payload.
	const shareValue =
		url && encryption === 'ecdh' ? url.slice(url.indexOf('#')) : url;

	async function copyUrl() {
		await navigator.clipboard.writeText(shareValue);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	function openUrl() {
		window.open(url, '_blank');
	}

	function handleBackdropClick(e) {
		if (e.target === e.currentTarget) onClose();
	}

	const shareLen = shareValue.length;
	const urlWarning =
		shareLen > 32000
			? `Warning: payload is ${shareLen.toLocaleString()} chars — some browsers may truncate it.`
			: '';

	return html`
		<div class="modal-backdrop" onClick=${handleBackdropClick}>
			<div class="modal">
				<div class="modal-title"><${Icon} name="link" /> Share files</div>

				<div class="modal-row">
					<label>Encryption</label>
					<select
						value=${encryption}
						onChange=${(e) => {
							setEncryption(e.target.value);
							setUrl('');
							setError('');
						}}
					>
						<option value="none">None (public link)</option>
						<option value="password">Password (Argon2id + AES-GCM)</option>
						<option value="ecdh">Recipient public key (ECDH)</option>
					</select>
				</div>

				${encryption === 'password' &&
				html`
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
				${encryption === 'ecdh' &&
				html`
					<ol class="modal-ecdh-guide">
						<li>
							Ask the recipient to open${' '}
							<a href=${`${location.origin}/receive`} target="_blank"
								>${location.origin}/receive</a
							>${' '}in their browser.
						</li>
						<li>
							Have them copy their public key and send it to you. Paste it
							below.
						</li>
						<li>
							Generate the link and send it to them — only they can decrypt it.
						</li>
					</ol>
					<div class="modal-row">
						<label>Recipient's public key</label>
						<textarea
							class="modal-textarea"
							value=${recipientKey}
							onInput=${(e) => setRecipientKey(e.target.value)}
							placeholder="Paste the recipient's public key"
							rows="3"
						></textarea>
					</div>
				`}
				${error && html`<div class="modal-row modal-error">${error}</div>`}
				${url &&
				html`
					<div class="modal-row">
						<label>
							${encryption === 'ecdh' ? 'Encrypted payload' : 'Your link'}
							${shareLen > 0
								? html`<span class="modal-url-length"
										> ${shareLen.toLocaleString()} chars</span
									>`
								: ''}
						</label>
						<div class="modal-url">${shareValue}</div>
						${urlWarning && html`<div class="modal-error">${urlWarning}</div>`}
					</div>
				`}

				<div class="modal-actions">
					<button class="btn" onClick=${onClose}>Cancel</button>
					${url &&
					html`<${Fragment}>
						${encryption !== 'ecdh' && html`<button class="btn" onClick=${openUrl}>Open <${Icon} name="link-external" /></button>`}
						<button class="btn" onClick=${copyUrl}>${copied ? 'Copied!' : encryption === 'ecdh' ? 'Copy payload' : 'Copy link'}</button>
					</${Fragment}>`}
					<button
						class="btn btn-primary"
						onClick=${generate}
						disabled=${loading}
					>
						${loading ? 'Generating…' : 'Generate link'}
					</button>
				</div>
			</div>
		</div>
	`;
}
