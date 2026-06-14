// encode() / decode() — the full pipeline
import { pack, unpack } from './tar.js';
import { init, compress, decompress } from './compress.js';
import {
	argon2Derive,
	aesEncrypt,
	aesDecrypt,
	generateEcdhKeypair,
	ecdhDerive,
	exportPublicKey,
	importPublicKey,
} from './crypto.js';
import { encode as b64encode, decode as b64decode } from './base64url.js';

export const ENC_NONE = 0x00;
export const ENC_PASSWORD = 0x01;
export const ENC_ECDH = 0x02;
const FORMAT_VERSION = 1;

/**
 * @typedef {{ name: string, data: Uint8Array<ArrayBuffer> }} FileEntry
 * @typedef {{ preview?: string, fullscreen?: boolean, [k: string]: unknown }} Metadata
 */

/**
 * Peek at the encryption type of a payload without decoding it. Lets the UI decide
 * how to prompt (password / private key) before attempting a full decode.
 * @param {string} hash payload, with or without a leading '#'
 * @returns {number} one of ENC_NONE / ENC_PASSWORD / ENC_ECDH (ENC_NONE on parse error)
 */
export function peekEncryptionType(hash) {
	try {
		const raw = hash.startsWith('#') ? hash.slice(1) : hash;
		return (b64decode(raw)[0] >> 6) & 0x03;
	} catch {
		return ENC_NONE;
	}
}

/**
 * @param {Uint8Array[]} parts
 * @returns {Uint8Array<ArrayBuffer>}
 */
function concat(...parts) {
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

/**
 * @param {number} n
 * @returns {Uint8Array}
 */
function uint16be(n) {
	return new Uint8Array([n >> 8, n & 0xff]);
}

/**
 * @param {Uint8Array} buf
 * @param {number} off
 * @returns {number}
 */
function readUint16be(buf, off) {
	return (buf[off] << 8) | buf[off + 1];
}

/**
 * @param {FileEntry[]} files
 * @param {{
 *   encryption?: 'none' | 'password' | 'ecdh',
 *   password?: string,
 *   recipientPublicKey?: Uint8Array<ArrayBuffer>,
 *   metadata?: Metadata,
 * }} [options]
 * @returns {Promise<string>}
 */
export async function encode(files, options = {}) {
	await init();

	const {
		encryption = 'none',
		password,
		recipientPublicKey,
		metadata = {},
	} = options;
	const metaBytes = new TextEncoder().encode(JSON.stringify(metadata));
	const tarData = pack(files);
	const compressed = compress(tarData);

	const payload = concat(uint16be(metaBytes.length), metaBytes, compressed);

	let flagByte;
	let fullPayload;

	if (encryption === 'none') {
		flagByte = (ENC_NONE << 6) | FORMAT_VERSION;
		fullPayload = concat(new Uint8Array([flagByte]), payload);
	} else if (encryption === 'password') {
		if (!password) throw new Error('Password required for password encryption');
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const key = await argon2Derive(password, salt);
		const ciphertext = await aesEncrypt(key, iv, payload);
		flagByte = (ENC_PASSWORD << 6) | FORMAT_VERSION;
		fullPayload = concat(new Uint8Array([flagByte]), salt, iv, ciphertext);
	} else if (encryption === 'ecdh') {
		if (!recipientPublicKey)
			throw new Error('Recipient public key required for ECDH encryption');
		const ephemeral = await generateEcdhKeypair();
		const recipientKey = await importPublicKey(recipientPublicKey);
		const sharedKey = await ecdhDerive(ephemeral.privateKey, recipientKey);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ciphertext = await aesEncrypt(sharedKey, iv, payload);
		const ephemeralPub = await exportPublicKey(ephemeral.publicKey);
		flagByte = (ENC_ECDH << 6) | FORMAT_VERSION;
		fullPayload = concat(
			new Uint8Array([flagByte]),
			ephemeralPub,
			iv,
			ciphertext,
		);
	} else {
		throw new Error(`Unknown encryption type: ${encryption}`);
	}

	return `${location.origin}/#${b64encode(fullPayload)}`;
}

/**
 * @param {string} hash
 * @param {{
 *   password?: string,
 *   privateKey?: CryptoKey,
 * }} [options]
 * @returns {Promise<{ files: FileEntry[], metadata: Metadata }>}
 */
export async function decode(hash, options = {}) {
	await init();

	const raw = hash.startsWith('#') ? hash.slice(1) : hash;
	const fullPayload = b64decode(raw);

	const flagByte = fullPayload[0];
	const encType = (flagByte >> 6) & 0x03;

	let payload;

	if (encType === ENC_NONE) {
		payload = fullPayload.slice(1);
	} else if (encType === ENC_PASSWORD) {
		const { password } = options;
		if (!password) throw new Error('Password required to decrypt');
		const salt = fullPayload.slice(1, 17);
		const iv = fullPayload.slice(17, 29);
		const ciphertext = fullPayload.slice(29);
		const key = await argon2Derive(password, salt);
		payload = await aesDecrypt(key, iv, ciphertext);
	} else if (encType === ENC_ECDH) {
		const { privateKey } = options;
		if (!privateKey) throw new Error('Private key required to decrypt');
		const ephemeralPubBytes = fullPayload.slice(1, 66);
		const iv = fullPayload.slice(66, 78);
		const ciphertext = fullPayload.slice(78);
		const ephemeralPub = await importPublicKey(ephemeralPubBytes);
		const sharedKey = await ecdhDerive(privateKey, ephemeralPub);
		payload = await aesDecrypt(sharedKey, iv, ciphertext);
	} else {
		throw new Error(`Unknown encryption type: ${encType}`);
	}

	// Parse payload: [2 bytes meta len][meta JSON][zstd compressed tar]
	const metaLen = readUint16be(payload, 0);
	const metaBytes = payload.slice(2, 2 + metaLen);
	const compressedTar = payload.slice(2 + metaLen);

	const metadata = /** @type {Metadata} */ (
		metaLen === 0 ? {} : JSON.parse(new TextDecoder().decode(metaBytes))
	);
	const tarData = decompress(compressedTar);
	const files = unpack(tarData);

	return { files, metadata };
}
