import { TarWriter } from './vendors/tarjs/tarjs.mjs';
import { assertNotNil } from './src/utils.mjs';

export function initFileBrowserPage() {
	document.body.dataset.page = 'file-browser';
	const template = assertNotNil(
		document.getElementById('file-browser-page-template'),
	);
	const main = assertNotNil(document.getElementById('app-main'));
	main.innerHTML = template.innerHTML;

	const fileInput = assertNotNil(document.getElementById('file-input'));
	const fileList = assertNotNil(document.getElementById('file-list'));
	const linkEl = /** @type {HTMLAnchorElement} */ (
		assertNotNil(document.getElementById('link'))
	);

	const tarWriter = new TarWriter();

	const { hash } = location;
	console.log('Hash length!: ', hash.length);

	/**
	 * @this {HTMLInputElement}
	 */
	async function onFileUpload() {
		const { files } = this;
		if (!files) {
			return;
		}
		for (const file of files) {
			tarWriter.addFile(file.name, file);
			fileList.appendChild(document.createElement('li')).textContent =
				file.name;
		}

		const tarball = await tarWriter.write();

		const fileReader1 = new FileReader();
		fileReader1.readAsDataURL(tarball);

		fileReader1.onloadend = () => {
			const result = fileReader1.result;
			if (typeof result !== 'string') {
				throw new Error(
					`Unexpected type of result: ${Object.prototype.toString.call(result)}`,
				);
			}
			console.log(result.length);
		};

		const compressedReadableStream = tarball
			.stream()
			.pipeThrough(new CompressionStream('gzip'));

		const blob = await new Response(compressedReadableStream).blob();

		const fileReader = new FileReader();
		fileReader.readAsDataURL(blob);

		fileReader.onloadend = () => {
			const result = fileReader.result;
			if (typeof result !== 'string') {
				throw new Error(
					`Unexpected type of result: ${Object.prototype.toString.call(result)}`,
				);
			}

			const link = [
				location.origin,
				location.pathname,
				location.search,
				'#',
				result.slice(
					// There's a prefix like "data:application/octet-stream;base64," in the data,
					// which we don't need
					result.indexOf(',') + 1,
				),
			].join('');
			linkEl.href = link;
		};
	}

	function copyLink() {
		navigator.clipboard.writeText(linkEl.href);
	}

	assertNotNil(document.getElementById('copy-link')).addEventListener(
		'click',
		copyLink,
	);

	fileInput.addEventListener('change', onFileUpload);
}

initFileBrowserPage();
