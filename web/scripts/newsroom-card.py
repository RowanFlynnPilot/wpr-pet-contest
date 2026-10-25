# The share card for the page for other newsrooms (docs/newsroom-kit), a
# 1200x630 og:image, so a link to /for-newsrooms/ unfurls with a picture.
# One-time asset; rerun after changing the page's headline:
#     python web/scripts/newsroom-card.py
# Shares og-card.py's faces and helpers (the brand fonts come from the Google
# Fonts repo at run time; the badge and wordmark are the committed copies).
import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("og_card", HERE / "og-card.py")
og = importlib.util.module_from_spec(spec)
spec.loader.exec_module(og)

OUT = HERE.parent.parent / "docs" / "newsroom-kit" / "img" / "og-card.png"


def main():
    fraunces = og.fetch(og.FRAUNCES)
    fraunces_italic = og.fetch(og.FRAUNCES_ITALIC)
    sans = og.fetch(og.PUBLIC_SANS)

    img = Image.new("RGB", (1200, 630), og.CREAM)
    d = ImageDraw.Draw(img, "RGBA")
    # The newspaper's thick-over-thin rule, in the typewriter teal.
    d.rectangle([0, 0, 1200, 8], fill=og.TEAL_DEEP)
    d.rectangle([0, 13, 1200, 14], fill=og.TEAL_DEEP)

    for i in range(5):
        og.paw(d, 820 + i * 82, 575 - i * 96 + (20 if i % 2 else -20), 32, og.TEAL + (28,))
    og.paw(d, 990, 290, 150, og.SUN + (255,))

    kicker = og.font(sans, 24, {"wght": 800})
    d.text((78, 74), "A READER CONTEST, FOR LOCAL NEWSROOMS", font=kicker, fill=og.TEAL)

    head = og.font(fraunces, 84, {"opsz": 144, "wght": 650})
    italic = og.font(fraunces_italic, 84, {"opsz": 144, "wght": 500})
    x, y = 72, 118
    d.text((x, y), "The ", font=head, fill=og.TEAL_DEEP)
    x2 = x + head.getlength("The ")
    d.text((x2, y), "cutest", font=italic, fill=og.TEAL)
    d.text((x2 + italic.getlength("cutest"), y), " pet in", font=head, fill=og.TEAL_DEEP)
    d.text((72, 208), "your county, and", font=head, fill=og.TEAL_DEEP)
    d.text((72, 298), "the money it raises", font=head, fill=og.TEAL_DEEP)

    sub = og.font(sans, 29, {"wght": 400})
    d.text((78, 426), "Built and run by Wausau Pilot & Review. Ready for another town.", font=sub, fill=(58, 58, 58))

    badge = Image.open(og.PUBLIC / "wpr-typewriter-badge.png").convert("RGB").resize((64, 64), Image.LANCZOS)
    word = Image.open(og.PUBLIC / "wpr-wordmark.png").convert("RGB")
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

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
