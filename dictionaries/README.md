# Shared zstd dictionaries

Every linkify.ink link is compressed with zstd and a shared **raw-content
dictionary**: bytes both ends already have, which the compressor can reference
instead of spelling them out in the link. The flag byte's format version says
which dictionary a link needs.

| format | dictionary | raw size | SHA-256 of the raw dictionary |
| --- | --- | ---: | --- |
| 1 | none | | |
| 2 | `v2.dict.zst` | 3,489,101 bytes | `84b92dfee4d5a8b1a41878e9a3c5dc470424d729c78ac47a1778c1e04a2cba80` |

The files here are the dictionaries compressed with zstd, which the app already
has to decompress them. `vendor/vendor.codec.js` imports each one as a data URL
(`--loader:.zst=dataurl`), so the codec bundle carries it and works offline, in
the extension and in Node without fetching anything.

## Sources

`v2.dict.zst` holds no text under a share-alike licence. Its word lists are
counts over Mozilla Common Voice's sentences (CC0), VS Code's language packs
(MIT) and Firefox's localizations (MPL-2.0); only which words are most frequent
comes from them. Its trained section holds fragments of the MIT, ISC, BSD and
Apache-licensed packages in `node_modules`, chosen by zstd's dictionary trainer.
See [`demo/shared-dictionary/`](../demo/shared-dictionary/README.md).

## Never edit or delete one

(Until linkify.ink is launched there are no links to break, so v2 may still be
rebuilt in place. After that, the rules below hold.)

A published dictionary is part of the link format. Change a single byte and every
link made with it decodes to garbage or fails. `tests/codec.spec.js` pins the
hash above.

A better dictionary is a new format version:

1. Build it (see [`demo/shared-dictionary/`](../demo/shared-dictionary/README.md))
   and freeze it with `node demo/shared-dictionary/build-dictionary.mjs --write
   dictionaries/v3.dict.zst`, which refuses to overwrite an existing file.
2. Import it in `vendor/vendor.codec.js` as `zstdDictionaryUrls[3]`, keeping every
   older entry, and rebuild the bundle (`npm run bundle-libs-codec`).
3. Bump `FORMAT_VERSION` in `linkify.ink.js` and add the version to the list above
   it. Readers keep reading every older version.
4. Pin the new hash in `tests/codec.spec.js` and add it to the table above.
