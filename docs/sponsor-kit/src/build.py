"""Build the sponsor kit's self-contained pages.

Reads src/*.template.html, embeds images as data URIs, and writes the pages
one level up (docs/sponsor-kit/). Run after editing a template or reshooting
the mock-ups:

    python docs/sponsor-kit/src/build.py

  {{img:NAME}}    assets/mockup-NAME.png, embedded as WebP (smaller page)
  {{asset:FILE}}  assets/FILE, embedded as is

Needs Pillow (pip install pillow).
"""

import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image

KIT = Path(__file__).resolve().parent.parent
ASSETS = KIT / "assets"
PAGES = {"index.template.html": "index.html", "leave-behind.template.html": "leave-behind.html"}
MAX_WIDTH = 2000  # mock-ups are shot at 2x; nothing on the page shows wider than ~1030 CSS px


def webp_uri(name: str) -> str:
    path = ASSETS / f"mockup-{name}.png"
    img = Image.open(path).convert("RGB")
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=82, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def asset_uri(name: str) -> str:
    path = ASSETS / name
    mime = {"png": "image/png", "jpg": "image/jpeg", "svg": "image/svg+xml"}[path.suffix[1:].lower()]
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def build(template: str, out: str) -> None:
    src = (KIT / "src" / template).read_text(encoding="utf-8")
    html = re.sub(r"\{\{img:([\w-]+)\}\}", lambda m: webp_uri(m.group(1)), src)
    html = re.sub(r"\{\{asset:([\w.-]+)\}\}", lambda m: asset_uri(m.group(1)), html)
    left = re.findall(r"\{\{[^}]+\}\}", html)
    if left:
        sys.exit(f"{template}: unresolved {left}")
    (KIT / out).write_text(html, encoding="utf-8")
    print(f"{out}: {len(html.encode()) / 1e6:.2f} MB")


if __name__ == "__main__":
    for template, out in PAGES.items():
        if (KIT / "src" / template).exists():
            build(template, out)
