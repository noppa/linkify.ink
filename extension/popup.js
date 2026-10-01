// Popup — UI only. It collects the capture mode, asks the service worker to do
// the work, and renders what comes back. Nothing here touches the codec: the
// worker owns it so that closing this popup mid-capture doesn't cancel the link.
//
// Links are always public. Encryption is not offered here on purpose — open the
// link in the editor and share it from there with a password; one place to get
// that right is better than two.

/** @param {string} id @returns {HTMLElement} */
function el(id) {
	const found = document.getElementById(id);
	if (!found) throw new Error(`Missing element #${id}`);
	return found;
}

const modeSelect = /** @type {HTMLSelectElement} */ (el('mode'));
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
// switching to article-only mode — before the link is actually at risk.
const SIZE_WARN = 24000;
const SIZE_LIMIT = 32000;

/** The most recently generated link, for the copy/open buttons. */
let currentUrl = '';

/** Remembered between popup opens; the popup is destroyed every time it closes. */
const SETTINGS_KEY = 'popupSettings';

async function restoreSettings() {
	const stored = await chrome.storage.sync.get(SETTINGS_KEY);
	const settings = /** @type {{ mode?: string } | undefined} */ (stored[SETTINGS_KEY]);
	if (settings?.mode) modeSelect.value = settings.mode;
}

function saveSettings() {
	return chrome.storage.sync.set({ [SETTINGS_KEY]: { mode: modeSelect.value } });
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
 *   linkedImages: number, width: number,
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
	if (result.mode === 'full') {
		notes.push(
			`Static snapshot of the page as rendered at ${result.width}px wide — no scripts, ` +
				'and nothing that was hidden, hovered or behind a breakpoint.',
		);
	}
	if (result.chars >= SIZE_LIMIT) {
		notes.push('Over 32,000 characters — some browsers and chat apps may truncate this link.');
	} else if (result.chars >= SIZE_WARN) {
		notes.push('Getting long. Article-only mode produces smaller links than full page.');
	}
	if (result.linkedImages > 0) {
		const n = result.linkedImages;
		notes.push(`${n} image${plural(n)} ${n === 1 ? 'loads' : 'load'} from the original site.`);
	}
	notesLine.textContent = notes.join(' ');
	notesLine.hidden = notes.length === 0;

	resultSection.hidden = false;
}

async function capture() {
	captureButton.disabled = true;
	resultSection.hidden = true;
	setStatus('Capturing…');
	await saveSettings();

	try {
		const response = await chrome.runtime.sendMessage({
			type: 'capture',
			options: { mode: modeSelect.value },
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
