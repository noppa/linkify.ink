// Popup — UI only. It collects options, asks the service worker to do the work,
// and renders what comes back. Nothing here touches the codec: the worker owns it
// so that closing this popup mid-generation (Argon2 takes about a second) doesn't
// cancel the link.

/** @param {string} id @returns {HTMLElement} */
function el(id) {
	const found = document.getElementById(id);
	if (!found) throw new Error(`Missing element #${id}`);
	return found;
}

const modeSelect = /** @type {HTMLSelectElement} */ (el('mode'));
const encryptionSelect = /** @type {HTMLSelectElement} */ (el('encryption'));
const passwordRow = el('password-row');
const imagesCheckbox = /** @type {HTMLInputElement} */ (el('images'));
const passwordInput = /** @type {HTMLInputElement} */ (el('password'));
const captureButton = /** @type {HTMLButtonElement} */ (el('capture'));
const statusLine = el('status');
const resultSection = el('result');
const titleLabel = el('title');
const sizeLabel = el('size');
const urlBox = el('url');
const notesLine = el('notes');
const copyButton = /** @type {HTMLButtonElement} */ (el('copy'));
const openButton = /** @type {HTMLButtonElement} */ (el('open'));

// The site warns past 32,000 characters that some browsers may truncate the URL
// (see ShareModal.js). Amber a little before that, so there's room to react —
// switching to article-only mode, or dropping images — before the link is
// actually at risk.
const SIZE_WARN = 24000;
const SIZE_LIMIT = 32000;

/** The most recently generated link, for the copy/open buttons. */
let currentUrl = '';

/** Remembered between popup opens; the popup is destroyed every time it closes. */
const SETTINGS_KEY = 'popupSettings';

async function restoreSettings() {
	const stored = await chrome.storage.sync.get(SETTINGS_KEY);
	const settings =
		/** @type {{ mode?: string, encryption?: string, images?: boolean } | undefined} */ (
			stored[SETTINGS_KEY]
		);
	if (settings?.mode) modeSelect.value = settings.mode;
	if (settings?.encryption) encryptionSelect.value = settings.encryption;
	// Only restore the images toggle if the permission it depends on is still
	// granted — the user can revoke it from chrome://extensions at any time, and a
	// checkbox that lies about what will happen is worse than an unchecked one.
	if (settings?.images) {
		imagesCheckbox.checked = await chrome.permissions.contains({
			origins: ['<all_urls>'],
		});
	}
	syncPasswordRow();
}

function saveSettings() {
	// Deliberately not the password — it is typed fresh each time and has no
	// business being persisted.
	return chrome.storage.sync.set({
		[SETTINGS_KEY]: {
			mode: modeSelect.value,
			encryption: encryptionSelect.value,
			images: imagesCheckbox.checked,
		},
	});
}

function syncPasswordRow() {
	passwordRow.hidden = encryptionSelect.value !== 'password';
}

/**
 * @param {string} message
 * @param {'info' | 'error'} [kind]
 */
function setStatus(message, kind = 'info') {
	statusLine.textContent = message;
	statusLine.hidden = !message;
	statusLine.classList.toggle('error', kind === 'error');
}

/** @param {number} n @returns {string} */
function plural(n) {
	return n === 1 ? '' : 's';
}

/** @param {number} chars @returns {'ok' | 'warn' | 'bad'} */
function sizeBand(chars) {
	if (chars >= SIZE_LIMIT) return 'bad';
	if (chars >= SIZE_WARN) return 'warn';
	return 'ok';
}

/**
 * @param {{
 *   url: string, chars: number, title: string, mode: string,
 *   droppedImages: number, unfetchedImages: number, inlinedImages: number,
 *   imagesRequested: boolean, imagePermission: boolean,
 * }} result
 */
function showResult(result) {
	currentUrl = result.url;
	titleLabel.textContent = result.title || 'Untitled';
	titleLabel.title = result.title || '';
	sizeLabel.textContent = `${result.chars.toLocaleString()} chars`;
	sizeLabel.className = `size ${sizeBand(result.chars)}`;
	urlBox.textContent = result.url;

	const notes = [];
	if (result.chars >= SIZE_LIMIT) {
		notes.push('Over 32,000 characters — some browsers and chat apps may truncate this link.');
	} else if (result.chars >= SIZE_WARN) {
		notes.push('Getting long. Article-only mode produces smaller links than full page.');
	}
	if (result.imagesRequested && !result.imagePermission) {
		notes.push('Images skipped — permission was not granted.');
	} else if (result.inlinedImages > 0) {
		notes.push(`${result.inlinedImages} image${plural(result.inlinedImages)} included.`);
		if (result.unfetchedImages > 0) {
			notes.push(
				`${result.unfetchedImages} more couldn't be fetched or didn't fit the size budget.`,
			);
		}
	} else if (result.droppedImages > 0) {
		const n = result.droppedImages;
		notes.push(`${n} image${plural(n)} dropped (alt text kept).`);
	}
	notesLine.textContent = notes.join(' ');
	notesLine.hidden = notes.length === 0;

	resultSection.hidden = false;
}

async function capture() {
	const encryption = /** @type {'none' | 'password'} */ (encryptionSelect.value);
	const password = passwordInput.value;

	if (encryption === 'password' && !password) {
		setStatus('Enter a password first.', 'error');
		return;
	}

	captureButton.disabled = true;
	resultSection.hidden = true;
	setStatus(encryption === 'password' ? 'Capturing and encrypting…' : 'Capturing…');
	await saveSettings();

	try {
		const response = await chrome.runtime.sendMessage({
			type: 'capture',
			options: {
				mode: modeSelect.value,
				images: imagesCheckbox.checked ? 'inline' : 'drop',
				encryption,
				password,
			},
		});

		if (!response?.ok) throw new Error(response?.error ?? 'Capture failed.');
		setStatus('');
		showResult(response);
	} catch (e) {
		setStatus(e instanceof Error ? e.message : String(e), 'error');
	} finally {
		captureButton.disabled = false;
	}
}

captureButton.addEventListener('click', capture);
encryptionSelect.addEventListener('change', syncPasswordRow);

// Inlining images means fetching them from whatever hosts the article points at,
// which needs a host permission the extension deliberately doesn't ask for up
// front. Request it at the moment the user opts in — this handler runs inside the
// click, which is the user gesture chrome.permissions.request requires.
imagesCheckbox.addEventListener('change', async () => {
	if (!imagesCheckbox.checked) return;
	const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
	if (!granted) {
		imagesCheckbox.checked = false;
		setStatus('Images need permission to read the sites they are hosted on.', 'error');
		return;
	}
	setStatus('');
});

copyButton.addEventListener('click', async () => {
	if (!currentUrl) return;
	await navigator.clipboard.writeText(currentUrl);
	copyButton.textContent = 'Copied!';
	setTimeout(() => {
		copyButton.textContent = 'Copy link';
	}, 1500);
});

openButton.addEventListener('click', () => {
	if (currentUrl) chrome.tabs.create({ url: currentUrl });
});

restoreSettings();
