"""Builds samples/tweendemo/test.swf from samples/clickgoto/test.swf.

Adds a 48-frame motion tween to the root timeline of the clickgoto sample:
shape 1 is placed at depth 10 and then moved, scaled, rotated and faded
frame by frame, with frame labels and a RemoveObject near the end. The two
clickable buttons and their ActionScript are left untouched.

Usage (from the repo root):
    python samples/tweendemo/build.py

Needs Java and tools/ffdec/ffdec-cli.jar. Output is deterministic.
"""
import math
import pathlib
import re
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
FFDEC = ROOT / "tools" / "ffdec" / "ffdec-cli.jar"
SRC = ROOT / "samples" / "clickgoto" / "test.swf"
OUT = ROOT / "samples" / "tweendemo" / "test.swf"

FRAMES = 48
REMOVE_AT = 44          # frame on which the tweened shape is removed
DEPTH = 10
SHAPE_ID = 1


def ffdec(*args: str) -> None:
    subprocess.run(["java", "-jar", str(FFDEC), *args], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def fmt(v: float) -> str:
    return repr(round(v, 6))


def place(frame: int) -> str:
    """PlaceObject2 for the tweened shape on a 1-based frame."""
    t = (frame - 1) / (REMOVE_AT - 2)            # 0..1 over the tween
    x = round((60 + 430 * t) * 20)               # twips
    y = round((90 + 40 * math.sin(t * math.pi)) * 20)
    angle = t * math.pi                          # half a turn
    scale = 0.6 + 0.8 * t
    a = scale * math.cos(angle)
    d = scale * math.cos(angle)
    b = scale * math.sin(angle)
    c = -scale * math.sin(angle)
    alpha = round(256 * (1 - 0.7 * t))
    first = frame == 1
    return (
        f'<item type="PlaceObject2Tag" {"characterId=\"%d\" " % SHAPE_ID if first else ""}'
        f'depth="{DEPTH}" forceWriteAsLong="false" '
        f'placeFlagHasCharacter="{str(first).lower()}" placeFlagHasClipActions="false" '
        f'placeFlagHasClipDepth="false" placeFlagHasColorTransform="true" '
        f'placeFlagHasMatrix="true" placeFlagHasName="false" placeFlagHasRatio="false" '
        f'placeFlagMove="{str(not first).lower()}">'
        f'<matrix type="MATRIX" hasRotate="true" hasScale="true" nRotateBits="18" '
        f'nScaleBits="18" nTranslateBits="15" rotateSkew0="{fmt(b)}" rotateSkew1="{fmt(c)}" '
        f'scaleX="{fmt(a)}" scaleY="{fmt(d)}" translateX="{x}" translateY="{y}"/>'
        f'<colorTransform type="CXFORMWITHALPHA" alphaMultTerm="{alpha}" blueMultTerm="256" '
        f'greenMultTerm="256" hasAddTerms="false" hasMultTerms="true" nbits="10" '
        f'redMultTerm="256"/>'
        f'</item>'
    )


def label(name: str) -> str:
    return (f'<item type="FrameLabelTag" forceWriteAsLong="true" name="{name}" '
            f'namedAnchor="false"/>')


SHOW = '<item type="ShowFrameTag" forceWriteAsLong="false"/>'
REMOVE = f'<item type="RemoveObject2Tag" depth="{DEPTH}" forceWriteAsLong="false"/>'


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        xml_in = pathlib.Path(tmp) / "in.xml"
        xml_out = pathlib.Path(tmp) / "out.xml"
        ffdec("-swf2xml", str(SRC), str(xml_in))
        xml = xml_in.read_text(encoding="utf-8")

        # The root timeline ends with three ShowFrame tags, then the tag list closes.
        tail = re.search(r'(\s*<item type="ShowFrameTag"[^>]*/>){3}(?=\s*</tags>\s*</swf>)', xml)
        if not tail:
            raise SystemExit("unexpected root timeline layout in clickgoto dump")

        frames = []
        for f in range(1, FRAMES + 1):
            parts = []
            if f == 1:
                parts.append(label("start"))
            if f == 24:
                parts.append(label("middle"))
            if f == REMOVE_AT:
                parts.append(label("gone"))
                parts.append(REMOVE)
            elif f < REMOVE_AT:
                parts.append(place(f))
            parts.append(SHOW)
            frames.append("".join(parts))

        xml = xml[:tail.start()] + "\n" + "\n".join(frames) + xml[tail.end():]
        xml = re.sub(r'(<swf [^>]*?)frameCount="3"', rf'\1frameCount="{FRAMES}"', xml, count=1)
        xml_out.write_text(xml, encoding="utf-8")
        ffdec("-xml2swf", str(xml_out), str(OUT))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
