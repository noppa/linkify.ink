// @ts-check
import { test, expect } from '@playwright/test';

test.describe('share modal', () => {
	test('generates a public link', async ({ page }) => {
		await page.goto('/');

		await page.getByRole('button', { name: 'Share' }).click();
		await expect(page.locator('.modal-title')).toHaveText(/Share files/);

		await page.getByRole('button', { name: 'Generate link' }).click();

		const urlBox = page.locator('.modal-url');
		await expect(urlBox).toBeVisible({ timeout: 15000 });
		const text = await urlBox.textContent();
		expect(text).toMatch(/^https?:\/\/.+#.+/);
	});

	test('can be closed via Cancel', async ({ page }) => {
		await page.goto('/');

		await page.getByRole('button', { name: 'Share' }).click();
		await expect(page.locator('.modal-title')).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.locator('.modal-title')).toHaveCount(0);
	});
});
