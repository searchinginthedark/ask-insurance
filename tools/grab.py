"""Save the visible text of each URL in a list file to research/raw/<slug>.txt for grepping.

Usage: python tools/grab.py <urls.txt>
"""
import os
import re
import sys

import requests
from bs4 import BeautifulSoup

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "research", "raw")


def slug(url):
    s = re.sub(r"^https?://(www\.)?", "", url)
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")[:120]


def main(path):
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(RAW, exist_ok=True)
    with open(path, encoding="utf-8") as f:
        urls = [u.strip() for u in f if u.strip() and not u.startswith("#")]
    for url in urls:
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=45)
        except requests.RequestException as e:
            print("ERR", url, type(e).__name__)
            continue
        ctype = r.headers.get("content-type", "")
        out = os.path.join(RAW, slug(url))
        if r.content.startswith(b"%PDF"):
            import fitz
            with open(out + ".pdf", "wb") as f:
                f.write(r.content)
            doc = fitz.open(out + ".pdf")
            text = "\n".join("=== page %d ===\n%s" % (i + 1, p.get_text("text")) for i, p in enumerate(doc))
        else:
            soup = BeautifulSoup(r.content, "html.parser")
            for t in soup(["script", "style", "noscript", "svg"]):
                t.decompose()
            text = soup.get_text("\n", strip=True)
        with open(out + ".txt", "w", encoding="utf-8", newline="\n") as f:
            f.write("URL %s\nFINAL %s\nSTATUS %s\n\n%s" % (url, r.url, r.status_code, text))
        print(r.status_code, len(text), slug(url), ctype[:30])


if __name__ == "__main__":
    main(sys.argv[1])
