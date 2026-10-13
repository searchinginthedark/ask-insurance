"""Build the Shield plan comparison from MOH's own "Comparison of Integrated Shield Plans".

MOH publishes one PDF per ward class (private hospital, class A, class B1, Standard B1), each a text
table with one column per plan tier, plus two insurer-level tables on the page itself (claims
processing time and pre-authorisation). Every value here is copied out of those tables by this
script, never typed by hand, and the script fails rather than guess:

- a blank or merged cell for a tier we keep fails the build (a blank must never read as "no cover");
- each tier's premium is read from two different tables in the same PDF and must agree;
- every number in every value must appear in the PDF's own text.

Closed plans (MOH marks them *) and Raffles (not one of the 7 insurers here) are left out.

Usage:
  python tools/moh_ip.py          write data/compare/hospitalisation.json
  python tools/moh_ip.py --check  re-read MOH live; exit 1 if anything differs from the committed file
                                  (a red run means MOH updated its comparison: re-run without --check)
Needs PyMuPDF 1.26.5: table detection is version-sensitive, so CI pins the same version.
"""
import json
import os
import re
import sys

import fitz
import requests
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "compare", "hospitalisation.json")
PAGE = ("https://www.moh.gov.sg/managing-expenses/schemes-and-subsidies/integrated-shield-plans/"
        "comparision-of-integrated-shield-plans/")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")

# (group id, name shown, link text of MOH's PDF). B2/C is left out: only closed plans remain there.
GROUPS = [
    ("private", "Private hospital", "Comparison of Private Hospital IPs"),
    ("a", "Public hospital, class A", "Comparison of Class A IPs"),
    ("b1", "Public hospital, class B1", "Comparison of Class B1 IPs"),
    ("standard", "Standard plan (class B1)", "Comparison of Standard IPs"),
]
SHORT = {"private": "Private", "a": "Class A", "b1": "Class B1", "standard": "Standard"}
INSURERS = {"AIA": "aia", "Great Eastern": "great_eastern", "Prudential": "prudential",
            "Income": "income", "Singlife": "singlife", "HSBC Life": "hsbc_life"}


def product_of(insurer, tier):
    """The plan in research/insurers/*.json that this MOH tier belongs to."""
    if insurer == "income":
        return "IncomeShield Standard Plan" if "Standard" in tier else "Enhanced IncomeShield"
    return {"aia": "AIA HealthShield Gold Max", "great_eastern": "GREAT SupremeHealth",
            "prudential": "PRUShield", "singlife": "Singlife Shield",
            "hsbc_life": "HSBC Life Shield"}[insurer]


# Rows copied per tier: metric id -> pattern for MOH's row label. The deductible row depends on the
# ward class the plan targets, so it is chosen per group.
ROWS = {
    "ward_limit": r"^- Normal Ward",
    "pre": r"^Pre-Hospitalisation Treatment",
    "post": r"^Post-Hospitalisation Treatment",
    "coins": r"^Co-insurance",
    "year_limit": r"^Policy Year Limit",
    "entry_age": r"^Last Entry Age",
}
# Rows MOH's table has no line for in that group. The app shows "Not in MOH's table", never a blank.
NOT_LISTED = {"standard": {"pre", "post"}}
# Cells where MOH's summary and detailed premium tables disagree, checked by eye against the PDF.
# Both figures are shown. Any NEW disagreement still fails the build.
KNOWN_CONFLICTS = {("b1", "Enhanced IncomeShield Basic", "71 to 73")}
DEDUCTIBLE_ROW = {"private": r"^- Class A and Private Hospital", "a": r"^- Class A and Private Hospital",
                  "b1": r"^- Class B1$", "standard": r"^- Class B1$"}

# "why" sits under the row label in a narrow sticky column, so it stays short. Longer reading notes
# go in "notes" below the table.
METRICS = [
    {"id": "ward", "label": "Ward class", "why": "The ward the plan is built to pay for."},
    {"id": "premium", "label": "Yearly premium", "per": "band",
     "why": "S$, incl. MediShield Life and GST."},
    {"id": "premium_change", "label": "Yearly rise, last 3 years", "per": "band",
     "why": "Private part of the premium, same age band."},
    {"id": "deductible", "label": "Deductible", "why": "S$ you pay first each policy year, in its ward class."},
    {"id": "coins", "label": "Co-insurance", "why": "Your share of the bill after the deductible."},
    {"id": "year_limit", "label": "Yearly claim limit", "why": "Most it pays in a policy year, S$."},
    {"id": "ward_limit", "label": "Ward and treatment, normal ward", "why": "“As Charged” means no daily cap."},
    {"id": "pre", "label": "Before admission", "why": "Tests and specialist visits before a stay."},
    {"id": "post", "label": "After discharge", "why": "Follow-up treatment after a stay."},
    {"id": "entry_age", "label": "Last entry age", "why": "Oldest age (next birthday) to start."},
    {"id": "claims", "label": "Claims processing", "per": "insurer", "why": "Across all the insurer's Shield plans."},
    {"id": "preauth", "label": "Pre-authorisation", "per": "insurer", "why": "Check what will be paid before treatment."},
]
NOTES = [
    "Premiums are for Singapore Citizens and PRs, by age next birthday, and rise as you move into the next age band. MOH shows a range where the premium changes within the band.",
    "The premium rise is MOH's average yearly growth over the last 3 years of the private part of the premium, MediShield Life left out. It shows how fast prices have moved, not what they will do.",
    "Many plans pay more, or for longer, when you use the insurer's panel or preferred doctors. The conditions are in each cell, word for word from MOH.",
    "Riders are not included: a rider changes what you pay out of your own pocket, and costs extra.",
]
STANDARD_QUOTE = "With the exception of Standard IPs, other IPs may differ in coverage across insurers"

NOTE = re.compile(r"\s*[\[(]\s*(?:see )?Notes? \([^)]*\)(?: and \([^)]*\))?\s*[\])]")
DIGIT_GAP = re.compile(r"(?<=\d) (?=[\d,])")


def clean(cell):
    s = re.sub(r"\s+", " ", (cell or "").replace("\n", " ")).strip()
    return NOTE.sub("", s).strip()


def clean_num(cell):
    # PDF text sometimes splits a figure: "5 27" is 527 and "1 ,005" is 1,005.
    return re.sub(r"\s+", " ", DIGIT_GAP.sub("", clean(cell))).replace(" ,", ",").strip()


def split_header(h):
    m = re.match(r"^\[([^\]]+)\]\s*(.+?)\s*(\*?)$", clean(h))
    if not m:
        return None
    return m.group(1).strip(), m.group(2).strip(), bool(m.group(3))


def get(url):
    r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en-SG,en;q=0.9"}, timeout=60)
    r.raise_for_status()
    return r


def tables(pdf_bytes):
    """Every table row in the PDF, page by page, with continuation rows (blank first cell) folded
    into the row above so a benefit split across two rows reads as one."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    out = []
    for page in doc:
        for t in page.find_tables().tables:
            rows = []
            for r in t.extract():
                if rows and r[0] is None and any(c for c in r[1:]) and rows[-1][0]:
                    prev = rows[-1]
                    for i, c in enumerate(r[1:], 1):
                        if c and i < len(prev):
                            prev[i] = (prev[i] or "") + " " + c
                    continue
                rows.append(list(r))
            out.append(rows)
    text = "\n".join(p.get_text("text") for p in doc)
    return out, text


def numbers(s):
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", s)}


def parse_group(gid, pdf_bytes, errors):
    tabs, text = tables(pdf_bytes)
    m = re.search(r"Updated as of:\s*([0-9]{1,2} \w+ 20\d\d)", text)
    as_at = m.group(1) if m else None
    benefit = {}      # column header -> {row label -> cell}
    order = []
    summary = {}      # column header -> {band -> premium incl. MSHL}
    detail = {}       # column header -> {band -> {incl, excl, change}}
    for rows in tabs:
        head = rows[0]
        first = clean(head[0])
        if first == "Benefits" or (first == "" and len(rows) > 1 and clean(rows[1][0]) == "Benefits"):
            if first == "":
                rows = rows[1:]
                head = rows[0]
            cols = [clean(h) for h in head]
            for c in cols[1:]:
                if c not in benefit:
                    benefit[c] = {}
                    order.append(c)
            for r in rows[1:]:
                lab = clean(r[0])
                if not lab:
                    # Unlabelled rows are footnotes such as "^ An additional claim limit ...".
                    for i, c in enumerate(cols[1:], 1):
                        if i < len(r) and r[i] and clean(r[i]).startswith("^ "):
                            benefit[c].setdefault("(footnote ^)", r[i])
                    continue
                for i, c in enumerate(cols[1:], 1):
                    if i < len(r) and lab not in benefit[c]:
                        benefit[c][lab] = r[i]
        elif first == "Premiums":
            cols = [clean(h) for h in head]
            for r in rows[1:]:
                band = clean(r[0])
                if not re.match(r"^(\d+ to \d+|Premiums above age 90)$", band):
                    continue
                for i, c in enumerate(cols[1:], 1):
                    summary.setdefault(c, {})[band] = r[i]
        else:
            # Detailed premium tables: a row of plan names (every third column), then
            # "Age Next Birthday:" with incl. / excl. / annual change under each plan.
            names = None
            for r in rows:
                cells = [clean(c) if c is not None else None for c in r]
                if any(c and c.startswith("[") for c in cells[1:]):
                    names = {i: cells[i] for i in range(1, len(cells)) if cells[i] and cells[i].startswith("[")}
                    continue
                band = cells[0] or ""
                if names and re.match(r"^(\d+ to \d+|Premiums above age 90)$", band):
                    for i, name in names.items():
                        vals = r[i:i + 3]
                        slot = detail.setdefault(name, {})
                        prev = slot[list(slot)[-1]] if slot else None
                        change = vals[2] if len(vals) > 2 else None
                        # MOH merges one "N.A. (Note: ...)" cell down a plan's whole change column.
                        if change is None and prev and (prev["change"] or "").startswith("N.A."):
                            change = prev["change"]
                        slot[band] = {"incl": vals[0], "excl": vals[1] if len(vals) > 1 else None, "change": change}
    return as_at, benefit, order, summary, detail, text


def build():
    errors = []
    page = get(PAGE)
    soup = BeautifulSoup(page.content, "html.parser")
    pdfs = {}
    for a in soup.find_all("a", href=True):
        for gid, _, label in GROUPS:
            if label in a.get_text(" ", strip=True) and a["href"].lower().endswith(".pdf"):
                pdfs[gid] = a["href"]
    for gid, _, label in GROUPS:
        if gid not in pdfs:
            errors.append("MOH page has no link named %r" % label)
    page_text = soup.get_text(" ")
    insurer_values = parse_insurer_tables(soup, errors)
    units, groups, as_ats, closed_tiers = [], [], set(), []
    for gid, gname, _ in GROUPS:
        if gid not in pdfs:
            continue
        as_at, benefit, order, summary, detail, text = parse_group(gid, get(pdfs[gid]).content, errors)
        as_ats.add(as_at)
        groups.append({"id": gid, "name": gname, "short": SHORT[gid], "pdf": pdfs[gid], "as_at": as_at})
        pdf_nums = numbers(DIGIT_GAP.sub("", text))
        # Standard plans: one benefit column for all of them (MOH: same benefits everywhere),
        # premiums per insurer.
        tiers = list(summary) if gid == "standard" else order
        for col in tiers:
            sp = split_header(col)
            if not sp:
                errors.append("%s: unreadable column header %r" % (gid, col))
                continue
            ins_label, tier, closed = sp
            iid = INSURERS.get(ins_label)
            if iid is None:
                continue
            if closed:
                closed_tiers.append({"insurer": iid, "name": tier, "group": gid})
                continue
            bcol = benefit.get("Standard IP") if gid == "standard" else benefit.get(col)
            if bcol is None:
                errors.append("%s: no benefit column for %s" % (gid, col))
                continue
            values = {"ward": gname}
            rows = dict(ROWS, deductible=DEDUCTIBLE_ROW[gid])
            for mid, pat in rows.items():
                if mid in NOT_LISTED.get(gid, ()):
                    continue
                hits = [lab for lab in bcol if re.search(pat, lab)]
                cell = bcol[hits[0]] if hits else None
                if cell is None or not clean(cell):
                    errors.append("%s / %s: no %s cell (blank or merged in MOH's table)" % (gid, tier, mid))
                    continue
                v = clean(cell)
                # A trailing ^ points at a footnote row MOH puts under the table ("^ An additional ...").
                if v.endswith("^"):
                    foot = [clean(c) for c in bcol.values() if c and clean(c).startswith("^ ")]
                    if len(foot) != 1:
                        errors.append("%s / %s: %s has a ^ footnote that could not be found" % (gid, tier, mid))
                    else:
                        v = "%s (%s)" % (v[:-1], foot[0][2:])
                if mid == "entry_age" and v == "None":
                    v = "None (no maximum)"
                values[mid] = v
            prem = {}
            sum_col = summary.get(col, {})
            det = detail.get(col) or detail.get(col.rstrip("*").strip()) or {}
            for band, cell in sum_col.items():
                d = det.get(band)
                if cell is None or d is None or None in d.values():
                    errors.append("%s / %s: premium for %s missing" % (gid, tier, band))
                    continue
                incl = clean_num(cell)
                if clean_num(d["incl"]) != incl:
                    if (gid, tier, band) in KNOWN_CONFLICTS:
                        incl = "%s or %s (MOH's two tables differ)" % (clean_num(d["incl"]), incl)
                    else:
                        errors.append("%s / %s: premium tables disagree at %s: %r vs %r" % (gid, tier, band, incl, clean_num(d["incl"])))
                prem[band] = {"incl": incl, "excl": clean_num(d["excl"]), "change": clean(d["change"])}
            if not prem:
                errors.append("%s / %s: no premiums" % (gid, tier))
            for mid, v in list(values.items()) + [(b + " " + k, x) for b, p in prem.items() for k, x in p.items()]:
                missing = numbers(DIGIT_GAP.sub("", v)) - pdf_nums
                if missing and mid != "ward":
                    errors.append("%s / %s: %s has numbers not in the PDF text: %s" % (gid, tier, mid, sorted(missing)))
            units.append({
                "id": slug(iid + "-" + tier),
                "insurer": iid,
                "product": product_of(iid, tier),
                "name": tier,
                "group": gid,
                "values": values,
                "premium": prem,
            })
    for iid in {u["insurer"] for u in units}:
        if iid not in insurer_values:
            errors.append("insurer %s missing from MOH's service indicator tables" % iid)
    for iid, vals in insurer_values.items():
        for mid, v in vals.items():
            q = v.get("quote") or ""
            if q and re.sub(r"\W", "", q.lower()) not in re.sub(r"\W", "", page_text.lower()):
                errors.append("%s %s: quote not on MOH page: %r" % (iid, mid, q))
    if re.sub(r"\W", "", STANDARD_QUOTE.lower()) not in re.sub(r"\W", "", page_text.lower()):
        errors.append("MOH page no longer says: %r" % STANDARD_QUOTE)
    bands = []
    for u in units:
        for b in u["premium"]:
            if b not in bands:
                bands.append(b)
    data = {
        "category": "hospitalisation",
        "kind": "moh",
        "na": "Not in MOH's table",
        "source": {"publisher": "MOH", "title": "Comparison of Integrated Shield Plans", "url": PAGE,
                   "as_at": sorted(a for a in as_ats if a)},
        "notes": NOTES,
        "same_benefits": {"standard": {"t": "Standard plans have the same coverage at every insurer, so their benefit rows match; the premium and the insurer rows differ.",
                                       "quote": STANDARD_QUOTE}},
        "groups": groups,
        "bands": bands,
        "default_band": "31 to 40",
        "metrics": METRICS,
        "units": units,
        "insurer_values": insurer_values,
        # MOH: "no longer offered to new members". Kept so the app can say so of a plan still listed.
        "closed": closed_tiers,
    }
    return data, errors


def parse_insurer_tables(soup, errors):
    """Claims processing time and pre-authorisation, one row per insurer, from the MOH page."""
    out = {}
    found_claims = found_pre = False
    for tb in soup.find_all("table"):
        rows = [[c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])] for tr in tb.find_all("tr")]
        if not rows:
            continue
        head = " ".join(rows[0])
        foot = " ".join(" ".join(r) for r in rows[1:])
        if "Median Claims Processing Duration" in head:
            found_claims = True
            m = re.search(r"\((\d{1,2} \w+ to \d{1,2} \w+ 20\d\d)\)", foot)
            period = m.group(1) if m else None
            if not period:
                errors.append("claims table: no period found")
            for r in rows[1:]:
                iid = INSURERS.get(r[0].strip()) if r else None
                if iid and len(r) >= 3:
                    def days(c):
                        if c == "0 (Same Day)":
                            return "the same day"
                        if not re.match(r"^\d+$", c):
                            errors.append("claims table: unexpected cell %r" % c)
                        return "within %s day%s" % (c, "" if c == "1" else "s")
                    out.setdefault(iid, {})["claims"] = {
                        "v": "Half %s, 75%% %s" % (days(r[1]), days(r[2])),
                        "when": period, "cells": [r[1], r[2]]}
        elif "Availability of Pre-Auth" in head:
            found_pre = True
            for r in rows[1:]:
                name = re.sub(r"\s*↗.*$", "", r[0]).strip() if r else ""
                iid = INSURERS.get(name)
                if iid and len(r) >= 2:
                    out.setdefault(iid, {})["preauth"] = {"v": re.sub(r"\s*\d+$", "", r[1]).strip()}
            # Income and Singlife are explained only in the table's footnote.
            for iid, v, quote in (
                ("income", "Not offered", "Income does not offer pre-authorisation"),
                ("singlife", "Not needed at its preferred providers (stopped 9 Sep 2023)",
                 "Singlife has ceased offering pre-authorisation as of 9 September 2023 as they no longer require pre-authorisation for preferred medical providers"),
            ):
                out.setdefault(iid, {})["preauth"] = {"v": v, "quote": quote}
    if not found_claims:
        errors.append("MOH page: claims processing table not found")
    if not found_pre:
        errors.append("MOH page: pre-authorisation table not found")
    return out


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    data, errors = build()
    if errors:
        print("MOH comparison: %d problem(s)" % len(errors))
        for e in errors:
            print("  -", e)
        return 1
    n = len(data["units"])
    if "--check" in argv:
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        if old != data:
            print("MOH comparison CHANGED since the committed file. Re-run: python tools/moh_ip.py, review the diff, commit.")
            for u_old, u_new in zip(old.get("units", []), data["units"]):
                if u_old != u_new:
                    print("  first difference in", u_new["id"])
                    break
            if len(old.get("units", [])) != n:
                print("  tiers: %d committed, %d live" % (len(old.get("units", [])), n))
            return 1
        print("MOH comparison unchanged: %d tiers, as at %s" % (n, ", ".join(data["source"]["as_at"])))
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote %s: %d tiers in %d groups, as at %s" % (os.path.relpath(OUT, ROOT), n, len(data["groups"]), ", ".join(data["source"]["as_at"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
