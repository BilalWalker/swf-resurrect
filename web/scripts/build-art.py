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

from PIL import Image, ImageDraw, ImageFilter

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
# The side pillar (pillar_pieces): shaft x range at each joining edge, measured on the 1024 px sources;
# the middle's scale; the shared canvas (the base, the widest piece, fits it centred on its shaft);
# the shipped width (2x of the 170 CSS px the page draws) and how dark it is kept.
PILLAR_SHAFT = {"top": (338, 655), "middle": (318, 705), "base": (337, 660)}
PILLAR_MIDDLE_SCALE = 0.82
PILLAR_CANVAS = 940
PILLAR_WIDTH = 340
PILLAR_LIGHT = 0.6
# Height, on the 940 px canvas, of the dark band at the top of the middle and the base (the joins).
PILLAR_BAND = 14
# The moon-phase row's surface (moon_disc): a crater patch of tiles/moon.png, and its size.
MOON_DISC = (655, 415, 150)
MOON_DISC_SIZE = 64
FILE_BUDGET = 60 * 1024
TOTAL_BUDGET = 1100 * 1024


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


def pillar_pieces(src: Path) -> dict[str, Image.Image]:
    """The side pillar: top (with the gargoyle), middle (repeated down the page) and base. Each piece is
    put on a canvas of one shared width centred on its own shaft, so stacked in CSS the shafts line up.
    The middle's shaft is wider in the art (387 px against 317 and 323 at the joins), so it is scaled to
    82 %. All three are darkened so the pillars sit behind the content; their green light stays."""
    out: dict[str, Image.Image] = {}
    for name in ("top", "middle", "base"):
        im = Image.open(src / "pillar" / f"{name}.png").convert("RGBA")
        lo, hi = PILLAR_SHAFT[name]
        if name == "middle":
            im = im.resize((round(im.width * PILLAR_MIDDLE_SCALE), round(im.height * PILLAR_MIDDLE_SCALE)), Image.Resampling.LANCZOS)
            lo, hi = lo * PILLAR_MIDDLE_SCALE, hi * PILLAR_MIDDLE_SCALE
        centre = (lo + hi) / 2
        alpha = im.getchannel("A").point(lambda a: 255 if a > ALPHA_FLOOR else 0)
        box = alpha.getbbox() or (0, 0, im.width, im.height)
        canvas = Image.new("RGBA", (PILLAR_CANVAS, box[3] - box[1]), (0, 0, 0, 0))
        canvas.paste(im.crop((0, box[1], im.width, box[3])), (round(PILLAR_CANVAS / 2 - centre), 0))
        r, g, b, a = canvas.split()
        dim = lambda v: round(v * PILLAR_LIGHT)
        canvas = Image.merge("RGBA", (r.point(dim), g.point(dim), b.point(dim), a))
        if name != "top":
            # A thin dark stone band along the top edge covers the join with the piece above.
            band = canvas.crop((0, 0, canvas.width, PILLAR_BAND))
            br, bg, bb, ba = band.split()
            shade = lambda v: round(v * 0.28)
            canvas.paste(Image.merge("RGBA", (br.point(shade), bg.point(shade), bb.point(shade), ba)), (0, 0))
        scale = PILLAR_WIDTH / PILLAR_CANVAS
        out[name] = canvas.resize((PILLAR_WIDTH, round(canvas.height * scale)), Image.Resampling.LANCZOS)
    return out


def moon_disc(tile: Path) -> Image.Image:
    """The surface of the moon-phase row's moons: a crater-only patch of the painted moon (centre and
    radius on the 1254 px tile, inside the disc, clear of its rim and of the cloud wisps over its
    lower half, which cluttered the moons at 22 px), masked to a circle, MOON_DISC_SIZE px."""
    im = Image.open(tile).convert("RGBA")
    cx, cy, r = MOON_DISC
    disc = im.crop((cx - r, cy - r, cx + r, cy + r)).resize((MOON_DISC_SIZE * 4, MOON_DISC_SIZE * 4), Image.Resampling.LANCZOS)
    mask = Image.new("L", disc.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, disc.width - 1, disc.height - 1), fill=255)
    disc.putalpha(mask)
    return disc.resize((MOON_DISC_SIZE, MOON_DISC_SIZE), Image.Resampling.LANCZOS)


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
    if (src / "pillar").is_dir():
        for name, im in pillar_pieces(src).items():
            out = OUT / f"pillar-{name}.webp"
            im.save(out, "WEBP", quality=76, method=6, alpha_quality=88)
            size = out.stat().st_size
            total += size
            if size > FILE_BUDGET:
                over.append(out.name)
            print(f"{out.relative_to(REPO).as_posix()}  {im.width}x{im.height}  {size / 1024:.1f} KB")
    if (src / "tiles" / "moon.png").is_file():
        disc = OUT / "moon-disc.webp"
        moon_disc(src / "tiles" / "moon.png").save(disc, "WEBP", quality=82, method=6, alpha_quality=90)
        msize = disc.stat().st_size
        total += msize
        if msize > FILE_BUDGET:
            over.append(disc.name)
        print(f"{disc.relative_to(REPO).as_posix()}  {MOON_DISC_SIZE}x{MOON_DISC_SIZE}  {msize / 1024:.1f} KB")
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
