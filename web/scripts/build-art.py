"""Turns the owner's painted source PNGs into the shipped WebP art of the result page.

One-off tool, run by hand when the sources change (they are not committed):

    python web/scripts/build-art.py [source-dir]

Needs Python 3 with Pillow (with WebP support); it is not a dependency of the web app. The source
directory defaults to .work/art-src/ and holds tiles/, icons/, ornaments/ and props/ (1254 x 1254
PNGs with real transparency, the divider 2172 x 724). Each image is trimmed to the bounds of its
visible pixels (alpha above ALPHA_FLOOR, so a faint halo at the canvas edge does not hold the
bounds open), scaled to fit its group's box, and written as web/client/public/art/<group>-<name>.webp.
The script prints each file's size and fails when one passes FILE_BUDGET or all pass TOTAL_BUDGET.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "web" / "client" / "public" / "art"

# Box each group is scaled to fit (longest side, px), and the WebP quality.
GROUPS: dict[str, tuple[str, int, int]] = {
    # source folder: (output prefix, box, quality)
    "icons": ("icon", 96, 82),
    "tiles": ("tile", 192, 80),
    "ornaments": ("orn", 256, 82),
    "props": ("prop", 320, 78),
}
# The divider is a long thin line: its box is its width.
WIDE = {"divider": 512}
ALPHA_FLOOR = 12
# The four mirrored frame corners: 128 px serves a 64 CSS px corner at 2x.
CORNER_BOX = 128
# The page continuation below the first screen (deep_tile): its width and how dark it is kept.
DEEP_WIDTH = 1200
DEEP_LIGHT = 0.62
FILE_BUDGET = 60 * 1024
TOTAL_BUDGET = 900 * 1024


def trim(im: Image.Image) -> Image.Image:
    alpha = im.getchannel("A").point(lambda a: 255 if a > ALPHA_FLOOR else 0)
    box = alpha.getbbox()
    return im if box is None else im.crop(box)


def fit(im: Image.Image, box: int) -> Image.Image:
    scale = box / max(im.size)
    if scale >= 1:
        return im
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    return im.resize(size, Image.Resampling.LANCZOS)


def deep_tile(backdrop: Path) -> Image.Image:
    """The page below the first screen: the backdrop's own lower band (fog over the ground, no moon or
    chapel), darkened and softened, stacked on its mirror image so it repeats down the page without a
    seam. Derived from the shipped backdrop.webp, so it needs no source file."""
    im = Image.open(backdrop).convert("RGB")
    band = im.crop((0, round(im.height * 0.66), im.width, round(im.height * 0.97)))
    band = band.resize((DEEP_WIDTH, round(band.height * DEEP_WIDTH / band.width)), Image.Resampling.LANCZOS)
    band = band.filter(ImageFilter.GaussianBlur(1.2)).point(lambda v: round(v * DEEP_LIGHT))
    tile = Image.new("RGB", (band.width, band.height * 2))
    tile.paste(band, (0, 0))
    tile.paste(band.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, band.height))
    return tile


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / ".work" / "art-src"
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    over: list[str] = []
    for folder, (prefix, box, quality) in GROUPS.items():
        for png in sorted((src / folder).glob("*.png")):
            im = Image.open(png).convert("RGBA")
            im = fit(trim(im), WIDE.get(png.stem, box))
            out = OUT / f"{prefix}-{png.stem}.webp"
            im.save(out, "WEBP", quality=quality, method=6, alpha_quality=90)
            size = out.stat().st_size
            total += size
            if size > FILE_BUDGET:
                over.append(out.name)
            print(f"{out.relative_to(REPO).as_posix()}  {im.width}x{im.height}  {size / 1024:.1f} KB")
            if png.stem == "corner":
                # The frame needs all four corners; CSS cannot mirror one background layer, so the
                # other three are written pre-mirrored at the size the frames use (up to 64 CSS px).
                small = fit(trim(Image.open(png).convert("RGBA")), CORNER_BOX)
                for suffix, flips in (("tl", ()), ("tr", ("x",)), ("bl", ("y",)), ("br", ("x", "y"))):
                    c = small
                    if "x" in flips:
                        c = c.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                    if "y" in flips:
                        c = c.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
                    cout = OUT / f"orn-corner-{suffix}.webp"
                    c.save(cout, "WEBP", quality=quality, method=6, alpha_quality=90)
                    csize = cout.stat().st_size
                    total += csize
                    if csize > FILE_BUDGET:
                        over.append(cout.name)
                    print(f"{cout.relative_to(REPO).as_posix()}  {c.width}x{c.height}  {csize / 1024:.1f} KB")
    deep = OUT / "backdrop-deep.webp"
    deep_tile(OUT / "backdrop.webp").save(deep, "WEBP", quality=68, method=6)
    dsize = deep.stat().st_size
    total += dsize
    if dsize > FILE_BUDGET:
        over.append(deep.name)
    print(f"{deep.relative_to(REPO).as_posix()}  {dsize / 1024:.1f} KB")
    print(f"total {total / 1024:.0f} KB")
    if over or total > TOTAL_BUDGET:
        print(f"over budget: {', '.join(over) or f'total above {TOTAL_BUDGET // 1024} KB'}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
