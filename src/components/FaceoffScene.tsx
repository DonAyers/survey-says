import { Show, For } from "solid-js";
import type { RoomView, Team } from "../types";
import Avatar from "./Avatar";
import TimerBar from "./TimerBar";

export default function FaceoffScene(props: {
  room: RoomView;
  isHost: boolean;
  myMemberId: string | null;
  guessInput: string;
  onGuessInput: (v: string) => void;
  onSubmitGuess: () => void;
  onBuzz: (teamId: string) => void;
}) {
  const fo = () => props.room.faceoff!;
  const repOf = (team: Team) => team.members.find((m) => fo().repIds.includes(m.id)) ?? team.members[0];
  const awaitingTeamId = () =>
    fo().stage === "await_first_guess" ? fo().buzzTeamId : fo().stage === "await_second_guess" ? otherTeamId() : null;
  const otherTeamId = () => {
    const buzz = fo().buzzTeamId;
    if (!buzz) return null;
    return props.room.teams[0].id === buzz ? props.room.teams[1].id : props.room.teams[0].id;
  };
  const awaitingRepIsHuman = () => {
    const teamId = awaitingTeamId();
    if (!teamId) return false;
    const team = props.room.teams.find((t) => t.id === teamId);
    const rep = team ? repOf(team) : null;
    return !!rep && !rep.isNPC;
  };
  // Host always allowed; a remote guest may only act when the room says
  // it's genuinely their member's turn.
  const canAct = () => props.isHost || (!!props.myMemberId && props.myMemberId === props.room.activeMemberId);
  const canBuzz = (teamId: string) => {
    if (props.isHost) return true;
    const team = props.room.teams.find((t) => t.id === teamId);
    const rep = team ? repOf(team) : null;
    return !!rep && rep.id === props.myMemberId;
  };

  return (
    <div class="w-full max-w-5xl flex flex-col gap-4 sm:gap-6 items-center">
      <div class="text-center">
        <p class="text-amber-400 font-black text-lg sm:text-xl uppercase tracking-widest">Face-Off — Round {props.room.roundNumber}</p>
        <p class="text-slate-400 text-sm">{props.room.multiplier}x points this round</p>
      </div>

      <div class="bg-board rounded-xl p-4 sm:p-6 text-center shadow-2xl border-4 border-amber-400 w-full">
        <p class="text-lg sm:text-2xl font-bold">{props.room.question.prompt}</p>
        <div class="flex flex-wrap justify-center gap-2 mt-3">
          <For each={props.room.question.answers}>
            {() => <span class="w-8 h-8 flex items-center justify-center bg-slate-800 rounded text-slate-500 font-bold">?</span>}
          </For>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:gap-8 w-full items-start">
        <For each={props.room.teams}>
          {(team, i) => {
            const rep = () => repOf(team);
            const isBuzzWinner = () => fo().buzzTeamId === team.id;
            const isAwaiting = () => awaitingTeamId() === team.id;
            const guess = () => (fo().firstGuess?.teamId === team.id ? fo().firstGuess : fo().secondGuess?.teamId === team.id ? fo().secondGuess : null);
            return (
              <div class={`flex flex-col items-center gap-2 sm:gap-3 ${i() === 1 ? "order-2" : ""}`}>
                <p class="font-bold text-base sm:text-lg text-center">{team.name}</p>
                <Show when={rep()}>{(r) => <Avatar member={r()} size="lg" highlighted={isAwaiting()} />}</Show>

                <Show when={fo().stage === "await_buzz"}>
                  <button
                    class="btn-danger text-xs sm:text-lg px-2 sm:px-6 py-2 sm:py-3 text-center"
                    disabled={!canBuzz(team.id)}
                    onClick={() => props.onBuzz(team.id)}
                  >
                    🔔 {team.name} Buzzed In!
                  </button>
                </Show>

                <Show when={fo().stage !== "await_buzz" && isBuzzWinner()}>
                  <p class="text-emerald-400 text-xs uppercase tracking-widest">Buzzed in first</p>
                </Show>

                <Show when={guess()}>
                  {(g) => (
                    <p class={`text-sm font-semibold ${g().matched ? "text-emerald-400" : "text-strike"}`}>
                      "{g().text || "(no answer)"}" {g().matched ? `— worth ${g().points}!` : "— not on the board"}
                    </p>
                  )}
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <TimerBar
        endsAt={props.room.timerEndsAt}
        durationMs={props.room.timerDurationMs}
        label={fo().stage === "await_buzz" ? "Time to buzz in" : "Time to answer"}
      />

      <Show when={fo().stage === "await_first_guess" || fo().stage === "await_second_guess"}>
        <div class="bg-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl w-full">
          <p class="text-slate-400 text-sm uppercase tracking-widest">
            {!awaitingRepIsHuman()
              ? "Waiting for the NPC to answer…"
              : canAct()
                ? "Your guess — what did the contestant say?"
                : "Waiting for the other contestant to answer…"}
          </p>
          <div class="flex flex-col sm:flex-row gap-2">
            <input
              class="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 disabled:opacity-40"
              type="text"
              placeholder="Type the guess…"
              value={props.guessInput}
              disabled={!awaitingRepIsHuman() || !canAct()}
              onInput={(e) => props.onGuessInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && props.onSubmitGuess()}
            />
            <button class="btn-primary" disabled={!awaitingRepIsHuman() || !canAct()} onClick={props.onSubmitGuess}>
              Submit
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
