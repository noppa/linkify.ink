// @ts-check
import { ZstdWasm } from '../libraries.bundle.js';

/** @type {boolean} */
let initialized = false;

/** @returns {Promise<void>} */
export async function init() {
	if (initialized) return;
	await ZstdWasm.init();
	initialized = true;
}

/**
 * @param {Uint8Array} data
 * @param {number} [level]
 * @returns {Uint8Array}
 */
export function compress(data, level = 9) {
	return ZstdWasm.compress(data, level);
}

/**
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function decompress(data) {
	return ZstdWasm.decompress(data);
}
