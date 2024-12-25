/**
 * @template T
 * @param {T} value
 * @param {string} message
 * @returns {NonNullable<T>}
 */
export function assertNotNil(
	value,
	message = 'Expected value not to be null or undefined',
) {
	if (value == null) {
		throw new Error(message);
	}
	return value;
}
