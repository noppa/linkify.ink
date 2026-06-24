// This serves as a very simple development server that serves the files in the
// current directory and polls for updates to the files, reloading the page on code changes.

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* globals process */

const baseHeaders = {
	'Cache-Control': 'public, max-age=0',
};

/**
 * @param {string} extname
 * @returns {string}
 */
function getContentType(extname) {
	const extnameWithoutDot = extname.replace(/^\./, '');
	switch (extnameWithoutDot) {
		case 'html':
			return 'text/html';
		case 'mjs':
		case 'js':
			return 'text/javascript';
		case 'css':
			return 'text/css';
		case 'json':
			return 'application/json';
		case 'ico':
			return 'image/x-icon';
		case 'png':
		case 'jpg':
			return 'image/' + extnameWithoutDot;
		default:
			return 'text/plain';
	}
}

let lastUpdatedAt = Date.now();
const requestedRelativePaths = new Set(['index.html']);

const port = Number(process.env.PORT) || 8080;
// The sandbox preview is served on its own port so it's a distinct origin from the
// editor (mirrors *.sandbox.linkify.ink in production). Different port = different
// origin, so the preview's service worker can't hijack the editor.
const sandboxPort = Number(process.env.SANDBOX_PORT) || port + 1;
const updateInterval = process.env.UPDATE_INTERVAL || 5000;

const updaterScript = `
async function checkUpdates() {
	try {
		const response = await fetch('/check-updates');
		const { hasUpdates } = await response.json();
		if (hasUpdates) {
			location.reload();
		} else {
			setTimeout(checkUpdates, ${updateInterval});
		}
	} catch (error) {
	 console.warn('Error checking updates:', error);
	}
}
setTimeout(checkUpdates, ${updateInterval});
`;

/**
 * Local mirror of the *.sandbox.linkify.ink Cloudflare worker, served on its own
 * port (sandboxPort). Serves the loader at / and the service worker at
 * /sandbox-sw.js; everything else is a preview file the service worker handles.
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 */
async function serveSandbox(request, response) {
	const pathOnly = (request.url || '/').split('?')[0];

	if (pathOnly === '/sandbox-sw.js') {
		const sw = await fs.promises.readFile(
			path.join(import.meta.dirname, 'sandbox-sw.js'),
		);
		response.writeHead(200, {
			...baseHeaders,
			'Content-Type': getContentType('.js'),
			'Service-Worker-Allowed': '/',
		});
		response.end(sw);
		return;
	}

	if (pathOnly === '/' || pathOnly === '') {
		const loader = await fs.promises.readFile(
			path.join(import.meta.dirname, 'sandbox-loader.html'),
		);
		response.writeHead(200, {
			...baseHeaders,
			'Content-Type': getContentType('.html'),
		});
		response.end(loader);
		return;
	}

	// Everything else on the sandbox origin is a preview file served by the SW.
	// If a request reaches the network it means the SW didn't have it — 404 rather
	// than leaking the editor's own files onto the sandbox origin.
	response.writeHead(404, {
		...baseHeaders,
		'Content-Type': getContentType('.txt'),
	});
	response.end('Not found (sandbox)');
}

http
	.createServer(async function (request, response) {
		try {
			const filePath = request.url;
			const relativePathStart =
				filePath.length <= 1
					? // Normalize "/" to "", and later to "index.html"
						1
					: filePath.search(/\w/);

			if (relativePathStart === -1) {
				throw new Error(`Invalid path: ${request.url}`);
			}

			let relativePath = filePath.slice(relativePathStart);

			// Updates checker for live reloading
			if (relativePath === 'updates-checker.mjs') {
				response.writeHead(200, {
					...baseHeaders,
					'Content-Type': getContentType('.js'),
				});
				response.end(updaterScript);
				return;
			} else if (relativePath === 'check-updates') {
				const stats = await Promise.all(
					Array.from(requestedRelativePaths, async (relativePath) => {
						try {
							const stats = await fs.promises.stat(
								path.join(import.meta.dirname, relativePath),
							);
							return stats.mtime.valueOf();
						} catch (error) {
							console.error(error);
							if (error.code === 'ENOENT') {
								requestedRelativePaths.delete(relativePath);
							}
						}
					}),
				);

				const newUpdatedAt = stats
					.filter(Boolean)
					.reduce((acc, mtime) => Math.max(acc, mtime), 0);
				const hasUpdates = newUpdatedAt > lastUpdatedAt;

				if (hasUpdates) {
					lastUpdatedAt = newUpdatedAt;
				}

				response.writeHead(200, {
					...baseHeaders,
					'Content-Type': getContentType('.json'),
				});
				response.end(JSON.stringify({ hasUpdates }));
				return;
			}

			if (!relativePath) {
				relativePath = 'index.html';
			}

			const contentType = getContentType(path.extname(relativePath));

			const content =
				relativePath === 'index.html'
					? await getIndexHtml()
					: await fs.promises.readFile(
							path.join(import.meta.dirname, relativePath),
						);

			requestedRelativePaths.add(relativePath);
			response.writeHead(200, { ...baseHeaders, 'Content-Type': contentType });
			response.end(content, 'utf-8');
		} catch (error) {
			if (error.code === 'ENOENT') {
				try {
					const indexHtmlContents = await getIndexHtml();
					response.writeHead(404, {
						...baseHeaders,
						'Content-Type': getContentType('.html'),
					});
					response.end(indexHtmlContents, 'utf-8');
					return;
				} catch (err) {
					// No return here on purpose: let error handling fall to the generic 500 error
					console.error(err);
				}
			}

			console.error(error);
			response.writeHead(500);
			response.end('Internal server error');
		}
	})
	.listen(port);

// Dedicated sandbox-preview server on its own port (distinct origin from the editor).
http
	.createServer(async function (request, response) {
		try {
			await serveSandbox(request, response);
		} catch (error) {
			console.error(error);
			response.writeHead(500);
			response.end('Internal server error');
		}
	})
	.listen(sandboxPort);

async function getIndexHtml() {
	const contents = await fs.promises.readFile(
		path.join(import.meta.dirname, './index.html'),
		'utf-8',
	);

	return contents.replace(
		/<\/body>/i,
		`<script src="updates-checker.mjs"></script></body>`,
	);
}

console.log(`Listening in http://localhost:${port}`);
console.log(`Sandbox preview on http://localhost:${sandboxPort}`);
