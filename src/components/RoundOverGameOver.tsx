import { For, Show } from "solid-js";
import type { RoomView } from "../types";

export function RoundOverView(props: { room: RoomView; isHost: boolean; onNextRound: () => void }) {
  const leader = () =>
    props.room.teams[0].score === props.room.teams[1].score ? null : [...props.room.teams].sort((a, b) => b.score - a.score)[0];
  const isLastRound = () => props.room.roundNumber >= props.room.totalRounds;

  return (
    <div class="w-full max-w-xl bg-slate-800 rounded-xl p-6 flex flex-col gap-4 text-center shadow-2xl">
      <h2 class="text-3xl font-black text-amber-400">Round {props.room.roundNumber} Over!</h2>
      <p class="text-slate-300">
        {props.room.strikes >= 3 ? "Three strikes. A truly heroic collapse." : "Board cleared. Somebody actually knew something."}
      </p>
      <div class="grid grid-cols-2 gap-3">
        <For each={props.room.teams}>
          {(team) => (
            <div class="bg-slate-900 rounded px-3 py-2">
              <p class="text-slate-400 text-sm">{team.name}</p>
              <p class="text-2xl font-black text-amber-300">{team.score}</p>
            </div>
          )}
        </For>
      </div>
      <Show when={leader()}>{(l) => <p class="text-slate-400 text-sm">{l().name} currently leads.</p>}</Show>
      <Show when={props.isHost} fallback={<p class="text-slate-500 text-sm">Waiting for the host to continue…</p>}>
        <button class="btn-primary text-lg" onClick={props.onNextRound}>
          {isLastRound() ? "See Final Results" : "Next Round"}
        </button>
      </Show>
    </div>
  );
}

export function GameOverView(props: { room: RoomView; isHost: boolean; onResetGame: () => void }) {
  const sorted = () => [...props.room.teams].sort((a, b) => b.score - a.score);
  const isTie = () => props.room.teams[0].score === props.room.teams[1].score;

  return (
    <div class="w-full max-w-xl bg-slate-800 rounded-xl p-6 flex flex-col gap-4 text-center shadow-2xl">
      <h2 class="text-3xl font-black text-amber-400">Game Over</h2>
      <p class="text-slate-400">The survey has spoken. Judge accordingly.</p>
      <ul class="flex flex-col gap-2">
        <For each={sorted()}>
          {(team, i) => (
            <li class="flex justify-between bg-slate-900 rounded px-3 py-2">
              <span>
                {i() === 0 && !isTie() ? "🏆 " : ""}
                {team.name}
              </span>
              <span class="font-bold text-amber-300">{team.score}</span>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.isHost} fallback={<p class="text-slate-500 text-sm">Waiting for the host to start a new game…</p>}>
        <button class="btn-primary text-lg" onClick={props.onResetGame}>
          Play Again
        </button>
      </Show>
    </div>
  );
}
