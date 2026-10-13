"""Which researched products the app shows. Shared by build_data, check_links and verify_facts so
a plan that is not shown is never link-checked either (a dead link on a hidden plan must not turn
the weekly Action red).

User ruling 2026-10-13: protection only. Savings and investment plans are out, both as whole
categories and as savings-led plans filed under whole life. The research files keep them, so
deleting an id from SAVINGS_CATEGORIES (and its guide entry) restores a category.
"""
import re

SAVINGS_CATEGORIES = {"endowment", "ilp", "annuity"}

# Whole life plans sold as wealth, income or legacy vehicles rather than for cover. Matched on the
# plan's name and summary only: AIA files a plain protection plan's subtype under "Participating
# Savings", and its summary is about boosted cover, so the subtype would misfire.
SAVINGS_LED = re.compile(
    r"\bwealth\b|legacy|\bincome\b|\bindex(ed)?\b|universal life|\bsav(ings|er)\b|dividends?"
    r"|\bcoupon\b|monthly payouts?|cash benefits?",
    re.I,
)


def in_scope(product):
    cat = product.get("category")
    if cat in SAVINGS_CATEGORIES:
        return False
    if cat == "whole_life":
        text = (product.get("name") or "") + " " + (product.get("summary") or "")
        return not SAVINGS_LED.search(text)
    return True
