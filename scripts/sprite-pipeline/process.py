#!/usr/bin/env python3
"""
process.py — turns a raw sprite sheet from generate.py into game-ready
assets: chroma-key removal, frame splitting, per-frame auto-crop/alignment
onto a consistent canvas, and export as transparent PNGs plus a combined
horizontal sheet + metadata.json.

Usage:
    python3 scripts/sprite-pipeline/process.py                 # all presets with a raw source
    python3 scripts/sprite-pipeline/process.py chrome-flamingo  # one preset

Input:
    art/raw/<preset-id>.png          (from generate.py)

Output:
    public/sprites/<preset-id>/idle.png
    public/sprites/<preset-id>/alert.png
    public/sprites/<preset-id>/celebrate.png
    public/sprites/<preset-id>/sheet.png       (all frames combined, one row)
    public/sprites/<preset-id>/metadata.json   (frame size, pose order, source preset)

Requires: pip install -r scripts/sprite-pipeline/requirements.txt
"""

import json
import sys
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
PRESETS_PATH = SCRIPT_DIR / "presets.json"
RAW_DIR = REPO_ROOT / "art" / "raw"
OUTPUT_DIR = REPO_ROOT / "public" / "sprites"

POSE_NAMES = ["idle", "alert", "celebrate"]
FRAME_COLUMNS = len(POSE_NAMES)

# Fallback chroma key if background sampling fails for some reason — must
# roughly match generate.py's CHROMA_HEX request, though image models often
# don't render an exact pure color, which is why we sample the real
# background color from the sheet's corners at runtime instead of trusting
# this constant on its own.
FALLBACK_CHROMA_RGB = (0, 255, 0)
# Any pixel within this Euclidean distance of the *sampled* background color
# (in 0-255 RGB space) is treated as background and made fully transparent.
# Pixels near the threshold get partial alpha so anti-aliased edges don't
# leave a hard fringe around the character.
CHROMA_THRESHOLD = 45
CHROMA_FEATHER = 35
# Size (in px) of the square patch sampled at each corner to determine the
# sheet's actual background color (handles image models rendering a muted
# or slightly-off version of the requested chroma color).
CORNER_SAMPLE_SIZE = 12

# Final square canvas each cropped frame is centered/padded onto, so every
# pose in every pack has identical dimensions for the frontend's CSS
# steps() sprite-sheet animation.
CANVAS_SIZE = 256
CONTENT_PADDING = 18  # px of breathing room inside the canvas

def load_presets() -> list[dict]:
    with open(PRESETS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def sample_background_color(img: Image.Image) -> tuple[int, int, int]:
    """Average the pixels in a small patch at each of the four corners to
    determine the sheet's *actual* rendered background color — image models
    routinely drift from the exact chroma hex requested in the prompt."""
    rgb = img.convert("RGB")
    width, height = rgb.size
    s = CORNER_SAMPLE_SIZE
    corners = [
        (0, 0, s, s),
        (width - s, 0, width, s),
        (0, height - s, s, height),
        (width - s, height - s, width, height),
    ]
    total = [0, 0, 0]
    count = 0
    for box in corners:
        patch = rgb.crop(box)
        for pixel in patch.getdata():
            total[0] += pixel[0]
            total[1] += pixel[1]
            total[2] += pixel[2]
            count += 1
    if count == 0:
        return FALLBACK_CHROMA_RGB
    return (total[0] // count, total[1] // count, total[2] // count)


def chroma_key(img: Image.Image, key_color: tuple[int, int, int]) -> Image.Image:
    """Replace the flat chroma-key background with a transparent alpha
    channel using a soft distance threshold (avoids a hard fringe on
    anti-aliased character edges)."""
    img = img.convert("RGBA")
    pixels = img.load()
    width, height = img.size
    cr, cg, cb = key_color

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            dist = ((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2) ** 0.5
            if dist <= CHROMA_THRESHOLD:
                pixels[x, y] = (r, g, b, 0)
            elif dist <= CHROMA_THRESHOLD + CHROMA_FEATHER:
                # Linearly ramp alpha across the feather band so the cutout
                # edge is soft instead of a jagged binary mask.
                t = (dist - CHROMA_THRESHOLD) / CHROMA_FEATHER
                pixels[x, y] = (r, g, b, int(255 * t))
    return img



def split_columns(img: Image.Image, columns: int) -> list[Image.Image]:
    """Slice a chroma-keyed (RGBA, real alpha) sheet into `columns` frames by
    cutting at the actual visual GAPS between poses rather than trusting
    naive equal-thirds boundaries. Poses don't always land dead-center in
    their nominal third — a raised hand or a held prop can drift toward a
    neighboring column — so instead we compute a per-x "content mass"
    profile (sum of alpha down each column of pixels) and cut at the
    lowest-mass point near each expected boundary, i.e. the true empty gap
    between two poses. This avoids both bleed (cutting too late) and
    clipping (cutting too early)."""
    width, height = img.size
    alpha = img.getchannel("A")
    col_mass = [0] * width
    alpha_pixels = alpha.load()
    for x in range(width):
        total = 0
        for y in range(height):
            total += alpha_pixels[x, y]
        col_mass[x] = total

    nominal_boundary = width / columns
    search_radius = int(nominal_boundary * 0.4)

    boundaries = [0]
    for i in range(1, columns):
        approx = int(nominal_boundary * i)
        lo = max(1, approx - search_radius)
        hi = min(width - 1, approx + search_radius)
        valley_x = min(range(lo, hi + 1), key=lambda x: col_mass[x])
        boundaries.append(valley_x)
    boundaries.append(width)

    frames = []
    for i in range(columns):
        frames.append(img.crop((boundaries[i], 0, boundaries[i + 1], height)))
    return frames


def crop_and_center(frame: Image.Image, canvas_size: int, padding: int) -> Image.Image:
    """Auto-crop to the frame's opaque content bounding box, then paste it
    centered onto a fixed-size transparent canvas so every exported pose
    shares identical dimensions and anchor point."""
    bbox = frame.getbbox()  # bbox of any non-fully-transparent pixel
    content = frame.crop(bbox) if bbox else frame

    max_dim = canvas_size - (padding * 2)
    content.thumbnail((max_dim, max_dim), Image.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    offset_x = (canvas_size - content.width) // 2
    # Anchor near the bottom rather than dead-center so standing characters
    # of slightly different heights still share a common "floor" line.
    offset_y = canvas_size - padding - content.height
    canvas.paste(content, (offset_x, offset_y), content)
    return canvas


def process_one(preset_id: str) -> None:
    raw_path = RAW_DIR / f"{preset_id}.png"
    if not raw_path.exists():
        print(f"[{preset_id}] skipped — no raw source at {raw_path}", file=sys.stderr)
        return

    print(f"[{preset_id}] processing…")
    sheet = Image.open(raw_path)
    bg_color = sample_background_color(sheet)
    print(f"[{preset_id}] sampled background color: rgb{bg_color}")
    keyed = chroma_key(sheet, bg_color)
    raw_frames = split_columns(keyed, FRAME_COLUMNS)
    frames = [crop_and_center(f, CANVAS_SIZE, CONTENT_PADDING) for f in raw_frames]

    out_dir = OUTPUT_DIR / preset_id
    out_dir.mkdir(parents=True, exist_ok=True)

    for pose_name, frame in zip(POSE_NAMES, frames):
        frame.save(out_dir / f"{pose_name}.png")

    combined = Image.new("RGBA", (CANVAS_SIZE * len(frames), CANVAS_SIZE), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        combined.paste(frame, (i * CANVAS_SIZE, 0), frame)
    combined.save(out_dir / "sheet.png")

    metadata = {
        "preset": preset_id,
        "frameSize": CANVAS_SIZE,
        "poses": POSE_NAMES,
        "sheetWidth": CANVAS_SIZE * len(frames),
        "sheetHeight": CANVAS_SIZE,
    }
    with open(out_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[{preset_id}] wrote {len(frames)} frames + sheet.png -> {out_dir.relative_to(REPO_ROOT)}")


def write_manifest() -> None:
    """List every preset that currently has processed real art, so the
    frontend (see src/spriteManifest.ts) knows which seeds can use a real
    sprite sheet instead of falling back to the procedural SVG look. Scans
    the actual output directory rather than just this run's presets, so it
    stays correct even if you process presets one at a time across several
    runs."""
    if not OUTPUT_DIR.exists():
        ids: list[str] = []
    else:
        ids = sorted(
            p.name
            for p in OUTPUT_DIR.iterdir()
            if p.is_dir() and (p / "metadata.json").exists()
        )
    manifest_path = OUTPUT_DIR / "manifest.json"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(ids, f, indent=2)
    print(f"manifest -> {manifest_path.relative_to(REPO_ROOT)} ({len(ids)} preset(s))")


def main() -> None:
    presets = load_presets()
    requested_id = sys.argv[1] if len(sys.argv) > 1 else None

    if requested_id:
        ids = [requested_id]
    else:
        ids = [p["id"] for p in presets]

    for preset_id in ids:
        process_one(preset_id)

    write_manifest()


if __name__ == "__main__":
    main()
