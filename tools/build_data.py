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

from scope import SAVINGS_CATEGORIES, in_scope

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATEGORIES = [
    "hospitalisation", "ip_rider", "term_life", "whole_life", "critical_illness", "cancer",
    "disability_income", "long_term_care", "personal_accident", "hospital_cash", "endowment",
    "ilp", "annuity", "maternity_child", "outpatient", "rider",
]
# Categories the app shows, in display order (data/guide.json must match). Savings categories stay
# valid in research files but are dropped from the build: see tools/scope.py.
SHOWN = [c for c in CATEGORIES if c not in SAVINGS_CATEGORIES]
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


# Pages with no "At a glance" strip, because no allowed source gives a figure worth showing for them.
NO_KEY = {"personal_accident"}


def check_highlights(guide):
    """Key figures, must-know flags, FAQ one-liners and pain points. Numbers in them are checked
    against the sources themselves by tools/verify_guide.py; this only checks shape and source ids."""
    errors = []
    src = guide["sources"]

    def keys(owner, lst, required):
        if required and not lst:
            errors.append("guide: %s has no key figures" % owner)
        for k in lst or []:
            if not (k.get("v") and k.get("l")):
                errors.append("guide: %s key figure needs v and l: %r" % (owner, k))
            elif k.get("s") not in src:
                errors.append("guide: %s key figure %r has no valid source" % (owner, k["v"]))
            # A figure strip is for a glance: the value must stay short enough to read as one.
            elif len(k["v"]) > 22 or len(k["l"]) > 140:
                errors.append("guide: %s key figure %r is too long" % (owner, k["v"]))
            # A target (rule of thumb) and an actual (what people hold) side by side must not look
            # alike; the app tags each. Absent means a plain fact.
            if k.get("kind") not in (None, "target", "actual"):
                errors.append("guide: %s key figure %r has unknown kind %r" % (owner, k.get("v"), k["kind"]))

    for c in guide["categories"]:
        keys(c["id"], c.get("key"), c["id"] not in NO_KEY)
        for f in c["facts"] + c["watch"] + c["caveats"]:
            if "top" in f and f["top"] is not True:
                errors.append("guide: %s top must be true or absent" % c["id"])
    for s in guide["schemes"]:
        keys(s["id"], s.get("key"), True)
    for q in guide["faq"]:
        if not q.get("short"):
            errors.append("guide: FAQ %r has no short answer" % q["q"])
    pains = guide.get("pain_points") or []
    if len(pains) != 5:
        errors.append("guide: expected 5 pain points, found %d" % len(pains))
    for p in pains:
        where = "pain point %s" % p.get("id")
        if not p.get("title"):
            errors.append("guide: %s has no title" % where)
        keys(where, p.get("key"), True)
        for field in ("why", "fix"):
            if not p.get(field):
                errors.append("guide: %s has no %s" % (where, field))
            for f in p.get(field) or []:
                if f.get("s") and f["s"] not in src:
                    errors.append("guide: %s unknown source %s" % (where, f["s"]))
                if f.get("link") and not (IN_APP.match(f["link"]) and f.get("label")):
                    errors.append("guide: %s link must be an in-app #/ route with a label: %s" % (where, f["link"]))
    for c in guide["categories"]:
        for f in c["facts"] + c["watch"] + c["caveats"]:
            if f.get("link") and not (IN_APP.match(f["link"]) and f.get("label")):
                errors.append("guide: %s link must be an in-app #/ route with a label: %s" % (c["id"], f["link"]))
    return errors


IN_APP = re.compile(r"^#/[a-z0-9/_-]*(#[a-z0-9_-]+)?$")
# Publishers the guide may cite (user ruling 2026-10-13; MOE added 2026-10-14 for graduate starting
# pay only). Great Eastern is here as the DPS administrator, never as a seller.
GUIDE_HOSTS = ("moh.gov.sg", "cpf.gov.sg", "lia.org.sg", "sdic.org.sg", "moneysense.gov.sg",
               "comparefirst.sg", "fidrec.com.sg", "moe.gov.sg")
GE_DPS = "https://www.greateasternlife.com/sg/en/personal-insurance/our-products/life-insurance/dependants-protection-scheme.html"
TERM = re.compile(r"\{\{([^}|]*)(?:\|([^}]*))?\}\}")
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def guide_texts(guide):
    """(page, text) for every guide string that may carry {{term}} marks. Page groups what one
    screen shows, so a term is marked at most once per page."""
    for c in guide["categories"]:
        page = "type/" + c["id"]
        for key in ("plain", "who", "what"):
            yield page, c.get(key) or ""
        for f in c["facts"] + c["watch"] + c["caveats"]:
            yield page, f["t"]
    for p in guide["pain_points"]:
        for f in p["why"] + p["fix"]:
            yield "top5/" + p["id"], f["t"]
    for q in guide["faq"]:
        yield "faq/" + q["q"], q["a"]


def check_glossary(guide):
    errors = []
    src = guide["sources"]
    for sid, s in src.items():
        host = (urlparse(s["url"]).hostname or "").lower()
        if not (s["url"] == GE_DPS or any(host == d or host.endswith("." + d) for d in GUIDE_HOSTS)):
            errors.append("guide: source %s is not from an allowed publisher: %s" % (sid, s["url"]))
    groups = {g["id"] for g in guide.get("glossary_groups", [])}
    terms = {}
    for g in guide.get("glossary", []):
        where = "glossary %s" % g.get("id")
        if not re.match(r"^[a-z][a-z-]*$", g.get("id") or "") or g["id"] in terms:
            errors.append("guide: %s: id missing, malformed or repeated" % where)
        terms[g.get("id")] = g
        if not g.get("term") or g.get("group") not in groups or not g.get("lines"):
            errors.append("guide: %s needs term, a known group and lines" % where)
        for f in g.get("lines", []) + ([g["example"]] if g.get("example") else []):
            if not f.get("t") or (f.get("s") and f["s"] not in src):
                errors.append("guide: %s has an empty line or unknown source" % where)
        if g.get("link") and not (IN_APP.match(g["link"]) and g.get("label")):
            errors.append("guide: %s link must be an in-app route with a label" % where)
    # A made-up example (no source) must not borrow a real figure, or it would pass on a scheme
    # amount with no link to check it. Real figures go in a sourced line or a sourced example.
    real = set()
    for c in guide["categories"]:
        for f in c["facts"] + c["watch"] + c["caveats"] + c.get("key", []):
            if f.get("s"):
                real |= {n.replace(",", "") for n in NUM.findall(f.get("t") or f.get("v", ""))}
    for s in guide["schemes"]:
        for f in s["facts"] + s.get("key", []):
            real |= {n.replace(",", "") for n in NUM.findall(f.get("t") or f.get("v", ""))}
    for g in guide.get("glossary", []):
        ex = g.get("example")
        if ex and not ex.get("s"):
            clash = sorted({n.replace(",", "") for n in NUM.findall(ex["t"])
                            if float(n.replace(",", "")) >= 100} & real)
            if clash:
                errors.append("guide: glossary %s made-up example uses real figure(s) %s" % (g["id"], ", ".join(clash)))
    seen = {}
    for page, text in guide_texts(guide):
        for m in TERM.finditer(text):
            tid = m.group(1)
            if tid not in terms:
                errors.append("guide: unknown glossary term {{%s}} on %s" % (tid, page))
            elif (page, tid) in seen:
                errors.append("guide: {{%s}} marked twice on %s; mark only the first use" % (tid, page))
            seen[(page, tid)] = True
    for c in guide["categories"]:
        vs = c.get("versus")
        if not vs:
            continue
        if len(vs.get("cols") or []) != 2 or not vs.get("rows") or not vs.get("scenarios"):
            errors.append("guide: %s versus needs 2 cols, rows and scenarios" % c["id"])
        for r in vs.get("rows", []):
            for f in (r.get("a") or []) + (r.get("b") or []):
                if not f.get("s") or f["s"] not in src:
                    errors.append("guide: %s versus row %r: every cell needs a source" % (c["id"], r.get("k")))
        for sc in vs.get("scenarios", []):
            for f in sc.get("items") or []:
                if not f.get("s") or f["s"] not in src:
                    errors.append("guide: %s scenario %r: every line needs a source" % (c["id"], sc.get("title")))
    sp = guide.get("starting_pay")
    if sp and (sp.get("s") not in src or not sp.get("items")
               or not all(isinstance(i.get("v"), int) and i.get("k") for i in sp["items"])):
        errors.append("guide: starting_pay needs a source and items of {k, integer v}")
    return errors


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# Where plan-comparison figures may come from: the regulator's own site and its file host, pinned
# to MOH's site folder on that host.
COMPARE_HOSTS = ["www.moh.gov.sg/", "isomer-user-content.by.gov.sg/3/"]


def check_compare(comp, insurers):
    """data/compare/<category>.json: every unit must map to a built plan, every value to a defined
    metric, and every link to an allowed host. Values themselves are checked by their own tool
    (tools/moh_ip.py --check for the MOH tables)."""
    errors = []
    cat = comp.get("category")
    where = "compare/%s" % cat
    if cat not in SHOWN:
        return [where + ": unknown category"]
    plans = {(i["id"], p["name"]): p for i in insurers for p in i["products"] if p["category"] == cat}
    metrics = [m["id"] for m in comp.get("metrics", [])]
    if len(set(metrics)) != len(metrics) or not metrics:
        errors.append(where + ": metric ids missing or repeated")
    groups = {g["id"] for g in comp.get("groups", [])}
    urls = [comp["source"]["url"]] + [g["pdf"] for g in comp.get("groups", [])]
    for u in urls:
        p = urlparse(u)
        if p.scheme != "https" or not any((p.hostname + p.path).startswith(h) for h in COMPARE_HOSTS):
            errors.append(where + ": link not on an allowed host: " + u)
    seen = set()
    per = {m["id"]: m.get("per", "unit") for m in comp.get("metrics", [])}
    for u in comp.get("units", []):
        tag = "%s: %s" % (where, u.get("id"))
        if u["id"] in seen:
            errors.append(tag + ": duplicate id")
        seen.add(u["id"])
        plan = plans.get((u["insurer"], u["product"]))
        if not plan:
            errors.append(tag + ": no built %s plan %r from %s" % (cat, u["product"], u["insurer"]))
        else:
            u["pid"] = plan["id"]
        if u.get("group") not in groups:
            errors.append(tag + ": unknown group")
        for k, v in u.get("values", {}).items():
            if per.get(k) != "unit":
                errors.append(tag + ": value for unknown or non-unit metric " + k)
            if not (isinstance(v, str) and v.strip()):
                errors.append(tag + ": empty value for " + k)
        for band, row in u.get("premium", {}).items():
            if band not in comp.get("bands", []) or not all(isinstance(row.get(x), str) and row[x].strip() for x in ("incl", "excl", "change")):
                errors.append(tag + ": bad premium row " + band)
    for iid, vals in comp.get("insurer_values", {}).items():
        for k, v in vals.items():
            if per.get(k) != "insurer" or not (v.get("v") or "").strip():
                errors.append("%s: insurer value %s.%s invalid" % (where, iid, k))
    return errors


INSURER_NOTES = [
    "Each cell is quoted from the insurer's own page or product summary. Tap Source to read it there.",
    "“Not on the insurer's page” means the insurer's material does not state it, not that the plan lacks it. Ask the insurer.",
    "Premiums depend on your age, health, smoking status and cover amount, so they are not shown. Get quotes from each insurer.",
]


def insurer_compare(cat, defs, insurers, metrics_files):
    """Compare table for a type with no official like-for-like table: one column per plan, cells
    from research/metrics/<insurer>.json (checked against their sources by tools/verify_metrics.py).
    Every plan of the type gets a column, filled or not, so none silently drops out."""
    errors = []
    ids = {m["id"] for m in defs}
    units = []
    for i in insurers:
        cells = (metrics_files.get(i["id"]) or {}).get("products", {})
        for p in i["products"]:
            if p["category"] != cat:
                continue
            entry = cells.get(p["name"]) or {}
            values, srcs = {}, {}
            for mid, cell in (entry.get("metrics") or {}).items():
                tag = "metrics/%s: %s %s" % (i["id"], p["name"], mid)
                if mid not in ids:
                    errors.append(tag + ": unknown metric")
                elif not (cell.get("v") and cell.get("quote") and cell.get("src")):
                    errors.append(tag + ": needs v, quote and src")
                elif not (cell["src"].startswith("https://") and on_domain(cell["src"], i["id"])):
                    errors.append(tag + ": src off-domain: " + cell["src"])
                else:
                    values[mid] = cell["v"].strip()
                    srcs[mid] = cell["src"]
            units.append({"id": p["id"], "pid": p["id"], "insurer": i["id"], "product": p["name"],
                          "name": p["name"], "values": values, "src": srcs})
    for iid, f in metrics_files.items():
        names = {p["name"] for i in insurers if i["id"] == iid for p in i["products"]}
        for name in f.get("products", {}):
            if name not in names:
                errors.append("metrics/%s: %r is not a built plan" % (iid, name))
    comp = {"category": cat, "kind": "insurer", "na": "Not on the insurer's page",
            "source": {"publisher": "Each insurer's own page or product summary"},
            "metrics": defs, "units": units, "notes": INSURER_NOTES}
    return comp, errors


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
    dropped = 0
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
                continue
            if not in_scope(p):
                dropped += 1
                continue
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
                # Stable id for links that pick plans (#/compare/<type>?p=...). Insurer + name, so a
                # renamed plan gets a new id rather than silently pointing at another plan.
                "id": slug(iid + "-" + name),
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
        for f in c["facts"] + c["watch"] + c.get("caveats", []):
            if f.get("s") and f["s"] not in guide["sources"]:
                errors.append("guide: unknown source %s in %s" % (f["s"], c["id"]))
    for s in guide["schemes"]:
        for f in s["facts"]:
            if f["s"] not in guide["sources"]:
                errors.append("guide: unknown source %s in %s" % (f["s"], s["id"]))
    if [c["id"] for c in guide["categories"]] != SHOWN:
        errors.append("guide: category ids/order differ from SHOWN")
    # Every type page must explain itself in plain words and carry its pitfalls and caveats.
    for c in guide["categories"]:
        for key in ("plain", "who", "watch", "caveats"):
            if not c.get(key):
                errors.append("guide: %s has no %s" % (c["id"], key))
    errors += check_highlights(guide)
    errors += check_glossary(guide)
    ids = [p["id"] for i in insurers for p in i["products"]]
    for dup in sorted({x for x in ids if ids.count(x) > 1}):
        errors.append("product id %s is not unique" % dup)
    compare = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "compare", "*.json"))):
        comp = load(path)
        errors += check_compare(comp, insurers)
        compare[comp.get("category")] = comp
    metrics_files = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "research", "metrics", "*.json"))):
        f = load(path)
        metrics_files[f.get("insurer")] = f
    for c in guide["categories"]:
        if c.get("metrics") and c["id"] not in compare:
            comp, errs = insurer_compare(c["id"], c["metrics"], insurers, metrics_files)
            errors += errs
            # Ship the table only once some cells exist; until then the type keeps plan cards.
            if any(u["values"] for u in comp["units"]):
                compare[c["id"]] = comp
    if errors:
        print("BUILD FAILED, %d problem(s):" % len(errors))
        for e in errors:
            print("  -", e)
        return 1
    out_dir = os.path.join(ROOT, "public", "data")
    os.makedirs(out_dir, exist_ok=True)
    for name, obj in (("insurers.json", {"insurers": insurers}), ("guide.json", guide), ("compare.json", compare)):
        with open(os.path.join(out_dir, name), "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write("\n")
    n = sum(len(i["products"]) for i in insurers)
    print("built %d insurers, %d products (%d savings or investment plans left out)" % (len(insurers), n, dropped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
