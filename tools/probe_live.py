"""Probe a live deployment: pages, headers, noindex, and that nothing outside public/ is served.

Usage: python tools/probe_live.py https://ask-insurance-drab.vercel.app
Exit 1 on any failed expectation.
"""
import hashlib
import os
import sys

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(base):
    sys.stdout.reconfigure(encoding="utf-8")
    base = base.rstrip("/")
    fails = []

    def expect(cond, msg):
        print(("ok   " if cond else "FAIL ") + msg)
        if not cond:
            fails.append(msg)

    r = requests.get(base + "/", timeout=30, allow_redirects=False)
    expect(r.status_code == 200, "GET / -> %s" % r.status_code)
    h = {k.lower(): v for k, v in r.headers.items()}
    expect("noindex" in h.get("x-robots-tag", ""), "X-Robots-Tag: %s" % h.get("x-robots-tag"))
    expect("script-src 'self'" in h.get("content-security-policy", ""), "CSP present")
    expect(h.get("x-frame-options") == "DENY", "X-Frame-Options: %s" % h.get("x-frame-options"))
    expect('name="robots" content="noindex' in r.text, "noindex meta in HTML")

    rb = requests.get(base + "/robots.txt", timeout=30)
    expect(rb.status_code == 200 and "Disallow: /" in rb.text, "robots.txt disallows all")

    # Served files must match the committed bytes (catches a stale or wrong deployment).
    for rel in ("app.js", "app.css", "data/insurers.json", "data/guide.json", "icon-192.png"):
        live = requests.get(base + "/" + rel, timeout=30)
        with open(os.path.join(ROOT, "public", rel), "rb") as f:
            local = f.read()
        same = hashlib.sha256(live.content).hexdigest() == hashlib.sha256(local).hexdigest()
        expect(live.status_code == 200 and same, "%s matches local (%s)" % (rel, live.status_code))
    dh = {k.lower(): v for k, v in requests.get(base + "/data/insurers.json", timeout=30).headers.items()}
    expect("no-cache" in dh.get("cache-control", ""), "data/ Cache-Control: %s" % dh.get("cache-control"))

    # Nothing outside public/ may be reachable; a nonexistent path is the control.
    for path in ("/research/CONTRACT.md", "/tools/build_data.py", "/README.md", "/data/guide.json.bak",
                 "/public/index.html", "/CLAUDE.md", "/.git/config", "/definitely-not-a-page-xyz"):
        s = requests.get(base + path, timeout=30, allow_redirects=False).status_code
        expect(s == 404, "%s -> %s (expect 404)" % (path, s))
    print("\n%d failure(s)" % len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
