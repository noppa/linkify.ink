// Cloudflare Worker for *.sandbox.linkify.ink
// Serves sandbox-loader.html and sandbox-sw.js for all subdomains. Both are imported
// from the repo root as text modules (see the [[rules]] in wrangler.toml) so the
// hosted sandbox stays in sync with the local dev-server, which serves the same files.
// The service worker (sandbox-sw.js) intercepts fetch events within the UUID subdomain
// and serves files posted by the parent (linkify.ink) via postMessage.

import LOADER_HTML from './sandbox-loader.html';
import SW_JS from './sandbox-sw.js';

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === '/sandbox-sw.js') {
			return new Response(SW_JS, {
				headers: {
					'Content-Type': 'application/javascript',
					'Service-Worker-Allowed': '/',
					'Cache-Control': 'no-cache',
				},
			});
		}

		return new Response(LOADER_HTML, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cache-Control': 'no-cache',
			},
		});
	},
};
