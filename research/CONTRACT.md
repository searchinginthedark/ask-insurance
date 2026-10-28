# Research contract: insurer product lineups (Singapore, individuals)

You are collecting ONE insurer's CURRENT retail product lineup for a Singapore consumer reference app.
Accuracy beats coverage. A product you could not confirm on the insurer's own site is LEFT OUT,
never guessed. Today is 2026-10-13.

## Sources allowed
- Only the insurer's OFFICIAL domain(s) for product facts, URLs and PDFs.
- compareFIRST (comparefirst.sg) may be used to discover product names, never as the product URL.
- No blogs, comparison sites, forums, agents' sites, or your own memory for any fact.

## Tools (run from the project root `C:\Users\Toh_Z\Documents\Claude Projects\ask-insurance`)
- `python tools/fetch_page.py <url> [--links REGEX] [--text]` prints final URL, HTTP status, <title>,
  <h1>s, optional matching links, optional visible text (first 6000 chars). Use it instead of raw curl.
- `python tools/pdf_extract.py <pdf_url> <insurer_id>` downloads an official PDF into
  `research/pdf/<insurer_id>/` and writes a `.txt` beside it; prints page count and the first 4000 chars.
  Read the `.txt` with grep for specific facts (entry age, sum assured limits, policy term, benefits)
  rather than reading it whole.
- WebFetch / WebSearch are fine for DISCOVERY (finding the URL). Every final URL must then pass
  `fetch_page.py` (status 200 and the product name in title/h1/text), or be marked `"blocked"` if the
  site refuses scripted requests (403/timeout) with the evidence of where you saw it.
- Never write scripts with `python -c` or bash heredocs; write a .py file under
  `research/scratch/<insurer_id>/` and run it.

## Categories (use these ids exactly)
hospitalisation   Integrated Shield Plan (private/A-ward IP on top of MediShield Life)
ip_rider          rider on an Integrated Shield Plan (co-payment/deductible riders, extras)
term_life         term life, incl. decreasing/mortgage term
whole_life        whole life, universal life, legacy plans
critical_illness  CI incl. early/multi-stage, multi-pay, and CI riders sold as standalone plans
cancer            cancer-only plans
disability_income disability income / income protection
long_term_care    CareShield Life / ElderShield supplements, LTC plans
personal_accident personal accident (adult, child, senior)
hospital_cash     hospital income / daily cash plans
endowment         savings / endowment / education plans (non-ILP)
ilp               investment-linked plans
annuity           retirement income / annuity plans
maternity_child   maternity, pregnancy, newborn/juvenile-specific protection
outpatient        outpatient / GP / specialist / dental plans for individuals
rider             other riders (premium waiver, payor benefit, CI or TPD acceleration riders) — only list
                  riders that have their own page or PDF

## Output: write `research/insurers/<insurer_id>.json` (UTF-8, newline='\n'), exactly this shape
```json
{
  "id": "aia",
  "name": "AIA Singapore",
  "formerly": null,
  "website": "https://...",
  "products_index_url": "https://...",
  "claims_url": "https://...",
  "contact_url": "https://...",
  "verified_on": "2026-10-13",
  "products": [
    {
      "name": "Exact product name as on the page",
      "category": "term_life",
      "subtype": "e.g. multi-pay CI / decreasing term / null",
      "summary": "1-2 plain sentences, only what the official page says.",
      "facts": ["Short fact with the number exactly as stated, e.g. 'Entry age 1 to 65'"],
      "channel": "agent | direct-online | bank | mixed | unknown",
      "url": "https://official product page",
      "url_status": "ok | blocked",
      "pdfs": [{"title": "Product Summary / Brochure", "url": "https://official.pdf", "local": "research/pdf/aia/x.pdf"}],
      "fact_source": "page | pdf | both",
      "evidence": "<=15 word quote from the page or PDF that names the product"
    }
  ],
  "not_found": ["categories you checked and the insurer does not offer, e.g. 'annuity'"],
  "notes": ["anything odd: rebrands, discontinued products still online, bot-blocking"]
}
```

## Rules
- `facts`: at most 5 per product, each traceable to the page or PDF you cite. Numbers verbatim
  (keep "S$", "%", age ranges). No marketing adjectives, no "best".
- Prefer the product page as `url`; put brochures / product summaries / policy wording in `pdfs`.
  Download at most 2 PDFs per product (product summary first); only from the insurer's own domain
  (including their CDN, e.g. assets on the same company).
- Skip: travel, motor, home, maid, pet, group/corporate/employee benefits, SME, and products marked
  "no longer available" / "closed to new business".
- Discontinued-but-still-online pages: leave out, mention in `notes`.
- If the same product has separate pages per variant, list it once and mention variants in `subtype`.
- Do not stop early: walk the insurer's whole individual product menu, every category above.
- Final reply to the orchestrator: just the counts per category, the path of the JSON, and any
  products you saw but could not verify. Keep it under 150 words.

## Discovery tips
- Many menus are JS-rendered and invisible to `fetch_page.py`. Try `<site>/sitemap.xml` (or the
  sitemap listed in `/robots.txt`) and filter URLs, then confirm each candidate with `fetch_page.py`.
- AIA answers scripted requests (requests library) even though curl times out. Manulife returns 403
  to scripts: use WebFetch to read it, and mark its URLs `"url_status": "blocked"` if fetch_page fails.
