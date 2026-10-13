"""WCAG contrast for every text/background token pair in public/app.css, light and dark.

Usage: python tools/contrast.py   (exit 1 if any pair is under its minimum)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# (foreground, background, minimum): 4.5 for text, 3 for focus rings and large bold numbers.
PAIRS = [("text", "bg", 4.5), ("text", "surface", 4.5), ("muted", "bg", 4.5), ("muted", "surface", 4.5),
         ("link", "surface", 4.5), ("link", "bg", 4.5), ("on-brand", "brand", 4.5), ("warn-fg", "warn-bg", 4.5),
         ("ok-fg", "ok-bg", 4.5), ("tag-fg", "tag-bg", 4.5), ("muted", "tag-bg", 4.5), ("focus", "surface", 3),
         ("focus", "bg", 3), ("edge", "surface", 3.0), ("edge", "bg", 3.0)]


def lum(hexv):
    r, g, b = (int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main():
    css = open(os.path.join(ROOT, "public", "app.css"), encoding="utf-8").read()
    light = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", css.split("@media (prefers-color-scheme: dark)")[0]))
    dark_block = css.split("@media (prefers-color-scheme: dark)")[1].split("\n}\n")[0]
    dark = dict(light, **dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", dark_block)))
    bad = 0
    for mode, t in (("light", light), ("dark", dark)):
        for fg, bg, need in PAIRS:
            r = ratio(t[fg], t[bg])
            flag = "" if r >= need else "  <-- FAIL"
            bad += bool(flag)
            print("%-5s %-9s on %-9s %5.2f (need %.1f)%s" % (mode, fg, bg, r, need, flag))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
