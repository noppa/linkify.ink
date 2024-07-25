import { TarWriter } from './vendors/tarjs/tarjs.mjs';

/**
 * @template T
 * @param {T} value
 * @param {string} message
 * @returns {NonNullable<T>}
 */
function assertNotNil(
	value,
	message = 'Expected value not to be null or undefined',
) {
	if (value == null) {
		throw new Error(message);
	}
	return value;
}

const fileInput = assertNotNil(document.getElementById('file'));
const fileList = assertNotNil(document.getElementById('file-list'));

const tarWriter = new TarWriter();

/**
 * @this {HTMLInputElement}
 */
function onFileUpload() {
	const { files } = this;
	if (!files) {
		return;
	}
	for (const file of files) {
		tarWriter.addFile(file.name, file);
		fileList.appendChild(document.createElement('li')).textContent = file.name;
	}
}

fileInput.addEventListener('change', onFileUpload);
