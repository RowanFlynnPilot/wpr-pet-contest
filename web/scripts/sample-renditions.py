"""Pre-rendered widths of the sample pet photos, for hosts with no render
endpoint (the demo, the Node mock). Writes public/sample-pets/w<W>/<n>.jpg for
each width in WIDTHS from the 800px squares; the app asks for them when
VITE_STORAGE_RENDITIONS names the widths (see src/lib/photos.js).

    python web/scripts/sample-renditions.py
"""
from pathlib import Path
from PIL import Image

WIDTHS = (160, 320)
ROOT = Path(__file__).resolve().parents[1] / "public" / "sample-pets"

total = 0
for src in sorted(ROOT.glob("*.jpg"), key=lambda p: int(p.stem)):
    im = Image.open(src).convert("RGB")
    for w in WIDTHS:
        out = ROOT / f"w{w}" / src.name
        out.parent.mkdir(exist_ok=True)
        small = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        small.save(out, "JPEG", quality=75, optimize=True, progressive=True)
        total += out.stat().st_size
print(f"{len(WIDTHS) * len(list(ROOT.glob('*.jpg')))} renditions, {total // 1024} KB")
