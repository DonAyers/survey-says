import { createEffect, createSignal, Show } from "solid-js";
import type { RoomView } from "../types";

// Purely client-derived "scene 3": whenever a new answer flips to revealed,
// flash a big closeup card of just that tile for a moment before returning
// to the main board view. No server support needed — we just diff the
// revealed set between renders.
export default function RevealCloseup(props: { room: RoomView }) {
  const [closeup, setCloseup] = createSignal<{ text: string; points: number } | null>(null);
  let previousRevealed = new Set<string>();

  createEffect(() => {
    const answers = props.room.question.answers;
    const revealedNow = new Set(answers.filter((a) => a.revealed && a.text).map((a) => a.text!));
    const newlyRevealed = [...revealedNow].find((text) => !previousRevealed.has(text));
    previousRevealed = revealedNow;

    if (newlyRevealed) {
      const answer = answers.find((a) => a.text === newlyRevealed);
      if (answer) {
        setCloseup({ text: answer.text!, points: answer.points ?? 0 });
        setTimeout(() => setCloseup((c) => (c?.text === answer.text ? null : c)), 1300);
      }
    }
  });

  return (
    <Show when={closeup()}>
      {(c) => (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm transition-opacity duration-150">
          <div class="bg-boardCell border-4 border-amber-300 rounded-2xl px-16 py-10 text-center shadow-2xl transition-transform duration-200">
            <p class="text-4xl font-black text-white mb-2">{c().text}</p>
            <p class="text-2xl font-bold text-amber-300">{c().points} points!</p>
          </div>
        </div>
      )}
    </Show>
  );
}
