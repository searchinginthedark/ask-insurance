"""Check an insurer's PDF-sourced Compare cells against PDFs saved by hand from a browser.

For a site that refuses scripts but loads in a browser (AIA, see local_verify.py). Its product pages
are read in the browser itself; its PDFs download instead of opening, so save them to one folder and
run this. Uses the same text matching as verify_metrics. After both pass, update checked_on in
research/hand_checks.json.

Usage: python tools/hand_check.py aia research/raw/hand_check/2026-11-04
Exit 0 every quote found, 1 a quote missing or a PDF not saved.
"""
import json
import os
import re
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify_metrics import ROOT, letters


def bump_digits(q):
    return re.sub(r"\d", lambda m: str((int(m.group()) + 1) % 10), q)


def main(insurer, folder):
    with open(os.path.join(ROOT, "research", "metrics", "%s.json" % insurer), encoding="utf-8") as f:
        products = json.load(f)["products"]
    texts, bad, cells, controls = {}, 0, 0, 0
    for name, entry in products.items():
        for mid, cell in entry["metrics"].items():
            src = cell["src"]
            if not src.lower().split("?")[0].endswith(".pdf"):
                continue
            cells += 1
            path = os.path.join(folder, src.rsplit("/", 1)[1].split("?")[0])
            if path not in texts:
                if not os.path.exists(path):
                    print("MISSING PDF %s" % path)
                    texts[path] = None
                else:
                    with fitz.open(path) as doc:
                        texts[path] = letters("\n".join(p.get_text("text") for p in doc))
            if texts[path] is None:
                bad += 1
                continue
            qs = cell["quote"] if isinstance(cell["quote"], list) else [cell["quote"]]
            for q in qs:
                if letters(q) not in texts[path]:
                    bad += 1
                    print("NOT FOUND %s / %s: %r" % (name, mid, q[:70]))
                # A changed number must not match, or a pass here means nothing.
                if re.search(r"\d", q):
                    controls += 1
                    if letters(bump_digits(q)) in texts[path]:
                        bad += 1
                        print("CONTROL MATCHED %s / %s" % (name, mid))
    print("%s PDF cells: %d, PDFs: %d, problems: %d, digit-changed controls: %d" % (insurer, cells, len(texts), bad, controls))
    return 1 if bad or not cells else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
