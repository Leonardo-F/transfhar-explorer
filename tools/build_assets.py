"""Regenerate web assets from the source paper and vendor files.

This script is only needed when the source assets change; the site and
build_offline.py consume the generated files. Requirements:

  * Python 3.9+ with Pillow (for image re-encoding)
  * pdftoppm / pdfinfo from poppler (for paper page rasterisation)

Usage:
  python3 tools/build_assets.py            # regenerate everything
  python3 tools/build_assets.py pages      # only paper page WebPs
  python3 tools/build_assets.py figures    # only figure crops
  python3 tools/build_assets.py katex      # only the lean KaTeX CSS + font files

The page screenshots are rendered from assets/paper.pdf at 120 DPI, cropped
to their content bounds and encoded as WebP q60; the figure crops are
re-encoded from PNG to WebP q92. The KaTeX stylesheet is split into a lean
CSS file that references external woff2 files and drops the font families
the course never uses (Fraktur, SansSerif, Script, Typewriter).
"""
from __future__ import annotations

import base64
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED_FAMILIES = {
    "KaTeX_Fraktur",
    "KaTeX_SansSerif",
    "KaTeX_Script",
    "KaTeX_Typewriter",
}


def build_pages() -> None:
    pdf = ROOT / "assets" / "paper.pdf"
    out = ROOT / "assets" / "pages"
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="transfhar-pages-") as tmp:
        subprocess.run(
            ["pdftoppm", "-png", "-r", "120", str(pdf), str(Path(tmp) / "page")],
            check=True,
        )
        files = sorted(Path(tmp).glob("page-*.png"))
        if len(files) != 16:
            raise SystemExit(f"expected 16 PDF pages, rendered {len(files)}")
        total = 0
        for src in files:
            page = int(src.stem.split("-")[-1])
            image = Image.open(src).convert("RGB")
            bounds = ImageChops.difference(
                image, Image.new("RGB", image.size, (255, 255, 255))
            ).getbbox()
            if bounds:
                pad = 24
                image = image.crop(
                    (
                        max(0, bounds[0] - pad),
                        max(0, bounds[1] - pad),
                        min(image.width, bounds[2] + pad),
                        min(image.height, bounds[3] + pad),
                    )
                )
            dst = out / f"page-{page:02}.webp"
            image.save(dst, "WEBP", quality=60, method=6)
            total += dst.stat().st_size
        print(f"pages: {len(files)} files, {total / 1048576:.2f} MB")


def build_figures() -> None:
    total_in = total_out = 0
    for i in range(1, 9):
        src = ROOT / "assets" / f"fig{i}.png"
        dst = ROOT / "assets" / f"fig{i}.webp"
        image = Image.open(src).convert("RGB")
        image.save(dst, "WEBP", quality=92, method=6)
        total_in += src.stat().st_size
        total_out += dst.stat().st_size
    print(f"figures: {total_in / 1024:.0f} KB -> {total_out / 1024:.0f} KB")


def build_katex() -> None:
    css_path = ROOT / "vendor" / "katex-embedded.css"
    css = css_path.read_text("utf8")
    fonts_dir = ROOT / "vendor" / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)

    blocks = re.findall(r"@font-face\{[^}]*\}", css)
    if len(blocks) < 10:
        raise SystemExit(f"unexpected @font-face count: {len(blocks)}")

    kept = 0
    dropped = 0
    written: dict[str, str] = {}
    lean = css
    for block in blocks:
        family = re.search(r'font-family:\s*"?([A-Za-z_0-9]+)"?', block).group(1)
        if family in EXCLUDED_FAMILIES:
            lean = lean.replace(block, "", 1)
            dropped += 1
            continue
        weight = re.search(r"font-weight:(\d+)", block).group(1)
        style = re.search(r"font-style:(\w+)", block).group(1)
        data = re.search(r"url\(data:font/woff2;base64,([^)]+)\)", block).group(1)
        name = f"{family}-{weight}-{style}.woff2"
        (fonts_dir / name).write_bytes(base64.b64decode(data))
        lean = lean.replace(
            block,
            block.replace(
                re.search(r"src:url\([^)]*\)", block).group(0),
                f'src:url(fonts/{name})',
            ),
            1,
        )
        written[name] = data
        kept += 1

    (ROOT / "vendor" / "katex-embedded.lean.css").write_text(lean, "utf8")
    print(
        f"katex: kept {kept} faces, dropped {dropped}; "
        f"css {len(css) / 1024:.0f} KB -> {len(lean) / 1024:.0f} KB, "
        f"{len(written)} woff2 files written"
    )


def main() -> None:
    targets = sys.argv[1:] or ["pages", "figures", "katex"]
    if "pages" in targets:
        build_pages()
    if "figures" in targets:
        build_figures()
    if "katex" in targets:
        build_katex()


if __name__ == "__main__":
    main()
