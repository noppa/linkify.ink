// @ts-check
// Central file-type knowledge: extension → MIME mapping and classification helpers.
// Keeping this in one place avoids the slightly-different copies that used to live
// in EditorPage, ReceivePage, FileList, Editor and Preview.

/** @typedef {import('./types.js').FileEntry} FileEntry */

/** @param {string} name @returns {string} lowercased extension, or '' */
function extOf(name) {
	return name.split('.').pop()?.toLowerCase() ?? '';
}

/** @type {Record<string, string>} */
const MIME_BY_EXT = {
	html: 'text/html', htm: 'text/html', css: 'text/css',
	js: 'text/javascript', jsx: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript',
	ts: 'text/typescript', tsx: 'text/typescript',
	json: 'application/json', md: 'text/markdown', mermaid: 'text/vnd.mermaid',
	mmd: 'text/vnd.mermaid', txt: 'text/plain', xml: 'application/xml',
	sh: 'text/x-shellscript', bash: 'text/x-shellscript', zsh: 'text/x-shellscript',
	c: 'text/x-c', h: 'text/x-c', cc: 'text/x-c++', cpp: 'text/x-c++', cxx: 'text/x-c++',
	hpp: 'text/x-c++', cs: 'text/x-csharp', go: 'text/x-go', java: 'text/x-java',
	kt: 'text/x-kotlin', kts: 'text/x-kotlin', lua: 'text/x-lua', php: 'text/x-php',
	py: 'text/x-python', pyw: 'text/x-python', rb: 'text/x-ruby', rs: 'text/x-rust',
	sql: 'application/sql', swift: 'text/x-swift', yaml: 'application/yaml', yml: 'application/yaml',
	diff: 'text/x-diff', patch: 'text/x-diff', graphql: 'application/graphql', gql: 'application/graphql',
	ini: 'text/plain', less: 'text/css', scss: 'text/css', makefile: 'text/x-makefile',
	pl: 'text/x-perl', pm: 'text/x-perl', r: 'text/x-r', vb: 'text/x-vb',
	wasm: 'application/wasm', wat: 'text/plain',
	svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
	gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
};

// Extensions we treat as editable text (in addition to any `text/*` MIME type).
const TEXT_EXTS = [
	'html', 'htm', 'css', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'json', 'md',
	'mermaid', 'mmd', 'txt', 'svg', 'xml', 'sh', 'bash', 'zsh', 'c', 'h', 'cc',
	'cpp', 'cxx', 'hpp', 'cs', 'go', 'java', 'kt', 'kts', 'lua', 'php', 'py',
	'pyw', 'rb', 'rs', 'sql', 'swift', 'yaml', 'yml', 'diff', 'patch', 'graphql',
	'gql', 'ini', 'less', 'scss', 'makefile', 'pl', 'pm', 'r', 'vb', 'wat',
];
// Raster image extensions shown in the image viewer (svg is edited as text instead).
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'];
// Extensions that get the "code" icon in the sidebar.
const CODE_EXTS = TEXT_EXTS.filter(
	(ext) => !['md', 'mermaid', 'mmd', 'txt'].includes(ext),
);

/**
 * Guess a MIME type from a filename extension.
 * @param {string} name
 * @param {string} [fallback] returned for unknown / extension-less names
 * @returns {string}
 */
export function guessType(name, fallback = 'application/octet-stream') {
	return MIME_BY_EXT[extOf(name)] ?? fallback;
}

/** @param {FileEntry} file @returns {boolean} */
export function isTextFile(file) {
	return file.type.startsWith('text/') || TEXT_EXTS.includes(extOf(file.name));
}

/** @param {FileEntry} file @returns {boolean} */
export function isImageFile(file) {
	return file.type.startsWith('image/') || IMAGE_EXTS.includes(extOf(file.name));
}

/** @param {FileEntry} file @returns {boolean} */
export function isCodeFile(file) {
	return CODE_EXTS.includes(extOf(file.name));
}

/** @param {string} name @returns {string} the Icon name to use in the file list */
export function iconForFile(name) {
	const ext = extOf(name);
	if (CODE_EXTS.includes(ext)) return 'file-code';
	if (ext === 'md' || ext === 'mermaid' || ext === 'mmd') return 'markdown';
	if (MIME_BY_EXT[ext]?.startsWith('image/')) return 'image';
	return 'file';
}
