// Cloudflare Worker for sandbox-*.linkify.ink
// Serves sandbox-loader.html and the service-worker script for all subdomains. Both
// are imported from the repo root as text modules so the hosted sandbox stays in sync
// with the local dev-server, which serves the same files. The service worker is stored
// as sandbox-sw.js.txt (not .js) so Wrangler's built-in Text rule imports it as a
// string; a .js file would be claimed by the default ESModule rule and bundled as an
// object. It is still served at the /sandbox-sw.js URL below. The service worker
// intercepts fetch events within the sandbox subdomain and serves files posted by the
// parent (linkify.ink) via postMessage.

import LOADER_HTML from './sandbox-loader.html';
import SW_JS from './sandbox-sw.js.txt';

export default {
	async fetch(request) {
		const url = new URL(request.url);

		// The route is *.linkify.ink/* (Cloudflare only allows a leading-label
		// wildcard), so scope the sandbox to sandbox-<uuid> hosts here. Any other
		// subdomain 404s rather than rendering a sandbox loader.
		if (!url.hostname.startsWith('sandbox-')) {
			return new Response('Not found', { status: 404 });
		}

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
