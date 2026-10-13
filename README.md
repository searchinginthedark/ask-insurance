# Ask Insurance

A reference webapp for personal insurance in Singapore (everything except travel): what each type does, what national schemes already cover, and which insurers sell what. Every figure links to its official source.

Static site in `public/`, no build step and no backend. Data is JSON compiled from research files.

## Layout

| Path | What |
|---|---|
| `public/` | The site: `index.html`, `app.js`, `app.css`, `data/*.json` (built) |
| `data/guide.json` | Insurance types, national schemes, FAQ. Every fact cites a source id |
| `research/insurers/*.json` | One file per insurer, written to `research/CONTRACT.md` |
| `data/compare/*.json` | Plan-by-plan comparison tables. `hospitalisation.json` is generated from MOH's Shield plan comparison by `tools/moh_ip.py`; never edit it by hand |
| `data/link_report.json` | Last link-check result |
| `data/browser_verified.json` | Links on bot-walled sites, checked by hand in a browser (valid 30 days) |
| `tools/` | Build, link check, fact check, contrast check |

## Commands

```bash
pip install -r requirements.txt
python tools/check_links.py      # every link: dead, soft-404, wrong page, or bot-blocked
python tools/build_data.py       # validate research files and write public/data/
python tools/verify_facts.py     # every numeric fact must appear in its cited page or PDF
python tools/verify_guide.py     # same for guide.json: key figures, pain points, FAQ (plus quotes)
python tools/moh_ip.py           # rebuild data/compare/hospitalisation.json from MOH's PDFs
python tools/moh_ip.py --check   # exit 1 if MOH's live tables differ from the committed file
python tools/contrast.py         # WCAG contrast for the colour tokens, light and dark
python -m unittest discover -s tests
python -m http.server 8774 --directory public
```

`build_data.py` fails on any dead, soft-404 or mismatched product link, on URLs outside the insurer's own domain, and on bad categories. It drops time-limited promotions from facts.

## Updating

1. Edit or re-research `research/insurers/<id>.json` (follow `research/CONTRACT.md`).
2. Run `check_links.py`, then `build_data.py`, then `verify_facts.py` and `verify_guide.py`.
   A key figure (`key`) or must-know flag (`top`) in `data/guide.json` needs a source id; add a
   `quote` from the source when the claim is in words rather than digits.
3. When MOH updates its Shield plan comparison (the weekly run goes red on `moh_ip.py --check`), run
   `python tools/moh_ip.py`, review the diff of `data/compare/hospitalisation.json`, then rebuild.
   The script fails rather than guess: a blank or merged cell, two MOH tables disagreeing, or a
   number missing from the PDF text all stop it. `moh_ip.py` needs PyMuPDF 1.26.5 (table detection
   changes between versions).
4. For links that come back `blocked`, open them in a real browser and add them to `data/browser_verified.json`.

Downloaded PDFs stay in `research/pdf/` (gitignored). The app links to the insurers' own copies.

## Not advice

General information only. Plans and terms change; readers should check the insurer's product summary and speak to a licensed adviser.
