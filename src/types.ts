// Shared frontend types mirroring the server's serialized room shape
// (see server.ts `serializeRoom`). Keep in sync manually — there's no
// codegen step in this prototype.

export type MemberKind = "local" | "remote" | "bot";

export interface Member {
  id: string;
  name: string;
  isNPC: boolean;
  intelligence: number;
  kind: MemberKind;
  avatarSeed: string;
}

export interface Team {
  id: string;
  name: string;
  score: number;
  members: Member[];
  faceoffIndex: number;
  targetSize: number;
}

export interface AnswerView {
  text: string | null;
  points: number | null;
  revealed: boolean;
}

export interface QuestionView {
  prompt: string;
  answers: AnswerView[];
}

export type Phase = "lobby" | "faceoff" | "board" | "steal" | "round_over" | "game_over";

export type FaceoffStage = "await_buzz" | "await_first_guess" | "await_second_guess" | "resolved";

export interface FaceoffGuess {
  teamId: string;
  text: string;
  points: number;
  matched: boolean;
}

export interface FaceoffState {
  repIds: [string, string];
  buzzTeamId: string | null;
  firstGuess: FaceoffGuess | null;
  secondGuess: FaceoffGuess | null;
  stage: FaceoffStage;
}

export interface RoomView {
  code: string;
  teams: [Team, Team];
  activeMemberId: string | null;
  roundNumber: number;
  totalRounds: number;
  multiplier: number;
  controllingTeamId: string | null;
  turnMemberIndex: number;
  stealTeamId: string | null;
  strikes: number;
  phase: Phase;
  roundPot: number;
  timerEndsAt: number | null;
  timerDurationMs: number | null;
  faceoff: FaceoffState | null;
  question: QuestionView;
}

export type Role = "host" | "guest";
