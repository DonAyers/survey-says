import type { Member } from "../types";
import CharacterSprite, { type SpriteMood } from "./CharacterSprite";

// Character representation: a deterministic procedural sprite (see
// CharacterSprite.tsx) derived from the member's avatarSeed, plus a name
// badge. `highlighted` maps to the sprite's "alert" mood (buzzed-in / on
// the clock); `mood` lets callers drive celebrate/strike poses explicitly.
export default function Avatar(props: { member: Member; highlighted?: boolean; size?: "sm" | "lg"; mood?: SpriteMood }) {
  const big = () => props.size === "lg";
  const effectiveMood = (): SpriteMood => props.mood ?? (props.highlighted ? "alert" : "idle");

  return (
    <div class={`flex flex-col items-center gap-1 ${props.highlighted ? "scale-110" : ""} transition-transform`}>
      <div
        class={`flex items-center justify-center rounded-full ${big() ? "w-20 h-20" : "w-10 h-10"} ${
          props.highlighted ? "bg-amber-400/20 shadow-lg shadow-amber-400/50" : "bg-slate-700/40"
        }`}
      >
        <CharacterSprite seed={props.member.avatarSeed} size={big() ? "lg" : "sm"} mood={effectiveMood()} isNPC={props.member.isNPC} />
      </div>
      <span class={`text-center leading-tight ${big() ? "text-sm" : "text-xs"} ${props.highlighted ? "text-amber-300 font-bold" : "text-slate-300"}`}>
        {props.member.name}
      </span>
      {props.member.isNPC && (
        <span class="text-[10px] text-fuchsia-400 -mt-1">IQ {props.member.intelligence}</span>
      )}
    </div>
  );
}
