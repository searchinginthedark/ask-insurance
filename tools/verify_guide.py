"""Re-check every sourced number in data/guide.json against the text of its own source.

Covers category facts / pitfalls / caveats, scheme facts, key figures (`key`), pain points and the
FAQ. Each number in an item that carries a source id must appear in that source's page or PDF text,
and every key figure must carry a source id. An optional `quote` (a string or a list) on any item
must appear in the source too, whitespace and punctuation ignored: digits alone prove little for a
claim like "the policy may not be valid", and a one-digit number matches almost any page.

Sources are fetched live and cached in research/raw/guide/ (gitignored); pass --fresh to refetch.

Usage: python tools/verify_guide.py [--fresh]
Exit 1 if any number or quote is not in its source, or a source could not be read.
"""
import hashlib
import json
import os
import re
import sys

import requests
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "research", "raw", "guide")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def numbers(s):
    # Whole numbers only, commas dropped: "$1,500" is "1500". Matching digits as a substring of the
    # squashed page (as verify_facts does) lets "28" pass inside "2028" or "1280".
    return {n.replace(",", "").rstrip(".") for n in NUM.findall(s)}


def letters(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def source_text(url, fresh):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt")
    if os.path.exists(path) and not fresh:
        with open(path, encoding="utf-8") as f:
            return f.read()
    r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en-SG,en;q=0.9"}, timeout=45)
    r.raise_for_status()
    if r.content.startswith(b"%PDF"):
        import fitz
        text = "\n".join(p.get_text("text") for p in fitz.open(stream=r.content, filetype="pdf"))
    else:
        soup = BeautifulSoup(r.content, "html.parser")
        for t in soup(["script", "style", "noscript", "svg"]):
            t.decompose()
        text = soup.get_text(" ")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return text


def items(guide):
    """Yield (where, item, text-to-check) for every sourced item in the guide."""
    for c in guide["categories"]:
        for key in ("facts", "watch", "caveats"):
            for f in c.get(key, []):
                yield "%s.%s" % (c["id"], key), f, f["t"]
        for k in c.get("key", []):
            yield "%s.key" % c["id"], k, k["v"] + " " + k["l"]
    for s in guide["schemes"]:
        for f in s["facts"]:
            yield "%s.facts" % s["id"], f, f["t"]
        for k in s.get("key", []):
            yield "%s.key" % s["id"], k, k["v"] + " " + k["l"]
    for p in guide.get("pain_points", []):
        for k in p["key"]:
            yield "pain.%s.key" % p["id"], k, k["v"] + " " + k["l"]
        for field in ("why", "fix"):
            for f in p[field]:
                yield "pain.%s.%s" % (p["id"], field), f, f["t"]
    for q in guide["faq"]:
        # The one-line answer is checked against the same source as the full one.
        yield "faq", q, q["a"] + " " + q.get("short", "")


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    fresh = "--fresh" in argv
    with open(os.path.join(ROOT, "data", "guide.json"), encoding="utf-8") as f:
        guide = json.load(f)
    texts, bad, checked = {}, [], 0
    # A FAQ one-liner summarises its answer, so it may not carry a number the answer lacks. The page
    # check alone cannot see "28 days" as wrong when the page also says "updated 28 September".
    for q in guide["faq"]:
        extra = sorted(numbers(q.get("short", "")) - numbers(q["a"]))
        if extra:
            bad.append(("faq.short", q["short"], "numbers not in its answer: " + ", ".join(extra)))
    for where, item, text in items(guide):
        sid = item.get("s")
        if where.endswith(".key") and not sid:
            bad.append((where, text, "key figure has no source"))
            continue
        if not sid:
            continue
        if sid not in texts:
            try:
                raw = source_text(guide["sources"][sid]["url"], fresh)
                texts[sid] = (numbers(raw), letters(raw))
            except (requests.RequestException, KeyError) as e:
                texts[sid] = None
                bad.append((where, sid, "source unreadable: %s" % type(e).__name__))
        if texts[sid] is None:
            continue
        corpus, words = texts[sid]
        missing = sorted(numbers(text) - corpus)
        quotes = item.get("quote") or []
        for q in [quotes] if isinstance(quotes, str) else quotes:
            if letters(q) not in words:
                missing.append("quote %r" % q[:40])
        checked += 1
        if missing:
            bad.append((where, text, "not in %s: %s" % (sid, ", ".join(missing))))
    print("guide items checked: %d, problems: %d" % (checked, len(bad)))
    for where, text, why in bad:
        print("  %-28s %s | %s" % (where, why, text[:110]))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
