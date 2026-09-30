// Vendored UI dependencies (Preact + htm), bundled into vendor.ui.bundle.js and
// used by the editor UI. The codec's own vendored deps (zstd, argon2) live in the
// separate vendor.codec.bundle.js so tools that only create/read links don't have
// to pull in a rendering library.
export { h, render, Fragment } from 'preact';
export { useState, useEffect, useRef, useCallback } from 'preact/hooks';
export { default as htm } from 'htm';
