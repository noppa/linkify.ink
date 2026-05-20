// Cloudflare Worker for *.sandbox.linkify.ink
// Serves sandbox-loader.html and sandbox-sw.js for all subdomains.
// The service worker (sandbox-sw.js) intercepts fetch events within the UUID subdomain
// and serves files posted by the parent (linkify.ink) via postMessage.

const LOADER_HTML = `<!doctype html>
<html>
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>sandbox</title>
		<style>body { margin: 0; background: #fff; }</style>
	</head>
	<body>
		<script>
			const PARENT_ORIGIN = 'https://linkify.ink';
			let pendingEntry = 'index.html';

			async function init() {
				if (!('serviceWorker' in navigator)) return;
				await navigator.serviceWorker.register('/sandbox-sw.js', { scope: '/' });
				await new Promise((resolve) => {
					if (navigator.serviceWorker.controller) { resolve(undefined); return; }
					navigator.serviceWorker.addEventListener('controllerchange', () => resolve(undefined), { once: true });
				});
				navigator.serviceWorker.addEventListener('message', (event) => {
					if (event.data?.type === 'ready') {
						window.location.replace('/' + pendingEntry);
					}
				});
				window.parent.postMessage({ type: 'sandbox-ready' }, PARENT_ORIGIN);
			}

			window.addEventListener('message', (event) => {
				if (event.origin !== PARENT_ORIGIN) return;
				if (!event.data || event.data.type !== 'files') return;
				pendingEntry = event.data.entry || 'index.html';
				navigator.serviceWorker.controller?.postMessage({
					type: 'files',
					files: event.data.files,
				});
			});

			init();
		<\/script>
	</body>
</html>`;

// Keep this in sync with sandbox-sw.js in the repo root
const SW_JS = `
const files = new Map();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
	if (!event.data || event.data.type !== 'files') return;
	files.clear();
	for (const [name, bytes] of Object.entries(event.data.files)) {
		files.set('/' + String(name).replace(/^\\//, ''), new Uint8Array(bytes));
	}
	event.source?.postMessage({ type: 'ready' });
});
self.addEventListener('fetch', (event) => {
	const { pathname } = new URL(event.request.url);
	const path = pathname === '/' ? '/index.html' : pathname;
	const data = files.get(path);
	if (data !== undefined) {
		event.respondWith(new Response(data, { headers: { 'Content-Type': mimeFor(path) } }));
	}
});
function mimeFor(path) {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	const map = {
		html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',
		json:'application/json',md:'text/markdown',txt:'text/plain',svg:'image/svg+xml',
		png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',
		webp:'image/webp',avif:'image/avif',woff:'font/woff',woff2:'font/woff2',ico:'image/x-icon',
	};
	return map[ext] ?? 'application/octet-stream';
}
`;

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
