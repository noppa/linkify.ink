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
				anywhere. Files are packed, compressed, optionally encrypted, and
				encoded into the URL itself. There's no upload, no storage, no account,
				and no expiry date.
			</p>
			<p>
				Browsers don't send the part of a URL after <code>#</code> to the
				server, so linkify.ink never sees your files. They exist only in the
				links you share and the browsers that open them.
			</p>
			<p>
				<strong>Sharing modes:</strong>
			</p>
			<ul style="margin-left:20px;margin-bottom:12px;color:var(--text-muted)">
				<li>
					<strong>Public:</strong> a plain link; anyone who has it can open it.
				</li>
				<li>
					<strong>Password:</strong> encrypted with a key derived from your
					password.
				</li>
				<li>
					<strong>Recipient key:</strong> the recipient opens${' '}
					<a href="/receive" style="color:var(--accent)">/receive</a>, which
					generates a keypair in their browser. They send you their public key,
					and you encrypt to it. Only they can decrypt, and there's no password
					to leak.
				</li>
			</ul>
			<p>
				Encryption and decryption happen in your browser. Private keys and
				passwords are never sent anywhere.
			</p>
			<p>
				The link itself is still shared through whatever you send it on: chat
				apps store it, and browsers sync history. For a public link, whoever has
				the URL has the files. A password-protected link can be guessed at
				offline, so use a long password.
			</p>
			<p>
				Markdown, images, and even multi-file web projects can be previewed
				live. Web projects run on a separate, sandboxed origin, so untrusted
				code from a link never runs on the main site.
			</p>
			<p>
				<a href="/" style="color:var(--accent)">← Back to editor</a>
			</p>
		</div>
	`;
}
