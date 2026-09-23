// fetch-corpus.mjs — download the held-out documents measure.mjs reports on.
//
// The kind of thing people share as a link: READMEs and docs, source files in
// several languages, config, a long essay, and single-file HTML pages. None of it
// is in node_modules, so none of it can be in the dictionary. Downloaded rather
// than committed because it is other people's work.
//
//   node demo/shared-dictionary/fetch-corpus.mjs   → out/corpus/

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gh = 'https://raw.githubusercontent.com/';

/** @type {Record<string, string>} local name → URL */
export const CORPUS = {
	'rust-README.md': gh + 'rust-lang/rust/master/README.md',
	'go-CONTRIBUTING.md': gh + 'golang/go/master/CONTRIBUTING.md',
	'k8s-README.md': gh + 'kubernetes/kubernetes/master/README.md',
	'django-README.rst': gh + 'django/django/main/README.rst',
	'rustbook-ch04.md': gh + 'rust-lang/book/main/src/ch04-01-what-is-ownership.md',
	'mdn-flexbox.md': gh + 'mdn/content/main/files/en-us/learn_web_development/core/css_layout/flexbox/index.md',
	'react-19.md': gh + 'reactjs/react.dev/main/src/content/blog/2024/12/05/react-19.md',
	'rfc-2094-nll.md': gh + 'rust-lang/rfcs/master/text/2094-nll.md',
	'pep-0008.rst': gh + 'python/peps/main/peps/pep-0008.rst',
	'json-encoder.py': gh + 'python/cpython/main/Lib/json/encoder.py',
	'textwrap.py': gh + 'python/cpython/main/Lib/textwrap.py',
	'strings.go': gh + 'golang/go/master/src/strings/strings.go',
	'vscode-arrays.ts': gh + 'microsoft/vscode/main/src/vs/base/common/arrays.ts',
	'nvm-install.sh': gh + 'nvm-sh/nvm/master/install.sh',
	'nginx.conf': gh + 'h5bp/server-configs-nginx/main/nginx.conf',
	'compose.yaml': gh + 'docker/awesome-compose/master/react-express-mongodb/compose.yaml',
	'node-ci.yml': gh + 'actions/starter-workflows/main/ci/node.js.yml',
	'next-package.json': gh + 'vercel/next.js/canary/package.json',
	'h5bp.html': gh + 'h5bp/html5-boilerplate/main/src/index.html',
	'punk-bands.html': gh + 'mdn/learning-area/main/css/styling-boxes/styling-tables/punk-bands-complete.html',
	'three-keyframes.html': gh + 'mrdoob/three.js/dev/examples/webgl_animation_keyframes.html',
	'pico-examples.html': gh + 'picocss/examples/master/v2-html/index.html',
	'pico-classless.html': gh + 'picocss/examples/master/v2-html-classless/index.html',
	'minimal-theme.html': gh + 'pages-themes/minimal/master/_layouts/default.html',
	'pride-and-prejudice.txt': gh + 'GITenberg/Pride-and-Prejudice_1342/master/1342.txt',
};

if (import.meta.url === `file://${process.argv[1]}`) {
	const dir = join(here, 'out', 'corpus');
	mkdirSync(dir, { recursive: true });
	for (const [name, url] of Object.entries(CORPUS)) {
		const response = await fetch(url);
		if (!response.ok) {
			console.warn(`${name}: ${response.status}, skipped`);
			continue;
		}
		let bytes = new Uint8Array(await response.arrayBuffer());
		// A 12 KB chapter, not the whole novel: a link is a note, not a library.
		if (name.endsWith('.txt')) bytes = bytes.subarray(300_000, 312_000);
		writeFileSync(join(dir, name), bytes);
		console.log(`${name}: ${bytes.length} bytes`);
	}
}
