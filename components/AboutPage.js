import { h } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';

const html = htm.bind(h);

export default function AboutPage() {
	return html`
		<div class="about-page">
			<div
				class="logo"
				style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;margin-bottom:24px"
			>
				<div class="logo-dot"></div>
				linkify.ink
			</div>
			<h1>About</h1>
			<p>
				<strong>linkify.ink</strong> shares files without uploading them
				anywhere. Files are packed, compressed with zstd, optionally encrypted,
				and encoded into the URL itself — the link <em>is</em> the file. There's
				no upload, no storage, no account, and no expiry date.
			</p>
			<p>
				The payload lives in the URL hash fragment, which browsers never send to
				the server. Your files exist only in the links you share and the
				browsers that open them.
			</p>
			<p>
				<strong>Sharing modes:</strong>
			</p>
			<ul style="margin-left:20px;margin-bottom:12px;color:var(--text-muted)">
				<li>
					<strong>Public</strong> — a plain link; anyone who has it can open it
				</li>
				<li>
					<strong>Password</strong> — encrypted with AES-256-GCM, key derived
					from your password with Argon2id
				</li>
				<li>
					<strong>Recipient key (ECDH)</strong> — the recipient opens${' '}
					<a href="/receive" style="color:var(--accent)">/receive</a>, which
					generates an ephemeral keypair in their browser. They send you their
					public key, you encrypt directly to it — only they can decrypt, and
					there's no password to leak
				</li>
			</ul>
			<p>
				All encryption and decryption happens in your browser using the
				WebCrypto API. Keys are never sent anywhere, and in ECDH mode the
				private key never leaves the receive page.
			</p>
			<p>
				Markdown, images, and even multi-file HTML/CSS/JS projects can be
				previewed live — web projects run in a sandboxed iframe on a separate
				origin, so untrusted code from a link never runs on the main site.
			</p>
			<p>
				<a href="/" style="color:var(--accent)">← Back to editor</a>
			</p>
		</div>
	`;
}
