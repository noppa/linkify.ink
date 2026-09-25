"""train-dictionary.py — the trained section of the shared dictionary.

Trains a regular zstd dictionary (`zstd --train`, via python-zstandard) on a
generic corpus of web text: the HTML, CSS, JS and Markdown files that ship inside
node_modules. Like the vocabulary, it never sees the documents it is measured on.

A trained dictionary is a header (dictionary ID and entropy tables) followed by
raw content: the corpus fragments the trainer judged most useful, best last.
Only the content is kept. linkify.ink uses raw-content dictionaries, which carry
no ID into the frame, and the entropy tables are tuned to the samples rather than
to the vocabulary that build-dictionary.mjs puts after the content.

    pip install zstandard
    python3 demo/shared-dictionary/train-dictionary.py [KB ...]   → out/trained-{KB}k.raw

KB defaults to 1024, the size the v2 dictionary was built with. It takes about
half a minute.
"""

import os
import random
import sys
import zstandard

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
EXTENSIONS = (".html", ".htm", ".css", ".md", ".js", ".mjs", ".ts")
SAMPLE_BYTES = 16 * 1024  # zstd trains on small samples; cut big files into pieces
# The content follows the header's three starting repeat offsets, which a trained
# dictionary always sets to zstd's defaults: 1, 4 and 8 as 32-bit little-endian.
REPEAT_OFFSETS = b"\x01\x00\x00\x00\x04\x00\x00\x00\x08\x00\x00\x00"

samples = []
for dirpath, _, filenames in sorted(os.walk(os.path.join(ROOT, "node_modules"))):
    for name in sorted(filenames):
        if not name.endswith(EXTENSIONS) or ".min." in name or name.endswith(".d.ts"):
            continue
        try:
            with open(os.path.join(dirpath, name), "rb") as f:
                data = f.read(512 * 1024)
        except OSError:
            continue
        # Skip minified/generated bundles: one giant line is not what people share.
        if not data or data.count(b"\n") < len(data) / 400:
            continue
        for i in range(0, len(data), SAMPLE_BYTES):
            samples.append(data[i : i + SAMPLE_BYTES])

random.seed(1)
random.shuffle(samples)
samples = samples[:20000]
print(f"{len(samples)} samples, {sum(map(len, samples)) // 1024} KB")

os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
for kb in map(int, sys.argv[1:] or ["1024"]):
    trained = zstandard.train_dictionary(kb * 1024, samples, k=1024, d=8, level=19, threads=-1)
    data = trained.as_bytes()
    start = data.find(REPEAT_OFFSETS)
    if start == -1 or start > 4096:
        raise SystemExit(f"could not find the end of the {kb} KB dictionary's header")
    content = data[start + len(REPEAT_OFFSETS) :]
    path = os.path.join(HERE, "out", f"trained-{kb}k.raw")
    with open(path, "wb") as f:
        f.write(content)
    print(f"{path}: {len(content)} bytes of content")
