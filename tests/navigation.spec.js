// @ts-check
import { test, expect } from '@playwright/test';

test.describe('navigation', () => {
	test('logo links to the about page and back', async ({ page }) => {
		await page.goto('/');

		await page.locator('a.logo').click();
		await expect(page).toHaveURL(/\/about$/);
		await expect(page.locator('.about-page h1')).toHaveText('About');

		await page.getByRole('link', { name: '← Back to editor' }).click();
		await expect(page).toHaveURL(/\/$/);
	});

	test('receive page loads directly', async ({ page }) => {
		await page.goto('/receive');

		await expect(page.locator('.receive-page')).toBeVisible();
	});

	test('llms.txt is served as plain text, not the app', async ({ request }) => {
		const response = await request.get('/llms.txt');

		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toMatch(/^text\/plain/);
		const body = await response.text();
		expect(body).toMatch(/^# linkify\.ink\n/);
		expect(body).not.toContain('<html');
	});
});
