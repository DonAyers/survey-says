// server.ts — Bun static file server + native WebSocket game server for
// "Survey Says", a snarky Family Feud clone. Room state lives entirely
// in-memory in `rooms`. Run with: bun run server.ts
//
// Game flow mirrors the real show:
//   lobby -> faceoff (buzz-in + guess-off for board control)
//         -> board ("go down the line": wrong guess passes the turn to the
//            next teammate, 3 strikes ends the team's turn)
//         -> steal (other team gets one shot at the whole remaining pot)
//         -> round_over -> next round (faceoff again, higher point multiplier)
//         -> game_over after the last round
//
// NPC "intelligence" (0-100) is a flat percent chance to pick a genuinely
// correct board answer instead of a plausible-sounding wrong one; see
// `pickNpcAnswer` for the single place this logic lives — that's also
// exactly where a real model call (local LLM, hosted API, whatever) could
// be dropped in later without touching the rest of the game loop.

import { PRESET_SEEDS } from "./src/spritePresets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Answer {
  text: string;
  points: number;
  revealed: boolean;
}

interface Question {
  prompt: string;
  answers: Answer[];
}

// "local"  -> host-controlled human, typed in by the host on their own device
// "remote" -> human who joined over the network with the room code; only
//             their own socket may submit guesses/buzzes on their behalf
// "bot"    -> NPC, driven by `pickNpcAnswer`
type MemberKind = "local" | "remote" | "bot";

interface Member {
  id: string;
  name: string;
  isNPC: boolean;
  intelligence: number; // 0-100, only meaningful for NPCs
  kind: MemberKind;
  claimedBy?: string; // playerId of the socket that owns a "remote" member
  avatarSeed: string; // deterministic seed the frontend hashes into a procedural sprite look
}

interface Team {
  id: string;
  name: string;
  score: number;
  members: Member[];
  faceoffIndex: number; // rotates which member reps the team at face-off
  targetSize: number; // desired roster size; unfilled slots auto-fill with bots at kickoff
}

type Phase = "lobby" | "faceoff" | "board" | "steal" | "round_over" | "game_over";

type FaceoffStage = "await_buzz" | "await_first_guess" | "await_second_guess" | "resolved";

interface FaceoffGuess {
  teamId: string;
  text: string;
  points: number;
  matched: boolean;
}

interface FaceoffState {
  repIds: [string, string]; // rep for teams[0], teams[1] this round
  buzzTeamId: string | null;
  firstGuess: FaceoffGuess | null;
  secondGuess: FaceoffGuess | null;
  stage: FaceoffStage;
}

interface Room {
  code: string;
  teams: [Team, Team];
  roundIndex: number; // 0-based index into ROUND_MULTIPLIERS
  multiplier: number;
  controllingTeamId: string | null;
  turnMemberIndex: number; // index into controlling team's members, "up next"
  stealTeamId: string | null;
  strikes: number;
  phase: Phase;
  roundPot: number; // points already revealed/awarded this round (scaled)
  timerEndsAt: number | null;
  timerDurationMs: number | null;
  faceoff: FaceoffState | null;
  createdAt: number;
  hostPlayerId: string;
}

type Role = "host" | "guest";

interface SocketData {
  roomId: string;
  playerId: string;
  role: Role;
  memberId: string | null;
}

// ---------------------------------------------------------------------------
// Question bank — loaded from data/questions.jsonl (converted from the
// shared Family Feud question spreadsheet). Falls back to a small hardcoded
// sarcastic set if the file can't be read, so the game never has zero
// content.
// ---------------------------------------------------------------------------

interface QuestionSeed {
  prompt: string;
  answers: [string, number][];
}

const FALLBACK_QUESTIONS: QuestionSeed[] = [
  {
    prompt: "Name something you lie about on your resume.",
    answers: [
      ["Proficient in Excel", 38],
      ["Team player", 27],
      ["Years of experience", 18],
      ["Actually read the training manual", 11],
      ["Enjoys public speaking", 6],
    ],
  },
  {
    prompt: "Name a reason your coworker gives for being late that nobody believes.",
    answers: [
      ["Traffic", 41],
      ["Alarm didn't go off", 24],
      ["Car wouldn't start", 16],
      ["Dog ate my keys", 12],
      ["Was 'just about to leave'", 7],
    ],
  },
  {
    prompt: "Name something people pretend to enjoy but secretly hate.",
    answers: [
      ["Small talk", 35],
      ["Office birthday parties", 29],
      ["Group projects", 20],
      ["Kale", 10],
      ["Icebreaker games", 6],
    ],
  },
];

async function loadQuestionBank(): Promise<QuestionSeed[]> {
  try {
    const file = Bun.file(new URL("./data/questions.jsonl", import.meta.url));
    if (!(await file.exists())) return FALLBACK_QUESTIONS;
    const text = await file.text();
    const seeds: QuestionSeed[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed) as { prompt: string; answers: { text: string; points: number }[] };
      if (!parsed.prompt || !Array.isArray(parsed.answers) || parsed.answers.length === 0) continue;
      seeds.push({
        prompt: parsed.prompt,
        answers: parsed.answers.map((a) => [a.text, a.points] as [string, number]),
      });
    }
    return seeds.length > 0 ? seeds : FALLBACK_QUESTIONS;
  } catch {
    return FALLBACK_QUESTIONS;
  }
}

const QUESTION_BANK: QuestionSeed[] = await loadQuestionBank();
console.log(`Loaded ${QUESTION_BANK.length} questions.`);

// Flat pool of every answer text across the whole bank, used to hand NPCs a
// plausible-sounding *wrong* guess (an answer that's real, just not to this
// question) instead of an obviously fake placeholder string.
const WRONG_ANSWER_POOL: string[] = QUESTION_BANK.flatMap((q) => q.answers.map(([text]) => text));

// Fisher-Yates shuffle so repeated games (and rooms) don't always see
// questions in the same order.
function shuffledQuestionOrder(): number[] {
  const order = QUESTION_BANK.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function buildQuestion(seedIndex: number): Question {
  const seed = QUESTION_BANK[seedIndex % QUESTION_BANK.length];
  return {
    prompt: seed.prompt,
    answers: seed.answers.map(([text, points]) => ({ text, points, revealed: false })),
  };
}

// Per-room live question + question order state, kept out of `Room` so the
// serialized room stays small and broadcast-friendly.
const roomQuestions = new Map<string, Question>();
const roomQuestionOrder = new Map<string, number[]>();

function currentQuestion(room: Room): Question {
  return roomQuestions.get(room.code)!;
}

// ---------------------------------------------------------------------------
// Round structure — real Family Feud increases the point value each round:
// single (1x), double (2x), triple (3x). We play exactly one question per
// round, three rounds per game, then it's over (Fast Money bonus round is
// intentionally out of scope for this prototype).
// ---------------------------------------------------------------------------

const ROUND_MULTIPLIERS = [1, 2, 3];

// ---------------------------------------------------------------------------
// Timers — each room gets at most one live countdown (buzz window, turn
// timer, or steal timer). Kept in a side map since timeout handles aren't
// serializable. Durations are tracked in milliseconds so NPC "thinking
// delays" (randomized, sub-second precision) share the exact same machinery
// as the human pressure timers.
// ---------------------------------------------------------------------------

const TURN_MS = 20_000;
const STEAL_MS = 15_000;
const BUZZ_MS = 10_000;

function npcThinkDelayMs(): number {
  return 1200 + Math.random() * 2000; // 1.2s-3.2s, just enough to feel alive
}

const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearRoomTimer(roomCode: string) {
  const handle = roomTimers.get(roomCode);
  if (handle) {
    clearTimeout(handle);
    roomTimers.delete(roomCode);
  }
}

function startTimer(room: Room, durationMs: number, onExpire: (room: Room) => void) {
  clearRoomTimer(room.code);
  room.timerDurationMs = durationMs;
  room.timerEndsAt = Date.now() + durationMs;
  const handle = setTimeout(() => {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom) return;
    onExpire(liveRoom);
    broadcastRoom(liveRoom);
  }, durationMs);
  roomTimers.set(room.code, handle);
}

function stopTimer(room: Room) {
  clearRoomTimer(room.code);
  room.timerEndsAt = null;
  room.timerDurationMs = null;
}

// ---------------------------------------------------------------------------
// NPC "brain" — deterministic, local, zero-cost stand-in for a real model.
// `intelligence` is a literal percent chance of picking a genuinely correct
// (unrevealed) board answer; higher intelligence also biases *which*
// correct answer they reach for (smart NPCs go straight for the top of the
// board, dumb ones grab whatever). A miss returns a real answer text from a
// *different* question, so it reads as a plausible guess rather than
// obvious filler.
// ---------------------------------------------------------------------------

function pickNpcAnswer(question: Question, intelligence: number): string {
  const roll = Math.random() * 100;
  const unrevealed = question.answers.filter((a) => !a.revealed);

  if (roll < intelligence && unrevealed.length > 0) {
    const sorted = [...unrevealed].sort((a, b) => b.points - a.points);
    const index = intelligence >= 75 ? 0 : Math.floor(Math.random() * sorted.length);
    return sorted[index].text;
  }

  return WRONG_ANSWER_POOL[Math.floor(Math.random() * WRONG_ANSWER_POOL.length)];
}

// If every member of a team is an NPC, the team can act on its own using
// its smartest member's intelligence. If even one human is on the team,
// the host controls that team's answers (a human is assumed to be "in the
// room" steering).
function representativeIntelligence(team: Team): number | null {
  if (team.members.length === 0) return null;
  if (team.members.some((m) => !m.isNPC)) return null;
  return Math.max(...team.members.map((m) => m.intelligence));
}

// ---------------------------------------------------------------------------
// Room registry + code generation
// ---------------------------------------------------------------------------

const rooms = new Map<string, Room>();

// Tracks how many live sockets are subscribed to each room. The host
// dashboard is the only socket per room in this prototype (contestants are
// just named entries the host adds, not separate connections), so this
// count is what actually determines whether a room is "empty" and should
// be garbage-collected.
const roomConnections = new Map<string, number>();

function generateRoomCode(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function makeId(): string {
  return crypto.randomUUID();
}

// Seed for a brand-new member's sprite look (see CharacterSprite.tsx on the
// frontend). Prefers a curated PRESET_SEED not already used elsewhere in the
// room, so new players get a nice-looking (often real painted art) default
// instead of a throwaway procedural blob; falls back to a random string once
// every preset is already taken. Players can still reroll/pick their own via
// set_avatar_seed.
function makeAvatarSeed(room?: Room): string {
  const used = new Set(room ? room.teams.flatMap((t) => t.members.map((m) => m.avatarSeed)) : []);
  const available = PRESET_SEEDS.filter((seed) => !used.has(seed));
  if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
  return crypto.randomUUID().slice(0, 8);
}

function createRoom(hostPlayerId: string): Room {
  const code = generateRoomCode();
  const room: Room = {
    code,
    teams: [
      { id: makeId(), name: "Team 1", score: 0, members: [], faceoffIndex: 0, targetSize: 4 },
      { id: makeId(), name: "Team 2", score: 0, members: [], faceoffIndex: 0, targetSize: 4 },
    ],
    roundIndex: 0,
    multiplier: ROUND_MULTIPLIERS[0],
    controllingTeamId: null,
    turnMemberIndex: 0,
    stealTeamId: null,
    strikes: 0,
    phase: "lobby",
    roundPot: 0,
    timerEndsAt: null,
    timerDurationMs: null,
    faceoff: null,
    createdAt: Date.now(),
    hostPlayerId,
  };
  rooms.set(code, room);
  const order = shuffledQuestionOrder();
  roomQuestionOrder.set(code, order);
  roomQuestions.set(code, buildQuestion(order[0]));
  return room;
}

let npcCounter = 0;
const NPC_NAMES = ["Robo-Steve", "Chad.exe", "Karen 2.0", "Barry the Bot", "Synthetic Susan", "Glitchy Gary"];

function nextNpcName(): string {
  const name = NPC_NAMES[npcCounter % NPC_NAMES.length];
  npcCounter += 1;
  return npcCounter > NPC_NAMES.length ? `${name} ${Math.floor(npcCounter / NPC_NAMES.length) + 1}` : name;
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

function findMemberById(room: Room, memberId: string | null): Member | undefined {
  if (!memberId) return undefined;
  for (const team of room.teams) {
    const found = team.members.find((m) => m.id === memberId);
    if (found) return found;
  }
  return undefined;
}

// Which member is currently "up" and expected to answer, across every phase
// that takes a guess. Sent to clients so a remote player's UI knows when
// it's actually their turn, and used server-side to gate who may act.
function activeMemberForGuess(room: Room): string | null {
  if (room.phase === "faceoff" && room.faceoff) {
    const fo = room.faceoff;
    if (fo.stage === "await_first_guess") return repOf(room, fo.buzzTeamId!).id;
    if (fo.stage === "await_second_guess") return repOf(room, otherTeam(room, fo.buzzTeamId!).id).id;
    return null;
  }
  if (room.phase === "board") {
    const team = findTeam(room, room.controllingTeamId);
    const member = team ? currentUpMember(room, team) : null;
    return member?.id ?? null;
  }
  if (room.phase === "steal") {
    const team = findTeam(room, room.stealTeamId);
    return team?.members.find((m) => !m.isNPC)?.id ?? null;
  }
  return null;
}

// Host can always act (facilitator + controls every "local"/"bot" member).
// A guest may only act on behalf of their own claimed "remote" member.
function canActFor(room: Room, ws: { data: SocketData }, memberId: string | null): boolean {
  if (ws.data.role === "host") return true;
  if (!memberId) return false;
  const member = findMemberById(room, memberId);
  if (!member || member.kind !== "remote") return false;
  return ws.data.memberId === memberId;
}

function serializeRoom(room: Room) {
  const question = currentQuestion(room);
  return {
    type: "state",
    room: {
      code: room.code,
      teams: room.teams.map((t) => ({
        ...t,
        // Never leak which raw playerId a "remote" member is bound to.
        members: t.members.map(({ claimedBy, ...m }) => m),
      })),
      activeMemberId: activeMemberForGuess(room),
      roundNumber: room.roundIndex + 1,
      totalRounds: ROUND_MULTIPLIERS.length,
      multiplier: room.multiplier,
      controllingTeamId: room.controllingTeamId,
      turnMemberIndex: room.turnMemberIndex,
      stealTeamId: room.stealTeamId,
      strikes: room.strikes,
      phase: room.phase,
      roundPot: room.roundPot,
      timerEndsAt: room.timerEndsAt,
      timerDurationMs: room.timerDurationMs,
      faceoff: room.faceoff,
      question: {
        prompt: question.prompt,
        answers: question.answers.map((a) => ({
          text: a.revealed ? a.text : null,
          points: a.revealed ? a.points * room.multiplier : null,
          revealed: a.revealed,
        })),
      },
    },
  };
}

function broadcastRoom(room: Room) {
  server.publish(room.code, JSON.stringify(serializeRoom(room)));
}

function removeRoomIfEmpty(roomCode: string) {
  if ((roomConnections.get(roomCode) ?? 0) <= 0) {
    rooms.delete(roomCode);
    roomQuestions.delete(roomCode);
    roomQuestionOrder.delete(roomCode);
    clearRoomTimer(roomCode);
    roomConnections.delete(roomCode);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function findTeam(room: Room, teamId: string | null): Team | undefined {
  return room.teams.find((t) => t.id === teamId);
}

function otherTeam(room: Room, teamId: string): Team {
  return room.teams[0].id === teamId ? room.teams[1] : room.teams[0];
}

function totalQuestionPoints(question: Question): number {
  return question.answers.reduce((sum, a) => sum + a.points, 0);
}

function currentUpMember(room: Room, team: Team): Member | null {
  if (team.members.length === 0) return null;
  return team.members[room.turnMemberIndex % team.members.length];
}

function repOf(room: Room, teamId: string): Member {
  const teamIndex = room.teams[0].id === teamId ? 0 : 1;
  const repId = room.faceoff!.repIds[teamIndex];
  return room.teams[teamIndex].members.find((m) => m.id === repId)!;
}

// ---------------------------------------------------------------------------
// Lobby actions
// ---------------------------------------------------------------------------

function handleRenameTeam(room: Room, teamId: string, name: string) {
  const team = findTeam(room, teamId);
  const trimmed = name.trim().slice(0, 24);
  if (team && trimmed) team.name = trimmed;
}

function handleAddMember(room: Room, teamId: string, name: string) {
  const team = findTeam(room, teamId);
  const trimmed = name.trim().slice(0, 24);
  if (!team || !trimmed) return;
  team.members.push({ id: makeId(), name: trimmed, isNPC: false, intelligence: 100, kind: "local", avatarSeed: makeAvatarSeed(room) });
}

function handleAddNpc(room: Room, teamId: string, intelligence: number) {
  const team = findTeam(room, teamId);
  if (!team) return;
  const clamped = Number.isFinite(intelligence) ? Math.max(0, Math.min(100, Math.round(intelligence))) : 50;
  team.members.push({ id: makeId(), name: nextNpcName(), isNPC: true, intelligence: clamped, kind: "bot", avatarSeed: makeAvatarSeed(room) });
}

function handleSetLocalCount(room: Room, teamId: string, count: number) {
  const team = findTeam(room, teamId);
  if (!team) return;
  const clamped = Math.max(0, Math.min(8, Math.round(count)));
  const locals = team.members.filter((m) => m.kind === "local");
  if (locals.length < clamped) {
    for (let i = locals.length; i < clamped; i += 1) {
      team.members.push({ id: makeId(), name: `Player ${i + 1}`, isNPC: false, intelligence: 100, kind: "local", avatarSeed: makeAvatarSeed(room) });
    }
  } else if (locals.length > clamped) {
    let toRemove = locals.length - clamped;
    for (let i = team.members.length - 1; i >= 0 && toRemove > 0; i -= 1) {
      if (team.members[i].kind === "local") {
        team.members.splice(i, 1);
        toRemove -= 1;
      }
    }
  }
}

function handleSetTeamSize(room: Room, teamId: string, size: number) {
  const team = findTeam(room, teamId);
  if (!team) return;
  team.targetSize = Math.max(1, Math.min(8, Math.round(size) || 1));
}

function handleRenameMember(room: Room, teamId: string, memberId: string, name: string) {
  const team = findTeam(room, teamId);
  const member = team?.members.find((m) => m.id === memberId);
  const trimmed = name.trim().slice(0, 24);
  if (member && trimmed) member.name = trimmed;
}

function handleRemoveMember(room: Room, teamId: string, memberId: string) {
  const team = findTeam(room, teamId);
  if (!team) return;
  team.members = team.members.filter((m) => m.id !== memberId);
}

// A remote socket claims a fresh "remote" member slot on the team of its
// choosing. Reconnects with the same playerId (see /ws `player` param) just
// return the member they already claimed instead of creating a duplicate.
function handleJoinAsPlayer(room: Room, playerId: string, teamId: string, name: string): Member | null {
  if (room.phase !== "lobby") return null;
  const existing = room.teams.flatMap((t) => t.members).find((m) => m.claimedBy === playerId);
  if (existing) return existing;
  const team = findTeam(room, teamId);
  if (!team) return null;
  const trimmed = name.trim().slice(0, 24) || "Player";
  const member: Member = {
    id: makeId(),
    name: trimmed,
    isNPC: false,
    intelligence: 100,
    kind: "remote",
    claimedBy: playerId,
    avatarSeed: makeAvatarSeed(room),
  };
  team.members.push(member);
  return member;
}

// A member (or the host, on their behalf) picks a specific look or rerolls
// to a fresh random one. The frontend derives the actual visual traits from
// this seed (see CharacterSprite.tsx) — the server just stores an opaque
// string, capped to a sane length so nobody stuffs a novel into it.
function handleSetAvatarSeed(room: Room, teamId: string, memberId: string, seed: string) {
  const team = findTeam(room, teamId);
  const member = team?.members.find((m) => m.id === memberId);
  const trimmed = seed.trim().slice(0, 64);
  if (member && trimmed) member.avatarSeed = trimmed;
}


// ---------------------------------------------------------------------------
// Face-off
// ---------------------------------------------------------------------------

function pickFaceoffRep(team: Team): Member {
  const idx = team.faceoffIndex % Math.max(team.members.length, 1);
  team.faceoffIndex += 1;
  return team.members[idx];
}

function startFaceoff(room: Room) {
  room.phase = "faceoff";
  room.strikes = 0;
  room.roundPot = 0;
  room.controllingTeamId = null;
  room.stealTeamId = null;
  const repA = pickFaceoffRep(room.teams[0]);
  const repB = pickFaceoffRep(room.teams[1]);
  room.faceoff = {
    repIds: [repA.id, repB.id],
    buzzTeamId: null,
    firstGuess: null,
    secondGuess: null,
    stage: "await_buzz",
  };
  startTimer(room, BUZZ_MS, onBuzzTimeout);
}

function onBuzzTimeout(room: Room) {
  if (room.phase !== "faceoff" || room.faceoff?.stage !== "await_buzz") return;
  // Nobody (host) buzzed a team in — coin flip so the game keeps moving.
  const winner = Math.random() < 0.5 ? room.teams[0] : room.teams[1];
  handleBuzz(room, winner.id);
}

function handleBuzz(room: Room, teamId: string) {
  if (room.phase !== "faceoff" || room.faceoff?.stage !== "await_buzz") return;
  if (!findTeam(room, teamId)) return;
  room.faceoff.buzzTeamId = teamId;
  room.faceoff.stage = "await_first_guess";
  scheduleFaceoffAnswer(room, teamId);
}

function scheduleFaceoffAnswer(room: Room, teamId: string) {
  const rep = repOf(room, teamId);
  if (rep.isNPC) {
    startTimer(room, npcThinkDelayMs(), (liveRoom) => {
      if (liveRoom.phase !== "faceoff") return;
      const guessText = pickNpcAnswer(currentQuestion(liveRoom), rep.intelligence);
      resolveFaceoffGuess(liveRoom, teamId, guessText);
    });
  } else {
    startTimer(room, TURN_MS, (liveRoom) => {
      if (liveRoom.phase !== "faceoff") return;
      resolveFaceoffGuess(liveRoom, teamId, ""); // timed out = a miss
    });
  }
}

function resolveFaceoffGuess(room: Room, teamId: string, rawText: string) {
  const fo = room.faceoff;
  if (!fo) return;
  const question = currentQuestion(room);
  const normalized = rawText.trim().toLowerCase();
  const match = normalized ? question.answers.find((a) => a.text.toLowerCase().includes(normalized)) : undefined;
  const guess: FaceoffGuess = {
    teamId,
    text: match?.text ?? rawText.trim() ?? "",
    points: match?.points ?? 0,
    matched: Boolean(match),
  };

  if (fo.stage === "await_first_guess") {
    fo.firstGuess = guess;
    const topPoints = Math.max(...question.answers.map((a) => a.points));
    if (guess.matched && guess.points === topPoints) {
      awardFaceoffWinner(room, teamId, guess);
      return;
    }
    fo.stage = "await_second_guess";
    scheduleFaceoffAnswer(room, otherTeam(room, teamId).id);
    return;
  }

  if (fo.stage === "await_second_guess") {
    fo.secondGuess = guess;
    const firstPoints = fo.firstGuess?.points ?? 0;
    const winnerIsSecond = guess.matched && guess.points > firstPoints;
    const winnerTeamId = winnerIsSecond ? teamId : fo.buzzTeamId!;
    const winningGuess = winnerIsSecond ? guess : fo.firstGuess!;
    awardFaceoffWinner(room, winnerTeamId, winningGuess);
  }
}

function awardFaceoffWinner(room: Room, winnerTeamId: string, winningGuess: FaceoffGuess) {
  const fo = room.faceoff!;
  fo.stage = "resolved";
  room.controllingTeamId = winnerTeamId;
  room.turnMemberIndex = 0;

  if (winningGuess.matched) {
    const question = currentQuestion(room);
    const answer = question.answers.find((a) => a.text === winningGuess.text);
    if (answer && !answer.revealed) {
      answer.revealed = true;
      const points = answer.points * room.multiplier;
      room.roundPot += points;
      const team = findTeam(room, winnerTeamId);
      if (team) team.score += points;
    }
  }

  room.phase = "board";
  advanceMainTurnTimer(room);
}

// ---------------------------------------------------------------------------
// Main round ("go down the line")
// ---------------------------------------------------------------------------

function advanceMainTurnTimer(room: Room) {
  const team = findTeam(room, room.controllingTeamId);
  const member = team ? currentUpMember(room, team) : null;
  if (!team || !member) return;

  if (member.isNPC) {
    startTimer(room, npcThinkDelayMs(), (liveRoom) => {
      if (liveRoom.phase !== "board") return;
      const guessText = pickNpcAnswer(currentQuestion(liveRoom), member.intelligence);
      handleBoardGuess(liveRoom, guessText);
    });
  } else {
    startTimer(room, TURN_MS, (liveRoom) => {
      if (liveRoom.phase !== "board") return;
      registerStrike(liveRoom); // timed out = a miss, exactly like a wrong guess
    });
  }
}

function registerStrike(room: Room) {
  room.strikes += 1;
  if (room.strikes >= 3) {
    room.phase = "steal";
    room.stealTeamId = room.controllingTeamId ? otherTeam(room, room.controllingTeamId).id : null;
    advanceStealTimer(room);
  } else {
    const team = findTeam(room, room.controllingTeamId);
    if (team && team.members.length > 0) {
      room.turnMemberIndex = (room.turnMemberIndex + 1) % team.members.length;
    }
    advanceMainTurnTimer(room);
  }
}

function handleBoardGuess(room: Room, rawText: string) {
  const normalized = rawText.trim().toLowerCase();
  if (!normalized) return;
  const question = currentQuestion(room);
  const match = question.answers.find((a) => !a.revealed && a.text.toLowerCase().includes(normalized));

  if (match) {
    match.revealed = true;
    const points = match.points * room.multiplier;
    room.roundPot += points;
    const team = findTeam(room, room.controllingTeamId);
    if (team) team.score += points;

    const allRevealed = question.answers.every((a) => a.revealed);
    if (allRevealed) {
      room.phase = "round_over";
      stopTimer(room);
    } else {
      // Correct guess: same contestant keeps going, fresh clock.
      advanceMainTurnTimer(room);
    }
  } else {
    // Wrong guess: this is what actually fixes "guessing forever" — every
    // miss is an automatic strike and passes the turn to the next teammate,
    // exactly like the real show's "go down the line" rule.
    registerStrike(room);
  }
}

// ---------------------------------------------------------------------------
// Steal
// ---------------------------------------------------------------------------

function advanceStealTimer(room: Room) {
  const team = findTeam(room, room.stealTeamId);
  const autoIntelligence = team ? representativeIntelligence(team) : null;

  if (team && autoIntelligence !== null) {
    startTimer(room, npcThinkDelayMs(), (liveRoom) => {
      if (liveRoom.phase !== "steal") return;
      const guessText = pickNpcAnswer(currentQuestion(liveRoom), autoIntelligence);
      handleStealGuess(liveRoom, guessText);
    });
  } else {
    startTimer(room, STEAL_MS, (liveRoom) => {
      if (liveRoom.phase !== "steal") return;
      liveRoom.phase = "round_over";
      stopTimer(liveRoom);
    });
  }
}

function handleStealGuess(room: Room, rawText: string) {
  const normalized = rawText.trim().toLowerCase();
  const question = currentQuestion(room);
  const match = normalized ? question.answers.find((a) => !a.revealed && a.text.toLowerCase().includes(normalized)) : undefined;
  const stealTeam = findTeam(room, room.stealTeamId);

  if (match && stealTeam) {
    // Successful steal wins the *entire remaining pot*, not just the one
    // answer they named — matches the real show's steal rule.
    const remaining = totalQuestionPoints(question) * room.multiplier - room.roundPot;
    stealTeam.score += remaining;
    for (const a of question.answers) a.revealed = true;
    room.roundPot = totalQuestionPoints(question) * room.multiplier;
  }
  room.phase = "round_over";
  stopTimer(room);
}

// ---------------------------------------------------------------------------
// Top-level guess dispatcher + manual strike + round progression
// ---------------------------------------------------------------------------

function handleGuess(room: Room, rawText: string) {
  if (room.phase === "faceoff") {
    const fo = room.faceoff;
    if (!fo) return;
    if (fo.stage === "await_first_guess") {
      resolveFaceoffGuess(room, fo.buzzTeamId!, rawText);
    } else if (fo.stage === "await_second_guess") {
      resolveFaceoffGuess(room, otherTeam(room, fo.buzzTeamId!).id, rawText);
    }
    return;
  }
  if (room.phase === "board") {
    handleBoardGuess(room, rawText);
    return;
  }
  if (room.phase === "steal") {
    handleStealGuess(room, rawText);
  }
}

function handleStrike(room: Room) {
  if (room.phase !== "board") return;
  registerStrike(room);
}

function handleStartGame(room: Room, fillIntelligence: number) {
  const clampedIQ = Number.isFinite(fillIntelligence) ? Math.max(0, Math.min(100, Math.round(fillIntelligence))) : 50;
  for (const team of room.teams) {
    while (team.members.length < team.targetSize) {
      team.members.push({ id: makeId(), name: nextNpcName(), isNPC: true, intelligence: clampedIQ, kind: "bot", avatarSeed: makeAvatarSeed(room) });
    }
  }
  if (room.teams.some((t) => t.members.length === 0)) return;
  room.roundIndex = 0;
  room.multiplier = ROUND_MULTIPLIERS[0];
  const order = roomQuestionOrder.get(room.code)!;
  roomQuestions.set(room.code, buildQuestion(order[0]));
  for (const team of room.teams) team.faceoffIndex = 0;
  startFaceoff(room);
}

function advanceRound(room: Room) {
  room.roundIndex += 1;
  if (room.roundIndex >= ROUND_MULTIPLIERS.length) {
    room.phase = "game_over";
    stopTimer(room);
    return;
  }
  room.multiplier = ROUND_MULTIPLIERS[room.roundIndex];
  const order = roomQuestionOrder.get(room.code)!;
  roomQuestions.set(room.code, buildQuestion(order[room.roundIndex % order.length]));
  startFaceoff(room);
}

function handleNextRound(room: Room) {
  if (room.phase !== "round_over" && room.phase !== "lobby") return;
  advanceRound(room);
}

function handleResetGame(room: Room) {
  room.phase = "lobby";
  room.strikes = 0;
  room.roundPot = 0;
  room.roundIndex = 0;
  room.multiplier = ROUND_MULTIPLIERS[0];
  room.controllingTeamId = null;
  room.stealTeamId = null;
  room.turnMemberIndex = 0;
  room.faceoff = null;
  stopTimer(room);
  for (const team of room.teams) {
    team.score = 0;
    team.faceoffIndex = 0;
  }
  const order = shuffledQuestionOrder();
  roomQuestionOrder.set(room.code, order);
  roomQuestions.set(room.code, buildQuestion(order[0]));
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------

const DIST_DIR = new URL("./dist", import.meta.url).pathname;

async function serveStatic(pathname: string): Promise<Response | null> {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = `${DIST_DIR}${cleanPath}`;
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }
  return null;
}

// If a currently-active member just flipped from a human "remote" slot to
// an NPC "bot" (auto-fill on disconnect), the timer that's already ticking
// for them is still running on human-length durations. Restart it on the
// NPC track so the game doesn't sit idle for a human-length countdown.
function reconcileActiveTimerAfterBotConversion(room: Room) {
  if (room.phase === "board") {
    const team = findTeam(room, room.controllingTeamId);
    const member = team ? currentUpMember(room, team) : null;
    if (member?.isNPC) advanceMainTurnTimer(room);
  } else if (room.phase === "faceoff" && room.faceoff) {
    const fo = room.faceoff;
    if (fo.stage === "await_first_guess") {
      const rep = repOf(room, fo.buzzTeamId!);
      if (rep.isNPC) scheduleFaceoffAnswer(room, fo.buzzTeamId!);
    } else if (fo.stage === "await_second_guess") {
      const otherId = otherTeam(room, fo.buzzTeamId!).id;
      const rep = repOf(room, otherId);
      if (rep.isNPC) scheduleFaceoffAnswer(room, otherId);
    }
  } else if (room.phase === "steal") {
    const team = findTeam(room, room.stealTeamId);
    if (team && representativeIntelligence(team) !== null) advanceStealTimer(room);
  }
}

// Fly.io/Railway/Render inject PORT; fall back to 5551 for local dev.
const PORT = Number(process.env.PORT) || 5551;

// Cross-origin frontend (e.g. the static site on Vercel) needs CORS on the
// plain HTTP fallback route; WebSocket upgrades aren't subject to CORS.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const server = Bun.serve<SocketData>({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req, srv) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/ws") {
      const requestedRoom = url.searchParams.get("room")?.toUpperCase() ?? null;
      // Persisted client-side across reconnects so a page refresh doesn't
      // demote the host to a guest, or orphan a remote player's claimed
      // member — see src/App.tsx's localStorage handling.
      const requestedPlayer = url.searchParams.get("player") || null;
      const playerId = requestedPlayer || makeId();

      let room = requestedRoom ? rooms.get(requestedRoom) : undefined;
      if (!room) {
        room = createRoom(playerId);
      }

      const role: Role = playerId === room.hostPlayerId ? "host" : "guest";
      const existingMember = room.teams.flatMap((t) => t.members).find((m) => m.claimedBy === playerId);

      const upgraded = srv.upgrade(req, {
        data: { roomId: room.code, playerId, role, memberId: existingMember?.id ?? null } satisfies SocketData,
      });

      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // API fallback for creating a room without opening a socket (unused by
    // the default frontend flow, but handy for tooling/tests).
    if (url.pathname === "/api/room" && req.method === "POST") {
      const room = createRoom(makeId());
      return Response.json({ code: room.code }, { headers: CORS_HEADERS });
    }

    const staticResponse = await serveStatic(url.pathname);
    if (staticResponse) return staticResponse;

    // SPA fallback: serve index.html for any unknown non-asset route.
    const indexFallback = await serveStatic("/index.html");
    if (indexFallback) return indexFallback;

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const { roomId, playerId, role, memberId } = ws.data;
      ws.subscribe(roomId);
      roomConnections.set(roomId, (roomConnections.get(roomId) ?? 0) + 1);
      const room = rooms.get(roomId);
      if (room) {
        ws.send(JSON.stringify({ type: "joined", code: room.code, playerId, role, memberId }));
        ws.send(JSON.stringify(serializeRoom(room)));
      }
    },
    message(ws, raw) {
      const room = rooms.get(ws.data.roomId);
      if (!room) return;

      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const isHost = ws.data.role === "host";

      switch (msg.type) {
        // -- host-only lobby/admin actions ----------------------------------
        case "rename_team":
          if (!isHost) return;
          handleRenameTeam(room, String(msg.teamId ?? ""), String(msg.name ?? ""));
          break;
        case "add_member":
          if (!isHost) return;
          handleAddMember(room, String(msg.teamId ?? ""), String(msg.name ?? ""));
          break;
        case "add_npc":
          if (!isHost) return;
          handleAddNpc(room, String(msg.teamId ?? ""), Number(msg.intelligence ?? 50));
          break;
        case "set_local_count":
          if (!isHost) return;
          handleSetLocalCount(room, String(msg.teamId ?? ""), Number(msg.count ?? 0));
          break;
        case "set_team_size":
          if (!isHost) return;
          handleSetTeamSize(room, String(msg.teamId ?? ""), Number(msg.size ?? 4));
          break;
        case "rename_member":
          if (!isHost) return;
          handleRenameMember(room, String(msg.teamId ?? ""), String(msg.memberId ?? ""), String(msg.name ?? ""));
          break;
        case "remove_member":
          if (!isHost) return;
          handleRemoveMember(room, String(msg.teamId ?? ""), String(msg.memberId ?? ""));
          break;
        case "set_avatar_seed": {
          // Host can restyle anyone (e.g. local players typed in on their
          // device); a remote guest may only restyle their own claimed member.
          const memberId = String(msg.memberId ?? "");
          if (!canActFor(room, ws, memberId)) return;
          handleSetAvatarSeed(room, String(msg.teamId ?? ""), memberId, String(msg.seed ?? ""));
          break;
        }
        case "start_game":
          if (!isHost) return;
          handleStartGame(room, Number(msg.fillIntelligence ?? 50));
          break;
        case "strike":
          if (!isHost) return;
          handleStrike(room);
          break;
        case "next_round":
          if (!isHost) return;
          handleNextRound(room);
          break;
        case "reset_game":
          if (!isHost) return;
          handleResetGame(room);
          break;

        // -- remote player join (guests only) -------------------------------
        case "join_as_player": {
          if (isHost || ws.data.memberId) return;
          const member = handleJoinAsPlayer(room, ws.data.playerId, String(msg.teamId ?? ""), String(msg.name ?? ""));
          if (member) {
            ws.data.memberId = member.id;
            ws.send(JSON.stringify({ type: "joined_as_player", memberId: member.id, teamId: String(msg.teamId ?? "") }));
          }
          break;
        }

        // -- gated gameplay actions: host always OK, guests only for their
        // own claimed "remote" member, and only when it's actually their turn
        case "buzz": {
          const teamId = String(msg.teamId ?? "");
          if (room.phase === "faceoff" && room.faceoff?.stage === "await_buzz" && findTeam(room, teamId)) {
            const repId = repOf(room, teamId).id;
            if (!canActFor(room, ws, repId)) return;
          } else if (!isHost) {
            return;
          }
          handleBuzz(room, teamId);
          break;
        }
        case "guess": {
          const activeId = activeMemberForGuess(room);
          if (!canActFor(room, ws, activeId)) return;
          handleGuess(room, String(msg.text ?? ""));
          break;
        }
        default:
          return;
      }

      broadcastRoom(room);
    },
    close(ws) {
      const roomId = ws.data.roomId;
      roomConnections.set(roomId, Math.max(0, (roomConnections.get(roomId) ?? 1) - 1));
      ws.unsubscribe(roomId);
      const room = rooms.get(roomId);

      if (room && ws.data.memberId) {
        const team = room.teams.find((t) => t.members.some((m) => m.id === ws.data.memberId));
        const member = team?.members.find((m) => m.id === ws.data.memberId);
        if (team && member && member.kind === "remote") {
          if (room.phase === "lobby") {
            // Nothing lost yet — just drop the empty slot.
            team.members = team.members.filter((m) => m.id !== member.id);
          } else {
            // Auto-fill with a bot so the game keeps moving instead of
            // stalling on a dropped connection.
            member.kind = "bot";
            member.isNPC = true;
            member.claimedBy = undefined;
            if (!member.intelligence) member.intelligence = 50;
            reconcileActiveTimerAfterBotConversion(room);
          }
        }
      }

      removeRoomIfEmpty(roomId);
      if (room && rooms.has(roomId)) {
        broadcastRoom(room);
      }
    },
  },
});


console.log(`Survey Says server running at http://localhost:${server.port}`);
