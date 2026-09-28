// UI wiring for the linkify.ink library: imports the codec vendor bundle and the
// import-free lib, then constructs the single shared instance the components use.
// This is the "consumer" side of the lib's dependency-injection design — the lib
// itself imports nothing; wiring the vendored deps together happens here.
import { linkifyInkCodecDependencies } from '../vendor/vendor.codec.bundle.js';
import { LinkifyInk } from '../linkify.ink.js';

export const linkify = new LinkifyInk({
	...linkifyInkCodecDependencies,
	origin: location.origin,
});

export { LinkifyInk };
