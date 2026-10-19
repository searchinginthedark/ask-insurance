"""Fetch a source's text for the verifiers, and tell "the site refused us" apart from "the text changed".

GitHub's runners sit in US datacentres. Some insurer sites time out or answer 403 to them while
serving Singapore normally (AIA: every URL a ReadTimeout, Manulife: 403, 2026-10-19). A verifier
that reads such a refusal as "quote not on page" goes red for nothing, so a refusal raises Blocked
with the reason, and the verifier reports it as a warning instead of a failure.

Once a host refuses, later URLs on it are skipped: 55 AIA timeouts at 20 s each cost 9 minutes.
"""
import hashlib
import os
import re
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from check_links import BLOCKED_CODES, UA, is_challenge

_refused = {}  # host -> reason


class Blocked(Exception):
    pass


def _title(content):
    m = re.search(rb"<title[^>]*>(.*?)</title>", content[:20000], re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1).decode("utf-8", "replace")).strip()[:60] if m else ""


def text(url, cache_dir, prefix="", fresh=False, timeout=30):
    """Page or PDF text of url, cached in cache_dir. Raises Blocked when the site refuses or answers
    something that is not the document (a challenge page, HTML where a PDF should be). Only
    successful reads are cached, so a refusal is retried on the next run."""
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, prefix + hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt")
    if os.path.exists(path) and not fresh:
        with open(path, encoding="utf-8") as f:
            return f.read()
    host = urlparse(url).hostname
    if host in _refused:
        raise Blocked("skipped, %s already refused: %s" % (host, _refused[host]))
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en-SG,en;q=0.9"}, timeout=timeout)
    except requests.RequestException as e:
        _refused[host] = type(e).__name__
        raise Blocked(type(e).__name__)
    is_pdf = r.content[:5] == b"%PDF-"
    if r.status_code in BLOCKED_CODES or (not is_pdf and is_challenge(r.content)):
        why = "HTTP %d" % r.status_code + (", bot challenge" if not is_pdf and is_challenge(r.content) else "")
        _refused[host] = why
        raise Blocked(why)
    r.raise_for_status()  # a real 404 is a broken source, not a refusal
    if url.lower().split("?")[0].endswith(".pdf") and not is_pdf:
        raise Blocked("expected a PDF, got %s, %d bytes, title %r" % (
            r.headers.get("content-type", "?"), len(r.content), _title(r.content)))
    if is_pdf:
        import fitz
        out = "\n".join(p.get_text("text") for p in fitz.open(stream=r.content, filetype="pdf"))
    else:
        soup = BeautifulSoup(r.content, "html.parser")
        for t in soup(["script", "style", "noscript", "svg"]):
            t.decompose()
        out = soup.get_text(" ")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    return out


def warn(lines):
    """Print refusals as GitHub warning annotations (plain lines locally)."""
    gh = os.environ.get("GITHUB_ACTIONS") == "true"
    for line in lines:
        print(("::warning::" if gh else "  WARNING ") + line)
