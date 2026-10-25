# Generates public/og-card.png, the 1200x630 default share card (og:image),
# for the newsroom VITE_NEWSROOM names (web/src/newsrooms.js; wpr when unset):
#     npm run og-card
#     VITE_NEWSROOM=gazette npm run og-card
# Reads the newsroom through node and its colors from the theme block in
# src/styles/tokens.css, so the card follows the site. One-time asset; rerun
# after a branding change. Downloads the brand faces from the Google Fonts
# repo at run time and uses the committed badge and wordmark from public/, so
# nothing depends on WordPress uploads (a CDN move broke those once).
import io
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else PUBLIC / "og-card.png"

# WPR's palette, also the fallback when a token is missing. The card for
# another newsroom takes its own from tokens.css (see palette()).
TEAL_DEEP = (31, 75, 69)
TEAL = (58, 134, 124)
SUN = (244, 185, 66)
CREAM = (246, 242, 233)
MINT = (214, 230, 226)

DISPLAY = "https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf"
# The newsroom page's card (newsroom-card.py) keeps WPR's house serif.
FRAUNCES = "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
FRAUNCES_ITALIC = "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
PUBLIC_SANS = "https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/PublicSans%5Bwght%5D.ttf"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r:
        return r.read()


TAGS = {"weight": "wght", "optical size": "opsz", "opticalsize": "opsz"}


def font(data, size, axes=None):
    f = ImageFont.truetype(io.BytesIO(data), size)
    if axes:
        values = []
        for a in f.get_variation_axes():
            name = a.get("name", b"")
            name = (name.decode() if isinstance(name, bytes) else name).lower()
            values.append(axes.get(TAGS.get(name, name), a["default"]))
        f.set_variation_by_axes(values)
    return f


def on_white(path):
    """The badge and wordmark are transparent PNGs (for dark mode); flatten
    them onto white, not the black that convert('RGB') would leave."""
    im = Image.open(path).convert("RGBA")
    return Image.alpha_composite(Image.new("RGBA", im.size, "white"), im).convert("RGB")


def paw(draw, cx, cy, s, fill):
    """A paw print: one pad and four toes. Generic art."""
    draw.ellipse([cx - 0.44 * s, cy - 0.05 * s, cx + 0.44 * s, cy + 0.66 * s], fill=fill)
    for dx, dy, r in [(-0.62, -0.28, 0.2), (-0.24, -0.62, 0.21), (0.24, -0.62, 0.21), (0.62, -0.28, 0.2)]:
        draw.ellipse([cx + (dx - r) * s, cy + (dy - r * 1.25) * s, cx + (dx + r) * s, cy + (dy + r * 1.25) * s], fill=fill)


def newsroom():
    """The newsroom entry, as the site sees it, via node (the module is pure data)."""
    js = (
        "import('./src/newsrooms.js').then((m) => { const k = process.env.VITE_NEWSROOM || m.DEFAULT_NEWSROOM;"
        " if (!m.NEWSROOMS[k]) throw new Error('unknown newsroom ' + k); console.log(JSON.stringify(m.NEWSROOMS[k])) })"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def hex_rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def palette(theme):
    """Role tokens from tokens.css: the root block, then the newsroom's theme block over it."""
    css = (ROOT / "src" / "styles" / "tokens.css").read_text(encoding="utf8")

    def block(selector):
        m = re.search(re.escape(selector) + r"\s*\{(.*?)\}", css, re.S)
        return dict(re.findall(r"--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;", m.group(1))) if m else {}

    t = block(":root")
    if theme:
        t.update(block(f":root[data-theme='{theme}']"))
    pick = lambda name, fallback: hex_rgb(t[name]) if name in t else fallback
    return {
        "deep": pick("brand-deep", TEAL_DEEP),
        "brand": pick("brand", TEAL),
        "accent": pick("accent", SUN),
        "cream": pick("cream", CREAM),
        "tint": pick("brand-tint", MINT),
    }


def wrap(text, f, width):
    lines, cur = [], ""
    for w in text.split():
        t = f"{cur} {w}".strip()
        if cur and f.getlength(t) > width:
            lines.append(cur)
            cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def main():
    paper = newsroom()
    c = palette(paper.get("theme"))
    display = fetch(DISPLAY)
    sans = fetch(PUBLIC_SANS)

    img = Image.new("RGB", (1200, 630), c["deep"])
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, 1200, 10], fill=c["accent"])

    # Faint paw trail across the right side.
    for i in range(6):
        x = 760 + i * 80
        y = 560 - i * 92 + (22 if i % 2 else -22)
        paw(d, x, y, 34, (255, 255, 255, 22))
    # A big friendly paw.
    paw(d, 985, 300, 150, c["accent"] + (255,))

    kicker = font(sans, 25, {"wght": 800})
    d.text((78, 88), f"{paper['name'].upper()}  ·  READER CONTEST", font=kicker, fill=c["accent"])

    # "Cutest Pet / in Marathon / County": the region wrapped to the room left of the paw.
    size = 92
    head = font(display, size, {"opsz": 96, "wght": 650})
    lines = ["Cutest Pet"] + wrap(f"in {paper['region']}", head, 640)
    if len(lines) > 3:
        size = 76
        head = font(display, size, {"opsz": 96, "wght": 650})
        lines = ["Cutest Pet"] + wrap(f"in {paper['region']}", head, 660)
    for i, line in enumerate(lines):
        d.text((72, 128 + i * (size + 6)), line, font=head, fill="white")

    sub = font(sans, 30, {"wght": 400})
    d.text((78, 446), "Enter free. Vote packs help local animal shelters.", font=sub, fill=c["tint"])

    # The flag on a white chip, bottom left: badge and wordmark when the
    # newsroom has them, else its name in the display face.
    pad = 14
    if paper.get("badge") and paper.get("wordmark"):
        badge = on_white(PUBLIC / Path(paper["badge"]).name).resize((64, 64), Image.LANCZOS)
        word = on_white(PUBLIC / Path(paper["wordmark"]).name)
        ww = 300
        wh = round(word.height * ww / word.width)
        word = word.resize((ww, wh), Image.LANCZOS)
        chip_w, chip_h = 64 + 14 + ww + pad * 2, 64 + pad * 2
        chip = Image.new("RGB", (chip_w, chip_h), "white")
        chip.paste(badge, (pad, pad))
        chip.paste(word, (pad + 64 + 14, pad + (64 - wh) // 2))
    else:
        name_font = font(display, 36, {"opsz": 36, "wght": 650})
        tw = round(name_font.getlength(paper["name"]))
        chip_w, chip_h = tw + pad * 2 + 12, 64 + pad * 2
        chip = Image.new("RGB", (chip_w, chip_h), "white")
        ImageDraw.Draw(chip).text((pad + 6, pad + 10), paper["name"], font=name_font, fill=c["deep"])
    mask = Image.new("L", chip.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, chip_w, chip_h], radius=12, fill=255)
    img.paste(chip, (78, 630 - chip_h - 30), mask)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB) for {paper['name']}")


if __name__ == "__main__":
    main()
