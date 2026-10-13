"""Download an official PDF and extract its text with PyMuPDF.

Usage: python tools/pdf_extract.py <pdf_url> <insurer_id>
Writes research/pdf/<insurer_id>/<name>.pdf and .txt; prints page count and the first 4000 chars.
"""
import os
import re
import sys
from urllib.parse import urlparse, unquote

import fitz  # PyMuPDF
import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    url, insurer = argv[1], argv[2]
    sys.stdout.reconfigure(encoding="utf-8")
    out_dir = os.path.join(ROOT, "research", "pdf", insurer)
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.basename(unquote(urlparse(url).path)) or "doc.pdf"
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    if not base.lower().endswith(".pdf"):
        base += ".pdf"
    pdf_path = os.path.join(out_dir, base)
    r = requests.get(url, headers={"User-Agent": UA}, timeout=60)
    print("STATUS", r.status_code, "FINAL", r.url, "TYPE", r.headers.get("content-type", ""))
    if not r.ok or not r.content.startswith(b"%PDF"):
        print("NOT A PDF - not saved")
        return 1
    with open(pdf_path, "wb") as f:
        f.write(r.content)
    doc = fitz.open(pdf_path)
    parts = []
    for i, page in enumerate(doc):
        parts.append("\n=== page %d ===\n" % (i + 1))
        parts.append(page.get_text("text"))
    text = "".join(parts)
    txt_path = pdf_path[:-4] + ".txt"
    with open(txt_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("PAGES", doc.page_count)
    print("SAVED", os.path.relpath(pdf_path, ROOT).replace("\\", "/"))
    print("TEXT", os.path.relpath(txt_path, ROOT).replace("\\", "/"))
    print(text[:4000])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
