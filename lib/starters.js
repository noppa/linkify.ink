// Starter templates offered when initializing a fresh project.
// Each starter's `files()` returns brand-new FileEntry objects so the editor
// never mutates the shared template content.

/** @typedef {import('./types.js').FileEntry} FileEntry */

const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);

/**
 * @type {Record<string, { label: string, files: () => FileEntry[] }>}
 */
export const STARTERS = {
	markdown: {
		label: 'Markdown',
		files: () => [{ name: 'README.md', type: 'text/markdown', content: enc('') }],
	},
	webpage: {
		label: 'Web page',
		files: () => [
			{
				name: 'index.html',
				type: 'text/html',
				content: enc(
					`<!doctype html>\n<html>\n<head>\n  <meta charset="UTF-8" />\n  <title>My project</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>Hello, world!</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
				),
			},
			{
				name: 'style.css',
				type: 'text/css',
				content: enc(`body {\n  font-family: sans-serif;\n  margin: 40px;\n}\n`),
			},
			{
				name: 'script.js',
				type: 'text/javascript',
				content: enc(`console.log('Hello from script.js');\n`),
			},
		],
	},
	react: {
		label: 'TypeScript and React',
		// index.html bundles the .tsx files in the browser with esbuild-wasm,
		// reading them through the Preview API (see README.md).
		files: () => [
			{
				name: 'index.html',
				type: 'text/html',
				content: enc(String.raw`<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>My project</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/esbuild-wasm@0.28.1/lib/browser.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <pre id="errors" style="color: crimson"></pre>
  <script>
    // Asks linkify.ink for the project's files, as { name, content } with
    // content a Uint8Array.
    function getFiles() {
      return new Promise((resolve) => {
        const id = crypto.randomUUID();
        addEventListener('message', function onReply(event) {
          if (event.source !== parent || event.data?.id !== id) return;
          removeEventListener('message', onReply);
          resolve(event.data.files);
        });
        parent.postMessage({ type: 'linkify.getFiles', id }, location.origin);
      });
    }

    // Lets esbuild import the project's files, and React from the globals the
    // scripts above define.
    function projectFiles(sources) {
      return {
        name: 'project-files',
        setup(build) {
          build.onResolve({ filter: /^react(-dom)?(\/client)?$/ }, (args) => ({
            path: args.path,
            namespace: 'global',
          }));
          build.onLoad({ filter: /.*/, namespace: 'global' }, (args) => ({
            contents: args.path.startsWith('react-dom')
              ? 'module.exports = ReactDOM'
              : 'module.exports = React',
          }));

          build.onResolve({ filter: /^\./ }, (args) => {
            const url = new URL(args.path, 'file:///' + args.importer);
            const path = decodeURIComponent(url.pathname.slice(1));
            const name = ['', '.tsx', '.ts', '.jsx', '.js']
              .map((ext) => path + ext)
              .find((name) => name in sources);
            if (!name) return { errors: [{ text: 'Cannot find ' + path }] };
            return { path: name, namespace: 'project' };
          });
          build.onLoad({ filter: /.*/, namespace: 'project' }, (args) => ({
            contents: sources[args.path],
            loader: args.path.split('.').pop(),
          }));
        },
      };
    }

    async function run() {
      const [files] = await Promise.all([
        getFiles(),
        esbuild.initialize({
          wasmURL: 'https://unpkg.com/esbuild-wasm@0.28.1/esbuild.wasm',
        }),
      ]);
      const decoder = new TextDecoder();
      const sources = Object.fromEntries(
        files.map((file) => [file.name, decoder.decode(file.content)]),
      );
      const result = await esbuild.build({
        entryPoints: ['./main.tsx'],
        bundle: true,
        write: false,
        format: 'iife',
        plugins: [projectFiles(sources)],
      });
      new Function(result.outputFiles[0].text)();
    }

    run().catch((error) => {
      document.getElementById('errors').textContent = error.message;
    });
  </script>
</body>
</html>
`),
			},
			{
				name: 'main.tsx',
				type: 'text/typescript',
				content: enc(`import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App name="world" />);
`),
			},
			{
				name: 'App.tsx',
				type: 'text/typescript',
				content: enc(`import { useState } from 'react';

type AppProps = { name: string };

export default function App({ name }: AppProps) {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>Hello, {name}!</h1>
      <button onClick={() => setCount(count + 1)}>
        Clicked {count} {count === 1 ? 'time' : 'times'}
      </button>
    </main>
  );
}
`),
			},
		],
	},
};

/** @type {keyof typeof STARTERS} */
export const DEFAULT_STARTER = 'markdown';
