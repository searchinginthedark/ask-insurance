"""Check comparison metrics (research/metrics/<insurer>.json) against their own sources.

Every cell is {v, quote, src}. A cell passes only if:
- its plan exists in research/insurers/<insurer>.json in a compared category, and the metric id is
  one defined for that category in data/guide.json (`metrics`);
- `src` is the plan's own page, one of its PDFs, or a PDF listed in `extra_pdfs`, all on the
  insurer's own domain;
- `quote` (a string, or a list of at most two from the same source) appears in the text of `src` (letters and digits only, so line breaks and punctuation
  do not matter);
- every whole number in `v` is a whole number in `quote` ("28" does not pass inside "2028");
- `v` is at most 120 characters and `quote` at most 40 words.

Page text is cached in research/raw/pages/ (shared with verify_facts.py); PDFs are read from their
local copy in research/pdf/. Pass --fresh to refetch pages.

Usage: python tools/verify_metrics.py [INSURER_ID ...] [--fresh] [--remote]
Exit 1 on any problem, or if a source is broken (a 404 and the like). A source whose site refuses
the request (timeout, 403, bot wall) is a warning, not a failure: its cells are reported as
unchecked. See tools/fetch.py.
"""
import glob
import json
import os
import re
import sys

import requests

import fetch
from build_data import on_domain
from verify_facts import CACHE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
# --remote ignores local PDF copies and reads each PDF from its official URL, as CI must.
REMOTE = "--remote" in sys.argv
# --fresh refetches downloaded PDFs too; without it a changed brochure is read from a stale cache.
FRESH = "--fresh" in sys.argv


def numbers(s):
    return {n.replace(",", "").rstrip(".") for n in NUM.findall(s)}


def letters(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def pdf_text(local, url):
    """Text of a PDF: the local copy when there is one, else downloaded from its official URL
    (CI has no research/pdf/, which is gitignored). Downloads are cached beside the page cache."""
    import fitz
    if REMOTE:
        local = None
    p = os.path.join(ROOT, local or "")
    for t in (p[:-4] + ".txt", p + ".txt"):
        if local and os.path.exists(t):
            with open(t, encoding="utf-8", errors="replace") as f:
                return f.read()
    if local and os.path.exists(p):
        return "\n".join(pg.get_text("text") for pg in fitz.open(p))
    return fetch.text(url, CACHE, prefix="pdf-", fresh=FRESH, timeout=60)


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    fresh = "--fresh" in argv
    ids = [a for a in argv if not a.startswith("--")]
    with open(os.path.join(ROOT, "data", "guide.json"), encoding="utf-8") as f:
        guide = json.load(f)
    defined = {c["id"]: {m["id"] for m in c.get("metrics", [])} for c in guide["categories"] if c.get("metrics")}
    bad, checked, refused, skipped = [], 0, {}, 0
    for path in sorted(glob.glob(os.path.join(ROOT, "research", "metrics", "*.json"))):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        iid = d.get("insurer")
        if ids and iid not in ids:
            continue
        with open(os.path.join(ROOT, "research", "insurers", "%s.json" % iid), encoding="utf-8") as f:
            plans = {p["name"]: p for p in json.load(f)["products"]}
        extra = {}
        for x in d.get("extra_pdfs", []):
            if not (x.get("url", "").startswith("https://") and on_domain(x["url"], iid)):
                bad.append((iid, x.get("product"), "extra_pdfs", "off-domain or not https: %s" % x.get("url")))
            extra.setdefault(x.get("product"), {})[x.get("url")] = x.get("local")
        texts = {}
        for name, entry in d.get("products", {}).items():
            p = plans.get(name)
            cat = entry.get("category")
            if not p:
                bad.append((iid, name, "-", "no such plan in research/insurers/%s.json" % iid))
                continue
            if cat != p["category"] or cat not in defined:
                bad.append((iid, name, "-", "category %r does not match the plan's or has no metrics" % cat))
                continue
            sources = {p["url"]: None}
            sources.update({x["url"]: x.get("local") for x in p.get("pdfs") or []})
            sources.update(extra.get(name, {}))
            for mid, cell in entry.get("metrics", {}).items():
                checked += 1
                where = (iid, name, mid)
                if mid not in defined[cat]:
                    bad.append(where + ("unknown metric for %s" % cat,))
                    continue
                # quote may be a list when one value needs two passages of the same source
                # (e.g. an overall cap and a sub-cap stated in a footnote).
                qs = cell.get("quote") or ""
                qs = [x.strip() for x in ([qs] if isinstance(qs, str) else qs) if x and x.strip()]
                v, src = (cell.get("v") or "").strip(), cell.get("src")
                if not v or not qs or not src:
                    bad.append(where + ("needs v, quote and src",))
                    continue
                if len(v) > 120 or any(len(q.split()) > 40 for q in qs) or len(qs) > 2:
                    bad.append(where + ("too long (v %d chars, quotes %s words)" % (len(v), [len(q.split()) for q in qs]),))
                if src not in sources or not on_domain(src, iid):
                    bad.append(where + ("src is not this plan's page, PDF or extra_pdfs entry: %s" % src,))
                    continue
                if src not in texts:
                    local = sources[src]
                    try:
                        if local or src.lower().split("?")[0].endswith(".pdf"):
                            texts[src] = pdf_text(local, src)
                        else:
                            texts[src] = fetch.text(src, CACHE, fresh=fresh, timeout=20)
                    except fetch.Blocked as e:
                        texts[src] = None
                        refused[src] = str(e)
                    except requests.RequestException as e:
                        texts[src] = None
                        bad.append(where + ("source broken (%s): %s" % (type(e).__name__, src),))
                        continue
                text = texts[src]
                if src in refused:
                    skipped += 1
                    continue
                if not text or len(text) < 200:
                    bad.append(where + ("source text unreadable (blocked page or missing local PDF): %s" % src,))
                    continue
                for q in qs:
                    if letters(q) not in letters(text):
                        bad.append(where + ("quote not found in source: %r" % q[:70],))
                extra_nums = sorted(numbers(v) - set().union(*(numbers(q) for q in qs)))
                if extra_nums:
                    bad.append(where + ("numbers in v but not in quote: %s" % ", ".join(extra_nums),))
    print("metric cells checked: %d, problems: %d, unchecked because the site refused: %d" % (checked - skipped, len(bad), skipped))
    for iid, name, mid, why in bad:
        print("  %-13s %-32s %-10s %s" % (iid, (name or "")[:32], mid, why))
    fetch.warn("refused: %s (%s)" % (why, src) for src, why in sorted(refused.items()))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
