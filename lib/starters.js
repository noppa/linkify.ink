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
};

/** @type {keyof typeof STARTERS} */
export const DEFAULT_STARTER = 'markdown';
