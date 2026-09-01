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
