import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RequestError,
  readCountryCode,
  readNickname,
  readRequestBody,
  readRunId,
  readRunResult,
  readRunSeconds,
} from './validation.js';
import type { RunResult } from '../src/shared/leaderboard.ts';

const secondsAt = (distance: number): number =>
  distance <= 1600
    ? Math.log(1 + (distance * 0.0075) / 14) / 0.0075
    : Math.log(26 / 14) / 0.0075 + (distance - 1600) / 26;
const run = (distance = 100): RunResult => ({
  score: distance * 10 + 500,
  distance,
  coins: 10,
  runSeconds: secondsAt(distance),
  peakFlow: 1,
  nearMisses: 0,
  cleanMoves: 0,
});

test('request bodies require JSON objects and enforce the byte limit for UTF-8 text', () => {
  assert.deepEqual(readRequestBody('{"action":"profile"}'), { action: 'profile' });
  assert.deepEqual(readRequestBody({ action: 'start' }), { action: 'start' });
  for (const value of [null, undefined, [], 1, true, '{', 'null', '[]', '"text"']) {
    assert.throws(
      () => readRequestBody(value),
      (error: unknown) => error instanceof RequestError && error.status === 400,
    );
  }
  const oversized = { nickname: '界'.repeat(1400) };
  for (const value of [oversized, JSON.stringify(oversized)]) {
    assert.throws(
      () => readRequestBody(value),
      (error: unknown) => error instanceof RequestError && error.status === 413,
    );
  }
});

test('runner names normalize spaces and Unicode but reject markup and control characters', () => {
  assert.equal(readNickname('  José   Runner  '), 'José Runner');
  for (const value of ['ab', '<script>alert(1)</script>', 'a'.repeat(21), 'name\u0000', {}, null])
    assert.throws(() => readNickname(value));
});
test('run verification accepts normal scores across acceleration and capped speed', () => {
  for (const distance of [50, 100, 1500, 1600, 2400, 20_000]) {
    const value = run(distance);
    assert.deepEqual(readRunResult(value, value.runSeconds + 6), value);
  }
});
test('forged scores, impossible travel, non-finite values, and invented pickups are rejected', () => {
  for (const change of [
    { score: 999_999 },
    { distance: 1000 },
    { runSeconds: 0 },
    { coins: 10_000 },
    { score: NaN },
    { nearMisses: Infinity },
    { coins: -1 },
    { peakFlow: 4 },
    { cleanMoves: 1000 },
    { score: 1500.2 },
  ]) {
    assert.throws(() => readRunResult({ ...run(), ...change }, 15));
  }
});
test('pause time is allowed while a run cannot claim more active time than its session', () => {
  assert.doesNotThrow(() => readRunResult(run(), 400));
  assert.throws(() => readRunResult(run(), 1));
});
test('bonuses fit the advertised peak flow without allowing an arbitrary score', () => {
  const value = {
    ...run(350),
    coins: 50,
    peakFlow: 4,
    nearMisses: 1,
    cleanMoves: 3,
    score: 13_000,
  };
  assert.doesNotThrow(() => readRunResult(value, 30));
  assert.throws(() => readRunResult({ ...value, score: 30_000 }, 30));
});

test('active-time reports accept cumulative fractional seconds and enforce wall-time limits', () => {
  assert.equal(readRunSeconds(0, 0), 0);
  assert.equal(readRunSeconds(15.1239, 16), 15.123);
  assert.equal(readRunSeconds(18, 15), 18);
  assert.equal(readRunSeconds(30, 600), 30, 'paused time does not need to be reported as active');
  for (const value of [-1, NaN, Infinity, '10', null, {}, 86_400.001])
    assert.throws(() => readRunSeconds(value, 100_000));
  assert.throws(() => readRunSeconds(18.001, 15));
  assert.throws(() => readRunSeconds(1, NaN));
  assert.throws(() => readRunResult({ ...run(1), score: 10, coins: 0, runSeconds: 0 }, 10));
});

test('country analytics accepts real ISO codes and excludes unknown or regional placeholders', () => {
  for (const code of ['UZ', 'KZ', 'US', 'GB', 'AX', 'BQ', 'SS', 'PS', 'AQ'])
    assert.equal(readCountryCode(code), code);
  assert.equal(readCountryCode('de'), 'DE');
  for (const value of [
    'XX',
    'ZZ',
    'EU',
    'UK',
    'T1',
    'USA',
    ' US ',
    'US,KZ',
    ['US'],
    null,
    undefined,
  ]) {
    assert.equal(readCountryCode(value), null);
  }
});

test('run identifiers must be complete UUID-shaped IDs before reaching the database', () => {
  assert.equal(
    readRunId('c0de0000-1234-4321-8888-000000000001'),
    'c0de0000-1234-4321-8888-000000000001',
  );
  for (const value of [
    '-'.repeat(36),
    'a'.repeat(36),
    '',
    'c0de0000-1234-4321-8888-00000000000g',
    null,
  ])
    assert.throws(() => readRunId(value));
});

test('denser 24m routes can submit their legitimate pickups without invalidating older routes', () => {
  const value = { ...run(1000), coins: 200, score: 20_000 };
  assert.doesNotThrow(() => readRunResult(value, value.runSeconds + 5));
  assert.throws(() => readRunResult({ ...value, coins: 400, score: 30_000 }, value.runSeconds + 5));
});
