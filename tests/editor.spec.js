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

	test('uses the syntax-highlighting font only for code files', async ({ page }) => {
		await page.goto('/');

		const editor = page.locator('textarea.editor-textarea');
		await expect(editor).toBeVisible();
		await expect(editor).not.toHaveClass(/syntax-highlighted/);
		await expect(editor).not.toHaveCSS(
			'font-family',
			/Syntax Highlighter Light Owl/,
		);

		await page.getByRole('button', { name: 'Toggle sidebar' }).click();
		await page.locator('#starter-select').selectOption('webpage');
		await page.locator('.file-item', { hasText: 'script.js' }).click();
		await expect(editor).toHaveClass(/syntax-highlighted/);
		await expect
			.poll(() =>
				page.evaluate(() =>
					document.fonts.check('13px "Syntax Highlighter Light Owl"'),
				),
			)
			.toBe(true);
		await expect(editor).toHaveCSS(
			'font-family',
			/Syntax Highlighter Light Owl/,
		);

		await page.emulateMedia({ colorScheme: 'dark' });
		await expect
			.poll(() =>
				page.evaluate(() =>
					document.fonts.check('13px "Syntax Highlighter Night Owl"'),
				),
			)
			.toBe(true);
		await expect(editor).toHaveCSS(
			'font-family',
			/Syntax Highlighter Night Owl/,
		);

		await page.getByRole('button', { name: 'new' }).click();
		await page.locator('.file-item-rename-input').fill('notes.txt');
		await page.locator('.file-item-rename-input').press('Enter');
		await page.locator('.file-item', { hasText: 'notes.txt' }).click();
		await expect(editor).not.toHaveClass(/syntax-highlighted/);
		await expect(editor).not.toHaveCSS(
			'font-family',
			/Syntax Highlighter Night Owl/,
		);
	});

	test('uses the basic monospace font for code over 10,000 characters', async ({
		page,
	}) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();
		await page.locator('#starter-select').selectOption('webpage');
		await page.locator('.file-item', { hasText: 'script.js' }).click();

		const editor = page.locator('textarea.editor-textarea');
		await editor.fill('a'.repeat(10_000));
		await expect(editor).toHaveClass(/syntax-highlighted/);

		await editor.fill('a'.repeat(10_001));
		await expect(editor).not.toHaveClass(/syntax-highlighted/);
		await expect(editor).not.toHaveCSS(
			'font-family',
			/Syntax Highlighter (Light|Night) Owl/,
		);

		await editor.fill('const restored = true;');
		await expect(editor).toHaveClass(/syntax-highlighted/);
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

	test('uploading a file replaces the untouched default README', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();

		await page.locator('input[type="file"]').setInputFiles({
			name: 'upload.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('uploaded'),
		});

		await expect(
			page.locator('.file-item', { hasText: 'upload.txt' }),
		).toBeVisible();
		await expect(page.locator('.file-item', { hasText: 'README.md' })).toHaveCount(
			0,
		);
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

	test('renders Mermaid diagrams in Markdown and standalone files', async ({
		page,
	}) => {
		await page.goto('/');
		await page.locator('.editor-textarea').fill(
			'# Diagram\n\n```js\nconst answer = 42;\n```\n\n```mermaid\nflowchart LR\n  Start --> Finish\n```',
		);
		await page.locator('.editor-textarea').blur();

		const preview = page
			.locator('.preview-iframe')
			.contentFrame()
			.locator('iframe')
			.contentFrame();
		await expect(preview.getByRole('heading', { name: 'Diagram' })).toBeVisible();
		await expect(preview.locator('code.hljs.language-js')).toContainText(
			'const answer = 42;',
		);
		const markdownKeyword = preview.locator('code .hljs-keyword');
		await expect(markdownKeyword).toHaveText('const');
		await expect(markdownKeyword).toHaveCSS('color', 'rgb(207, 34, 46)');
		await expect(preview.locator('.mermaid-diagram svg')).toBeVisible();
		await expect(preview.locator('.mermaid-diagram')).toContainText('Start');
		await expect(preview.locator('code.language-mermaid')).toHaveCount(0);

		await page.getByRole('button', { name: 'Toggle sidebar' }).click();
		await page.getByRole('button', { name: 'new' }).click();
		await page.locator('.file-item-rename-input').fill('flow.mmd');
		await page.locator('.file-item-rename-input').press('Enter');
		await page.locator('.file-item', { hasText: 'flow.mmd' }).click();
		await expect(page.locator('.editor-panel .panel-header')).toContainText(
			'flow.mmd',
		);
		await page
			.locator('.editor-textarea')
			.fill('sequenceDiagram\n  Alice->>Bob: Hello');
		await page.locator('.editor-textarea').blur();

		await expect(page.locator('.panel-header', { hasText: 'flow.mmd' })).toHaveCount(
			2,
		);
		await expect(preview.locator('.mermaid-preview svg')).toBeVisible();
		await expect(preview.locator('.mermaid-preview')).toContainText('Alice');
	});

	test('syntax-highlights standalone code files', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();
		await page.locator('input[type="file"]').setInputFiles({
			name: 'hello.py',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from('def greet(name):\n    return f"Hello, {name}!"'),
		});
		await page.locator('.file-item', { hasText: 'hello.py' }).click();
		await expect(page.locator('.editor-textarea')).toHaveValue(/def greet\(name\):/);

		const preview = page
			.locator('.preview-iframe')
			.contentFrame()
			.locator('iframe')
			.contentFrame();
		await expect(preview.locator('.code-preview code.hljs.language-py')).toContainText(
			'def greet(name):',
		);
		await expect(preview.locator('code .hljs-keyword').first()).toHaveText('def');
	});

	test('runs scripts in an HTML preview served from the service worker', async ({
		page,
	}) => {
		const consoleMessages = /** @type {string[]} */ ([]);
		page.on('console', (message) => consoleMessages.push(message.text()));
		await page.goto('/');
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();
		await page.locator('#starter-select').selectOption('webpage');
		await page
			.locator('.editor-textarea')
			.fill('<h1>Hello</h1><script>document.body.dataset.ran = "yes"</script>');
		await page.locator('.editor-textarea').blur();

		const loader = page.frameLocator('.preview-iframe');
		const preview = loader.frameLocator('#content');
		await expect(preview.locator('body')).toHaveAttribute('data-ran', 'yes');
		await expect(preview.locator('h1')).toHaveText('Hello');
		await expect(loader.locator('#content')).toHaveAttribute(
			'sandbox',
			/allow-scripts/,
		);
		expect(consoleMessages).not.toContainEqual(
			expect.stringContaining("'allow-scripts' permission is not set"),
		);
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

		await expect(page.locator('.app')).toHaveClass(/shared-link-preview/);
		await expect(page.locator('.reader-file-name')).toHaveText('README.md');
		await expect(page.locator('.preview-panel')).toBeVisible();
		await expect(page.locator('.preview-panel .panel-header')).toBeHidden();
		await expect(page.locator('.editor-panel')).toBeHidden();
		await expect(page.locator('.sidebar')).toBeHidden();
		await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();

		await page.getByRole('button', { name: 'Open in editor' }).click();
		await expect(page.locator('.app')).not.toHaveClass(/shared-link-preview/);
		await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
		await expect(page.locator('.editor-panel')).toBeVisible();
		await expect(page.locator('.preview-panel')).toBeVisible();
		await expect(page.locator('.divider-handle')).toBeVisible();
	});
});
