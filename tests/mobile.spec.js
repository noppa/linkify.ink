// @ts-check
import { test, expect } from '@playwright/test';

test.describe('mobile layout', () => {
	test.use({ viewport: { width: 393, height: 700 } });

	test('fills the viewport with the sidebar collapsed', async ({ page }) => {
		await page.goto('/');

		// The default single-file project starts collapsed, which is the state that
		// used to keep the desktop's two columns and squeeze the whole app into a
		// content-height row with dead space underneath.
		await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
		await expect(page.locator('.main')).toHaveCSS('grid-template-columns', '393px');

		const viewportHeight = /** @type {number} */ (page.viewportSize()?.height);
		const right = await page.locator('.right').boundingBox();
		expect(right?.x).toBe(0);
		expect(right?.width).toBe(393);
		expect((right?.y ?? 0) + (right?.height ?? 0)).toBe(viewportHeight);
	});

	test('keeps the topbar actions on screen when text is inflated', async ({
		page,
	}) => {
		await page.goto('/');
		// Stands in for iOS Safari's text autosizing, which the app now opts out of
		// with text-size-adjust — but the bar should survive larger text regardless.
		await page.addStyleTag({
			content: '.topbar, .topbar * { font-size: 21px !important; }',
		});

		const share = await page.getByRole('button', { name: 'Share' }).boundingBox();
		expect((share?.x ?? 0) + (share?.width ?? 0)).toBeLessThanOrEqual(393);
	});
});

test.describe('preview without a service worker', () => {
	// Safari refuses to register a service worker in a cross-origin frame, which is
	// exactly what the sandbox is — so the preview has to render from blob: URLs
	// instead of leaving a blank frame. Blocking the script reproduces that here.
	// Routed on the context: a service worker's own script request doesn't go
	// through page-level routing.
	test.beforeEach(async ({ context }) => {
		await context.route('**/sandbox-sw.js', (route) => route.abort());
	});

	test('renders Markdown from the sandbox origin', async ({ page }) => {
		await page.goto('/');
		await page
			.locator('textarea.editor-textarea')
			.fill('# Hello\n\nSome **markdown**.');

		const preview = page.frameLocator('.preview-iframe').frameLocator('#content');
		await expect(preview.locator('h1')).toHaveText('Hello');

		// The fallback document is a blob: URL minted inside the sandbox frame, so
		// the preview still belongs to the sandbox origin rather than the editor's.
		const sandboxOrigin = await page.evaluate(
			() => `${location.protocol}//${location.hostname}:${Number(location.port) + 1}`,
		);
		await expect
			.poll(() => page.frames().map((frame) => frame.url()))
			.toContainEqual(expect.stringContaining(`blob:${sandboxOrigin}/`));
	});

	test('rewrites the file references in an HTML page and says what it cannot do', async ({
		page,
	}) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();
		await page.locator('#starter-select').selectOption('webpage');

		const preview = page.frameLocator('.preview-iframe').frameLocator('#content');
		await expect(preview.locator('h1')).toHaveText('Hello, world!');
		// style.css is linked from index.html, so the fallback repoints it at a blob URL.
		await expect(preview.locator('body')).toHaveCSS('margin', '40px');
		await expect(page.locator('.preview-notice')).toContainText('Limited preview');
	});

	test('leaves no notice on a preview that needs no other files', async ({ page }) => {
		await page.goto('/');
		await page.locator('textarea.editor-textarea').fill('# Hello');

		const preview = page.frameLocator('.preview-iframe').frameLocator('#content');
		await expect(preview.locator('h1')).toHaveText('Hello');
		await expect(page.locator('.preview-notice')).toBeHidden();
	});
});
