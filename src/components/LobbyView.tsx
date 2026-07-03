// Backstage game-show lobby: a theater marquee for the room code, two
// color-coded team "booths" (gold vs magenta, echoing the logo's ✓/✗), and
// chunky dial-style controls. All bespoke visual effects (flip tiles, bulb
// chase, reskinned range sliders, shine-sweep button) live in the injected
// <style> block below, following the same pattern as SurveyLogo.tsx.
import { createSignal, For, Show } from "solid-js";
import type { RoomView, Team } from "../types";
import CharacterSprite, { PRESET_SEEDS, randomAvatarSeed } from "./CharacterSprite";

const TEAM_ACCENTS = ["ls-team-gold", "ls-team-magenta"] as const;

export default function LobbyView(props: {
  room: RoomView;
  isHost: boolean;
  myMemberId: string | null;
  onRenameTeam: (teamId: string, name: string) => void;
  onSetLocalCount: (teamId: string, count: number) => void;
  onAddNpc: (teamId: string, intelligence: number) => void;
  onSetTeamSize: (teamId: string, size: number) => void;
  onRemoveMember: (teamId: string, memberId: string) => void;
  onStartGame: (fillIntelligence: number) => void;
  onJoinAsPlayer: (teamId: string, name: string) => void;
  onSetAvatarSeed: (teamId: string, memberId: string, seed: string) => void;
}) {
  const [fillIQ, setFillIQ] = createSignal(50);
  const [copied, setCopied] = createSignal(false);
  const rosterCount = () => props.room.teams.reduce((sum, t) => sum + t.members.length, 0);
  const anyRoomForBots = () => props.room.teams.some((t) => t.members.length < t.targetSize);
  const canStart = () => props.room.teams.every((t) => t.members.length > 0 || t.targetSize > 0);
  const alreadyJoined = () => props.room.teams.some((t) => t.members.some((m) => m.id === props.myMemberId));

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(props.room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard denied — silently ignore, code is visible anyway */
    }
  }

  return (
    <div class="ls-stage w-full max-w-4xl rounded-2xl p-6 md:p-8 flex flex-col gap-6">
      <style>{CSS}</style>
      <div class="ls-bulb-row" aria-hidden="true">
        <For each={Array.from({ length: 24 })}>{(_, i) => <span class="ls-bulb" style={{ "animation-delay": `${i() * 90}ms` }} />}</For>
      </div>

      <div class="text-center flex flex-col items-center gap-2">
        <p class="ls-eyebrow">Room Code</p>
        <div class="flex gap-1.5">
          <For each={props.room.code.split("")}>
            {(ch, i) => (
              <span class="ls-tile" style={{ "--tilt": `${(i() % 2 === 0 ? -1 : 1) * (2 + (i() % 3))}deg` }}>
                {ch}
              </span>
            )}
          </For>
        </div>
        <button class="ls-copy-btn" onClick={copyCode} title="Copy room code">
          {copied() ? "✓ Copied" : "Copy"}
        </button>
        <p class="ls-caption max-w-lg">
          Share this code — anyone who opens the site and enters it joins as a real player on their own device.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <For each={props.room.teams}>
          {(team, i) => (
            <TeamSetup
              team={team}
              accent={TEAM_ACCENTS[i() % TEAM_ACCENTS.length]}
              isHost={props.isHost}
              myMemberId={props.myMemberId}
              alreadyJoinedAnywhere={alreadyJoined()}
              onRename={props.onRenameTeam}
              onSetLocalCount={props.onSetLocalCount}
              onAddNpc={props.onAddNpc}
              onSetTeamSize={props.onSetTeamSize}
              onRemoveMember={props.onRemoveMember}
              onJoinAsPlayer={props.onJoinAsPlayer}
              onSetAvatarSeed={props.onSetAvatarSeed}
            />
          )}
        </For>
      </div>

      <Show when={props.isHost}>
        <div class="ls-dial-row">
          <span class="ls-dial-label">Auto-fill Bot IQ</span>
          <input
            class="ls-slider ls-slider-magenta flex-1"
            type="range"
            min="0"
            max="100"
            value={fillIQ()}
            style={{ "--fill": `${fillIQ()}%` }}
            onInput={(e) => setFillIQ(Number(e.currentTarget.value))}
          />
          <span class="ls-dial-value">{fillIQ()}</span>
        </div>

        <button class="ls-start-btn" disabled={!canStart()} onClick={() => props.onStartGame(fillIQ())}>
          <span>Start Game</span>
        </button>

        <Show when={anyRoomForBots()}>
          <p class="ls-caption text-center">Any open slots below each team's target size get auto-filled with bots at kickoff.</p>
        </Show>
        <Show when={rosterCount() === 0}>
          <p class="ls-caption text-center">Add at least one local player, wait for remote joiners, or bump up a team size to auto-fill with bots.</p>
        </Show>
      </Show>
      <Show when={!props.isHost}>
        <p class="ls-caption text-center animate-pulse">Waiting for the host to start the game…</p>
      </Show>

      <p class="ls-rules-strip">
        <span>🎯 3 rounds: single → double → triple points</span>
        <span class="ls-rules-dot">•</span>
        <span>🥊 Face-off decides who controls the board</span>
      </p>
    </div>
  );
}

function kindLabel(kind: Team["members"][number]["kind"], intelligence: number): string {
  if (kind === "bot") return `BOT · IQ ${intelligence}`;
  if (kind === "remote") return "REMOTE";
  return "LOCAL";
}

function TeamSetup(props: {
  team: Team;
  accent: (typeof TEAM_ACCENTS)[number];
  isHost: boolean;
  myMemberId: string | null;
  alreadyJoinedAnywhere: boolean;
  onRename: (teamId: string, name: string) => void;
  onSetLocalCount: (teamId: string, count: number) => void;
  onAddNpc: (teamId: string, intelligence: number) => void;
  onSetTeamSize: (teamId: string, size: number) => void;
  onRemoveMember: (teamId: string, memberId: string) => void;
  onJoinAsPlayer: (teamId: string, name: string) => void;
  onSetAvatarSeed: (teamId: string, memberId: string, seed: string) => void;
}) {
  const [nameDraft, setNameDraft] = createSignal(props.team.name);
  const [npcIQ, setNpcIQ] = createSignal(50);
  const [joinName, setJoinName] = createSignal("");
  const [pickerFor, setPickerFor] = createSignal<string | null>(null);
  const localCount = () => props.team.members.filter((m) => m.kind === "local").length;
  const sliderAccent = () => (props.accent === "ls-team-gold" ? "ls-slider-gold" : "ls-slider-magenta");
  const canEditAvatar = (memberId: string) => props.isHost || memberId === props.myMemberId;

  function commitName() {
    const v = nameDraft().trim();
    if (v && v !== props.team.name) props.onRename(props.team.id, v);
  }

  function join() {
    const v = joinName().trim();
    if (!v) return;
    props.onJoinAsPlayer(props.team.id, v);
  }

  return (
    <div class={`ls-booth ${props.accent}`}>
      <div class="ls-booth-header">
        <Show when={props.isHost} fallback={<p class="ls-nameplate">{props.team.name}</p>}>
          <input
            class="ls-nameplate-input"
            value={nameDraft()}
            onInput={(e) => setNameDraft(e.currentTarget.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && commitName()}
            maxlength={24}
          />
        </Show>
        <span class="ls-team-count">{props.team.members.length}/{props.team.targetSize}</span>
      </div>

      <Show when={props.isHost}>
        <div class="ls-control-row">
          <span class="ls-control-label">Local players (this device)</span>
          <div class="ls-stepper">
            <button class="ls-stepper-btn" onClick={() => props.onSetLocalCount(props.team.id, Math.max(0, localCount() - 1))}>
              −
            </button>
            <span class="ls-stepper-value">{localCount()}</span>
            <button class="ls-stepper-btn" onClick={() => props.onSetLocalCount(props.team.id, localCount() + 1)}>
              +
            </button>
          </div>
        </div>

        <div class="ls-control-row">
          <span class="ls-control-label">Team size (target)</span>
          <div class="ls-stepper">
            <button class="ls-stepper-btn" onClick={() => props.onSetTeamSize(props.team.id, Math.max(1, props.team.targetSize - 1))}>
              −
            </button>
            <span class="ls-stepper-value">{props.team.targetSize}</span>
            <button class="ls-stepper-btn" onClick={() => props.onSetTeamSize(props.team.id, props.team.targetSize + 1)}>
              +
            </button>
          </div>
        </div>

        <div class="ls-dial-row">
          <span class="ls-dial-label">NPC IQ</span>
          <input
            class={`ls-slider ${sliderAccent()} flex-1`}
            type="range"
            min="0"
            max="100"
            value={npcIQ()}
            style={{ "--fill": `${npcIQ()}%` }}
            onInput={(e) => setNpcIQ(Number(e.currentTarget.value))}
          />
          <span class="ls-dial-value">{npcIQ()}</span>
          <button class="ls-add-npc-btn" onClick={() => props.onAddNpc(props.team.id, npcIQ())}>
            🤖 Add
          </button>
        </div>
      </Show>

      <Show when={!props.isHost && !props.alreadyJoinedAnywhere}>
        <div class="ls-join-row">
          <input
            class="ls-join-input"
            type="text"
            placeholder="Your name"
            value={joinName()}
            onInput={(e) => setJoinName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            maxlength={24}
          />
          <button class="ls-join-btn" onClick={join}>
            Join {props.team.name}
          </button>
        </div>
      </Show>

      <ul class="ls-roster">
        <Show when={props.team.members.length === 0}>
          <li class="ls-roster-empty">No members yet.</li>
        </Show>
        <For each={props.team.members}>
          {(m) => (
            <li class="ls-roster-tag ls-roster-tag-avatar">
              <div class="ls-roster-main">
                <button
                  class="ls-sprite-btn"
                  disabled={!canEditAvatar(m.id)}
                  title={canEditAvatar(m.id) ? "Pick a look" : undefined}
                  onClick={() => setPickerFor((cur) => (cur === m.id ? null : m.id))}
                >
                  <CharacterSprite seed={m.avatarSeed} size="sm" isNPC={m.isNPC} />
                </button>
                <span class="ls-roster-name">
                  {m.name}
                  {m.id === props.myMemberId && <span class="ls-you-badge">YOU</span>}
                </span>
                <span class="ls-roster-right">
                  <span class={`ls-kind-chip ls-kind-${m.kind}`}>{kindLabel(m.kind, m.intelligence)}</span>
                  <Show when={canEditAvatar(m.id)}>
                    <button
                      class="ls-reroll-btn"
                      title="Randomize look"
                      onClick={() => props.onSetAvatarSeed(props.team.id, m.id, randomAvatarSeed())}
                    >
                      🎲
                    </button>
                  </Show>
                  <Show when={props.isHost}>
                    <button class="ls-remove-btn" onClick={() => props.onRemoveMember(props.team.id, m.id)}>
                      ✕
                    </button>
                  </Show>
                </span>
              </div>
              <Show when={pickerFor() === m.id}>
                <div class="ls-sprite-picker">
                  <For each={PRESET_SEEDS}>
                    {(seed) => (
                      <button
                        class={`ls-sprite-swatch ${seed === m.avatarSeed ? "ls-sprite-swatch-active" : ""}`}
                        onClick={() => {
                          props.onSetAvatarSeed(props.team.id, m.id, seed);
                          setPickerFor(null);
                        }}
                      >
                        <CharacterSprite seed={seed} size="sm" isNPC={m.isNPC} />
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

const CSS = `
.ls-stage {
  position: relative;
  background:
    radial-gradient(120% 90% at 15% -10%, rgba(217,167,46,.14), transparent 55%),
    radial-gradient(120% 90% at 85% 0%, rgba(217,66,163,.14), transparent 55%),
    linear-gradient(180deg, #0c1220 0%, #070a12 100%);
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 30px 70px -25px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.05);
  overflow: hidden;
}
.ls-stage::before {
  content: "";
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(255,255,255,.05) 1px, transparent 1.5px);
  background-size: 22px 22px;
  opacity: .5;
  pointer-events: none;
}
.ls-bulb-row { display: flex; justify-content: space-between; padding: 0 2px; position: relative; z-index: 1; }
.ls-bulb {
  width: 6px; height: 6px; border-radius: 50%;
  background: #f2d573;
  box-shadow: 0 0 6px 2px rgba(242,213,115,.7);
  animation: ls-twinkle 2.4s ease-in-out infinite;
}
@keyframes ls-twinkle { 0%, 100% { opacity: .25; transform: scale(.8); } 50% { opacity: 1; transform: scale(1.15); } }

.ls-eyebrow {
  font: 700 .7rem/1 "Bungee", sans-serif; letter-spacing: .3em; text-transform: uppercase;
  color: #7c8aa8; position: relative; z-index: 1;
}
.ls-caption { color: #64748b; font-size: .78rem; position: relative; z-index: 1; }
.ls-rules-strip {
  text-align: center; color: #55617c; font-size: .74rem; position: relative; z-index: 1;
  display: flex; align-items: center; justify-content: center; gap: .6rem; flex-wrap: wrap;
}
.ls-rules-dot { color: #3a4256; }

.ls-tile {
  --tilt: 0deg;
  display: inline-flex; align-items: center; justify-content: center;
  width: 3.1rem; height: 3.6rem;
  font: 900 2.1rem/1 "Bevan", serif;
  color: #ffe9ad;
  background: linear-gradient(180deg, #21283b 0%, #12172a 100%);
  border-radius: 8px;
  border: 2px solid rgba(242,213,115,.35);
  box-shadow: 0 6px 0 rgba(0,0,0,.4), 0 10px 18px -6px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.12), 0 0 18px rgba(242,213,115,.18);
  transform: rotate(var(--tilt));
  text-shadow: 0 0 12px rgba(242,213,115,.55);
  position: relative; z-index: 1;
}
.ls-copy-btn {
  font: 700 .68rem/1 "Bungee", sans-serif; letter-spacing: .05em; text-transform: uppercase;
  color: #0c1220; background: linear-gradient(180deg, #ffe9ad, #d9a72e);
  border: none; border-radius: 999px; padding: .55rem 1rem; cursor: pointer;
  box-shadow: 0 4px 0 #8a6a1a, 0 6px 14px -4px rgba(0,0,0,.5);
  transition: transform .12s ease;
  position: relative; z-index: 1;
  min-width: 6.5rem;
}
.ls-copy-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #8a6a1a; }

.ls-booth {
  position: relative; z-index: 1;
  border-radius: 14px; padding: 1.1rem;
  display: flex; flex-direction: column; gap: .7rem;
  background: linear-gradient(160deg, rgba(255,255,255,.04), rgba(255,255,255,.01));
  border: 2px solid var(--booth-line);
  box-shadow: 0 0 0 1px rgba(0,0,0,.3) inset, 0 16px 30px -18px rgba(0,0,0,.7);
}
.ls-team-gold { --booth-line: rgba(217,167,46,.5); --booth-glow: rgba(242,213,115,.16); }
.ls-team-magenta { --booth-line: rgba(217,66,163,.5); --booth-glow: rgba(233,99,183,.16); }
.ls-booth::before {
  content: ""; position: absolute; inset: 0; border-radius: 14px;
  background: radial-gradient(140% 60% at 50% -10%, var(--booth-glow), transparent 60%);
  pointer-events: none;
}
.ls-booth-header { display: flex; align-items: center; gap: .6rem; }
.ls-nameplate, .ls-nameplate-input {
  font: 700 1.15rem/1.1 "Bevan", serif; letter-spacing: .02em;
  color: #ffe9ad;
}
.ls-team-magenta .ls-nameplate, .ls-team-magenta .ls-nameplate-input { color: #f5a8dc; }
.ls-nameplate-input {
  background: rgba(0,0,0,.25); border: 1px solid var(--booth-line); border-radius: 8px;
  padding: .4rem .7rem; flex: 1; min-width: 0;
}
.ls-team-count {
  margin-left: auto; font: 700 .7rem/1 "Bungee", sans-serif; color: #8b96af;
  background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.08);
  border-radius: 999px; padding: .3rem .6rem;
}

.ls-control-row, .ls-dial-row {
  display: flex; align-items: center; gap: .6rem;
  background: rgba(0,0,0,.28); border-radius: 10px; padding: .5rem .7rem;
  border: 1px solid rgba(255,255,255,.06);
}
.ls-control-label, .ls-dial-label {
  font: 700 .68rem/1 "Bungee", sans-serif; letter-spacing: .05em; text-transform: uppercase;
  color: #8b96af; white-space: nowrap;
}
.ls-dial-label { margin-right: .1rem; }
.ls-dial-value { font: 800 1rem/1 "Bevan", serif; color: #e9c3f5; width: 2rem; text-align: right; }
.ls-team-gold .ls-dial-value { color: #ffe9ad; }

.ls-stepper { display: flex; align-items: center; gap: .5rem; margin-left: auto; }
.ls-stepper-btn {
  width: 1.9rem; height: 1.9rem; border-radius: 50%; border: none; cursor: pointer;
  font: 900 1rem/1 sans-serif; color: #0c1220;
  background: linear-gradient(180deg, #e2e8f5, #a9b4cc);
  box-shadow: 0 3px 0 #5c6580, 0 5px 10px -3px rgba(0,0,0,.5);
  transition: transform .1s ease;
}
.ls-stepper-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #5c6580; }
.ls-stepper-value { width: 1.4rem; text-align: center; font: 800 1rem/1 "Bevan", serif; }

.ls-slider {
  -webkit-appearance: none; appearance: none; height: 8px; border-radius: 999px; cursor: pointer;
  background: linear-gradient(90deg, var(--track-fill, #d9a72e) 0%, var(--track-fill, #d9a72e) var(--fill, 50%), rgba(255,255,255,.12) var(--fill, 50%));
}
.ls-slider-gold { --track-fill: #d9a72e; }
.ls-slider-magenta { --track-fill: #d942a3; }
.ls-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, var(--track-fill, #d9a72e) 70%);
  box-shadow: 0 0 0 3px rgba(0,0,0,.4), 0 0 10px var(--track-fill, #d9a72e);
  cursor: pointer; margin-top: -5px;
}
.ls-slider::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%; border: none;
  background: radial-gradient(circle at 35% 30%, #fff, var(--track-fill, #d9a72e) 70%);
  box-shadow: 0 0 0 3px rgba(0,0,0,.4), 0 0 10px var(--track-fill, #d9a72e);
  cursor: pointer;
}

.ls-add-npc-btn {
  font: 700 .72rem/1 "Bungee", sans-serif; letter-spacing: .03em;
  color: #fff; background: linear-gradient(180deg, #6b7591, #454e68);
  border: none; border-radius: 8px; padding: .5rem .7rem; cursor: pointer; white-space: nowrap;
  box-shadow: 0 3px 0 #262c3d;
  transition: transform .1s ease;
}
.ls-add-npc-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #262c3d; }

.ls-join-row { display: flex; gap: .5rem; }
.ls-join-input {
  flex: 1; min-width: 0; background: rgba(0,0,0,.3); border: 1px solid var(--booth-line);
  border-radius: 8px; padding: .5rem .7rem; color: #fff;
}
.ls-join-input::placeholder { color: #5b6478; }
.ls-join-btn {
  font: 700 .78rem/1 "Bungee", sans-serif; white-space: nowrap; cursor: pointer;
  color: #0c1220; background: linear-gradient(180deg, #ffe9ad, #d9a72e);
  border: none; border-radius: 8px; padding: .55rem 1rem;
  box-shadow: 0 3px 0 #8a6a1a;
}
.ls-team-magenta .ls-join-btn { background: linear-gradient(180deg, #f5a8dc, #d942a3); box-shadow: 0 3px 0 #8a2668; }

.ls-roster { display: flex; flex-direction: column; gap: .35rem; }
.ls-roster-empty { color: #5b6478; font-style: italic; font-size: .85rem; }
.ls-roster-tag {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(0,0,0,.25); border-radius: 8px; padding: .4rem .6rem;
  border-left: 3px solid var(--booth-line);
}
.ls-roster-tag-avatar { flex-direction: column; align-items: stretch; gap: .4rem; }
.ls-roster-main { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.ls-sprite-btn {
  background: none; border: none; padding: 0; cursor: pointer; line-height: 0;
  border-radius: 999px; flex-shrink: 0; transition: transform .15s ease;
}
.ls-sprite-btn:not(:disabled):hover { transform: scale(1.12); }
.ls-sprite-btn:disabled { cursor: default; }
.ls-roster-name { font-weight: 600; font-size: .9rem; flex: 1; }
.ls-you-badge {
  margin-left: .4rem; font: 800 .58rem/1 "Bungee", sans-serif; color: #0c1220;
  background: #6ee7b7; border-radius: 999px; padding: .18rem .4rem; vertical-align: middle;
}
.ls-roster-right { display: flex; align-items: center; gap: .5rem; }
.ls-kind-chip {
  font: 700 .6rem/1 "Bungee", sans-serif; letter-spacing: .04em;
  padding: .28rem .5rem; border-radius: 999px;
}
.ls-kind-local { background: rgba(110,231,183,.15); color: #6ee7b7; }
.ls-kind-remote { background: rgba(96,165,250,.15); color: #93c5fd; }
.ls-kind-bot { background: rgba(233,99,183,.15); color: #f0a8dc; }
.ls-reroll-btn {
  background: none; border: none; cursor: pointer; font-size: .95rem;
  filter: grayscale(.2); transition: transform .15s ease;
}
.ls-reroll-btn:hover { transform: rotate(-18deg) scale(1.2); filter: none; }
.ls-remove-btn { color: #5b6478; background: none; border: none; cursor: pointer; font-size: .8rem; }
.ls-remove-btn:hover { color: #e24a4a; }
.ls-sprite-picker {
  display: flex; flex-wrap: wrap; gap: .3rem; padding: .4rem;
  background: rgba(0,0,0,.3); border-radius: 8px;
}
.ls-sprite-swatch {
  background: rgba(255,255,255,.06); border: 2px solid transparent; border-radius: 8px;
  padding: .2rem; cursor: pointer; line-height: 0; transition: transform .12s ease, border-color .12s ease;
}
.ls-sprite-swatch:hover { transform: scale(1.08); border-color: rgba(255,255,255,.3); }
.ls-sprite-swatch-active { border-color: #ffce54; }

.ls-start-btn {
  position: relative; overflow: hidden;
  font: 800 1.3rem/1 "Bevan", serif; letter-spacing: .04em;
  color: #0c1220; padding: .9rem 1rem; border-radius: 12px; border: none; cursor: pointer;
  background: linear-gradient(180deg, #6ee7b7, #2fae7c);
  box-shadow: 0 6px 0 #1c6b4c, 0 14px 26px -10px rgba(46,174,124,.6);
  transition: transform .12s ease, filter .2s ease;
}
.ls-start-btn:disabled { filter: grayscale(.6) brightness(.7); cursor: not-allowed; box-shadow: 0 6px 0 #333c33; }
.ls-start-btn:not(:disabled):active { transform: translateY(4px); box-shadow: 0 2px 0 #1c6b4c; }
.ls-start-btn:not(:disabled)::after {
  content: ""; position: absolute; inset: -20%;
  background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.4) 50%, transparent 60%);
  animation: ls-sheen 2.8s linear infinite;
}
@keyframes ls-sheen { from { transform: translateX(-45%); } to { transform: translateX(45%); } }
`;
