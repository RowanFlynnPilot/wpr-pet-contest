# Per-pet share cards: dist/p/<id>/card.png, the image Facebook, X and
# Messages show when someone shares a pet's link. build-share-pages.mjs writes
# the manifest and calls this with it:
#
#   python scripts/pet-cards.py dist/p/manifest.json dist/p
#
# The whole photo, never cropped: a phone photo is tall and a link preview is
# wide (1200x630), so a crop cuts the pet's head off. The photo sits contained
# in a frame filled with a blurred copy of itself. Needs Pillow and the
# network (brand faces as og-card.py, the photos). A photo that will not load
# gets a placeholder; a card that fails leaves its page on the plain photo.
import importlib.util
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("og_card", HERE / "og-card.py")
og = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(og)

W, H = 1200, 630
FRAME = (56, 56, 56 + 560, H - 56)   # the photo's frame: x0, y0, x1, y1
RADIUS = 26
COL = 670                            # the words' left edge
COL_W = W - COL - 64


def rounded_mask(w, h, radius):
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w, h], radius=radius, fill=255)
    return mask


def load_photo(url):
    try:
        im = Image.open(io.BytesIO(og.fetch(url)))
        return ImageOps.exif_transpose(im).convert("RGB")
    except Exception as e:  # noqa: BLE001 - any failure means a placeholder
        print(f"[pet-cards] placeholder for {url}: {e}", file=sys.stderr)
        return None


def framed(im, w, h):
    """The whole photo inside w x h, over a blurred, darkened cover of itself."""
    if im is None:
        ph = Image.new("RGB", (w, h), og.MINT)
        og.paw(ImageDraw.Draw(ph), w / 2, h / 2 - 10, min(w, h) * 0.22, og.TEAL)
        return ph
    back = ImageOps.fit(im, (w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(28))
    back = Image.blend(back, Image.new("RGB", (w, h), og.TEAL_DEEP), 0.35)
    fit = ImageOps.contain(im, (w, h), Image.LANCZOS)
    back.paste(fit, ((w - fit.width) // 2, (h - fit.height) // 2))
    return back


def fit_font(draw, text, data, size, max_w, axes, floor):
    while True:
        f = og.font(data, size, axes)
        if draw.textlength(text, font=f) <= max_w or size <= floor:
            return f
        size -= 2


def name_lines(draw, name, data):
    """The pet's name as big as fits: one line from 104 down to 64, else two."""
    axes = {"wght": 800}
    for size in range(104, 62, -4):
        f = og.font(data, size, axes)
        if draw.textlength(name, font=f) <= COL_W:
            return f, [name]
    for size in range(76, 40, -4):
        f = og.font(data, size, axes)
        lines = og.wrap(name, f, COL_W)
        if len(lines) <= 2 and all(draw.textlength(l, font=f) <= COL_W for l in lines):
            return f, lines
    f = og.font(data, 40, axes)
    return f, og.wrap(name, f, COL_W)[:2]


def card(spec, display, sans, badge):
    img = Image.new("RGB", (W, H), og.TEAL_DEEP)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, W, 10], fill=og.SUN)

    x0, y0, x1, y1 = FRAME
    fw, fh = x1 - x0, y1 - y0
    img.paste(framed(load_photo(spec["photo"]), fw, fh), (x0, y0), rounded_mask(fw, fh, RADIUS))

    y = 92
    kicker = og.font(sans, 24, {"wght": 800})
    d.text((COL, y), "V O T E   F O R", font=kicker, fill=og.SUN)
    y += 46
    f, lines = name_lines(d, spec["pet_name"], display)
    for line in lines:
        d.text((COL, y), line, font=f, fill="white")
        y += int(f.size * 1.02)
    y += 14
    sub = " · ".join(p for p in [spec.get("town"), spec.get("species")] if p)
    if sub:
        sf = fit_font(d, sub, sans, 32, COL_W, {"wght": 600}, 22)
        d.text((COL, y), sub, font=sf, fill=og.MINT)
        y += 52

    # The contest and the shelters, anchored to the bottom of the column.
    money = spec.get("money") or ""
    mf = og.font(sans, 22, {"wght": 500})
    money_lines = og.wrap(money, mf, COL_W)[:2]
    contest = spec.get("contest") or "Cutest Pet in Marathon County"
    cf = fit_font(d, contest, display, 32, COL_W - 76, {"wght": 800}, 22)
    bottom = y1
    for line in reversed(money_lines):
        bottom -= 30
        d.text((COL, bottom), line, font=mf, fill=og.MINT)
    bottom -= 18
    seal = 60
    if badge is not None:
        disc = Image.new("RGB", (seal, seal), "white")
        b = ImageOps.contain(badge, (seal - 8, seal - 8), Image.LANCZOS)
        disc.paste(b, ((seal - b.width) // 2, (seal - b.height) // 2))
        mask = Image.new("L", (seal, seal), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, seal, seal], fill=255)
        img.paste(disc, (COL, bottom - seal), mask)
    d.text((COL + seal + 16, bottom - seal / 2 - 14), contest, font=cf, fill="white", anchor="lm")
    d.text((COL + seal + 16, bottom - seal / 2 + 18), "Wausau Pilot & Review", font=og.font(sans, 20, {"wght": 600}), fill=og.MINT, anchor="lm")
    d.line([COL, bottom - seal - 22, W - 64, bottom - seal - 22], fill=(255, 255, 255, 60), width=2)
    return img


def main(manifest_path, out_dir):
    specs = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    if not specs:
        print("[pet-cards] nothing to draw")
        return 0
    display = og.fetch(og.DISPLAY)
    sans = og.fetch(og.PUBLIC_SANS)
    try:
        badge = og.on_white(og.PUBLIC / "wpr-typewriter-badge.png")
    except Exception:  # noqa: BLE001 - a card without the seal is still a card
        badge = None
    out = Path(out_dir)
    failed = 0
    for spec in specs:
        try:
            dest = out / spec["id"] / "card.jpg"
            dest.parent.mkdir(parents=True, exist_ok=True)
            card(spec, display, sans, badge).save(dest, "JPEG", quality=86, optimize=True, progressive=True)
        except Exception as e:  # noqa: BLE001 - one bad card must not stop the rest
            failed += 1
            print(f"[pet-cards] {spec.get('id')}: {e}", file=sys.stderr)
    print(f"[pet-cards] wrote {len(specs) - failed} of {len(specs)} cards under {out}")
    return 1 if failed else 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: pet-cards.py <manifest.json> <out-dir>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
