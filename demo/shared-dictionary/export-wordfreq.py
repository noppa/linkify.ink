"""export-wordfreq.py — the multilingual section of the shared dictionary.

Writes the most frequent words of every language wordfreq has a "best" list for
(42 languages), from https://github.com/rspeer/wordfreq. wordfreq's data is
CC-BY-SA 4.0, which is why the published dictionary is too: see
dictionaries/README.md.

    pip install wordfreq
    python3 demo/shared-dictionary/export-wordfreq.py [N]   → out/wordfreq-{N}.json

N is words per language and defaults to 5000, what the v2 dictionary was built
with.
"""

import json
from importlib.metadata import version
import os
import sys
import wordfreq

HERE = os.path.dirname(os.path.abspath(__file__))
n = int(sys.argv[1]) if len(sys.argv) > 1 else 5000

languages = sorted(wordfreq.available_languages(wordlist="best"))
words = {lang: wordfreq.top_n_list(lang, n, wordlist="best") for lang in languages}

os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
path = os.path.join(HERE, "out", f"wordfreq-{n}.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump({"wordfreq": version("wordfreq"), "words": words}, f, ensure_ascii=False)
print(f"{path}: {len(languages)} languages, {n} words each")
