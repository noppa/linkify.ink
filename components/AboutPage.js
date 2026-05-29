// @ts-check
import { h } from '../libraries.bundle.js';
import { htm } from '../libraries.bundle.js';

const html = htm.bind(h);

export default function AboutPage() {
	return html`
		<div class="about-page">
			<div class="logo" style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;margin-bottom:24px">
				<div class="logo-dot"></div>
				linkify.ink
			</div>
			<h1>About</h1>
			<p>
				<strong>linkify.ink</strong> is a browser-based tool to share files as URLs.
				Files are packed, compressed with zstd, and optionally encrypted — entirely in your browser.
				No server ever sees your files.
			</p>
			<p>
				Payloads are stored in the URL hash fragment, which is never sent to the server.
			</p>
			<p>
				<strong>Encryption options:</strong>
			</p>
			<ul style="margin-left:20px;margin-bottom:12px;color:var(--text-muted)">
				<li><strong>None</strong> — public link, anyone with the URL can open it</li>
				<li><strong>Password</strong> — Argon2id key derivation + AES-256-GCM encryption</li>
			</ul>
			<p>
				<a href="/" style="color:var(--accent)">← Back to editor</a>
			</p>
		</div>
	`;
}
