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
		// index.html compiles the .tsx files in the browser with Sucrase, reading
		// them through the Preview API (see README.md), and runs them.
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
</head>
<body>
  <div id="root"></div>
  <pre id="errors" style="color: crimson"></pre>
  <script type="module">
    import { transform } from 'https://esm.sh/sucrase@3.35.1?bundle';

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

    const files = await getFiles();
    const decoder = new TextDecoder();
    const sources = Object.fromEntries(
      files.map((file) => [file.name, decoder.decode(file.content)]),
    );

    // React comes from the globals the scripts above define.
    const globals = { 'react': React, 'react-dom': ReactDOM, 'react-dom/client': ReactDOM };
    const modules = {};

    // A CommonJS require() over the project's files, which Sucrase compiles
    // from TypeScript and JSX as they're first required.
    function requireFrom(importer, specifier) {
      if (specifier in globals) return globals[specifier];
      const url = new URL(specifier, 'file:///' + importer);
      const path = decodeURIComponent(url.pathname.slice(1));
      const name = ['', '.tsx', '.ts', '.jsx', '.js']
        .map((ext) => path + ext)
        .find((name) => name in sources);
      if (!name) throw new Error('Cannot find ' + specifier + ' from ' + importer);
      if (!modules[name]) {
        const module = (modules[name] = { exports: {} });
        const { code } = transform(sources[name], {
          transforms: ['typescript', 'jsx', 'imports'],
          filePath: name,
          production: true,
        });
        const run = new Function('require', 'module', 'exports', code);
        run((specifier) => requireFrom(name, specifier), module, module.exports);
      }
      return modules[name].exports;
    }

    try {
      requireFrom('', './main.tsx');
    } catch (error) {
      document.getElementById('errors').textContent = error.message;
    }
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
