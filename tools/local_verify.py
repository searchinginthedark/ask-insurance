"""Weekly verifier run from this Singapore PC, for the sources GitHub's runner cannot read.

AIA times out, Manulife answers 403 and MOE sends an empty page to GitHub's US datacentres, so the
weekly Action reports their 60 Compare cells and 9 guide items as unchecked. From here they load.
This runs both verifiers with fresh fetches and is strict where CI is lenient: a source refusing
THIS machine is a failure too, since no other check covers it.

Run by the Windows task "askinsurance-verify" (tools/register-local-verify.ps1, Mondays 10:30 SGT).
A non-zero exit becomes the task's Last Run Result, which memory/tools/watchdog/local_watch.py
reports by email. Full output: research/raw/local_verify/last.txt (gitignored).

Usage: python tools/local_verify.py
Exit 0 all verified, 1 a problem or a refused source, 2 a verifier crashed or printed no summary.
"""
import os
import re
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "raw", "local_verify")
RUNS = [
    ("verify_guide", ["tools/verify_guide.py", "--fresh"]),
    ("verify_metrics", ["tools/verify_metrics.py", "--fresh", "--remote"]),
]
SUMMARY = re.compile(r"checked: (\d+), problems: (\d+), unchecked because the site refused: (\d+)")


def judge(rc, output):
    """(exit code, one-line verdict) for one verifier's run. Pure."""
    m = SUMMARY.search(output)
    if not m:
        return 2, "no summary line (crashed?), exit %d" % rc
    checked, problems, refused = (int(x) for x in m.groups())
    line = "checked %d, problems %d, refused %d" % (checked, problems, refused)
    if problems or refused or rc != 0:
        return 1, line
    return 0, line


def main():
    os.makedirs(OUT, exist_ok=True)
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    worst, report = 0, ["local_verify %s" % datetime.now().strftime("%Y-%m-%d %H:%M")]
    for name, args in RUNS:
        r = subprocess.run([sys.executable] + args, cwd=ROOT, env=env, capture_output=True,
                           encoding="utf-8", errors="replace")
        code, line = judge(r.returncode, r.stdout)
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
    cases = [
        (judge(0, ok)[0], 0),
        (judge(0, ok.replace("refused: 0", "refused: 9"))[0], 1),
        (judge(1, ok.replace("problems: 0", "problems: 2"))[0], 1),
        (judge(1, "Traceback (most recent call last)")[0], 2),
        (judge(1, ok)[0], 1),
    ]
    bad = [i for i, (got, want) in enumerate(cases) if got != want]
    print("selftest %d/%d" % (len(cases) - len(bad), len(cases)), "FAIL %s" % bad if bad else "ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
