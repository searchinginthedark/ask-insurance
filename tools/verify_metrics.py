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
Exit 1 on any problem, or if a source cannot be read.
"""
import glob
import json
import os
import re
import sys

from build_data import on_domain
from verify_facts import CACHE, page_text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
# --remote ignores local PDF copies and reads each PDF from its official URL, as CI must.
REMOTE = "--remote" in sys.argv


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
    import hashlib
    import requests
    from verify_facts import UA
    os.makedirs(CACHE, exist_ok=True)
    cp = os.path.join(CACHE, "pdf-" + hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt")
    if os.path.exists(cp):
        with open(cp, encoding="utf-8") as f:
            return f.read()
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=60)
        if not r.content.startswith(b"%PDF"):
            return None
        text = "\n".join(pg.get_text("text") for pg in fitz.open(stream=r.content, filetype="pdf"))
    except requests.RequestException:
        return None
    with open(cp, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return text


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    fresh = "--fresh" in argv
    ids = [a for a in argv if not a.startswith("--")]
    with open(os.path.join(ROOT, "data", "guide.json"), encoding="utf-8") as f:
        guide = json.load(f)
    defined = {c["id"]: {m["id"] for m in c.get("metrics", [])} for c in guide["categories"] if c.get("metrics")}
    bad, checked = [], 0
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
                    if local or src.lower().split("?")[0].endswith(".pdf"):
                        texts[src] = pdf_text(local, src)
                    else:
                        if fresh:
                            import hashlib
                            cp = os.path.join(CACHE, hashlib.sha1(src.encode()).hexdigest()[:16] + ".txt")
                            if os.path.exists(cp):
                                os.remove(cp)
                        texts[src] = page_text(src)
                text = texts[src]
                if not text or len(text) < 200:
                    bad.append(where + ("source text unreadable (blocked page or missing local PDF): %s" % src,))
                    continue
                for q in qs:
                    if letters(q) not in letters(text):
                        bad.append(where + ("quote not found in source: %r" % q[:70],))
                extra_nums = sorted(numbers(v) - set().union(*(numbers(q) for q in qs)))
                if extra_nums:
                    bad.append(where + ("numbers in v but not in quote: %s" % ", ".join(extra_nums),))
    print("metric cells checked: %d, problems: %d" % (checked, len(bad)))
    for iid, name, mid, why in bad:
        print("  %-13s %-32s %-10s %s" % (iid, (name or "")[:32], mid, why))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
