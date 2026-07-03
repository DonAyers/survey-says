// Procedural chibi-blob character sprites — no external art, no image-gen
// dependency. Every visual trait (skin tone, hair silhouette, hair color,
// outfit color, accessory, freckle pattern) is deterministically derived
// from a "seed" string via a tiny string hash, so the exact same seed
// always renders the exact same little guy. Reroll = pick a new random
// seed; "choose a character" = pick one of the curated PRESET_SEEDS below.
//
// Follows the same "no bespoke asset files, just parameterized SVG + CSS"
// approach already used by SurveyLogo.tsx.

import { createMemo, Show } from "solid-js";
import { hasRealSprite } from "../spriteManifest";

export type SpriteMood = "idle" | "alert" | "celebrate" | "strike";

// Real sprite sheets (see scripts/sprite-pipeline/) only ever have these
// three painted poses; "strike" has no dedicated painted frame, so it
// borrows the "alert" pose and relies on the shared cs-mood-strike CSS
// (red glow + shake) to convey "wrong answer" instead.
const REAL_ART_POSE_INDEX: Record<SpriteMood, number> = { idle: 0, alert: 1, celebrate: 2, strike: 1 };
const REAL_ART_POSE_COUNT = 3;

// ---------------------------------------------------------------------------
// Deterministic trait derivation
// ---------------------------------------------------------------------------

function hashSeed(seed: string): number {
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Pull successive "digits" out of the hash so each trait gets an
// independent-looking slice without needing a full PRNG.
function pick<T>(hash: number, salt: number, options: readonly T[]): T {
  const idx = Math.abs((hash >>> (salt % 24)) + salt * 2654435761) % options.length;
  return options[idx];
}

const SKIN_TONES = ["#ffdbac", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#4a2c1a"] as const;
const OUTFIT_COLORS = ["#f43f5e", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"] as const;
const HAIR_COLORS = ["#1c1917", "#3b2314", "#7c4a1e", "#d4af37", "#e11d48", "#6b7280", "#f5f5f4", "#4c1d95"] as const;
const HAIR_STYLES = ["spiky", "afro", "swoop", "mohawk", "bald", "curly"] as const;
const ACCESSORIES = ["none", "glasses", "bow", "headphones", "bandana"] as const;
type HairStyle = (typeof HAIR_STYLES)[number];
type Accessory = (typeof ACCESSORIES)[number];

interface Traits {
  skin: string;
  outfit: string;
  hairColor: string;
  hairStyle: HairStyle;
  accessory: Accessory;
  hasFreckles: boolean;
  bobDelay: number; // ms, so idle bobs desync across a roster
}

function deriveTraits(seed: string): Traits {
  const h = hashSeed(seed || "default");
  return {
    skin: pick(h, 1, SKIN_TONES),
    outfit: pick(h, 5, OUTFIT_COLORS),
    hairColor: pick(h, 9, HAIR_COLORS),
    hairStyle: pick(h, 13, HAIR_STYLES),
    accessory: pick(h, 17, ACCESSORIES),
    hasFreckles: (h >>> 20) % 3 === 0,
    bobDelay: (h % 900),
  };
}

// A curated set of seeds picked because they land on pleasing, distinct
// combinations — the "choose a character" strip in the lobby.
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

export function randomAvatarSeed(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---------------------------------------------------------------------------
// Hair silhouette paths (drawn in a 100x100 viewBox, positioned over the head)
// ---------------------------------------------------------------------------

function hairPath(style: HairStyle): string | null {
  switch (style) {
    case "spiky":
      return "M22 38 L28 18 L36 34 L44 14 L52 34 L60 14 L68 34 L78 38 L74 46 L26 46 Z";
    case "afro":
      return null; // rendered as a big circle instead of a path, see HairShape
    case "swoop":
      return "M20 40 Q24 12 50 14 Q76 12 80 40 Q60 24 50 30 Q40 24 20 40 Z";
    case "mohawk":
      return "M44 40 L47 6 L53 6 L56 40 Z";
    case "bald":
      return null;
    case "curly":
      return "M20 40 Q16 20 30 18 Q34 8 46 14 Q50 6 58 12 Q66 8 70 20 Q82 22 78 40 Q75 30 66 32 Q60 24 50 30 Q40 22 32 32 Q26 30 20 40 Z";
    default:
      return null;
  }
}

function HairShape(props: { style: HairStyle; color: string }) {
  if (props.style === "bald") return null;
  if (props.style === "afro") {
    return <circle cx="50" cy="30" r="26" fill={props.color} />;
  }
  const d = hairPath(props.style);
  if (!d) return null;
  return <path d={d} fill={props.color} />;
}

function AccessoryShape(props: { kind: Accessory; outfit: string }) {
  switch (props.kind) {
    case "glasses":
      return (
        <g stroke="#1c1917" stroke-width="2.5" fill="rgba(255,255,255,0.15)">
          <circle cx="38" cy="52" r="9" />
          <circle cx="62" cy="52" r="9" />
          <line x1="47" y1="52" x2="53" y2="52" />
        </g>
      );
    case "bow":
      return (
        <g fill={props.outfit} stroke="#1c1917" stroke-width="1.5">
          <path d="M50 22 L38 14 L38 26 Z" />
          <path d="M50 22 L62 14 L62 26 Z" />
          <circle cx="50" cy="22" r="3" />
        </g>
      );
    case "headphones":
      return (
        <g fill="none" stroke="#1c1917" stroke-width="4">
          <path d="M22 44 Q50 6 78 44" />
          <rect x="16" y="42" width="10" height="16" rx="4" fill={props.outfit} stroke="#1c1917" stroke-width="2" />
          <rect x="74" y="42" width="10" height="16" rx="4" fill={props.outfit} stroke="#1c1917" stroke-width="2" />
        </g>
      );
    case "bandana":
      return <path d="M20 38 Q50 24 80 38 L80 46 Q50 34 20 46 Z" fill={props.outfit} stroke="#1c1917" stroke-width="1.5" />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CharacterSprite(props: {
  seed: string;
  size?: "sm" | "md" | "lg";
  mood?: SpriteMood;
  isNPC?: boolean;
}) {
  const traits = createMemo(() => deriveTraits(props.seed));
  const px = () => (props.size === "lg" ? 76 : props.size === "sm" ? 34 : 52);
  const mood = () => props.mood ?? "idle";
  const useRealArt = createMemo(() => hasRealSprite(props.seed));

  return (
    <div
      class={`cs-wrap cs-mood-${mood()}`}
      style={{ width: `${px()}px`, height: `${px()}px`, "--cs-bob-delay": `${traits().bobDelay}ms` }}
    >
      <style>{CSS}</style>
      <Show
        when={useRealArt()}
        fallback={
          <svg class="cs-svg" viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-label="player avatar">
            <g class="cs-body-group">
              {/* body */}
              <ellipse cx="50" cy="78" rx="26" ry="18" fill={traits().outfit} />
              {/* arms (animated on celebrate/alert via CSS transform-origin) */}
              <g class="cs-arm cs-arm-l" style={{ "transform-origin": "34px 70px" }}>
                <ellipse cx="26" cy="76" rx="7" ry="12" fill={traits().outfit} />
              </g>
              <g class="cs-arm cs-arm-r" style={{ "transform-origin": "66px 70px" }}>
                <ellipse cx="74" cy="76" rx="7" ry="12" fill={traits().outfit} />
              </g>
              {/* head */}
              <circle cx="50" cy="46" r="28" fill={traits().skin} />
              {/* freckles */}
              {traits().hasFreckles && (
                <g fill="#00000022">
                  <circle cx="38" cy="54" r="1.4" />
                  <circle cx="42" cy="57" r="1.4" />
                  <circle cx="58" cy="54" r="1.4" />
                  <circle cx="62" cy="57" r="1.4" />
                </g>
              )}
              {/* eyes */}
              <g class="cs-eyes">
                <circle cx="40" cy="46" r="3.2" fill="#1c1917" />
                <circle cx="60" cy="46" r="3.2" fill="#1c1917" />
              </g>
              {/* mouth: shape swaps per mood via CSS-hidden siblings */}
              <path class="cs-mouth cs-mouth-idle" d="M42 58 Q50 64 58 58" fill="none" stroke="#7a3b1e" stroke-width="2.5" stroke-linecap="round" />
              <path class="cs-mouth cs-mouth-celebrate" d="M40 56 Q50 70 60 56 Q50 66 40 56 Z" fill="#7a3b1e" />
              <path class="cs-mouth cs-mouth-strike" d="M42 60 Q50 54 58 60" fill="none" stroke="#7a3b1e" stroke-width="2.5" stroke-linecap="round" />
              {/* hair */}
              <HairShape style={traits().hairStyle} color={traits().hairColor} />
              {/* accessory */}
              <AccessoryShape kind={traits().accessory} outfit={traits().outfit} />
              {props.isNPC && (
                <g>
                  <rect x="34" y="16" width="32" height="8" rx="4" fill="#0f172a" stroke="#94a3b8" stroke-width="1" />
                  <circle cx="42" cy="20" r="1.6" fill="#22d3ee" />
                  <circle cx="50" cy="20" r="1.6" fill="#22d3ee" />
                  <circle cx="58" cy="20" r="1.6" fill="#22d3ee" />
                </g>
              )}
            </g>
          </svg>
        }
      >
        {/* Real, hand-picked painted sprite sheet (see scripts/sprite-pipeline/).
            The sheet is a horizontal strip of REAL_ART_POSE_COUNT square frames;
            background-size stretches it to N*100% width so each frame occupies
            exactly one container-width, then background-position-x picks which
            frame shows. Animation (bob/alert/celebrate/shake) is the same
            cs-body-group CSS driven by the outer cs-mood-* class. */}
        <div
          class="cs-body-group cs-real-frame"
          style={{
            width: "100%",
            height: "100%",
            "background-image": `url(/sprites/${props.seed}/sheet.png)`,
            "background-size": `${REAL_ART_POSE_COUNT * 100}% 100%`,
            "background-position": `${(REAL_ART_POSE_INDEX[mood()] / (REAL_ART_POSE_COUNT - 1)) * 100}% 0%`,
            "background-repeat": "no-repeat",
          }}
        />
      </Show>
    </div>
  );
}

const CSS = `
.cs-wrap {
  position: relative;
  display: inline-flex;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
}
.cs-svg { overflow: visible; }

/* idle: gentle desynced bob */
.cs-mood-idle .cs-body-group {
  animation: cs-bob 2.6s ease-in-out infinite;
  animation-delay: var(--cs-bob-delay, 0ms);
}
@keyframes cs-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2.5px); }
}

/* alert (buzzed-in / your turn): lean in + a little urgency */
.cs-mood-alert .cs-body-group {
  animation: cs-alert 0.6s ease-in-out infinite;
  transform-origin: 50px 90px;
}
@keyframes cs-alert {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-3px) scale(1.04); }
}
.cs-mood-alert .cs-eyes { transform: scale(1.15); transform-origin: 50px 46px; }

/* celebrate: arms up, big bounce, grin */
.cs-mood-celebrate .cs-body-group { animation: cs-bounce 0.5s ease-in-out infinite; }
@keyframes cs-bounce {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-6px) rotate(-2deg); }
}
.cs-mood-celebrate .cs-arm-l { animation: cs-arm-up-l 0.5s ease-in-out infinite; }
.cs-mood-celebrate .cs-arm-r { animation: cs-arm-up-r 0.5s ease-in-out infinite; }
@keyframes cs-arm-up-l { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-40deg) translateY(-6px); } }
@keyframes cs-arm-up-r { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(40deg) translateY(-6px); } }

/* strike: quick shake + red tint */
.cs-mood-strike .cs-body-group { animation: cs-shake 0.35s ease-in-out 2; }
@keyframes cs-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px) rotate(-3deg); }
  75% { transform: translateX(3px) rotate(3deg); }
}
.cs-mood-strike .cs-wrap, .cs-mood-strike { filter: drop-shadow(0 0 6px rgba(239,68,68,0.7)); }

/* mouth swap: only the mood-matching path is visible */
.cs-mouth { opacity: 0; }
.cs-mood-idle .cs-mouth-idle,
.cs-mood-alert .cs-mouth-idle { opacity: 1; }
.cs-mood-celebrate .cs-mouth-celebrate { opacity: 1; }
.cs-mood-strike .cs-mouth-strike { opacity: 1; }
`;
