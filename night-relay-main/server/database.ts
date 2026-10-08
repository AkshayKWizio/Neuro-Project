import { createHash, randomUUID } from 'node:crypto';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type {
  Leaderboard,
  PlayerStanding,
  ProgressReceipt,
  RunResult,
  RunTicket,
  ScoreReceipt,
} from '../src/shared/leaderboard.ts';
import {
  RequestError,
  readCountryCode,
  readNickname,
  readRunId,
  readRunResult,
  readRunSeconds,
} from './validation.js';

const SEASON = 'samarkand-relay-v4';
let connection: NeonQueryFunction<false, false> | undefined;
type DatabaseRow = Readonly<Record<string, unknown>>;

function firstRow(rows: readonly DatabaseRow[]): DatabaseRow {
  const row = rows[0];
  if (!row) throw new Error('Expected a leaderboard database row.');
  return row;
}

function textColumn(row: DatabaseRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Invalid database text column: ${key}`);
  return value;
}

/** PostgreSQL bigint/numeric fields may arrive as strings; never coerce missing values to zero. */
function numberColumn(row: DatabaseRow, key: string): number {
  const value = row[key];
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') {
    throw new Error(`Invalid database numeric column: ${key}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid database numeric column: ${key}`);
  return number;
}

function timestampColumn(row: DatabaseRow, key: string): string {
  const value = row[key];
  const date = value instanceof Date ? value : new Date(textColumn(row, key));
  if (!Number.isFinite(date.getTime()))
    throw new Error(`Invalid database timestamp column: ${key}`);
  return date.toISOString();
}

function booleanColumn(row: DatabaseRow, key: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') throw new Error(`Invalid database boolean column: ${key}`);
  return value;
}

function db(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL)
    throw new RequestError(503, 'The leaderboard is temporarily unavailable.');
  return (connection ??= neon(process.env.DATABASE_URL));
}

export function tokenHash(token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new RequestError(401, 'Your browser identity is missing. Reload and try again.');
  return createHash('sha256').update(token).digest('hex');
}

export async function limitRequests(key: string, limit: number): Promise<void> {
  const sql = db();
  const digest = createHash('sha256').update(key).digest('hex');
  const rows: DatabaseRow[] = await sql`
    INSERT INTO nightline_limits (key, count, reset_at) VALUES (${digest}, 1, NOW() + INTERVAL '1 minute')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN nightline_limits.reset_at < NOW() THEN 1 ELSE nightline_limits.count + 1 END,
      reset_at = CASE WHEN nightline_limits.reset_at < NOW() THEN NOW() + INTERVAL '1 minute' ELSE nightline_limits.reset_at END
    RETURNING count`;
  if (numberColumn(firstRow(rows), 'count') > limit)
    throw new RequestError(429, 'A little breather—try again in a minute.');
}

export async function ensurePlayer(hash: string): Promise<string> {
  const sql = db();
  const id = randomUUID();
  const nickname = `Courier ${randomUUID().slice(0, 4).toUpperCase()}`;
  const rows: DatabaseRow[] = await sql`
    INSERT INTO nightline_players (id, token_hash, season, nickname)
    VALUES (${id}, ${hash}, ${SEASON}, ${nickname})
    ON CONFLICT (token_hash, season) DO UPDATE SET token_hash = EXCLUDED.token_hash
    RETURNING id`;
  return textColumn(firstRow(rows), 'id');
}

function standing(row: DatabaseRow, rank: number | null): PlayerStanding {
  return {
    id: textColumn(row, 'id'),
    nickname: textColumn(row, 'nickname'),
    score: row.best_score === null ? null : numberColumn(row, 'best_score'),
    distance: row.best_distance === null ? null : numberColumn(row, 'best_distance'),
    rank,
  };
}

export async function getLeaderboard(hash: string | null): Promise<Leaderboard> {
  const sql = db();
  const [leaders, totals, player, activity]: DatabaseRow[][] = await sql.transaction(
    [
      sql`SELECT id, nickname, best_score, best_distance FROM nightline_players
        WHERE season = ${SEASON} AND best_score IS NOT NULL ORDER BY best_score DESC, best_at ASC, id ASC LIMIT 25`,
      sql`SELECT COUNT(*) AS count FROM nightline_players WHERE season = ${SEASON} AND best_score IS NOT NULL`,
      sql`SELECT p.*, CASE WHEN p.best_score IS NULL THEN NULL ELSE
        (SELECT COUNT(*) + 1 FROM nightline_players other WHERE other.season = ${SEASON} AND
          (other.best_score > p.best_score OR (other.best_score = p.best_score AND (other.best_at, other.id) < (p.best_at, p.id)))) END AS rank
        FROM nightline_players p WHERE p.token_hash = ${hash} AND p.season = ${SEASON}`,
      sql`SELECT COUNT(*) AS players, COALESCE(SUM(play_seconds), 0) AS seconds,
        (SELECT COUNT(DISTINCT country_code) FROM nightline_activity_countries) AS countries,
        (SELECT started_at FROM nightline_tracking WHERE id = 'lifetime') AS tracking_since
        FROM nightline_activity`,
    ],
    { isolationLevel: 'RepeatableRead', readOnly: true },
  );
  const activityRow = firstRow(activity);
  const playerRow = player[0];
  return {
    entries: leaders.map((row, index) => standing(row, index + 1)),
    totalPlayers: numberColumn(firstRow(totals), 'count'),
    me: playerRow
      ? standing(playerRow, playerRow.rank === null ? null : numberColumn(playerRow, 'rank'))
      : null,
    stats: {
      totalPlayers: numberColumn(activityRow, 'players'),
      totalPlaySeconds: numberColumn(activityRow, 'seconds'),
      totalCountries: numberColumn(activityRow, 'countries'),
      trackingSince: timestampColumn(activityRow, 'tracking_since'),
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function renamePlayer(hash: string, value: unknown): Promise<Leaderboard> {
  const name = readNickname(value);
  const id = await ensurePlayer(hash);
  const sql = db();
  await sql`UPDATE nightline_players SET nickname = ${name} WHERE id = ${id}`;
  return getLeaderboard(hash);
}

export async function startRun(hash: string): Promise<RunTicket> {
  const sql = db();
  const player = await ensurePlayer(hash);
  const rows: DatabaseRow[] =
    await sql`INSERT INTO nightline_runs (id, player_id) VALUES (${randomUUID()}, ${player}) RETURNING id, started_at`;
  // Scores and lifetime activity live independently of transient run sessions.
  await sql`DELETE FROM nightline_runs WHERE player_id = ${player} AND started_at < NOW() - INTERVAL '1 day'`;
  const row = firstRow(rows);
  return { id: textColumn(row, 'id'), startedAt: timestampColumn(row, 'started_at') };
}

/** Lock one session before computing a delta, so simultaneous progress/finish requests add it once. */
async function recordActivity(
  hash: string,
  id: string,
  seconds: number,
  result: RunResult | null,
  country: string | null,
): Promise<boolean> {
  const sql = db();
  const finish = result !== null;
  const countryCode = readCountryCode(country);
  const rows: DatabaseRow[] = await sql`
    WITH locked AS MATERIALIZED (
      SELECT r.id, r.player_id, r.recorded_seconds, r.completed_at,
        EXTRACT(EPOCH FROM (NOW() - r.started_at)) AS elapsed
      FROM nightline_runs r JOIN nightline_players p ON p.id = r.player_id
      WHERE r.id = ${id} AND p.token_hash = ${hash} AND p.season = ${SEASON}
      FOR UPDATE OF r
    ), recorded AS (
      UPDATE nightline_runs r SET recorded_seconds = GREATEST(locked.recorded_seconds, ${seconds}::numeric),
        completed_at = CASE WHEN ${finish}::boolean THEN NOW() ELSE NULL END,
        score = CASE WHEN ${finish}::boolean THEN ${result?.score ?? null}::bigint ELSE r.score END
      FROM locked WHERE r.id = locked.id AND locked.completed_at IS NULL
        AND locked.elapsed BETWEEN 0 AND 86400 AND ${seconds}::numeric <= locked.elapsed + 3
      RETURNING r.player_id, r.recorded_seconds, r.recorded_seconds - locked.recorded_seconds AS delta
    ), activity AS (
      INSERT INTO nightline_activity (token_hash, play_seconds)
      SELECT ${hash}, delta FROM recorded WHERE recorded_seconds > 0
      ON CONFLICT (token_hash) DO UPDATE
        SET play_seconds = nightline_activity.play_seconds + EXCLUDED.play_seconds
      RETURNING token_hash
    ), country AS (
      INSERT INTO nightline_activity_countries (token_hash, country_code)
      SELECT token_hash, ${countryCode}::char(2) FROM activity WHERE ${countryCode}::text IS NOT NULL
      ON CONFLICT DO NOTHING
    ), best AS (
      UPDATE nightline_players SET best_score = ${result?.score ?? null}::bigint,
        best_distance = ${result ? Math.floor(result.distance) : null}::integer,
        best_coins = ${result?.coins ?? null}::integer, best_at = NOW()
      WHERE ${finish}::boolean AND id IN (SELECT player_id FROM recorded)
        AND (best_score IS NULL OR best_score < ${result?.score ?? null}::bigint)
      RETURNING id
    )
    SELECT completed_at IS NOT NULL AS completed, elapsed,
      EXISTS (SELECT 1 FROM recorded) AS recorded, EXISTS (SELECT 1 FROM best) AS personal_best
    FROM locked`;
  const run = rows[0];
  if (!run) throw new RequestError(404, 'This run session was not found.');
  if (booleanColumn(run, 'completed')) return false;
  if (numberColumn(run, 'elapsed') > 86_400)
    throw new RequestError(410, 'This run expired. Your next run can join the board.');
  if (!booleanColumn(run, 'recorded'))
    throw new RequestError(400, 'This run time could not be verified.');
  return booleanColumn(run, 'personal_best');
}

export async function recordProgress(
  hash: string,
  id: unknown,
  value: unknown,
  country: string | null = null,
): Promise<ProgressReceipt> {
  await recordActivity(hash, readRunId(id), readRunSeconds(value), null, country);
  return { recorded: true };
}

export async function submitRun(
  hash: string,
  runId: unknown,
  value: unknown,
  country: string | null = null,
): Promise<ScoreReceipt> {
  const id = readRunId(runId);
  const sql = db();
  const rows: DatabaseRow[] =
    await sql`SELECT r.completed_at, EXTRACT(EPOCH FROM (NOW() - r.started_at)) AS elapsed
    FROM nightline_runs r JOIN nightline_players p ON p.id = r.player_id
    WHERE r.id = ${id} AND p.token_hash = ${hash} AND p.season = ${SEASON}`;
  const run = rows[0];
  if (!run) throw new RequestError(404, 'This run session was not found.');
  if (run.completed_at !== null)
    return { accepted: true, personalBest: false, leaderboard: await getLeaderboard(hash) };
  const elapsed = numberColumn(run, 'elapsed');
  if (elapsed > 86_400)
    throw new RequestError(410, 'This run expired. Your next run can join the board.');
  const result = readRunResult(value, elapsed);
  const personalBest = await recordActivity(
    hash,
    id,
    readRunSeconds(result.runSeconds),
    result,
    country,
  );
  return { accepted: true, personalBest, leaderboard: await getLeaderboard(hash) };
}
