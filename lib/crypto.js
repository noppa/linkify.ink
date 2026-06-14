// All crypto via WebCrypto (window.crypto.subtle) + argon2-browser for Argon2id
import { Argon2, argon2WasmBase64DataUrl } from '../libraries.bundle.js';

// Implement global WASM loader for argon2-browser library.
// It'll check for the existence of this function and use it if available.
// Their internal require-based logic wasn't compatible with ESBuild's base64 bundling of wasm,
// so we'll handle it ourselves here.
globalThis.loadArgon2WasmBinary = async () => {
	const response = await fetch(argon2WasmBase64DataUrl);
	const buf = await response.arrayBuffer();
	return new Uint8Array(buf);
};

const subtle = crypto.subtle;

/**
 * Derive an AES-GCM CryptoKey from a password using Argon2id.
 * @param {string} password
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
export async function argon2Derive(password, salt) {
	const result = await Argon2.hash({
		pass: password,
		salt,
		type: Argon2.ArgonType.Argon2id,
		hashLen: 32,
		time: 3,
		mem: 65536,
		parallelism: 1,
	});
	return subtle.importKey('raw', result.hash, { name: 'AES-GCM' }, false, [
		'encrypt',
		'decrypt',
	]);
}

/**
 * @param {CryptoKey} key
 * @param {Uint8Array<ArrayBuffer>} iv
 * @param {Uint8Array<ArrayBuffer>} data
 * @returns {Promise<Uint8Array>}
 */
export async function aesEncrypt(key, iv, data) {
	const buf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
	return new Uint8Array(buf);
}

/**
 * @param {CryptoKey} key
 * @param {Uint8Array<ArrayBuffer>} iv
 * @param {Uint8Array<ArrayBuffer>} data
 * @returns {Promise<Uint8Array>}
 */
export async function aesDecrypt(key, iv, data) {
	const buf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
	return new Uint8Array(buf);
}

/**
 * @returns {Promise<{ publicKey: CryptoKey, privateKey: CryptoKey }>}
 */
export async function generateEcdhKeypair() {
	const pair = await subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveKey'],
	);
	return { publicKey: pair.publicKey, privateKey: pair.privateKey };
}

/**
 * Derive a shared AES-GCM key via ECDH + HKDF.
 * @param {CryptoKey} privateKey
 * @param {CryptoKey} publicKey
 * @returns {Promise<CryptoKey>}
 */
export async function ecdhDerive(privateKey, publicKey) {
	const sharedKeyMaterial = await subtle.deriveKey(
		{ name: 'ECDH', public: publicKey },
		privateKey,
		{ name: 'HKDF' },
		false,
		['deriveKey'],
	);
	return subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: new Uint8Array(32),
			info: new Uint8Array(0),
		},
		sharedKeyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	);
}

/**
 * Export a P-256 public key as raw 65-byte uncompressed point.
 * @param {CryptoKey} key
 * @returns {Promise<Uint8Array>}
 */
export async function exportPublicKey(key) {
	const buf = await subtle.exportKey('raw', key);
	return new Uint8Array(buf);
}

/**
 * Import a raw 65-byte P-256 public key.
 * @param {Uint8Array<ArrayBuffer>} raw
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKey(raw) {
	return subtle.importKey(
		'raw',
		raw,
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		[],
	);
}
