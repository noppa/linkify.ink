// @ts-check
// Minimal tar read/write (ustar format, files only, no directories)

const BLOCK = 512;

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
 * @param {{ name: string, data: Uint8Array }[]} files
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function pack(files) {
	const blocks = [];

	for (const file of files) {
		const nameBytes = new TextEncoder().encode(file.name);
		const header = new Uint8Array(BLOCK);

		// name (100 bytes at offset 0)
		header.set(nameBytes.slice(0, 100), 0);
		// mode (8 bytes at offset 100)
		header.set(numToOctal(0o644, 8), 100);
		// uid, gid (8 bytes each, offset 108, 116)
		header.set(numToOctal(0, 8), 108);
		header.set(numToOctal(0, 8), 116);
		// size (12 bytes at offset 124)
		header.set(numToOctal(file.data.length, 12), 124);
		// mtime (12 bytes at offset 136)
		header.set(numToOctal(Math.floor(Date.now() / 1000), 12), 136);
		// typeflag '0' = regular file (offset 156)
		header[156] = 48; // '0'
		// magic "ustar" (offset 257)
		header.set(strToField('ustar', 6), 257);
		// version "00" (offset 263)
		header.set(strToField('00', 2), 263);
		// checksum (offset 148)
		header.set(computeChecksum(header), 148);

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

	const total = blocks.reduce((acc, b) => acc + b.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const block of blocks) {
		result.set(block, offset);
		offset += block.length;
	}
	return result;
}

/**
 * @param {Uint8Array<ArrayBuffer>} buffer
 * @returns {{ name: string, data: Uint8Array<ArrayBuffer> }[]}
 */
export function unpack(buffer) {
	const files = [];
	let offset = 0;

	while (offset + BLOCK <= buffer.length) {
		const header = buffer.slice(offset, offset + BLOCK);

		// Check for end-of-archive (two zero blocks)
		if (header.every((b) => b === 0)) break;

		const name = fieldToStr(header, 0, 100);
		const sizeStr = fieldToStr(header, 124, 12);
		const size = parseInt(sizeStr, 8) || 0;
		const typeflag = header[156];

		offset += BLOCK;

		// Only regular files (typeflag '0' or '\0')
		if (typeflag === 48 || typeflag === 0) {
			const data = buffer.slice(offset, offset + size);
			files.push({ name, data });
		}

		// Advance past data blocks
		offset += Math.ceil(size / BLOCK) * BLOCK;
	}

	return files;
}
