"""verify_guide refetches a source once when an item fails, so one degraded page sent to a runner
does not turn the Monday check red, while a page that really changed still does.

Reads the local page cache (research/raw/guide/, filled by any verify_guide run); skipped without it.
Run: python -m unittest tests.test_verify_guide_retry
"""
import io
import json
import os
import sys
import unittest
from contextlib import redirect_stdout

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import verify_guide  # noqa: E402

with open(os.path.join(ROOT, "data", "guide.json"), encoding="utf-8") as f:
    TARGET = json.load(f)["sources"]["sdic_ppf_caps"]["url"]
DEGRADED = "Policy Owners' Protection Scheme. Please try again later."


class Capture(io.StringIO):
    def reconfigure(self, **kw):  # main() sets utf-8 on the real stdout
        pass


@unittest.skipUnless(os.path.isdir(verify_guide.CACHE), "no local page cache")
class Retry(unittest.TestCase):
    def setUp(self):
        self.real, self.wait = verify_guide.source_text, verify_guide.RETRY_WAIT
        verify_guide.RETRY_WAIT = 0
        self.calls = []

    def tearDown(self):
        verify_guide.source_text, verify_guide.RETRY_WAIT = self.real, self.wait

    def run_with(self, target_text):
        def fake(url, fresh):
            if url != TARGET:
                return self.real(url, False)
            self.calls.append(fresh)
            return target_text(len(self.calls))
        verify_guide.source_text = fake
        out = Capture()
        with redirect_stdout(out):
            rc = verify_guide.main([])
        return rc, out.getvalue()

    def test_degraded_once_then_real_page_passes(self):
        rc, out = self.run_with(lambda n: DEGRADED if n == 1 else self.real(TARGET, False))
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.calls, [False, True])  # the retry is a fresh fetch

    def test_page_that_stays_wrong_fails_and_shows_what_came_back(self):
        rc, out = self.run_with(lambda n: DEGRADED)
        self.assertEqual(rc, 1)
        self.assertEqual(self.calls, [False, True])  # one retry only, not one per item
        self.assertIn("sdic_ppf_caps sent %d chars" % len(DEGRADED), out)
        self.assertIn("try again later", out)


if __name__ == "__main__":
    unittest.main()
