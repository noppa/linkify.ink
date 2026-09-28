// @ts-check
import { test, expect } from '@playwright/test';
import { LinkifyInk } from '../linkify.ink.js';

test('tar packing is independent of the current time', () => {
	const files = [{ name: 'note.txt', data: new TextEncoder().encode('same bytes') }];
	const originalNow = Date.now;

	try {
		Date.now = () => 0;
		const first = LinkifyInk.packTar(files);
		Date.now = () => 1_000_000_000_000;
		const second = LinkifyInk.packTar(files);
		expect(second).toEqual(first);
	} finally {
		Date.now = originalNow;
	}
});

// Shared-dictionary compression (link format 2). The dictionary is part of the
// link format, so these guard both directions: links made before it existed still
// open, and the published dictionary never changes under links made with it.
//
// They run in the page, against the modules the app itself loads: the codec
// bundle's zstd glue reads import.meta, which the test runner's CommonJS
// transform cannot load in Node.

const FORMAT_1_LINK =
	'https://linkify.ink/#AQAWeyJwcmV2aWV3IjoiaGVsbG8ubWQifSi1L_1gAActAwCyhRIRkH0ABrGoG_flt2yk7NkiRAoOBnbxqmpjZrGF5q6COLhrn1vBNUUDVjvIGmfAESYA7JwOBeHvV2Ws_f08OX_-30sx740OO6eDAQkgUDcOSdwP6VAclGziPmNAYNAAw2nJAQ';

test.describe('shared dictionary', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/about');
	});

	test('reads a format-1 link made before shared dictionaries', async ({ page }) => {
		const read = await page.evaluate(async (link) => {
			const { linkify } = await import('/lib/linkify.js');
			const { files, metadata } = await linkify.readLink(link);
			return { metadata, files: files.map((f) => [f.name, new TextDecoder().decode(f.data)]) };
		}, FORMAT_1_LINK);
		expect(read).toEqual({
			metadata: { preview: 'hello.md' },
			files: [['hello.md', '# Hello\n\nThis link was made before shared dictionaries.\n']],
		});
	});

	test('writes shorter format-2 links that round-trip in every encryption mode', async ({
		page,
	}) => {
		const result = await page.evaluate(async () => {
			const { linkifyInkCodecDependencies } = await import('/vendor/vendor.codec.bundle.js');
			const { LinkifyInk } = await import('/linkify.ink.js');
			const linkify = new LinkifyInk(linkifyInkCodecDependencies);
			const withoutDictionary = new LinkifyInk({
				...linkifyInkCodecDependencies,
				zstdDictionaryUrls: {},
			});
			const text =
				'# Release notes\n\nThis release adds support for shared dictionaries, which make ' +
				'links shorter by priming the compressor with text that most documents contain.\n';
			const files = [{ name: 'notes.md', data: new TextEncoder().encode(text) }];
			/** @param {{ files: { name: string, data: Uint8Array }[] }} read */
			const same = (read) =>
				read.files.length === 1 &&
				read.files[0].name === 'notes.md' &&
				new TextDecoder().decode(read.files[0].data) === text;
			/** @param {string} link */
			const version = (link) => LinkifyInk.base64UrlDecode(link.split('#')[1])[0] & 0x3f;

			const plain = await linkify.createLink(files, { metadata: { preview: 'notes.md' } });
			const read = await linkify.readLink(plain);

			const password = await linkify.createLink(files, { encryption: 'password', password: 'pw' });

			const { publicKey, privateKey } = await linkify.generateKeypair();
			const ecdh = await linkify.createLink(files, {
				encryption: 'ecdh',
				recipientPublicKey: await linkify.exportPublicKey(publicKey),
			});

			const v1 = await withoutDictionary.createLink(files);
			return {
				versions: [version(plain), version(password), version(ecdh), version(v1)],
				metadata: read.metadata,
				roundTrips: [
					same(read),
					same(await linkify.readLink(password, { password: 'pw' })),
					same(await linkify.readLink(ecdh, { privateKey })),
					same(await linkify.readLink(v1)),
				],
				lengths: { dictionary: plain.length, none: v1.length },
			};
		});
		expect(result.versions).toEqual([2, 2, 2, 1]);
		expect(result.metadata).toEqual({ preview: 'notes.md' });
		expect(result.roundTrips).toEqual([true, true, true, true]);
		expect(result.lengths.dictionary).toBeLessThan(result.lengths.none);
	});

	test('refuses link formats it does not know', async ({ page }) => {
		const error = await page.evaluate(async () => {
			const { linkify, LinkifyInk } = await import('/lib/linkify.js');
			const link = await linkify.createLink([{ name: 'a.txt', data: new Uint8Array([1]) }]);
			const payload = LinkifyInk.base64UrlDecode(link.split('#')[1]);
			payload[0] = (payload[0] & 0xc0) | 3;
			return linkify.readLink(LinkifyInk.base64UrlEncode(payload)).then(
				() => '',
				(e) => String(e.message),
			);
		});
		expect(error).toMatch(/Unknown link format 3/);
	});

	test('the published v2 dictionary is unchanged', async ({ page }) => {
		// Every format-2 link depends on these exact bytes. If this fails, the
		// dictionary was rebuilt in place: restore it and publish a new version.
		const digest = await page.evaluate(async () => {
			const { linkifyInkCodecDependencies } = await import('/vendor/vendor.codec.bundle.js');
			const { zstd, zstdWasmUrl, zstdDictionaryUrls } = linkifyInkCodecDependencies;
			await zstd.init(zstdWasmUrl);
			const response = await fetch(zstdDictionaryUrls[2]);
			const dictionary = zstd.decompress(new Uint8Array(await response.arrayBuffer()));
			const hash = await crypto.subtle.digest('SHA-256', dictionary);
			return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
		});
		expect(digest).toBe('84b92dfee4d5a8b1a41878e9a3c5dc470424d729c78ac47a1778c1e04a2cba80');
	});
});
