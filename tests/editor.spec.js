// @ts-check
import { test, expect } from '@playwright/test';

test.describe('editor page', () => {
	test('loads with the default starter file', async ({ page }) => {
		await page.goto('/');

		await expect(page.locator('.logo')).toHaveText(/linkify\.ink/);
		await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();
		const fileItem = page.locator('.file-item', { hasText: 'README.md' });
		await expect(fileItem).toBeVisible();
		await expect(fileItem).toHaveClass(/active/);
	});

	test('can create a new file', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();

		await page.getByRole('button', { name: 'new' }).click();
		const input = page.locator('.file-item-rename-input');
		await input.fill('notes.txt');
		await input.press('Enter');

		await expect(
			page.locator('.file-item', { hasText: 'notes.txt' }),
		).toBeVisible();
	});

	test('can delete a file', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();

		await page.getByRole('button', { name: 'new' }).click();
		const input = page.locator('.file-item-rename-input');
		await input.fill('scratch.txt');
		await input.press('Enter');

		const fileItem = page.locator('.file-item', { hasText: 'scratch.txt' });
		await expect(fileItem).toBeVisible();
		await fileItem.getByRole('button', { name: 'Delete file' }).click();
		await expect(fileItem).toHaveCount(0);
	});

	test('switching starters swaps the file list', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();

		await page.locator('#starter-select').selectOption('webpage');

		await expect(
			page.locator('.file-item', { hasText: 'index.html' }),
		).toBeVisible();
		await expect(
			page.locator('.file-item', { hasText: 'style.css' }),
		).toBeVisible();
		await expect(
			page.locator('.file-item', { hasText: 'script.js' }),
		).toBeVisible();
	});

	test('shared links open in preview on desktop and can open the full workspace', async ({
		page,
	}) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Share' }).click();
		await page.getByRole('button', { name: 'Generate link' }).click();
		const sharedUrl = await page.locator('.modal-url').textContent();
		expect(sharedUrl).toBeTruthy();
		const sharedHash = new URL(/** @type {string} */ (sharedUrl)).hash;

		await page.goto(`/${sharedHash}`);
		// A real recipient opens this in a new document. Reload here because navigating
		// from the already-mounted editor to its own hash is same-document navigation.
		await page.reload();

		await expect(page.locator('.right')).toHaveClass(/shared-link-preview/);
		await expect(page.locator('.preview-panel')).toBeVisible();
		await expect(page.locator('.editor-panel')).toBeHidden();
		await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);

		await page.getByRole('button', { name: 'Open editor' }).click();
		await expect(page.locator('.right')).not.toHaveClass(/shared-link-preview/);
		await expect(page.locator('.editor-panel')).toBeVisible();
		await expect(page.locator('.preview-panel')).toBeVisible();
		await expect(page.locator('.divider-handle')).toBeVisible();
	});
});
