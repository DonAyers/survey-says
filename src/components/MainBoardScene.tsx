import { For, Show } from "solid-js";
import type { Member, RoomView, Team } from "../types";
import Avatar from "./Avatar";
import TimerBar from "./TimerBar";

export default function MainBoardScene(props: {
  room: RoomView;
  isHost: boolean;
  myMemberId: string | null;
  guessInput: string;
  onGuessInput: (v: string) => void;
  onSubmitGuess: () => void;
  onStrike: () => void;
  flash: string | null;
}) {
  const controllingTeam = () => props.room.teams.find((t) => t.id === props.room.controllingTeamId);
  const stealTeam = () => props.room.teams.find((t) => t.id === props.room.stealTeamId);
  const isSteal = () => props.room.phase === "steal";

  const upMember = (team: Team) =>
    team.id === props.room.controllingTeamId && !isSteal() && team.members.length > 0
      ? team.members[props.room.turnMemberIndex % team.members.length]
      : null;

  const activeGuesserIsHuman = () => {
    if (isSteal()) {
      const team = stealTeam();
      return !!team && team.members.some((m) => !m.isNPC);
    }
    const team = controllingTeam();
    const member = team ? upMember(team) : null;
    return !!member && !member.isNPC;
  };

  // Host always allowed; a remote guest may only act on their own turn.
  const canAct = () => props.isHost || (!!props.myMemberId && props.myMemberId === props.room.activeMemberId);

  return (
    <div class="w-full max-w-6xl flex flex-col gap-5">
      <div class="flex justify-between items-center text-sm text-slate-400">
        <span>
          Round {props.room.roundNumber} / {props.room.totalRounds} — {props.room.multiplier}x points
        </span>
        <Show when={!isSteal()}>
          <span>
            On the board: <span class="text-amber-400 font-bold">{controllingTeam()?.name}</span>
          </span>
        </Show>
        <Show when={isSteal()}>
          <span class="text-strike font-black uppercase tracking-widest animate-pulse">
            Steal! {stealTeam()?.name} gets one shot
          </span>
        </Show>
      </div>

      <div class="grid grid-cols-[1fr_2fr_1fr] gap-4 items-start">
        {/* Left team panel */}
        <TeamPanel team={props.room.teams[0]} room={props.room} upMember={upMember} />

        {/* Center board */}
        <div class="flex flex-col gap-4">
          <div class="bg-board rounded-xl p-5 text-center shadow-2xl border-4 border-amber-400">
            <p class="text-xl font-bold">{props.room.question.prompt}</p>
          </div>

          <div class="flex justify-center">
            <TimerBar endsAt={props.room.timerEndsAt} durationMs={props.room.timerDurationMs} />
          </div>

          <div class="grid grid-cols-1 gap-2">
            <For each={props.room.question.answers}>
              {(answer, i) => (
                <div
                  class={`flex items-center justify-between rounded-lg px-4 py-2 font-bold border-2 ${
                    answer.revealed ? "bg-boardCell border-amber-300 text-white" : "bg-slate-800 border-slate-600 text-slate-600"
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

          <div class="flex items-center justify-center gap-4">
            <p class="text-slate-400 text-sm uppercase tracking-widest">Strikes</p>
            <div class="flex gap-2">
              <For each={[0, 1, 2]}>
                {(i) => <span class={`text-4xl font-black ${i < props.room.strikes ? "text-strike" : "text-slate-700"}`}>X</span>}
              </For>
            </div>
            <p class="text-slate-400 text-sm">Round pot: {props.room.roundPot}</p>
          </div>

          <div class="bg-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
            <p class="text-slate-400 text-sm uppercase tracking-widest">
              {!activeGuesserIsHuman()
                ? "Waiting for the NPC to answer…"
                : !canAct()
                  ? "Waiting for the active player to answer…"
                  : isSteal()
                    ? `Your guess — one shot for ${stealTeam()?.name} to steal the whole pot`
                    : "Your guess — a miss is an automatic strike and passes the turn"}
            </p>
            <div class="flex gap-2">
              <input
                class="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 disabled:opacity-40"
                type="text"
                placeholder="Type what the contestant guessed…"
                value={props.guessInput}
                disabled={!activeGuesserIsHuman() || !canAct()}
                onInput={(e) => props.onGuessInput(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && props.onSubmitGuess()}
              />
              <button class="btn-primary" disabled={!activeGuesserIsHuman() || !canAct()} onClick={props.onSubmitGuess}>
                Submit
              </button>
              <Show when={!isSteal()}>
                <button class="btn-danger" disabled={!props.isHost} onClick={props.onStrike}>
                  Strike!
                </button>
              </Show>
            </div>
            <Show when={props.flash}>
              <p class="text-strike text-sm font-semibold">{props.flash}</p>
            </Show>
          </div>
        </div>

        {/* Right team panel */}
        <TeamPanel team={props.room.teams[1]} room={props.room} upMember={upMember} />
      </div>
    </div>
  );
}

function TeamPanel(props: { team: Team; room: RoomView; upMember: (team: Team) => Member | null }) {
  const isControlling = () => props.team.id === props.room.controllingTeamId;
  const isStealing = () => props.team.id === props.room.stealTeamId;

  return (
    <div
      class={`bg-slate-800 rounded-xl p-4 shadow-xl border-2 flex flex-col gap-3 ${
        isControlling() || isStealing() ? "border-amber-400" : "border-transparent"
      }`}
    >
      <div class="flex justify-between items-baseline">
        <p class="font-bold text-lg">
          {(isControlling() || isStealing()) && <span class="text-amber-400 mr-1">▶</span>}
          {props.team.name}
        </p>
        <p class="text-2xl font-black text-amber-300">{props.team.score}</p>
      </div>
      <div class="flex flex-col gap-2 items-center">
        <For each={props.team.members}>
          {(m) => <Avatar member={m} highlighted={props.upMember(props.team)?.id === m.id} />}
        </For>
      </div>
    </div>
  );
}
