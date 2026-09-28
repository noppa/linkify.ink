// Assembles the static SPA into ./dist for deployment to Cloudflare Workers
// Static Assets. Run `npm run bundle-libs` first (the deploy script chains it) so
// the library bundles exist. Only files the browser actually fetches from
// linkify.ink are copied — the sandbox files (sandbox-*.{html,js}) belong to the
// separate sandbox-*.linkify.ink worker and are deliberately left out.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const root = import.meta.dirname;
const dist = path.join(root, 'dist');

// Individual files and whole directories the SPA loads at runtime.
const entries = [
	'index.html',
	'app.js',
	'styles.css',
	'favicon.ico',
	'libraries.bundle.js',
	'libraries-for-preview.bundle.js',
	'vendor/vendor.codec.bundle.js',
	'linkify.ink.js',
	'assets',
	'components',
	'lib',
];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

for (const entry of entries) {
	const from = path.join(root, entry);
	const to = path.join(dist, entry);
	await fs.mkdir(path.dirname(to), { recursive: true });
	await fs.cp(from, to, { recursive: true });
}

console.log(`Built dist/ with ${entries.length} entries.`);
