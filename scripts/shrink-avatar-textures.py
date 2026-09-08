"""
Resize the avatar's textures to the size it is actually drawn at.

    python scripts/shrink-avatar-textures.py [--dry-run]

Reads ../avatar/model.glb (the character as exported) and writes
public/avatar/tutor.glb (the character as shipped). The source is never modified, so
this is always re-runnable and always reversible — delete the output and run it again.

Why this exists
---------------
The avatar is drawn at 92 CSS pixels. On a 2.8x phone that is about 260 device pixels
for the whole character, head to feet; the hair covers maybe eighty of them. The
exporter ships 1024 by 1024 maps regardless, which is roughly a hundred times more
texels than any of them can show. That cost 2.8 MB of a 4.3 MB model, and every
megabyte of it lands in the APK.

Sizes are chosen per slot rather than uniformly:

    baseColor, normal      512   what you actually look at, kept with headroom
    metallicRoughness      256   low-frequency by nature; shading, not detail
    occlusion              256   same

Format follows the alpha channel, not the original file type. The hair base colour is
a PNG because hair cards are cut out with alpha, and turning that into a JPEG would
give the character a solid rectangular block of hair. Anything without alpha becomes a
JPEG, which is what the exporter already chose for most of them.
"""

import json
import struct
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
SOURCE = PROJECT.parent / "avatar" / "model.glb"
OUTPUT = PROJECT / "public" / "avatar" / "tutor.glb"

DRY_RUN = "--dry-run" in sys.argv

# Slot -> longest edge to keep.
SLOT_SIZE = {
    "baseColor": 512,
    "normal": 512,
    "metallicRoughness": 256,
    "occlusion": 256,
    "emissive": 256,
}
DEFAULT_SIZE = 512

JPEG_QUALITY = 88


def pad4(n: int) -> int:
    return (4 - (n % 4)) % 4


def read_glb(path: Path):
    raw = path.read_bytes()
    magic, _version, _length = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF":
        raise SystemExit(f"{path} is not a .glb")
    json_len, json_type = struct.unpack_from("<II", raw, 12)
    if json_type != 0x4E4F534A:
        raise SystemExit("first chunk is not JSON")
    gltf = json.loads(raw[20 : 20 + json_len])
    bin_start = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<II", raw, bin_start)
    if bin_type != 0x004E4942:
        raise SystemExit("second chunk is not BIN")
    blob = raw[bin_start + 8 : bin_start + 8 + bin_len]
    return gltf, bytearray(blob)


def slot_map(gltf) -> dict:
    """Which material slot each image fills, so the size can suit the job."""
    out = {}

    def note(tex_index, slot):
        if tex_index is None:
            return
        img = gltf.get("textures", [])[tex_index].get("source")
        if img is not None:
            out.setdefault(img, slot)

    for mat in gltf.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        note((pbr.get("baseColorTexture") or {}).get("index"), "baseColor")
        note((pbr.get("metallicRoughnessTexture") or {}).get("index"), "metallicRoughness")
        note((mat.get("normalTexture") or {}).get("index"), "normal")
        note((mat.get("occlusionTexture") or {}).get("index"), "occlusion")
        note((mat.get("emissiveTexture") or {}).get("index"), "emissive")
    return out


def shrink(data: bytes, target: int):
    """Return (bytes, mime, note). Falls back to the original if resizing would not help."""
    im = Image.open(BytesIO(data))
    im.load()
    has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
    w, h = im.size

    if max(w, h) > target:
        scale = target / max(w, h)
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

    buf = BytesIO()
    if has_alpha:
        # Alpha has to survive, so this stays PNG.
        #
        # Quantising the whole RGBA image is smaller still — 59 KB against 244 — but it
        # folds alpha into the palette, and measuring the result showed the fully opaque
        # share of the hair texture going from 13.7 percent to zero. Every strand would
        # have rendered slightly see-through. So the colour is quantised and the alpha
        # channel is merged back at full depth, which keeps the cutout exact.
        im = im.convert("RGBA")
        alpha = im.getchannel("A")
        rgb = im.convert("RGB").quantize(colors=256, method=Image.FASTOCTREE).convert("RGB")
        Image.merge("RGBA", (*rgb.split(), alpha)).save(buf, format="PNG", optimize=True)
        mime, note = "image/png", "PNG, 256 colours, alpha kept at 8 bits"
    else:
        im.convert("RGB").save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        mime, note = "image/jpeg", f"JPEG q{JPEG_QUALITY}"

    out = buf.getvalue()
    if len(out) >= len(data):
        return data, None, "left alone (already smaller)"
    return out, mime, f"{im.size[0]}x{im.size[1]} {note}"


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"No source model at {SOURCE}")

    gltf, blob = read_glb(SOURCE)
    slots = slot_map(gltf)
    views = gltf["bufferViews"]

    # New bytes for the image bufferViews only. Everything else is copied verbatim.
    replacement = {}
    before = after = 0

    print(f"{'#':>2}  {'was':>8}  {'now':>8}  slot / result")
    for i, image in enumerate(gltf.get("images", [])):
        view_index = image.get("bufferView")
        if view_index is None:
            continue
        view = views[view_index]
        start = view.get("byteOffset", 0)
        original = bytes(blob[start : start + view["byteLength"]])
        slot = slots.get(i, "?")
        data, mime, note = shrink(original, SLOT_SIZE.get(slot, DEFAULT_SIZE))
        before += len(original)
        after += len(data)
        if mime:
            replacement[view_index] = data
            image["mimeType"] = mime
        print(f"{i:>2}  {len(original)/1024:7.0f}K  {len(data)/1024:7.0f}K  {slot} -> {note}")

    print(f"\ntextures: {before/1024/1024:.2f} MB -> {after/1024/1024:.2f} MB")

    if DRY_RUN:
        print("dry run, nothing written")
        return

    # Rebuild the binary chunk. Views are laid out in their existing order so that any
    # accessor's own byteOffset, which is relative to its view, stays valid; only the
    # view offsets move.
    order = sorted(range(len(views)), key=lambda k: views[k].get("byteOffset", 0))
    out = bytearray()
    for k in order:
        view = views[k]
        start = view.get("byteOffset", 0)
        data = replacement.get(k) or bytes(blob[start : start + view["byteLength"]])
        out += b"\x00" * pad4(len(out))
        view["byteOffset"] = len(out)
        view["byteLength"] = len(data)
        out += data
    out += b"\x00" * pad4(len(out))

    gltf["buffers"][0]["byteLength"] = len(out)

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * pad4(len(json_bytes))

    total = 12 + 8 + len(json_bytes) + 8 + len(out)
    glb = bytearray()
    glb += struct.pack("<4sII", b"glTF", 2, total)
    glb += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    glb += struct.pack("<II", len(out), 0x004E4942) + bytes(out)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(glb)

    src_mb = SOURCE.stat().st_size / 1024 / 1024
    out_mb = OUTPUT.stat().st_size / 1024 / 1024
    print(f"\n{SOURCE.name} {src_mb:.2f} MB  ->  {OUTPUT.name} {out_mb:.2f} MB "
          f"({(1 - out_mb / src_mb) * 100:.0f}% smaller)")


if __name__ == "__main__":
    main()
