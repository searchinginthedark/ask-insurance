"""Check every link the app shows and write data/link_report.json.

Statuses (kept distinct on purpose: "unknown" must never read as "fine"):
  ok        2xx, and for product pages the product name appears on the page
  pdf       2xx and the body really is a PDF
  mismatch  2xx but the product name is not on the page (wrong or generic page)
  soft404   a deep link that redirects to a site's home or a search/404 page
  dead      404 / 410 / other 4xx-5xx (except blocked codes)
  blocked   403 / 429 / timeout: the site refuses scripts; verify in a browser

Usage: python tools/check_links.py [--only INSURER_ID]
Exit 1 if anything is dead, soft404 or mismatch.
"""
import concurrent.futures as cf
import json
import os
import re
import sys
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")
BLOCKED_CODES = {401, 403, 429, 503}
GENERIC = {"plan", "insurance", "the", "and", "of", "for", "by", "life", "series", "ii", "iii",
           "plus", "pro", "max", "direct", "sg", "singapore"}


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def name_tokens(name):
    # Distinctive words only; brand prefixes like "AIA" stay because they are short but specific.
    toks = [t for t in norm(name).split() if t not in GENERIC]
    return toks or norm(name).split()


def collect():
    with open(os.path.join(ROOT, "data", "guide.json"), encoding="utf-8") as f:
        guide = json.load(f)
    links = {}
    for sid, s in guide["sources"].items():
        links[s["url"]] = {"kind": "source", "label": s["title"], "name": None, "owner": "guide"}
    import glob
    for path in glob.glob(os.path.join(ROOT, "research", "insurers", "*.json")):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        for key in ("website", "products_index_url", "claims_url", "contact_url"):
            if d.get(key):
                links.setdefault(d[key], {"kind": key, "label": d["name"], "name": None, "owner": d["id"]})
        for p in d.get("products", []):
            if p.get("url"):
                links[p["url"]] = {"kind": "product", "label": p["name"], "name": p["name"], "owner": d["id"]}
            for pdf in p.get("pdfs") or []:
                if pdf.get("url"):
                    links[pdf["url"]] = {"kind": "pdf", "label": p["name"], "name": None, "owner": d["id"]}
    return links


# Bot walls answer 200 with a challenge page. Without this they read as "mismatch" (tokiomarine.com
# behind Incapsula, 2026-10-13): wrong verdict, since the real page is fine in a browser.
CHALLENGE = re.compile(rb"_Incapsula_Resource|Incapsula incident|cf-chl-|Just a moment\.\.\.|Attention Required! \| Cloudflare|captcha-delivery", re.I)


def is_challenge(body):
    return bool(CHALLENGE.search(body[:20000]))


def is_soft404(orig, final):
    o, f = urlparse(orig), urlparse(final)
    deep = len(o.path.strip("/")) > 0
    home = f.path.strip("/") in ("", "en", "sg", "sg/en", "en/home", "home")
    looks_404 = re.search(r"(404|not-found|page-not-found|error)", f.path, re.I)
    return (deep and home) or bool(looks_404)


def check(url, meta):
    res = {"url": url, "kind": meta["kind"], "label": meta["label"], "owner": meta["owner"]}
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en-SG,en;q=0.9"},
                         timeout=40, allow_redirects=True)
    except requests.RequestException as e:
        res.update(status="blocked", detail=type(e).__name__)
        return res
    res["code"] = r.status_code
    res["final"] = r.url
    if r.status_code in BLOCKED_CODES or (r.content[:5] != b"%PDF-" and is_challenge(r.content)):
        res["status"] = "blocked"
        res["detail"] = "bot challenge" if r.status_code < 400 else ""
        return res
    if r.status_code >= 400:
        res["status"] = "dead"
        return res
    if is_soft404(url, r.url) and url.rstrip("/") != r.url.rstrip("/"):
        res["status"] = "soft404"
        return res
    if meta["kind"] == "pdf" or r.content[:5] == b"%PDF-":
        res["status"] = "pdf" if r.content[:5] == b"%PDF-" else "mismatch"
        if res["status"] == "mismatch":
            res["detail"] = "expected a PDF, got " + r.headers.get("content-type", "?")
        return res
    if meta["name"]:
        soup = BeautifulSoup(r.content, "html.parser")
        for t in soup(["script", "style", "noscript"]):
            t.decompose()
        text = norm(soup.get_text(" ") + " " + (soup.title.get_text(" ") if soup.title else ""))
        toks = name_tokens(meta["name"])
        hit = [t for t in toks if re.search(r"\b%s\b" % re.escape(t), text)]
        if len(hit) < max(1, (len(toks) + 1) // 2):
            res["status"] = "mismatch"
            res["detail"] = "name words found: %d/%d" % (len(hit), len(toks))
            return res
    res["status"] = "ok"
    return res


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    links = collect()
    if only:
        links = {u: m for u, m in links.items() if m["owner"] == only}
    results = []
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(check, u, m): u for u, m in links.items()}
        for f in cf.as_completed(futs):
            results.append(f.result())
    # A bot-walled link checked by hand in a real browser within 30 days counts as verified;
    # after that it falls back to "blocked" so a stale hand-check can never pass forever.
    bvp = os.path.join(ROOT, "data", "browser_verified.json")
    if os.path.exists(bvp):
        import datetime
        with open(bvp, encoding="utf-8") as f:
            bv = json.load(f)["urls"]
        today = datetime.date.today()
        for r in results:
            day = bv.get(r["url"])
            if r["status"] == "blocked" and day and (today - datetime.date.fromisoformat(day)).days <= 30:
                r["status"] = "browser_ok"
                r["detail"] = "checked in a browser " + day
    results.sort(key=lambda r: (r["owner"], r["kind"], r["url"]))
    out = os.path.join(ROOT, "data", "link_report.json")
    prev = {}
    if only and os.path.exists(out):
        with open(out, encoding="utf-8") as f:
            prev = {r["url"]: r for r in json.load(f)["links"]}
    for r in results:
        prev[r["url"]] = r
    merged = sorted(prev.values(), key=lambda r: (r["owner"], r["kind"], r["url"]))
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"checked_on": __import__("datetime").date.today().isoformat(), "links": merged},
                  f, ensure_ascii=False, indent=1)
        f.write("\n")
    counts = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    print("checked", len(results), counts)
    bad = [r for r in results if r["status"] in ("dead", "soft404", "mismatch")]
    for r in bad + [r for r in results if r["status"] == "blocked"]:
        print("%-8s %-14s %s  %s %s" % (r["status"], r["owner"], r["url"], r.get("final", ""), r.get("detail", "")))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
