import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import type { RunResult, RunTicket } from '../src/shared/leaderboard.js';

// This is a write test. Require an explicitly isolated target, never the app's default URL.
if (!process.env.LEADERBOARD_TEST_DATABASE_URL)
  throw new Error(
    'Set LEADERBOARD_TEST_DATABASE_URL to an isolated, migrated Neon branch before running this check.',
  );
process.env.DATABASE_URL = process.env.LEADERBOARD_TEST_DATABASE_URL;
const sql = neon(process.env.DATABASE_URL);
const { ensurePlayer, getLeaderboard, recordProgress, startRun, submitRun, tokenHash } =
  await import('../server/database.js');
const identities = [
  tokenHash(randomBytes(32).toString('hex')),
  tokenHash(randomBytes(32).toString('hex')),
];
const ids: string[] = [];
const historicId = randomUUID();
const historicSeason = `qa-lifetime-${randomUUID()}`;
const secondsAt = (distance: number): number => Math.log(1 + (distance * 0.0075) / 14) / 0.0075;
const rounded = (value: number): number => Math.floor(value * 1000) / 1000;
const result = (score: number): RunResult => ({
  score,
  distance: 100,
  coins: (score - 1000) / 50,
  runSeconds: secondsAt(100),
  peakFlow: 1,
  nearMisses: 0,
  cleanMoves: 0,
});
const ticket = async (hash: string): Promise<RunTicket> => {
  const value = await startRun(hash);
  await sql`UPDATE nightline_runs SET started_at = NOW() - INTERVAL '10 minutes' WHERE id = ${value.id}`;
  return value;
};
const played = async (hash: string): Promise<number> =>
  Number(
    (
      await sql`SELECT COALESCE(SUM(play_seconds), 0) AS seconds FROM nightline_activity WHERE token_hash = ${hash}`
    )[0].seconds,
  );
const assertSeconds = (actual: number, expected: number, message?: string): void =>
  assert.ok(
    Math.abs(actual - expected) < 0.00001,
    message ?? `Expected ${expected} seconds, received ${actual}`,
  );
const existingSnapshot = async (): Promise<string> => {
  const rows =
    await sql`SELECT id, token_hash, season, nickname, best_score, best_distance, best_coins, best_at, created_at
    FROM nightline_players WHERE token_hash <> ALL(${identities}::text[]) ORDER BY id`;
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};
const beforeRecords = await existingSnapshot();
const baseline = await getLeaderboard(null);
const baselineCountries = new Set(
  (await sql`SELECT DISTINCT country_code FROM nightline_activity_countries`).map(
    (row) => row.country_code,
  ),
);
try {
  for (const hash of identities) ids.push(await ensurePlayer(hash));
  assert.equal(
    await ensurePlayer(identities[0]),
    ids[0],
    'same browser keeps its automatic profile',
  );
  const initial = await getLeaderboard(identities[0]);
  assert.ok(initial.me);
  assert.match(initial.me.nickname, /^Courier [A-F0-9]{4}$/);
  assert.equal(initial.me.rank, null, 'a profile does not manufacture a score');
  assert.deepEqual(initial.stats, baseline.stats, 'profile creation does not count as play');

  const first = await ticket(identities[0]);
  assert.deepEqual(
    (await getLeaderboard(null)).stats,
    baseline.stats,
    'starting a ticket alone does not count',
  );
  await recordProgress(identities[0], first.id, 0, 'UZ');
  assert.deepEqual(
    (await getLeaderboard(null)).stats,
    baseline.stats,
    'zero progress does not count',
  );
  await assert.rejects(() => recordProgress(identities[1], first.id, 1, 'KZ'), /not found/);
  await assert.rejects(() => submitRun(identities[1], first.id, result(2000)), /not found/);
  await assert.rejects(() => recordProgress(identities[0], first.id, 700, 'UZ'), /verified/);

  await Promise.all(
    [2, 5, 3, 5, 1].map((seconds) => recordProgress(identities[0], first.id, seconds, 'UZ')),
  );
  assertSeconds(await played(identities[0]), 5);
  const progressed = await getLeaderboard(null);
  assert.equal(
    progressed.stats.totalPlayers,
    baseline.stats.totalPlayers + 1,
    'concurrent reports count one browser',
  );
  assertSeconds(progressed.stats.totalPlaySeconds, baseline.stats.totalPlaySeconds + 5);
  assert.equal(progressed.stats.totalCountries, new Set([...baselineCountries, 'UZ']).size);
  assert.equal(
    progressed.totalPlayers,
    baseline.totalPlayers,
    'progress does not add a ranked score',
  );

  const accepted = await submitRun(identities[0], first.id, result(2000), 'UZ');
  assert.equal(accepted.personalBest, true);
  assertSeconds(await played(identities[0]), rounded(result(2000).runSeconds));
  await submitRun(identities[0], first.id, { score: 999999 });
  await recordProgress(identities[0], first.id, 500, 'GB');
  assertSeconds(await played(identities[0]), rounded(result(2000).runSeconds));
  assert.equal(
    (await getLeaderboard(identities[0])).me?.score,
    2000,
    'completed tickets are one-use',
  );

  const second = await ticket(identities[1]);
  await submitRun(identities[1], second.id, result(2000), 'KZ');
  const boardA = await getLeaderboard(identities[0]);
  const boardB = await getLeaderboard(identities[1]);
  assert.ok(boardA.me?.rank && boardB.me?.rank);
  assert.match(boardB.me.nickname, /^Courier [A-F0-9]{4}$/);
  assert.ok(boardA.me.rank < boardB.me.rank, 'earlier equal score wins');
  assert.ok(
    boardA.entries.some((player) => player.id === ids[1]),
    'unrenamed browser A sees browser B',
  );
  assert.ok(
    boardB.entries.some((player) => player.id === ids[0]),
    'unrenamed browser B sees browser A',
  );
  assert.equal(boardB.stats.totalPlayers, baseline.stats.totalPlayers + 2);
  assert.equal(boardB.stats.totalCountries, new Set([...baselineCountries, 'UZ', 'KZ']).size);

  const lower = await ticket(identities[0]);
  assert.equal((await submitRun(identities[0], lower.id, result(1500))).personalBest, false);
  const higher = await ticket(identities[1]);
  const concurrent = await Promise.all([
    recordProgress(identities[1], higher.id, 3, 'KZ'),
    submitRun(identities[1], higher.id, result(2500), 'KZ'),
    submitRun(identities[1], higher.id, result(2500), 'KZ'),
  ]);
  assert.equal(
    concurrent.filter((receipt) => 'personalBest' in receipt && receipt.personalBest).length,
    1,
    'one finish wins',
  );
  assertSeconds(await played(identities[1]), rounded(result(2000).runSeconds) * 2);
  const higherBoard = await getLeaderboard(identities[1]);
  const lowerBoard = await getLeaderboard(identities[0]);
  assert.ok(higherBoard.me?.rank && lowerBoard.me?.rank);
  assert.ok(higherBoard.me.rank < lowerBoard.me.rank);

  const durableSeconds = await played(identities[0]);
  await sql`UPDATE nightline_runs SET started_at = NOW() - INTERVAL '2 days' WHERE player_id = ${ids[0]}`;
  const fresh = await startRun(identities[0]);
  assert.equal(
    Number(
      (await sql`SELECT COUNT(*) AS count FROM nightline_runs WHERE player_id = ${ids[0]}`)[0]
        .count,
    ),
    1,
  );
  assertSeconds(await played(identities[0]), durableSeconds, 'cleanup preserves lifetime duration');
  await assert.rejects(() => recordProgress(identities[0], fresh.id, 10_000), /verified/);

  // A second season for the same test browser must not create another lifetime player.
  await sql`INSERT INTO nightline_players (id, token_hash, season, nickname, best_score, best_distance, best_coins, best_at)
    VALUES (${historicId}, ${identities[0]}, ${historicSeason}, 'QA past courier', 1234, 100, 4, NOW() - INTERVAL '2 days')`;
  await sql`INSERT INTO nightline_activity (token_hash, play_seconds, first_played_at)
    SELECT token_hash, 0, MIN(COALESCE(best_at, created_at)) FROM nightline_players
    WHERE token_hash = ${identities[0]} AND best_score IS NOT NULL GROUP BY token_hash
    ON CONFLICT (token_hash) DO NOTHING`;
  const end = await getLeaderboard(null);
  assert.equal(
    end.stats.totalPlayers,
    baseline.stats.totalPlayers + 2,
    'lifetime players deduplicate across seasons',
  );
  assertSeconds(
    end.stats.totalPlaySeconds,
    baseline.stats.totalPlaySeconds + rounded(result(2000).runSeconds) * 4,
  );
  assert.equal(end.stats.trackingSince, baseline.stats.trackingSince);
  assert.equal(
    Number(
      (await sql`SELECT best_score FROM nightline_players WHERE id = ${historicId}`)[0].best_score,
    ),
    1234,
  );
  assert.equal(
    await existingSnapshot(),
    beforeRecords,
    'all pre-existing profiles and scores remain untouched',
  );
  console.log(
    'Verified: automatic shared identities, live play totals, countries, concurrent progress/finish, retries, ranking, session cleanup, season deduplication and existing-record preservation.',
  );
} finally {
  await sql`DELETE FROM nightline_players WHERE token_hash = ANY(${identities}::text[])`;
  await sql`DELETE FROM nightline_activity WHERE token_hash = ANY(${identities}::text[])`;
  assert.equal(await existingSnapshot(), beforeRecords, 'cleanup preserves all original records');
  console.log('Removed only this check’s two browser identities, profiles, sessions and activity.');
}
