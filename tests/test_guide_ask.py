"""Canaries for the "Questions to ask yourself" checks: a check that cannot fail proves nothing.

Offline. Run: python -m unittest tests.test_guide_ask
"""
import copy
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build_data  # noqa: E402
import verify_guide  # noqa: E402

with open(os.path.join(ROOT, "data", "guide.json"), encoding="utf-8") as f:
    GUIDE = json.load(f)


def first_ask(guide):
    return next(q for c in guide["categories"] for q in c.get("qa", []) if q.get("ask"))


def ask_errors(guide):
    return [e for e in build_data.check_highlights(guide) if " ask" in e or "questions to ask" in e]


class BuildCheck(unittest.TestCase):
    def test_real_guide_passes(self):
        self.assertEqual(ask_errors(GUIDE), [])

    def broken(self, change):
        g = copy.deepcopy(GUIDE)
        change(first_ask(g))
        errs = ask_errors(g)
        self.assertTrue(errs, "check did not fire")
        return errs

    def test_one_question_is_too_few(self):
        self.broken(lambda q: q.__setitem__("ask", q["ask"][:1]))

    def test_five_questions_is_too_many(self):
        self.broken(lambda q: q.__setitem__("ask", (q["ask"] * 3)[:5]))

    def test_unknown_source(self):
        self.broken(lambda q: q["ask"][0].__setitem__("s", "no_such_source"))

    def test_missing_quote(self):
        self.broken(lambda q: q["ask"][0].pop("quote"))

    def test_not_a_question(self):
        self.broken(lambda q: q["ask"][0].__setitem__("t", "Your dependants need cover."))

    def test_advice_is_refused(self):
        self.broken(lambda q: q["ask"][0].__setitem__("t", "You should buy cover until 65, shouldn't you?"))

    def test_ask_on_global_faq_is_refused(self):
        g = copy.deepcopy(GUIDE)
        g["faq"][0]["ask"] = copy.deepcopy(first_ask(g)["ask"])
        self.assertTrue([e for e in build_data.check_highlights(g) if "questions to ask belong" in e])


class VerifierCoverage(unittest.TestCase):
    def test_every_ask_is_checked(self):
        want = sum(len(q.get("ask", [])) for c in GUIDE["categories"] for q in c.get("qa", []))
        got = sum(1 for where, _, _ in verify_guide.items(GUIDE) if where.endswith(".qa.ask"))
        self.assertGreater(want, 0)
        self.assertEqual(got, want)

    def run_verifier(self, guide):
        """verify_guide.main against a fake source whose text holds every quote and number of the
        REAL guide, so only a changed ask can go missing from it."""
        corpus = []
        for _, item, text in verify_guide.items(GUIDE):
            quotes = item.get("quote") or []
            corpus += [text] + ([quotes] if isinstance(quotes, str) else quotes)
        corpus = " ".join(corpus)
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, "data"))
            with open(os.path.join(tmp, "data", "guide.json"), "w", encoding="utf-8") as f:
                json.dump(guide, f)
            old_root, old_src = verify_guide.ROOT, verify_guide.source_text
            verify_guide.ROOT, verify_guide.source_text = tmp, lambda url, fresh: corpus
            # main() calls sys.stdout.reconfigure, which a StringIO lacks.
            out = io.TextIOWrapper(io.BytesIO(), encoding="utf-8")
            try:
                with redirect_stdout(out):
                    verify_guide.main([])
                out.flush()
            finally:
                verify_guide.ROOT, verify_guide.source_text = old_root, old_src
            text = out.buffer.getvalue().decode("utf-8")
        return [ln for ln in text.splitlines() if ".qa.ask" in ln]

    def test_real_asks_pass(self):
        self.assertEqual(self.run_verifier(GUIDE), [])

    def test_quote_not_in_source_fails(self):
        g = copy.deepcopy(GUIDE)
        first_ask(g)["ask"][0]["quote"] = ["zebra quantum canary premium"]
        self.assertEqual(len(self.run_verifier(g)), 1)

    def test_number_not_in_source_fails(self):
        g = copy.deepcopy(GUIDE)
        first_ask(g)["ask"][0]["t"] = "Can you afford 987654 a year?"
        self.assertEqual(len(self.run_verifier(g)), 1)


if __name__ == "__main__":
    unittest.main()
