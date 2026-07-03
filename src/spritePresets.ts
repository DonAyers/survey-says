// Framework-agnostic list of curated avatar seeds — imported by both the
// SolidJS frontend (CharacterSprite.tsx, for the "choose a character" strip)
// and the Bun server (server.ts, so brand-new members/NPCs get assigned one
// of these by default instead of a throwaway random string). Keeping this in
// its own tiny file with no Solid/DOM imports lets Bun import it directly.
//
// Each of these has a matching real painted sprite sheet in
// public/sprites/<seed>/ (see scripts/sprite-pipeline/) — if the pipeline has
// never been run, CharacterSprite.tsx just falls back to its procedural SVG
// look for these same seeds, so nothing breaks either way.
export const PRESET_SEEDS = [
  "marmalade-otter",
  "velvet-heckler",
  "static-clipboard",
  "neon-gravy",
  "quiet-riot-accountant",
  "disco-plumber",
  "feral-intern",
  "chrome-flamingo",
] as const;
