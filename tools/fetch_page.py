"""Fetch one page the way a browser would and print what a researcher needs to confirm it.

Usage: python tools/fetch_page.py <url> [--links REGEX] [--text]
"""
import re
import sys

import requests
from bs4 import BeautifulSoup

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    url = argv[1]
    link_re = None
    if "--links" in argv:
        link_re = re.compile(argv[argv.index("--links") + 1], re.I)
    want_text = "--text" in argv
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en-SG,en;q=0.9"},
                         timeout=30, allow_redirects=True)
    except requests.RequestException as e:
        print("STATUS blocked-or-down", type(e).__name__, e)
        return 1
    print("STATUS", r.status_code)
    print("FINAL", r.url)
    if r.history:
        print("REDIRECTS", " -> ".join(str(h.status_code) for h in r.history))
    ctype = r.headers.get("content-type", "")
    print("TYPE", ctype)
    if "html" not in ctype:
        return 0 if r.ok else 1
    soup = BeautifulSoup(r.content, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    print("TITLE", title)
    for h in soup.find_all("h1")[:5]:
        print("H1", h.get_text(" ", strip=True))
    if link_re:
        seen = set()
        for a in soup.find_all("a", href=True):
            href = requests.compat.urljoin(r.url, a["href"])
            label = a.get_text(" ", strip=True)
            if (link_re.search(href) or link_re.search(label)) and href not in seen:
                seen.add(href)
                print("LINK", href, "|", label[:80])
    if want_text:
        for t in soup(["script", "style", "noscript"]):
            t.decompose()
        text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
        print("TEXT", text[:6000])
    return 0 if r.ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
