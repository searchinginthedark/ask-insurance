"""Canaries for tools/check_links.py: a checker that cannot fail proves nothing.

Live-network tests. Run: python -m unittest tests.test_check_links
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import check_links  # noqa: E402

PRODUCT = {"kind": "product", "label": "x", "owner": "test"}


class Canaries(unittest.TestCase):
    def test_dead_page(self):
        r = check_links.check("https://www.income.com.sg/this-page-does-not-exist-askins-canary",
                              dict(PRODUCT, name="Nothing"))
        self.assertIn(r["status"], ("dead", "soft404"), r)

    def test_wrong_page_is_mismatch(self):
        # A real page that does not name the product must not pass as "ok".
        r = check_links.check("https://www.moh.gov.sg/managing-expenses/schemes-and-subsidies/medishield-life/medishield-life-benefits/",
                              dict(PRODUCT, name="Zebrashield Quantum Term"))
        self.assertEqual(r["status"], "mismatch", r)

    def test_right_page_is_ok(self):
        r = check_links.check("https://www.moh.gov.sg/managing-expenses/schemes-and-subsidies/medishield-life/medishield-life-benefits/",
                              dict(PRODUCT, name="MediShield Life Benefits"))
        self.assertEqual(r["status"], "ok", r)

    def test_html_where_pdf_expected(self):
        r = check_links.check("https://www.moneysense.gov.sg/", {"kind": "pdf", "label": "x", "owner": "t", "name": None})
        self.assertEqual(r["status"], "mismatch", r)

    def test_challenge_detector(self):
        self.assertTrue(check_links.is_challenge(b'<script src="/_Incapsula_Resource?SWJIYLWA=1"></script>'))
        self.assertTrue(check_links.is_challenge(b"<title>Just a moment...</title>"))
        self.assertFalse(check_links.is_challenge(b"<title>TM Term Assure (II)</title>"))

    def test_soft404_detector(self):
        self.assertTrue(check_links.is_soft404("https://a.com/products/term", "https://a.com/"))
        self.assertTrue(check_links.is_soft404("https://a.com/products/term", "https://a.com/en/404"))
        self.assertFalse(check_links.is_soft404("https://a.com/products/term", "https://a.com/products/term/"))


if __name__ == "__main__":
    unittest.main()
