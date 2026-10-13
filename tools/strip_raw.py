"""Print a raw page's text minus site chrome: lines that recur across 3+ pages of the same site.

Usage: python tools/strip_raw.py <slug-prefix> [<slug-prefix> ...]
"""
import collections
import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "research", "raw")


def site(name):
    return name.split("_")[0]


def main(prefixes):
    sys.stdout.reconfigure(encoding="utf-8")
    files = sorted(glob.glob(os.path.join(RAW, "*.txt")))
    per_site = collections.defaultdict(collections.Counter)
    texts = {}
    for f in files:
        name = os.path.basename(f)
        with open(f, encoding="utf-8") as fh:
            lines = [l.strip() for l in fh.read().splitlines()]
        texts[name] = lines
        for l in set(lines):
            per_site[site(name)][l] += 1
    for p in prefixes:
        for name, lines in texts.items():
            if not name.startswith(p):
                continue
            print("########", name)
            common = per_site[site(name)]
            for l in lines:
                if l and (common[l] < 3 or len(l) > 120):
                    print(l)


if __name__ == "__main__":
    main(sys.argv[1:])
