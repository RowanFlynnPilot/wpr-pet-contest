# Generates public/og-card.png, the 1200x630 default share card (og:image).
# One-time asset; rerun after a branding change:  npm run og-card
# Downloads the brand faces from the Google Fonts repo at run time and uses the
# committed badge and wordmark from public/, so nothing depends on WordPress
# uploads (a CDN move broke those once).
import io
import math
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = PUBLIC / "og-card.png"

TEAL_DEEP = (31, 75, 69)
TEAL = (58, 134, 124)
SUN = (244, 185, 66)
CREAM = (246, 242, 233)
MINT = (214, 230, 226)

FRAUNCES = "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
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


def paw(draw, cx, cy, s, fill):
    """A paw print: one pad and four toes. Generic art."""
    draw.ellipse([cx - 0.44 * s, cy - 0.05 * s, cx + 0.44 * s, cy + 0.66 * s], fill=fill)
    for dx, dy, r in [(-0.62, -0.28, 0.2), (-0.24, -0.62, 0.21), (0.24, -0.62, 0.21), (0.62, -0.28, 0.2)]:
        draw.ellipse([cx + (dx - r) * s, cy + (dy - r * 1.25) * s, cx + (dx + r) * s, cy + (dy + r * 1.25) * s], fill=fill)


def main():
    fraunces = fetch(FRAUNCES)
    sans = fetch(PUBLIC_SANS)

    img = Image.new("RGB", (1200, 630), TEAL_DEEP)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, 1200, 10], fill=SUN)

    # Faint paw trail across the right side.
    for i in range(6):
        x = 760 + i * 80
        y = 560 - i * 92 + (22 if i % 2 else -22)
        paw(d, x, y, 34, (255, 255, 255, 22))
    # A big friendly paw.
    paw(d, 985, 300, 150, SUN + (255,))

    kicker = font(sans, 25, {"wght": 800})
    d.text((78, 88), "WAUSAU PILOT & REVIEW  ·  READER CONTEST", font=kicker, fill=SUN)

    head = font(fraunces, 92, {"opsz": 144, "wght": 650})
    d.text((72, 128), "Cutest Pet", font=head, fill="white")
    d.text((72, 226), "in Marathon", font=head, fill="white")
    d.text((72, 324), "County", font=head, fill="white")

    sub = font(sans, 30, {"wght": 400})
    d.text((78, 446), "Enter free. Vote packs help local animal shelters.", font=sub, fill=MINT)

    # Badge and wordmark on a white chip, bottom left.
    badge = Image.open(PUBLIC / "wpr-typewriter-badge.png").convert("RGB").resize((64, 64), Image.LANCZOS)
    word = Image.open(PUBLIC / "wpr-wordmark.png").convert("RGB")
    ww = 300
    wh = round(word.height * ww / word.width)
    word = word.resize((ww, wh), Image.LANCZOS)
    pad = 14
    chip_w, chip_h = 64 + 14 + ww + pad * 2, 64 + pad * 2
    chip = Image.new("RGB", (chip_w, chip_h), "white")
    chip.paste(badge, (pad, pad))
    chip.paste(word, (pad + 64 + 14, pad + (64 - wh) // 2))
    mask = Image.new("L", chip.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, chip_w, chip_h], radius=12, fill=255)
    img.paste(chip, (78, 630 - chip_h - 30), mask)

    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
