"""Weekly verifier run from this Singapore PC, for the sources GitHub's runner cannot read.

AIA times out, Manulife answers 403 and MOE sends an empty page to GitHub's US datacentres, so the
weekly Action reports their 60 Compare cells and 9 guide items as unchecked. From here they load.
This runs both verifiers with fresh fetches and is strict where CI is lenient: a source refusing
THIS machine is a failure too, since no other check covers it. One exception: a refused source
listed in research/hand_checks.json with a check under MAX_HAND_CHECK_DAYS old. AIA has refused
scripts from this PC too since 2026-11-02 while loading in a browser, so someone reads those sources
in a browser instead, and this goes red again when that reading gets old.

Run by the Windows task "askinsurance-verify" (tools/register-local-verify.ps1, Mondays 10:30 SGT).
A non-zero exit becomes the task's Last Run Result, which memory/tools/watchdog/local_watch.py
reports by email. Full output: research/raw/local_verify/last.txt (gitignored).

Usage: python tools/local_verify.py
Exit 0 all verified, 1 a problem or a refused source, 2 a verifier crashed or printed no summary.
"""
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "raw", "local_verify")
HAND_CHECKS = os.path.join(ROOT, "research", "hand_checks.json")
MAX_HAND_CHECK_DAYS = 30
RUNS = [
    ("verify_guide", ["tools/verify_guide.py", "--fresh"]),
    ("verify_metrics", ["tools/verify_metrics.py", "--fresh", "--remote"]),
]
SUMMARY = re.compile(r"checked: (\d+), problems: (\d+), unchecked because the site refused: (\d+)")
REFUSED_URL = re.compile(r"refused: .*\((https?://[^\s)]+)\)\s*$", re.M)


def hand_checked(url, checks, today):
    """Date of a hand check of url that is still young enough, else None. A future date never counts."""
    for c in checks:
        if url in c.get("sources", []):
            when = date.fromisoformat(c["checked_on"])
            if 0 <= (today - when).days <= MAX_HAND_CHECK_DAYS:
                return when
    return None


def judge(rc, output, checks=(), today=None):
    """(exit code, one-line verdict) for one verifier's run. Pure."""
    m = SUMMARY.search(output)
    if not m:
        return 2, "no summary line (crashed?), exit %d" % rc
    checked, problems, refused = (int(x) for x in m.groups())
    line = "checked %d, problems %d, refused %d" % (checked, problems, refused)
    if problems or rc != 0:
        return 1, line
    if not refused:
        return 0, line
    # Every refused source must be covered: a source added later, or a count with no URLs, stays red.
    dates = [hand_checked(u, checks, today or date.today()) for u in REFUSED_URL.findall(output)]
    if not dates or None in dates:
        return 1, line
    return 0, "%s, all hand-checked (oldest %s)" % (line, min(dates))


def load_hand_checks():
    if not os.path.exists(HAND_CHECKS):
        return []
    with open(HAND_CHECKS, encoding="utf-8") as f:
        return json.load(f)["checks"]


def main():
    os.makedirs(OUT, exist_ok=True)
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    checks = load_hand_checks()
    worst, report = 0, ["local_verify %s" % datetime.now().strftime("%Y-%m-%d %H:%M")]
    for name, args in RUNS:
        r = subprocess.run([sys.executable] + args, cwd=ROOT, env=env, capture_output=True,
                           encoding="utf-8", errors="replace")
        code, line = judge(r.returncode, r.stdout, checks)
        worst = max(worst, code)
        report.append("%s %s: %s" % ("OK  " if code == 0 else "FAIL", name, line))
        report.append(r.stdout + r.stderr)
    report.insert(1, "RESULT %s" % ("OK" if worst == 0 else "FAIL (exit %d)" % worst))
    with open(os.path.join(OUT, "last.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(report))
    print("\n".join(x for x in report[:4]))
    return worst


def selftest():
    ok = "metric cells checked: 234, problems: 0, unchecked because the site refused: 0"
    url, other = "https://www.aia.com.sg/a", "https://www.aia.com.sg/b"
    refused = ok.replace("refused: 0", "refused: 9") + "\n  WARNING refused: ReadTimeout (%s)\n" % url
    checks = [{"checked_on": "2026-11-04", "sources": [url]}]
    cases = [
        (judge(0, ok)[0], 0),
        (judge(0, ok.replace("refused: 0", "refused: 9"))[0], 1),
        (judge(1, ok.replace("problems: 0", "problems: 2"))[0], 1),
        (judge(1, "Traceback (most recent call last)")[0], 2),
        (judge(1, ok)[0], 1),
        (judge(0, refused)[0], 1),  # no hand check at all
        (judge(0, refused, checks, date(2026, 11, 4))[0], 0),
        (judge(0, refused, checks, date(2026, 12, 4))[0], 0),  # 30 days: last good day
        (judge(0, refused, checks, date(2026, 12, 5))[0], 1),  # 31 days: red again
        (judge(0, refused, checks, date(2026, 11, 3))[0], 1),  # a future date never counts
        (judge(0, refused + "  WARNING refused: skipped (%s)\n" % other, checks, date(2026, 11, 4))[0], 1),  # one uncovered
        (judge(0, ok.replace("refused: 0", "refused: 9"), checks, date(2026, 11, 4))[0], 1),  # a count, no URLs
        (judge(1, refused.replace("problems: 0", "problems: 2"), checks, date(2026, 11, 4))[0], 1),  # a real problem wins
    ]
    bad = [i for i, (got, want) in enumerate(cases) if got != want]
    print("selftest %d/%d" % (len(cases) - len(bad), len(cases)), "FAIL %s" % bad if bad else "ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
