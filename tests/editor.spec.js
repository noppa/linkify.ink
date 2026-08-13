// @ts-check
import { test, expect } from '@playwright/test';

test.describe('editor page', () => {
	test('loads with the default starter file', async ({ page }) => {
		await page.goto('/');

		await expect(page.locator('.logo')).toHaveText(/linkify\.ink/);
		const fileItem = page.locator('.file-item', { hasText: 'README.md' });
		await expect(fileItem).toBeVisible();
		await expect(fileItem).toHaveClass(/active/);
	});

	test('can create a new file', async ({ page }) => {
		await page.goto('/');

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
});
