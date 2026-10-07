// linkify.ink.js — the linkify.ink library.
//
// This file imports NOTHING. It exports a single class, `LinkifyInk`, that turns a
// set of files into a shareable linkify.ink URL (optionally encrypted) and back
// again. Everything the browser gives us for free (WebCrypto, TextEncoder, btoa,
// fetch) is used directly; the two things it can't — zstd compression and Argon2id
// key derivation — are supplied by the caller through the constructor.
//
// The caller is responsible for importing the vendor bundle (vendor/vendor.codec.bundle.js)
// and this file, then constructing an instance with the vendored libraries:
//
//   import { linkifyInkCodecDependencies } from './vendor/vendor.codec.bundle.js';
//   import { LinkifyInk } from './linkify.ink.js';
//
//   const linkify = new LinkifyInk(linkifyInkCodecDependencies);
//
// `linkifyInkCodecDependencies` is a ready-made bundle of the vendored libraries;
// spread it to override anything, e.g.
// `new LinkifyInk({ ...linkifyInkCodecDependencies, origin: location.origin })`.
//
//   const url = await linkify.createLink(files, { encryption: 'password', password });
//   const { files, metadata } = await linkify.readLink(url, { password });
//
// Keeping this file import-free means it drops into any environment — a browser, a
// Node script, an AI agent executing JS — without a module resolver or the risk of
// a stray import failing to resolve at runtime.

/**
 * @typedef {{ name: string, data: Uint8Array<ArrayBuffer> }} FileEntry
 * @typedef {{ preview?: string, fullscreen?: boolean, [k: string]: unknown }} Metadata
 *
 * @typedef {{
 *   init: (wasmUrl: string) => Promise<unknown>,
 *   compress: (data: Uint8Array, level: number) => Uint8Array,
 *   decompress: (data: Uint8Array) => Uint8Array,
 *   createCCtx?: () => number,
 *   createDCtx?: () => number,
 *   compressUsingDict?: (cctx: number, data: Uint8Array, dict: Uint8Array, level: number) => Uint8Array,
 *   decompressUsingDict?: (dctx: number, data: Uint8Array, dict: Uint8Array) => Uint8Array,
 * }} ZstdModule
 *
 * @typedef {{
 *   hash: (opts: object) => Promise<{ hash: Uint8Array }>,
 *   ArgonType: { Argon2id: number },
 * }} Argon2Module
 *
 * @typedef {{
 *   zstd: ZstdModule,
 *   zstdWasmUrl: string,
 *   argon2: Argon2Module,
 *   argon2WasmUrl: string,
 *   zstdDictionaryUrls?: Record<number, string>,
 *   origin?: string,
 * }} LinkifyInkDeps
 *
 * `zstdDictionaryUrls` maps a format version to the URL (usually a data: URL) of
 * the zstd-compressed shared dictionary that version compresses with. Without the
 * current version's dictionary, links are written in format 1, which needs none.
 */

// The flag byte's low six bits are the format version. It says how the payload
// was compressed, so every version ever published has to stay readable:
//   1  zstd
//   2  zstd with a shared raw-content dictionary, dictionaries/v2.dict.zst. The
//      dictionary primes the compressor with text most links contain anyway
//      (markup, CSS, code, English), so no link has to spell it out itself.
// A better dictionary is a new version, never an edit to a published one.
const FORMAT_VERSION = 2;
const FORMAT_PLAIN = 1;
const BLOCK = 512;

// zstd's wasm module is process-wide: init() replaces its memory, which would
// strand the compression contexts and buffers of every instance already using it.
// So each zstd module is initialized once, however many instances share it.
/** @type {WeakMap<ZstdModule, Promise<void>>} */
const zstdInits = new WeakMap();

export class LinkifyInk {
	/** No encryption — anyone with the link can read it. */
	static ENC_NONE = 0x00;
	/** Password encryption — Argon2id key derivation + AES-GCM. */
	static ENC_PASSWORD = 0x01;
	/** Recipient-public-key encryption — ECDH (P-256) + HKDF + AES-GCM. */
	static ENC_ECDH = 0x02;

	/** @type {ZstdModule} */
	#zstd;
	/** @type {string} */
	#zstdWasmUrl;
	/** @type {Argon2Module} */
	#argon2;
	/** @type {string} */
	#argon2WasmUrl;
	/** @type {Record<number, string>} */
	#zstdDictionaryUrls;
	/** @type {string} */
	#origin;
	/** @type {Promise<void> | null} */
	#initPromise = null;
	/** Decompressed dictionaries by format version, loaded on first use. @type {Map<number, Promise<Uint8Array>>} */
	#dictionaries = new Map();
	/** @type {number | undefined} */
	#cctx;
	/** @type {number | undefined} */
	#dctx;

	/** @param {LinkifyInkDeps} deps */
	constructor(deps) {
		if (!deps || !deps.zstd || !deps.argon2)
			throw new Error(
				'LinkifyInk requires { zstd, zstdWasmUrl, argon2, argon2WasmUrl } from the vendor bundle',
			);
		this.#zstd = deps.zstd;
		this.#zstdWasmUrl = deps.zstdWasmUrl;
		this.#argon2 = deps.argon2;
		this.#argon2WasmUrl = deps.argon2WasmUrl;
		this.#zstdDictionaryUrls = deps.zstdDictionaryUrls ?? {};
		this.#origin = deps.origin ?? 'https://linkify.ink';
	}

	// --- Public API ---------------------------------------------------------

	/**
	 * Build a shareable linkify.ink URL from a set of files.
	 * @param {FileEntry[]} files
	 * @param {{
	 *   encryption?: 'none' | 'password' | 'ecdh',
	 *   password?: string,
	 *   recipientPublicKey?: Uint8Array<ArrayBuffer>,
	 *   metadata?: Metadata,
	 * }} [options]
	 * @returns {Promise<string>}
	 */
	async createLink(files, options = {}) {
		await this.#init();

		const {
			encryption = 'none',
			password,
			recipientPublicKey,
			metadata = {},
		} = options;
		const metaBytes = new TextEncoder().encode(JSON.stringify(metadata));
		const tarData = tarPack(files);
		const { version, compressed } = await this.#compress(tarData);

		const payload = concat(uint16be(metaBytes.length), metaBytes, compressed);

		let fullPayload;

		if (encryption === 'none') {
			const flagByte = (LinkifyInk.ENC_NONE << 6) | version;
			fullPayload = concat(new Uint8Array([flagByte]), payload);
		} else if (encryption === 'password') {
			if (!password)
				throw new Error('Password required for password encryption');
			const salt = crypto.getRandomValues(new Uint8Array(16));
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const key = await this.#argon2Derive(password, salt);
			const ciphertext = await aesEncrypt(key, iv, payload);
			const flagByte = (LinkifyInk.ENC_PASSWORD << 6) | version;
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
			const flagByte = (LinkifyInk.ENC_ECDH << 6) | version;
			fullPayload = concat(
				new Uint8Array([flagByte]),
				ephemeralPub,
				iv,
				ciphertext,
			);
		} else {
			throw new Error(`Unknown encryption type: ${encryption}`);
		}

		return `${this.#origin}/#${LinkifyInk.base64UrlEncode(fullPayload)}`;
	}

	/**
	 * Decode (and, if needed, decrypt) a linkify.ink URL or hash back into files.
	 * @param {string} hash a full URL, or the hash fragment, with or without '#'
	 * @param {{ password?: string, privateKey?: CryptoKey }} [options]
	 * @returns {Promise<{ files: FileEntry[], metadata: Metadata }>}
	 */
	async readLink(hash, options = {}) {
		await this.#init();

		const raw = stripToHashPayload(hash);
		const fullPayload = LinkifyInk.base64UrlDecode(raw);

		const encType = (fullPayload[0] >> 6) & 0x03;
		const version = fullPayload[0] & 0x3f;
		if (version < FORMAT_PLAIN || version > FORMAT_VERSION)
			throw new Error(
				`Unknown link format ${version}; it may have been made by a newer linkify.ink`,
			);

		let payload;

		if (encType === LinkifyInk.ENC_NONE) {
			payload = fullPayload.slice(1);
		} else if (encType === LinkifyInk.ENC_PASSWORD) {
			const { password } = options;
			if (!password) throw new Error('Password required to decrypt');
			const salt = fullPayload.slice(1, 17);
			const iv = fullPayload.slice(17, 29);
			const ciphertext = fullPayload.slice(29);
			const key = await this.#argon2Derive(password, salt);
			payload = await aesDecrypt(key, iv, ciphertext);
		} else if (encType === LinkifyInk.ENC_ECDH) {
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
		const tarData = /** @type {Uint8Array<ArrayBuffer>} */ (
			await this.#decompress(version, compressedTar)
		);
		const files = tarUnpack(tarData);

		return { files, metadata };
	}

	/**
	 * Peek at the encryption type of a payload without decoding it. Lets a caller
	 * decide how to prompt (password / private key) before attempting a full read.
	 * @param {string} hash a full URL, or the hash fragment, with or without '#'
	 * @returns {number} one of ENC_NONE / ENC_PASSWORD / ENC_ECDH (ENC_NONE on parse error)
	 */
	peekEncryptionType(hash) {
		try {
			return (
				(LinkifyInk.base64UrlDecode(stripToHashPayload(hash))[0] >> 6) & 0x03
			);
		} catch {
			return LinkifyInk.ENC_NONE;
		}
	}

	/**
	 * Generate an ECDH (P-256) keypair for receiving files. Share the exported
	 * public key with senders; keep the private key to decrypt what they send.
	 * @returns {Promise<{ publicKey: CryptoKey, privateKey: CryptoKey }>}
	 */
	async generateKeypair() {
		return generateEcdhKeypair();
	}

	/**
	 * Export a P-256 public key as its raw 65-byte uncompressed point.
	 * @param {CryptoKey} key
	 * @returns {Promise<Uint8Array<ArrayBuffer>>}
	 */
	async exportPublicKey(key) {
		return exportPublicKey(key);
	}

	/**
	 * Import a raw 65-byte P-256 public key.
	 * @param {Uint8Array<ArrayBuffer>} raw
	 * @returns {Promise<CryptoKey>}
	 */
	async importPublicKey(raw) {
		return importPublicKey(raw);
	}

	/**
	 * Pack files into a ustar tar archive (files only, no directories). Pure; no
	 * vendored deps required. Useful for offering received files as a single
	 * download.
	 * @param {FileEntry[]} files
	 * @returns {Uint8Array<ArrayBuffer>}
	 */
	static packTar(files) {
		return tarPack(files);
	}

	/**
	 * Read files out of a ustar tar archive. Pure; no vendored deps required.
	 * @param {Uint8Array<ArrayBuffer>} buffer
	 * @returns {FileEntry[]}
	 */
	static unpackTar(buffer) {
		return tarUnpack(buffer);
	}

	/**
	 * Base64url-encode bytes (no padding). Pure; no vendored deps required.
	 * @param {Uint8Array} bytes
	 * @returns {string}
	 */
	static base64UrlEncode(bytes) {
		let binary = '';
		for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	/**
	 * Base64url-decode a string. Pure; no vendored deps required.
	 * @param {string} str
	 * @returns {Uint8Array<ArrayBuffer>}
	 */
	static base64UrlDecode(str) {
		const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
		const padded = base64.padEnd(
			base64.length + ((4 - (base64.length % 4)) % 4),
			'=',
		);
		const binary = atob(padded);
		const buffer = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
		return buffer;
	}

	// --- Internals ----------------------------------------------------------

	/**
	 * Initialize the vendored WASM libraries once. zstd needs an explicit init;
	 * argon2-browser loads its wasm through a global hook we point at the supplied
	 * data URL (its own require()-based loader isn't compatible with esbuild's
	 * base64 wasm bundling).
	 * @returns {Promise<void>}
	 */
	#init() {
		if (!this.#initPromise) {
			const argon2WasmUrl = this.#argon2WasmUrl;
			globalThis.loadArgon2WasmBinary = async () => {
				const response = await fetch(argon2WasmUrl);
				return new Uint8Array(await response.arrayBuffer());
			};
			let zstdInit = zstdInits.get(this.#zstd);
			if (!zstdInit) {
				zstdInit = Promise.resolve(this.#zstd.init(this.#zstdWasmUrl)).then(
					() => undefined,
				);
				// A failed init (a flaky network) is retried by the next instance.
				zstdInit.catch(() => zstdInits.delete(this.#zstd));
				zstdInits.set(this.#zstd, zstdInit);
			}
			this.#initPromise = zstdInit;
		}
		return this.#initPromise;
	}

	/**
	 * Compress with the current format's dictionary, or without one (format 1)
	 * when the caller supplied no dictionary or a zstd without dictionary support.
	 * @param {Uint8Array} data
	 * @returns {Promise<{ version: number, compressed: Uint8Array }>}
	 */
	async #compress(data) {
		const zstd = this.#zstd;
		if (!this.#zstdDictionaryUrls[FORMAT_VERSION] || !zstd.compressUsingDict || !zstd.createCCtx)
			return { version: FORMAT_PLAIN, compressed: zstd.compress(data, 19) };
		const dictionary = await this.#dictionary(FORMAT_VERSION);
		this.#cctx ??= zstd.createCCtx();
		return {
			version: FORMAT_VERSION,
			compressed: zstd.compressUsingDict(this.#cctx, data, dictionary, 19),
		};
	}

	/**
	 * @param {number} version the link's format version
	 * @param {Uint8Array} data
	 * @returns {Promise<Uint8Array>}
	 */
	async #decompress(version, data) {
		const zstd = this.#zstd;
		if (version === FORMAT_PLAIN) return zstd.decompress(data);
		if (!zstd.decompressUsingDict || !zstd.createDCtx)
			throw new Error(`Link format ${version} needs a zstd with dictionary support`);
		const dictionary = await this.#dictionary(version);
		this.#dctx ??= zstd.createDCtx();
		return zstd.decompressUsingDict(this.#dctx, data, dictionary);
	}

	/**
	 * Fetch and decompress a format version's shared dictionary, once.
	 * @param {number} version
	 * @returns {Promise<Uint8Array>}
	 */
	#dictionary(version) {
		let dictionary = this.#dictionaries.get(version);
		if (!dictionary) {
			const url = this.#zstdDictionaryUrls[version];
			if (!url) throw new Error(`Link format ${version} needs its zstd dictionary`);
			dictionary = fetch(url)
				.then((response) => response.arrayBuffer())
				.then((buffer) => this.#zstd.decompress(new Uint8Array(buffer)));
			// A failed load (a flaky network) is retried by the next call.
			dictionary.catch(() => this.#dictionaries.delete(version));
			this.#dictionaries.set(version, dictionary);
		}
		return dictionary;
	}

	/**
	 * Derive an AES-GCM key from a password using Argon2id.
	 * @param {string} password
	 * @param {Uint8Array<ArrayBuffer>} salt
	 * @returns {Promise<CryptoKey>}
	 */
	async #argon2Derive(password, salt) {
		const result = await this.#argon2.hash({
			pass: password,
			salt,
			type: this.#argon2.ArgonType.Argon2id,
			hashLen: 32,
			time: 3,
			mem: 65536,
			parallelism: 1,
		});
		return crypto.subtle.importKey(
			'raw',
			/** @type {Uint8Array<ArrayBuffer>} */ (result.hash),
			{ name: 'AES-GCM' },
			false,
			['encrypt', 'decrypt'],
		);
	}
}

// --- Pure helpers (no vendored deps) --------------------------------------

/**
 * @param {string} hash
 * @returns {string}
 */
function stripToHashPayload(hash) {
	const hashIdx = hash.indexOf('#');
	return hashIdx === -1 ? hash : hash.slice(hashIdx + 1);
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

// --- WebCrypto helpers (platform-native; no vendored deps) ----------------

/**
 * @param {CryptoKey} key
 * @param {Uint8Array<ArrayBuffer>} iv
 * @param {Uint8Array<ArrayBuffer>} data
 * @returns {Promise<Uint8Array<ArrayBuffer>>}
 */
async function aesEncrypt(key, iv, data) {
	const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
	return new Uint8Array(buf);
}

/**
 * @param {CryptoKey} key
 * @param {Uint8Array<ArrayBuffer>} iv
 * @param {Uint8Array<ArrayBuffer>} data
 * @returns {Promise<Uint8Array<ArrayBuffer>>}
 */
async function aesDecrypt(key, iv, data) {
	const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
	return new Uint8Array(buf);
}

/**
 * @returns {Promise<{ publicKey: CryptoKey, privateKey: CryptoKey }>}
 */
async function generateEcdhKeypair() {
	const pair = await crypto.subtle.generateKey(
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
async function ecdhDerive(privateKey, publicKey) {
	const sharedKeyMaterial = await crypto.subtle.deriveKey(
		{ name: 'ECDH', public: publicKey },
		privateKey,
		{ name: 'HKDF' },
		false,
		['deriveKey'],
	);
	return crypto.subtle.deriveKey(
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
 * @param {CryptoKey} key
 * @returns {Promise<Uint8Array<ArrayBuffer>>}
 */
async function exportPublicKey(key) {
	const buf = await crypto.subtle.exportKey('raw', key);
	return new Uint8Array(buf);
}

/**
 * @param {Uint8Array<ArrayBuffer>} raw
 * @returns {Promise<CryptoKey>}
 */
async function importPublicKey(raw) {
	return crypto.subtle.importKey(
		'raw',
		raw,
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		[],
	);
}

// --- Minimal tar (ustar, files only) --------------------------------------

/**
 * @param {string} str
 * @param {number} len
 * @returns {Uint8Array}
 */
function strToField(str, len) {
	const buf = new Uint8Array(len);
	for (let i = 0; i < Math.min(str.length, len - 1); i++) {
		buf[i] = str.charCodeAt(i);
	}
	return buf;
}

/**
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {number} len
 * @returns {string}
 */
function fieldToStr(buf, offset, len) {
	let end = offset;
	while (end < offset + len && buf[end] !== 0) end++;
	return String.fromCharCode(...buf.slice(offset, end));
}

/**
 * @param {number} num
 * @param {number} len
 * @returns {Uint8Array}
 */
function numToOctal(num, len) {
	return strToField(num.toString(8).padStart(len - 1, '0'), len);
}

/**
 * @param {Uint8Array} header
 * @returns {Uint8Array}
 */
function computeChecksum(header) {
	// Checksum field (bytes 148-155) treated as spaces during calculation
	let sum = 0;
	for (let i = 0; i < BLOCK; i++) {
		sum += i >= 148 && i < 156 ? 32 : header[i];
	}
	return numToOctal(sum, 8);
}

/**
 * @param {FileEntry[]} files
 * @returns {Uint8Array<ArrayBuffer>}
 */
function tarPack(files) {
	const blocks = [];

	for (const file of files) {
		const nameBytes = new TextEncoder().encode(file.name);
		const header = new Uint8Array(BLOCK);

		header.set(nameBytes.slice(0, 100), 0); // name (100 bytes at offset 0)
		header.set(numToOctal(0o644, 8), 100); // mode
		header.set(numToOctal(0, 8), 108); // uid
		header.set(numToOctal(0, 8), 116); // gid
		header.set(numToOctal(file.data.length, 12), 124); // size
		// Archive metadata is part of the URL payload. A fixed mtime keeps public
		// links reproducible when the file names and bytes have not changed.
		header.set(numToOctal(0, 12), 136); // mtime
		header[156] = 48; // typeflag '0' = regular file
		header.set(strToField('ustar', 6), 257); // magic
		header.set(strToField('00', 2), 263); // version
		header.set(computeChecksum(header), 148); // checksum

		blocks.push(header);

		// file data padded to BLOCK boundary
		const padded = Math.ceil(file.data.length / BLOCK) * BLOCK;
		const dataBlock = new Uint8Array(padded);
		dataBlock.set(file.data);
		blocks.push(dataBlock);
	}

	// Two 512-byte zero blocks at the end
	blocks.push(new Uint8Array(BLOCK));
	blocks.push(new Uint8Array(BLOCK));

	return concat(...blocks);
}

/**
 * @param {Uint8Array<ArrayBuffer>} buffer
 * @returns {FileEntry[]}
 */
function tarUnpack(buffer) {
	/** @type {FileEntry[]} */
	const files = [];
	let offset = 0;

	while (offset + BLOCK <= buffer.length) {
		const header = buffer.slice(offset, offset + BLOCK);

		// End-of-archive (two zero blocks)
		if (header.every((b) => b === 0)) break;

		const name = fieldToStr(header, 0, 100);
		const size = parseInt(fieldToStr(header, 124, 12), 8) || 0;
		const typeflag = header[156];

		offset += BLOCK;

		// Only regular files (typeflag '0' or '\0')
		if (typeflag === 48 || typeflag === 0) {
			files.push({ name, data: buffer.slice(offset, offset + size) });
		}

		offset += Math.ceil(size / BLOCK) * BLOCK;
	}

	return files;
}
