// Makes the vendored codec dependencies work outside a browser (Node, Deno, an
// agent's JS sandbox) without changing their behaviour inside one. Imported first
// by vendor.codec.js so it runs before any vendor module body evaluates.
//
// argon2-browser resolves its global as `typeof self !== 'undefined' ? self : this`
// and then branches on `global.process` to decide whether to load its wasm the
// Node way (require + __dirname, which esbuild cannot bundle) or the browser way
// (hand it the bytes via loadArgon2WasmBinary — what LinkifyInk does). Outside a
// browser there is no `self`, and once we supply one, `process` exists and sends it
// down the Node path. So `self` is a pass-through view of globalThis with `process`
// hidden: every other lookup, including the loadArgon2WasmBinary hook and the
// `Module` object argon2 sets and reads back, resolves against the real global.
//
// The companion half of this lives in the bundle command: --define:process=undefined
// stops argon2's emscripten glue from taking the same Node path for its own reasons.
//
// In a browser `self` is already defined, so `??=` makes this whole file a no-op.
// @ts-ignore - `self` is typed as a full Window; a pass-through view is enough here
globalThis.self ??= new Proxy(globalThis, {
	get: (target, prop) =>
		prop === 'process' ? undefined : Reflect.get(target, prop),
});
