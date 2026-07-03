import type { Member } from "../types";

// Ridiculously simple character representation: no art assets, just a big
// emoji + name badge. isNPC swaps the glyph and tints the badge so hosts
// can tell contestants apart from robots at a glance.
export default function Avatar(props: { member: Member; highlighted?: boolean; size?: "sm" | "lg" }) {
  const glyph = () => (props.member.isNPC ? "🤖" : "🧑");
  const big = () => props.size === "lg";

  return (
    <div class={`flex flex-col items-center gap-1 ${props.highlighted ? "scale-110" : ""} transition-transform`}>
      <div
        class={`flex items-center justify-center rounded-full ${big() ? "w-20 h-20 text-4xl" : "w-10 h-10 text-xl"} ${
          props.highlighted ? "bg-amber-400 shadow-lg shadow-amber-400/50" : "bg-slate-700"
        }`}
      >
        {glyph()}
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
