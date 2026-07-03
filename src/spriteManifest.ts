// Tiny reactive registry of which PRESET_SEEDS (see CharacterSprite.tsx)
// currently have real generated sprite sheets under public/sprites/, as
// produced by scripts/sprite-pipeline/process.py. Fetched once at app
// startup; if the manifest is missing (pipeline never run) or fails to
// load, everything gracefully falls back to the procedural SVG look —
// this file is purely an enhancement, never a hard dependency.
import { createSignal } from "solid-js";

const [manifest, setManifest] = createSignal<string[]>([]);

fetch("/sprites/manifest.json")
  .then((res) => (res.ok ? res.json() : []))
  .then((ids) => setManifest(Array.isArray(ids) ? ids : []))
  .catch(() => setManifest([]));

export function hasRealSprite(seed: string): boolean {
  return manifest().includes(seed);
}
