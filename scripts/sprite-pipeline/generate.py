#!/usr/bin/env python3
"""
generate.py — calls the OpenAI Images API to produce a raw, un-processed
sprite sheet for one (or all) curated character presets defined in
presets.json. Each sheet is a single PNG containing three side-by-side
poses (idle / alert / celebrate) of the same character, painted on a flat
chroma-key green background so process.py can cleanly key it out afterward.

This script is meant to be run BY YOU, locally, with your own OpenAI API
key exported in your shell — it is never invoked by the Bun server or the
Vite frontend, and no key is ever read, logged, or stored by this repo.

Usage:
    export OPENAI_API_KEY=sk-...
    python3 scripts/sprite-pipeline/generate.py                # all presets
    python3 scripts/sprite-pipeline/generate.py chrome-flamingo # one preset

Output:
    art/raw/<preset-id>.png  (1536x1024, three poses left-to-right)

Requires: pip install -r scripts/sprite-pipeline/requirements.txt
"""

import base64
import json
import os
import sys
import time
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
PRESETS_PATH = SCRIPT_DIR / "presets.json"
RAW_OUTPUT_DIR = REPO_ROOT / "art" / "raw"

OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"
MODEL = "gpt-image-1"
IMAGE_SIZE = "1536x1024"  # landscape: three roughly-square poses side by side

# Chroma-key green chosen to be far from any plausible skin/hair/outfit tone
# so process.py's color-distance threshold has a clean margin.
CHROMA_HEX = "#00FF00"

PROMPT_TEMPLATE = """\
A 2D video game character sprite reference sheet, flat vector cartoon \
style, chibi proportions, thick clean outlines, bold flat colors, no \
gradients, no drop shadows on the background.

Character: {description}

Layout: exactly three poses of the SAME character, arranged left to \
right in a single row, evenly spaced, each pose centered in its own \
third of the image and fully visible (nothing cropped at the edges):
  1. Neutral idle pose, standing, arms relaxed at sides, friendly \
     neutral expression.
  2. Alert "buzzed in" pose, leaning forward eagerly, one hand cupped \
     near the ear, wide excited eyes.
  3. Celebrating pose, both arms thrown up in victory, huge open grin.

Background: a single flat solid chroma-key green ({chroma}), completely \
uniform, no texture, no vignette, no other scenery or props on the \
background. The character sprites must be the only non-background \
content in the image.
"""


def build_prompt(description: str) -> str:
    return PROMPT_TEMPLATE.format(description=description, chroma=CHROMA_HEX)


def load_presets() -> list[dict]:
    with open(PRESETS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def generate_one(preset: dict, api_key: str) -> None:
    preset_id = preset["id"]
    prompt = build_prompt(preset["description"])
    print(f"[{preset_id}] requesting image…")

    resp = requests.post(
        OPENAI_IMAGES_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": MODEL,
            "prompt": prompt,
            "size": IMAGE_SIZE,
            "n": 1,
        },
        timeout=180,
    )
    if resp.status_code != 200:
        print(f"[{preset_id}] FAILED: {resp.status_code} {resp.text[:500]}", file=sys.stderr)
        return

    data = resp.json()
    b64 = data["data"][0]["b64_json"]
    raw_bytes = base64.b64decode(b64)

    RAW_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RAW_OUTPUT_DIR / f"{preset_id}.png"
    out_path.write_bytes(raw_bytes)
    print(f"[{preset_id}] saved -> {out_path.relative_to(REPO_ROOT)}")


def main() -> None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: set OPENAI_API_KEY in your shell before running this script.", file=sys.stderr)
        sys.exit(1)

    presets = load_presets()
    requested_id = sys.argv[1] if len(sys.argv) > 1 else None

    if requested_id:
        matches = [p for p in presets if p["id"] == requested_id]
        if not matches:
            print(f"ERROR: no preset named '{requested_id}' in presets.json", file=sys.stderr)
            sys.exit(1)
        presets = matches

    for i, preset in enumerate(presets):
        generate_one(preset, api_key)
        # Small delay between requests to stay well clear of rate limits
        # when generating the whole pack in one go.
        if i < len(presets) - 1:
            time.sleep(2)


if __name__ == "__main__":
    main()
