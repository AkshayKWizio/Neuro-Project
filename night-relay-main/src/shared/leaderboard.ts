export interface PlayerStanding {
  id: string;
  nickname: string;
  score: number | null;
  distance: number | null;
  rank: number | null;
}

export interface Leaderboard {
  entries: PlayerStanding[];
  me: PlayerStanding | null;
  totalPlayers: number;
  stats: LifetimeStats;
  updatedAt: string;
}

export interface LifetimeStats {
  totalPlaySeconds: number;
  totalPlayers: number;
  totalCountries: number;
  trackingSince: string;
}

export interface RunTicket {
  id: string;
  startedAt: string;
}
export interface ProgressReceipt {
  recorded: true;
}

export interface RunResult {
  score: number;
  distance: number;
  coins: number;
  runSeconds: number;
  peakFlow: number;
  nearMisses: number;
  cleanMoves: number;
}

export interface ScoreReceipt {
  accepted: boolean;
  personalBest: boolean;
  leaderboard: Leaderboard;
}

export type LeaderboardRequest =
  | { action: 'profile' | 'start' }
  | { action: 'rename'; nickname: string }
  | { action: 'progress'; runId: string; runSeconds: number }
  | { action: 'finish'; runId: string; result: RunResult };

/** JSON enters as unknown; these guards validate its shape before it reaches the UI. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return isNonnegativeNumber(value) && Number.isSafeInteger(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function isRunTicket(value: unknown): value is RunTicket {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.id) &&
    isTimestamp(value.startedAt)
  );
}

/** Shape checks for persisted runs; the server separately verifies time, route, and score. */
export function isRunResult(value: unknown): value is RunResult {
  return (
    isRecord(value) &&
    isNonnegativeInteger(value.score) &&
    isNonnegativeNumber(value.distance) &&
    isNonnegativeInteger(value.coins) &&
    isNonnegativeNumber(value.runSeconds) &&
    isNonnegativeInteger(value.peakFlow) &&
    value.peakFlow >= 1 &&
    value.peakFlow <= 4 &&
    isNonnegativeInteger(value.nearMisses) &&
    isNonnegativeInteger(value.cleanMoves)
  );
}

function isPlayerStanding(value: unknown): value is PlayerStanding {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.nickname === 'string' &&
    value.nickname.length > 0 &&
    (value.score === null || isNonnegativeInteger(value.score)) &&
    (value.distance === null || isNonnegativeNumber(value.distance)) &&
    (value.rank === null || (isNonnegativeInteger(value.rank) && value.rank >= 1))
  );
}

function isLifetimeStats(value: unknown): value is LifetimeStats {
  return (
    isRecord(value) &&
    isNonnegativeNumber(value.totalPlaySeconds) &&
    isNonnegativeInteger(value.totalPlayers) &&
    isNonnegativeInteger(value.totalCountries) &&
    isTimestamp(value.trackingSince)
  );
}

export function isLeaderboard(value: unknown): value is Leaderboard {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isPlayerStanding) &&
    (value.me === null || isPlayerStanding(value.me)) &&
    isNonnegativeInteger(value.totalPlayers) &&
    isLifetimeStats(value.stats) &&
    isTimestamp(value.updatedAt)
  );
}

export function isProgressReceipt(value: unknown): value is ProgressReceipt {
  return isRecord(value) && value.recorded === true;
}

export function isScoreReceipt(value: unknown): value is ScoreReceipt {
  return (
    isRecord(value) &&
    typeof value.accepted === 'boolean' &&
    typeof value.personalBest === 'boolean' &&
    isLeaderboard(value.leaderboard)
  );
}
