"""train-dictionary.py — the comparison point for the hand-built dictionary.

Trains a regular zstd dictionary (`zstd --train`, via python-zstandard) on a
generic corpus of web text: the HTML, CSS, JS and Markdown files that ship inside
node_modules. Like the vocabulary dictionary, it never sees the documents it is
measured on. Unlike it, it is an opaque binary with entropy tables tuned to its
samples, which is what zstd recommends for small inputs.

    pip install zstandard
    python3 demo/shared-dictionary/train-dictionary.py   → out/trained-{16,64}k.dict
"""

import os
import random
import zstandard

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
EXTENSIONS = (".html", ".htm", ".css", ".md", ".js", ".mjs", ".ts")
SAMPLE_BYTES = 16 * 1024  # zstd trains on small samples; cut big files into pieces

samples = []
for dirpath, _, filenames in os.walk(os.path.join(ROOT, "node_modules")):
    for name in filenames:
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
for kb in (16, 64):
    dictionary = zstandard.train_dictionary(kb * 1024, samples, level=19, threads=-1)
    path = os.path.join(HERE, "out", f"trained-{kb}k.dict")
    with open(path, "wb") as f:
        f.write(dictionary.as_bytes())
    print(f"{path}: {len(dictionary.as_bytes())} bytes")
