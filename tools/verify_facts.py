"""Independently re-check product facts against their own sources.

For every fact that contains a number (ages, S$ amounts, %, years), each number must appear in the
product page text or one of its downloaded PDF texts. Agents self-checked; this does not trust them.
Pages are cached in research/raw/pages/ so re-runs are cheap.

Usage: python tools/verify_facts.py [INSURER_ID ...]
Writes research/fact_report.json; exit 1 if any fact has an unsupported number.
"""
import glob
import hashlib
import json
import os
import re
import sys

import requests
from bs4 import BeautifulSoup

from scope import in_scope

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "research", "raw", "pages")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def flat(s):
    # Normalise so "S$1,000,000", "SGD 1,000,000" and "1 000 000" compare equal on digits.
    return re.sub(r"[\s,]", "", s.lower())


def page_text(url):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read()
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en-SG,en;q=0.9"}, timeout=20)
        soup = BeautifulSoup(r.content, "html.parser")
        for t in soup(["script", "style", "noscript"]):
            t.decompose()
        text = soup.get_text(" ")
    except requests.RequestException:
        text = ""
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return text


def pdf_text(local):
    if not local:
        return ""
    p = os.path.join(ROOT, local)
    t = p[:-4] + ".txt"
    if os.path.exists(t):
        with open(t, encoding="utf-8", errors="replace") as f:
            return f.read()
    if os.path.exists(p):
        import fitz
        return "\n".join(pg.get_text("text") for pg in fitz.open(p))
    return ""


def main(ids):
    sys.stdout.reconfigure(encoding="utf-8")
    files = sorted(glob.glob(os.path.join(ROOT, "research", "insurers", "*.json")))
    report, bad, checked = [], 0, 0
    # Warm the page cache in parallel; the serial loop below then reads from disk.
    import concurrent.futures as cf
    urls = set()
    for path in files:
        with open(path, encoding="utf-8") as f:
            urls.update(p["url"] for p in json.load(f).get("products", []) if in_scope(p))
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(page_text, sorted(urls)))
    for path in files:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        if ids and d["id"] not in ids:
            continue
        for p in d.get("products", []):
            if not in_scope(p):
                continue
            raw = page_text(p["url"]) + " " + " ".join(pdf_text(x.get("local")) for x in p.get("pdfs") or [])
            corpus = flat(raw)
            # The agent's evidence quote must really be in the cited source (whitespace/punctuation-insensitive).
            ev = re.sub(r"[^a-z0-9]", "", (p.get("evidence") or "").lower())
            if ev and ev not in re.sub(r"[^a-z0-9]", "", raw.lower()):
                if d["id"] != "tokio_marine":  # bot-walled: checked in the browser instead
                    bad += 1
                    report.append({"insurer": d["id"], "product": p["name"], "fact": "EVIDENCE: " + p["evidence"],
                                   "missing": ["quote"], "corpus_chars": len(corpus)})
            nums_needed = [(fact, NUM.findall(fact)) for fact in p.get("facts", []) if NUM.search(fact)]
            if not nums_needed:
                continue
            for fact, nums in nums_needed:
                checked += 1
                missing = [n for n in nums if flat(n) not in corpus]
                if missing:
                    bad += 1
                    report.append({"insurer": d["id"], "product": p["name"], "fact": fact, "missing": missing,
                                   "corpus_chars": len(corpus)})
    with open(os.path.join(ROOT, "research", "fact_report.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("numeric facts checked:", checked, "unsupported:", bad)
    for r in report:
        print("%-13s %-34s missing %s | %s" % (r["insurer"], r["product"][:34], r["missing"], r["fact"][:90]))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
