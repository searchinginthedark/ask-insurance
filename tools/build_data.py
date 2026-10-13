"""Compile research/insurers/*.json into public/data/insurers.json and copy data/guide.json.

Validates the research contract so a bad agent file fails the build instead of shipping:
category ids, https URLs on the insurer's own domain, fact counts, required fields.
Merges link status from data/link_report.json when it exists.

Usage: python tools/build_data.py
"""
import glob
import json
import os
import re
import sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATEGORIES = [
    "hospitalisation", "ip_rider", "term_life", "whole_life", "critical_illness", "cancer",
    "disability_income", "long_term_care", "personal_accident", "hospital_cash", "endowment",
    "ilp", "annuity", "maternity_child", "outpatient", "rider",
]
# Official domains per insurer. A URL outside these fails the build: the contract allows
# product facts and PDFs from the insurer's own site only.
DOMAINS = {
    "aia": ["aia.com.sg", "aia.com"],
    "great_eastern": ["greateasternlife.com", "greateasternlife.com.sg"],
    "prudential": ["prudential.com.sg"],
    "income": ["income.com.sg"],
    "singlife": ["singlife.com"],
    "manulife": ["manulife.com.sg"],
    "hsbc_life": ["hsbc.com.sg", "hsbclife.com.sg"],
    "tokio_marine": ["tokiomarine.com"],
    "fwd": ["fwd.com.sg"],
    "china_life": ["chinalife.com.sg"],
    "etiqa": ["etiqa.com.sg"],
    "raffles": ["raffleshealthinsurance.com"],
    "chubb": ["chubb.com"],
    "msig": ["msig.com.sg"],
    "directasia": ["directasia.com"],
}
PROMO = re.compile(r"\b(discount|promo(tion)?|cashback|voucher|rebate|limited[- ]time|% off|sign[- ]ups?|e-?vouchers?)\b", re.I)
# Tags readers need before they click: a medical plan that is NOT a MediSave-approved Shield plan,
# and a plan only some people can buy.
NOT_IP = re.compile(r"not an? Integrated Shield|non-MediSave|international private medical", re.I)
LIMITED = re.compile(r"\b(exclusive to|invitation[- ]only|only to those|offered only|qualifying customers|for clients of)\b", re.I)
ORDER = ["aia", "great_eastern", "prudential", "income", "singlife", "hsbc_life", "manulife",
         "tokio_marine", "fwd", "china_life", "etiqa", "raffles", "chubb", "msig", "directasia"]


# Third-party CDNs an insurer's OWN pages link to, pinned to that insurer's project path so the
# exception cannot admit anyone else's files. Each entry was confirmed by finding the prefix in the
# insurer's own HTML (Income: www.income.com.sg/health-insurance/enhanced-incomeshield, 2026-10-13).
CDN_PREFIXES = {
    "income": ["assets-au-01.kc-usercontent.com/8acbd32f-b7e0-0294-6b7d-a2bc72d6b30c/"],
}


def on_domain(url, insurer):
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if any(host == d or host.endswith("." + d) for d in DOMAINS.get(insurer, [])):
        return True
    return any((host + parsed.path).startswith(p) for p in CDN_PREFIXES.get(insurer, []))


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    errors = []
    report = {}
    rp = os.path.join(ROOT, "data", "link_report.json")
    if os.path.exists(rp):
        report = {r["url"]: r for r in load(rp)["links"]}
    insurers = []
    for path in sorted(glob.glob(os.path.join(ROOT, "research", "insurers", "*.json"))):
        d = load(path)
        iid = d.get("id")
        where = os.path.basename(path)
        if iid not in DOMAINS:
            errors.append("%s: unknown insurer id %r" % (where, iid))
            continue
        for key in ("website", "products_index_url", "claims_url", "contact_url"):
            u = d.get(key)
            if u and not (u.startswith("https://") and on_domain(u, iid)):
                errors.append("%s: %s off-domain or not https: %s" % (where, key, u))
        products = []
        seen = set()
        for p in d.get("products", []):
            name = (p.get("name") or "").strip()
            tag = "%s: %s" % (where, name or "<no name>")
            if not name:
                errors.append(tag + ": missing name")
                continue
            if p.get("category") not in CATEGORIES:
                errors.append(tag + ": bad category %r" % p.get("category"))
            url = p.get("url") or ""
            if not (url.startswith("https://") and on_domain(url, iid)):
                errors.append(tag + ": url off-domain or not https: " + url)
            # Promotions expire within weeks and would make the page wrong without any link breaking.
            facts = [f for f in (p.get("facts") or []) if isinstance(f, str) and f.strip()
                     and not PROMO.search(f)]
            status = report.get(url, {}).get("status")
            if status in ("dead", "soft404", "mismatch"):
                errors.append(tag + ": link is " + status + ": " + url)
            if len(facts) > 5:
                errors.append(tag + ": more than 5 facts")
            pdfs = []
            for pdf in p.get("pdfs") or []:
                pu = pdf.get("url") or ""
                if not (pu.startswith("https://") and on_domain(pu, iid)):
                    errors.append(tag + ": pdf off-domain: " + pu)
                    continue
                pdfs.append({"title": pdf.get("title") or "Document", "url": pu,
                             "status": report.get(pu, {}).get("status")})
            key = (name.lower(), p.get("category"))
            if key in seen:
                errors.append(tag + ": duplicate product")
            seen.add(key)
            sub = p.get("subtype") or ""
            flags = []
            if NOT_IP.search(sub):
                flags.append("not_ip")
            if LIMITED.search(sub + " " + (p.get("summary") or "")):
                flags.append("limited")
            products.append({
                "name": name,
                "category": p.get("category"),
                "subtype": sub or None,
                "flags": flags,
                "summary": (p.get("summary") or "").strip(),
                "facts": facts,
                "channel": p.get("channel") or "unknown",
                "url": url,
                "status": status,
                "pdfs": [x for x in pdfs if x["status"] not in ("dead", "soft404", "mismatch")],
            })
        insurers.append({
            "id": iid,
            "name": d.get("name"),
            "formerly": d.get("formerly"),
            "website": d.get("website"),
            "products_index_url": d.get("products_index_url"),
            "claims_url": d.get("claims_url"),
            "contact_url": d.get("contact_url"),
            "verified_on": d.get("verified_on"),
            "not_found": d.get("not_found") or [],
            "products": products,
        })
    insurers.sort(key=lambda i: ORDER.index(i["id"]) if i["id"] in ORDER else 99)
    guide = load(os.path.join(ROOT, "data", "guide.json"))
    for c in guide["categories"]:
        for f in c["facts"] + c["watch"]:
            if f.get("s") and f["s"] not in guide["sources"]:
                errors.append("guide: unknown source %s in %s" % (f["s"], c["id"]))
    for s in guide["schemes"]:
        for f in s["facts"]:
            if f["s"] not in guide["sources"]:
                errors.append("guide: unknown source %s in %s" % (f["s"], s["id"]))
    if [c["id"] for c in guide["categories"]] != CATEGORIES:
        errors.append("guide: category ids/order differ from CATEGORIES")
    if errors:
        print("BUILD FAILED, %d problem(s):" % len(errors))
        for e in errors:
            print("  -", e)
        return 1
    out_dir = os.path.join(ROOT, "public", "data")
    os.makedirs(out_dir, exist_ok=True)
    for name, obj in (("insurers.json", {"insurers": insurers}), ("guide.json", guide)):
        with open(os.path.join(out_dir, name), "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write("\n")
    n = sum(len(i["products"]) for i in insurers)
    print("built %d insurers, %d products" % (len(insurers), n))
    return 0


if __name__ == "__main__":
    sys.exit(main())
