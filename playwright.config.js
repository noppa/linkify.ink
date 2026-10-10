// @ts-check
import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices } from '@playwright/test';

const PORT = 8123;

// Claude Code's cloud containers come with a Chromium preinstalled at this path,
// often a few versions behind the one this Playwright pins, and can't download
// another. Fall back to it only when Playwright's own browser is missing, so CI
// and local installs keep testing against the pinned version.
const preinstalledChromium = '/opt/pw-browsers/chromium';
const launchOptions =
	!existsSync(chromium.executablePath()) && existsSync(preinstalledChromium)
		? { executablePath: preinstalledChromium }
		: {};

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], launchOptions },
		},
	],
	webServer: {
		command: 'npm start',
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		env: { PORT: String(PORT) },
	},
});
