// setup-fixtures.mjs — fetch the real stylesheets the fixture pages are built on.
//
// The pages in fixtures/ are hand-written, but the CSS they load is not: it is
// the actual shipped build of Bootstrap, Bulma, Pico and github-markdown-css,
// pulled from npm. That matters, because the entire question this demo asks is
// how the computed styles of real-world CSS compress, and synthetic CSS would
// answer a different, easier question.
//
// The stylesheets are downloaded rather than committed — they are ~700KB of
// third-party code with their own licences, and they are perfectly reproducible.
//
//   node demo/scrape-compress/setup-fixtures.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, 'fixtures', 'vendor');
const staging = join(here, '.npm-staging');

/** Package → the files to lift out of it, as [source within package, name in vendor/]. */
const WANTED = {
	'bootstrap@5.3.8': [['dist/css/bootstrap.min.css', 'bootstrap.css']],
	'bulma@1.0.4': [['css/bulma.min.css', 'bulma.css']],
	'@picocss/pico@2.1.1': [['css/pico.min.css', 'pico.css']],
	'github-markdown-css@5.9.0': [['github-markdown.css', 'markdown.css']],
};

if (existsSync(vendor) && process.argv[2] !== '--force') {
	console.log('fixtures/vendor already populated — pass --force to refetch');
	process.exit(0);
}

mkdirSync(staging, { recursive: true });
mkdirSync(vendor, { recursive: true });

console.log('installing stylesheet packages...');
execFileSync(
	'npm',
	['install', '--no-save', '--no-audit', '--no-fund', '--prefix', staging, ...Object.keys(WANTED)],
	{ stdio: 'inherit' },
);

for (const [spec, files] of Object.entries(WANTED)) {
	// `@scope/name@version` → `@scope/name`; `name@version` → `name`.
	const name = spec.slice(0, spec.lastIndexOf('@')) || spec;
	for (const [from, to] of files) {
		cpSync(join(staging, 'node_modules', name, from), join(vendor, to));
		console.log('  ' + to);
	}
}

rmSync(staging, { recursive: true, force: true });
console.log('done');
