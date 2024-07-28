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

const port = process.env.PORT || 8080;
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
