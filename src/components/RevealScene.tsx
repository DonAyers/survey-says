import { For, Show } from "solid-js";
import type { RoomView } from "../types";

// The "let's see what you missed" beat: the server flips any answer nobody
// guessed one at a time (cheapest first, biggest last for suspense — see
// startReveal/revealNextHiddenAnswer in server.ts), broadcasting state after
// each flip. This screen just renders whatever the board looks like at each
// step; the pacing lives entirely server-side so every client (host + any
// remote guests) sees the exact same reveal in lockstep.
export default function RevealScene(props: { room: RoomView; isHost: boolean; onSkip: () => void }) {
  const hiddenCount = () => props.room.question.answers.filter((a) => !a.revealed).length;

  return (
    <div class="w-full max-w-3xl flex flex-col gap-5 items-center">
      <div class="text-center">
        <p class="text-strike uppercase tracking-widest text-sm font-black animate-pulse">
          {hiddenCount() > 0 ? "😬 Let's see what you missed…" : "…and that's everything."}
        </p>
        <p class="text-slate-500 text-xs mt-1">{props.room.question.prompt}</p>
      </div>

      <div class="w-full bg-board rounded-xl p-5 shadow-2xl border-4 border-amber-400">
        <div class="grid grid-cols-1 gap-2">
          <For each={props.room.question.answers}>
            {(answer, i) => (
              <div
                class={`flex items-center justify-between rounded-lg px-4 py-3 font-bold border-2 transition-all duration-500 ${
                  answer.revealed
                    ? "bg-boardCell border-amber-300 text-white"
                    : "bg-slate-800 border-slate-600 text-slate-600 animate-pulse"
                }`}
              >
                <span>
                  {i() + 1}. {answer.revealed ? answer.text : "?????"}
                </span>
                <Show when={answer.revealed}>
                  <span class="text-amber-300">{answer.points}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <p class="text-slate-400 text-sm uppercase tracking-widest">Round pot: {props.room.roundPot}</p>
        <Show when={props.isHost && hiddenCount() > 0}>
          <button class="btn-secondary text-sm" onClick={props.onSkip}>
            Reveal All ⏩
          </button>
        </Show>
      </div>
    </div>
  );
}
