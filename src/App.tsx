import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Role, RoomView } from "./types";
import LobbyView from "./components/LobbyView";
import FaceoffScene from "./components/FaceoffScene";
import MainBoardScene from "./components/MainBoardScene";
import RevealCloseup from "./components/RevealCloseup";
import { RoundOverView, GameOverView } from "./components/RoundOverGameOver";
import { IntroSplash, HeaderLogo } from "./components/SurveyLogo";

function playerStorageKey(roomCode: string) {
  return `survey-says:player:${roomCode}`;
}

export default function App() {
  const [room, setRoom] = createSignal<RoomView | null>(null);
  const [connected, setConnected] = createSignal(false);
  const [role, setRole] = createSignal<Role>("host");
  const [myMemberId, setMyMemberId] = createSignal<string | null>(null);
  const [showIntro, setShowIntro] = createSignal(true);

  const [guessInput, setGuessInput] = createSignal("");
  const [flash, setFlash] = createSignal<string | null>(null);

  let socket: WebSocket | null = null;

  function flashMessage(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash((current) => (current === msg ? null : current)), 1800);
  }

  function connect() {
    const url = new URL(window.location.href);
    const requestedRoom = url.searchParams.get("room");
    const savedPlayerId = requestedRoom ? localStorage.getItem(playerStorageKey(requestedRoom)) : null;
    const params = new URLSearchParams();
    if (requestedRoom) params.set("room", requestedRoom);
    if (savedPlayerId) params.set("player", savedPlayerId);

    // In production the frontend (static, e.g. on Vercel) and the Bun WS
    // server (persistent process, e.g. on Fly.io) live on different hosts.
    // VITE_WS_URL points at that backend (e.g. "wss://survey-says.fly.dev");
    // if unset, fall back to same-origin (local dev proxy / same-host prod).
    const configuredBase = import.meta.env.VITE_WS_URL as string | undefined;
    let wsUrl: string;
    if (configuredBase) {
      const base = configuredBase.replace(/\/$/, "");
      wsUrl = `${base}/ws${params.toString() ? `?${params.toString()}` : ""}`;
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}/ws${params.toString() ? `?${params.toString()}` : ""}`;
    }

    socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));

    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "joined") {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("room", msg.code);
        window.history.replaceState({}, "", currentUrl.toString());
        localStorage.setItem(playerStorageKey(msg.code), msg.playerId);
        setRole(msg.role);
        setMyMemberId(msg.memberId ?? null);
      } else if (msg.type === "joined_as_player") {
        setMyMemberId(msg.memberId);
      } else if (msg.type === "state") {
        setRoom(msg.room);
      }
    });
  }

  onMount(connect);
  onCleanup(() => socket?.close());

  function send(payload: Record<string, unknown>) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function renameTeam(teamId: string, name: string) {
    send({ type: "rename_team", teamId, name });
  }

  function setLocalCount(teamId: string, count: number) {
    send({ type: "set_local_count", teamId, count });
  }

  function setTeamSize(teamId: string, size: number) {
    send({ type: "set_team_size", teamId, size });
  }

  function addNpc(teamId: string, intelligence: number) {
    send({ type: "add_npc", teamId, intelligence });
  }

  function removeMember(teamId: string, memberId: string) {
    send({ type: "remove_member", teamId, memberId });
  }

  function setAvatarSeed(teamId: string, memberId: string, seed: string) {
    send({ type: "set_avatar_seed", teamId, memberId, seed });
  }

  function joinAsPlayer(teamId: string, name: string) {
    send({ type: "join_as_player", teamId, name });
  }

  function startGame(fillIntelligence: number) {
    send({ type: "start_game", fillIntelligence });
  }

  function buzz(teamId: string) {
    send({ type: "buzz", teamId });
  }

  function submitGuess() {
    const text = guessInput().trim();
    if (!text) return;
    const r = room();
    const wasRevealedCount = r ? r.question.answers.filter((a) => a.revealed).length : 0;
    const wasStrikes = r?.strikes ?? 0;
    send({ type: "guess", text });
    setGuessInput("");
    setTimeout(() => {
      const after = room();
      const afterCount = after ? after.question.answers.filter((a) => a.revealed).length : 0;
      const afterStrikes = after?.strikes ?? 0;
      if (after && afterCount === wasRevealedCount && afterStrikes > wasStrikes) {
        flashMessage(`"${text}" isn't on the board. STRIKE!`);
      }
    }, 150);
  }

  function strike() {
    send({ type: "strike" });
  }

  function nextRound() {
    send({ type: "next_round" });
  }

  function resetGame() {
    send({ type: "reset_game" });
  }

  return (
    <div class="min-h-screen bg-slate-900 text-white flex flex-col items-center p-6 gap-6">
      <Show when={showIntro()}>
        <IntroSplash onDone={() => setShowIntro(false)} />
      </Show>

      <header class="text-center flex flex-col items-center gap-2">
        <HeaderLogo />
        <p class="text-slate-400 text-sm italic">
          Where your coworkers' terrible opinions become a competitive sport.
        </p>
      </header>

      <Show when={!connected()}>
        <p class="text-slate-400">Connecting to game server…</p>
      </Show>

      <Show when={room() && role() === "guest"}>
        <p class="text-emerald-400 text-xs uppercase tracking-widest -mt-4">
          {myMemberId() ? "Playing remotely" : "Joined as a guest"}
        </p>
      </Show>

      <Show when={room()}>
        {(r) => (
          <>
            <Show when={r().phase === "lobby"}>
              <LobbyView
                room={r()}
                isHost={role() === "host"}
                myMemberId={myMemberId()}
                onRenameTeam={renameTeam}
                onSetLocalCount={setLocalCount}
                onAddNpc={addNpc}
                onSetTeamSize={setTeamSize}
                onRemoveMember={removeMember}
                onStartGame={startGame}
                onJoinAsPlayer={joinAsPlayer}
                onSetAvatarSeed={setAvatarSeed}
              />
            </Show>

            <Show when={r().phase === "faceoff"}>
              <FaceoffScene
                room={r()}
                isHost={role() === "host"}
                myMemberId={myMemberId()}
                guessInput={guessInput()}
                onGuessInput={setGuessInput}
                onSubmitGuess={submitGuess}
                onBuzz={buzz}
              />
            </Show>

            <Show when={r().phase === "board" || r().phase === "steal"}>
              <MainBoardScene
                room={r()}
                isHost={role() === "host"}
                myMemberId={myMemberId()}
                guessInput={guessInput()}
                onGuessInput={setGuessInput}
                onSubmitGuess={submitGuess}
                onStrike={strike}
                flash={flash()}
              />
              <RevealCloseup room={r()} />
            </Show>

            <Show when={r().phase === "round_over"}>
              <RoundOverView room={r()} isHost={role() === "host"} onNextRound={nextRound} />
            </Show>

            <Show when={r().phase === "game_over"}>
              <GameOverView room={r()} isHost={role() === "host"} onResetGame={resetGame} />
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
