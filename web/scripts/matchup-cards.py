# Matchup share cards: dist/m/<id>/card.png, one per head-to-head matchup in a
# round that is open or about to open. build-share-pages.mjs writes the
# manifest and calls this with it:
#
#   python scripts/matchup-cards.py dist/m/manifest.json dist/m
#
# Needs Pillow and the network, for the brand faces (same source as
# og-card.py) and the pets' photos. A photo that will not load gets a
# placeholder, so the card is produced regardless; the only way to get no card
# is for Pillow or the fonts to be missing, and then the page falls back to a
# single photo.
import importlib.util
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("og_card", HERE / "og-card.py")
og = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(og)

W, H = 1200, 630
PHOTO = 380           # each pet's square
TOP = 104             # the photos' top edge
LEFT, RIGHT = 90, W - 90 - PHOTO
RADIUS = 28


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
    return mask


def photo(url, size):
    try:
        im = Image.open(io.BytesIO(og.fetch(url)))
        im = ImageOps.exif_transpose(im).convert("RGB")
        return ImageOps.fit(im, (size, size), Image.LANCZOS)
    except Exception as e:  # noqa: BLE001 - any failure means a placeholder
        print(f"[matchup-cards] placeholder for {url}: {e}", file=sys.stderr)
        ph = Image.new("RGB", (size, size), og.MINT)
        og.paw(ImageDraw.Draw(ph), size / 2, size / 2 - 10, size * 0.28, og.TEAL)
        return ph


def fit(draw, text, data, size, max_w, axes, floor=20):
    """The largest size at or under `size` at which `text` fits in `max_w`."""
    while True:
        f = og.font(data, size, axes)
        if draw.textlength(text, font=f) <= max_w or size <= floor:
            return f
        size -= 2


def card(spec, fraunces, sans):
    img = Image.new("RGB", (W, H), og.TEAL_DEEP)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, W, 10], fill=og.SUN)

    kicker_text = f"WAUSAU PILOT & REVIEW  ·  {spec['contest'].upper()}"
    kicker = fit(d, kicker_text, sans, 22, W - 2 * 78, {"wght": 800})
    d.text((78, 42), kicker_text, font=kicker, fill=og.SUN)

    mask = rounded_mask(PHOTO, RADIUS)
    for side, x in ((spec["a"], LEFT), (spec["b"], RIGHT)):
        img.paste(photo(side["photo"], PHOTO), (x, TOP), mask)
        if side.get("seed") is not None:
            pill_font = og.font(sans, 22, {"wght": 800})
            label = f"No. {side['seed']}"
            w = d.textlength(label, font=pill_font)
            d.rounded_rectangle([x + 14, TOP + 14, x + 14 + w + 28, TOP + 14 + 36], radius=18, fill=og.SUN)
            d.text((x + 28, TOP + 14 + 18), label, font=pill_font, fill=og.TEAL_DEEP, anchor="lm")
        cx = x + PHOTO / 2
        name = fit(d, side["pet_name"], fraunces, 44, PHOTO + 60, {"opsz": 72, "wght": 650})
        d.text((cx, TOP + PHOTO + 40), side["pet_name"], font=name, fill="white", anchor="mm")
        if side.get("town"):
            town = fit(d, side["town"], sans, 22, PHOTO + 60, {"wght": 500})
            d.text((cx, TOP + PHOTO + 84), side["town"], font=town, fill=og.MINT, anchor="mm")

    # The "VS" disc between the photos.
    cy = TOP + PHOTO / 2
    d.ellipse([W / 2 - 58, cy - 58, W / 2 + 58, cy + 58], fill=og.CREAM)
    d.text((W / 2, cy + 2), "VS", font=og.font(fraunces, 48, {"opsz": 72, "wght": 700}), fill=og.TEAL_DEEP, anchor="mm")

    line_text = f"{spec['round']}  ·  Voting closes {spec['closes']}"
    line = fit(d, line_text, sans, 26, W - 2 * 60, {"wght": 600})
    d.text((W / 2, H - 30), line_text, font=line, fill=og.MINT, anchor="mm")
    return img


def main(manifest_path, out_dir):
    specs = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    if not specs:
        print("[matchup-cards] nothing to draw")
        return 0
    fraunces = og.fetch(og.DISPLAY)
    sans = og.fetch(og.PUBLIC_SANS)
    out = Path(out_dir)
    failed = 0
    for spec in specs:
        try:
            dest = out / spec["id"] / "card.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            card(spec, fraunces, sans).save(dest, "PNG", optimize=True)
        except Exception as e:  # noqa: BLE001 - one bad card must not stop the rest
            failed += 1
            print(f"[matchup-cards] {spec.get('id')}: {e}", file=sys.stderr)
    print(f"[matchup-cards] wrote {len(specs) - failed} of {len(specs)} cards under {out}")
    return 1 if failed else 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: matchup-cards.py <manifest.json> <out-dir>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
