# Research contract: comparison metrics for term life, critical illness and Shield riders

You fill the Compare tab's rows for ONE insurer's plans. Each cell is shown publicly beside other
insurers' plans, so a wrong cell is worse than an empty one. **Leave a metric out rather than
guess.** The app then shows "Not on the insurer's page", which is honest. Today is 2026-10-13.

## Input
- `public/data/insurers.json`: take every product of your insurer whose `category` is `term_life`,
  `critical_illness` or `ip_rider`. Use the exact `name`, `url` and `pdfs` given there. Do not add,
  rename or drop plans; if a plan looks closed or wrong, say so in `notes`.
- Already-downloaded PDFs and their text: `research/pdf/<insurer_id>/` (the `local` field of
  `research/insurers/<insurer_id>.json` names them; the text is beside the PDF as `.txt` or
  `.pdf.txt`). Grep those first.

## Sources allowed (same as research/CONTRACT.md)
- Only the insurer's OWN pages and PDFs (its domains in `tools/build_data.py` `DOMAINS`/`CDN_PREFIXES`).
- `src` must be the product's `url`, one of its `pdfs` urls, or a PDF you add under `extra_pdfs`
  (official domain, downloaded with `python tools/pdf_extract.py <pdf_url> <insurer_id>`).
  Prefer the product summary PDF: it is stable and states terms precisely.
- No blogs, comparison sites, compareFIRST, agents' sites or memory.

## Tools (run from `C:\Users\Toh_Z\Documents\Claude Projects\ask-insurance`)
- `python tools/fetch_page.py <url> --text` for a page; `python tools/pdf_extract.py <pdf_url> <insurer_id>` for a PDF.
- Grep `.txt` files rather than reading them whole.
- Never `python -c` or heredocs; write any script to `research/scratch/<insurer_id>/` and run it.
- `python tools/verify_metrics.py <insurer_id>` checks your file. Run it before you finish and fix
  every problem it prints (or drop that metric).

## Metrics (ids exactly as below; only the ones for the plan's category)

term_life
- `term`        Cover term or end age, e.g. "5, 10 or 20 years, or to age 65 or 75"
- `entry_age`   Entry age range, keeping "age next birthday"/"last birthday" if stated
- `tpd`         Total and permanent disability: "Yes, ...", "No", or "Optional rider" (+ age limit if stated)
- `ti`          Terminal illness: "Yes", "No" or "Optional rider"
- `premium`     Whether premium rates are guaranteed, e.g. "Guaranteed for the policy term", "Not guaranteed"
- `no_medical`  Renew, convert or increase cover without health checks: what is offered, or "No"

critical_illness
- `stages`      "Severe stage only", or "Early, intermediate and severe", etc.
- `conditions`  How many conditions or illnesses are covered, as stated
- `claims`      "One claim" or how many claims / payout cap, e.g. "Multiple claims, up to 900% of sum assured"
- `term`        Cover term or end age
- `entry_age`   Entry age range
- `waiting`     Waiting period after cover starts, e.g. "90 days for selected illnesses"

ip_rider
- `pairs_with`  Which Shield plan(s)/tiers it attaches to
- `copay`       What you pay as co-payment, e.g. "5% of the claimable amount"
- `copay_cap`   Yearly cap on that co-payment, with its condition, e.g. "S$6,000 a policy year for panel treatment"
- `panel`       Any panel / preferred-provider condition on the cap or cover; "None stated" is NOT allowed: omit instead
- `entry_age`   Last entry age

## Output: write `research/metrics/<insurer_id>.json` (UTF-8, newline='\n')
```json
{
  "insurer": "aia",
  "checked_on": "2026-10-13",
  "extra_pdfs": [{"product": "Exact plan name", "title": "Product Summary", "url": "https://...pdf", "local": "research/pdf/aia/x.pdf"}],
  "products": {
    "Exact plan name": {
      "category": "term_life",
      "metrics": {
        "term": {"v": "5, 10, 20 or 30 years (renewable), or to age 65 or 75 (level)",
                 "quote": "Renewable term option for 5, 10, 20 or 30 years; or level term option up to age 65 or 75",
                 "src": "https://official page or pdf url"}
      }
    }
  },
  "notes": ["anything odd: a plan that looks closed, a variant whose terms differ, a source that blocks scripts"]
}
```

## Rules for every cell
1. `quote` is copied VERBATIM from `src` (whitespace and punctuation may differ, words may not),
   at most 40 words. It must support the whole of `v`.
2. Every number in `v` appears in `quote`, written the same way (no 1,000,000 -> 1 million, no
   "five" -> 5). Keep "S$", "%", "age next birthday".
3. `v` is at most 120 characters, plain English, no marketing words. Start yes/no metrics with
   "Yes", "No" or "Optional". A "No" needs a quote that SAYS no; absence of a mention is not a No.
4. If variants differ (e.g. Plan A vs B, To-Age-65 vs To-Age-85), say so in `v` only if the
   quote covers all of it; otherwise give the general term and add a note.
5. Promotions, discounts and illustrative premiums are never values.
6. One plan may need different sources per metric; that is fine, each cell has its own `src`.
7. Bot-walled pages (403/timeout): use the plan's PDF instead. Manulife pages block scripts, so use
   its PDFs for every cell.

Final reply: counts of cells filled per category, the JSON path, the `verify_metrics.py` result
line, and any plan you could not fill at all. Under 120 words.
