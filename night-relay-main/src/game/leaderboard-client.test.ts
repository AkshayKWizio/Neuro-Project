import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { LeaderboardClient } from './leaderboard-client.ts';
import {
  isRecord,
  type Leaderboard,
  type RunResult,
  type RunTicket,
  type ScoreReceipt,
} from '../shared/leaderboard.ts';

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
const board: Leaderboard = {
  entries: [],
  me: null,
  totalPlayers: 0,
  updatedAt: '2026-09-04T00:00:00Z',
  stats: {
    totalPlaySeconds: 0,
    totalPlayers: 0,
    totalCountries: 0,
    trackingSince: '2026-09-04T00:00:00Z',
  },
};
const ticket: RunTicket = {
  id: '46e1c995-4d89-435e-b9bb-63a8cc6279bd',
  startedAt: new Date().toISOString(),
};
const result: RunResult = {
  score: 1000,
  distance: 100,
  coins: 0,
  runSeconds: 7,
  peakFlow: 1,
  nearMisses: 0,
  cleanMoves: 0,
};
const receipt: ScoreReceipt = { accepted: true, personalBest: true, leaderboard: board };
const json = (value: unknown): Response =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const bodyOf = (options?: RequestInit): Record<string, unknown> => {
  const body: unknown = JSON.parse(String(options?.body ?? '{}'));
  assert.ok(isRecord(body));
  return body;
};
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'localStorage', { value: originalStorage, configurable: true });
});

test('browser identity survives reload without ever requiring a name', async () => {
  const identities: string[] = [],
    actions: string[] = [];
  globalThis.fetch = async (_url, options) => {
    identities.push(new Headers(options?.headers).get('authorization')!);
    actions.push(String(bodyOf(options).action));
    return json(board);
  };
  await new LeaderboardClient().initialize();
  await new LeaderboardClient().initialize();
  assert.equal(identities[0], identities[1]);
  assert.match(identities[0]!, /^Bearer [a-f0-9]{64}$/);
  assert.deepEqual(actions, ['profile', 'profile']);
});

test('active heartbeats exclude idle time, preserve final seconds, and use keepalive', async () => {
  const progress: number[] = [];
  globalThis.fetch = async (_url, options) => {
    const body = bodyOf(options);
    if (body.action === 'progress') {
      progress.push(Number(body.runSeconds));
      assert.equal(options?.keepalive, true);
      return json({ recorded: true });
    }
    return json(ticket);
  };
  const client = new LeaderboardClient();
  await client.startRun();
  client.trackProgress(0);
  await client.flushProgress();
  assert.deepEqual(progress, []);
  client.trackProgress(0.8);
  await client.flushProgress();
  client.trackProgress(0.8);
  await client.flushProgress();
  client.trackProgress(8.25);
  await client.flushProgress();
  assert.deepEqual(progress, [0.8, 8.25]);
  client.dispose();
});

test('page exit sends the latest cumulative time immediately while an older heartbeat is still pending', async () => {
  const progress: { runId: unknown; seconds: number; keepalive: boolean | undefined }[] = [];
  let releaseOlder!: () => void;
  let olderStarted!: () => void;
  let olderFinished = false;
  const olderResponse = new Promise<Response>((resolve) => {
    releaseOlder = () => resolve(json({ recorded: true }));
  });
  const olderRequestStarted = new Promise<void>((resolve) => {
    olderStarted = resolve;
  });
  globalThis.fetch = async (_url, options) => {
    const body = bodyOf(options);
    if (body.action !== 'progress') return json(ticket);
    progress.push({
      runId: body.runId,
      seconds: Number(body.runSeconds),
      keepalive: options?.keepalive,
    });
    if (progress.length === 1) {
      olderStarted();
      const response = await olderResponse;
      olderFinished = true;
      return response;
    }
    return json({ recorded: true });
  };
  const client = new LeaderboardClient();
  let leaving: Promise<void> | undefined;
  try {
    await client.startRun();
    client.trackProgress(1);
    await olderRequestStarted;
    client.trackProgress(12.75);
    leaving = client.flushProgress(true);
    assert.deepEqual(
      progress,
      [
        { runId: ticket.id, seconds: 1, keepalive: true },
        { runId: ticket.id, seconds: 12.75, keepalive: true },
      ],
      'page teardown must dispatch before the older fetch resolves',
    );
    await leaving;
    assert.equal(
      olderFinished,
      false,
      'the final heartbeat completes independently of the older request',
    );
  } finally {
    releaseOlder();
    await leaving;
    await client.flushProgress();
    client.dispose();
  }
});

test('concurrent score delivery shares one request and survives a transient server failure', async () => {
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++;
    assert.deepEqual(
      bodyOf(options).result,
      result,
      'retries keep the original completed score even if its caller mutates the input',
    );
    return requests === 1
      ? new Response('FUNCTION_INVOCATION_FAILED', { status: 500 })
      : json(receipt);
  };
  const client = new LeaderboardClient();
  const mutableResult = { ...result };
  const first = client.finishRun(ticket, mutableResult);
  mutableResult.score = 99_999;
  const [a, b] = await Promise.all([first, client.finishRun(ticket, mutableResult)]);
  assert.equal(requests, 2);
  assert.deepEqual(a, b);
  assert.equal(localStorage.getItem('nightline.pending-run.v1:' + ticket.id), null);
});

test('malformed successful responses are rejected before reaching leaderboard rendering', async () => {
  const client = new LeaderboardClient();
  const malformed: unknown[] = [
    null,
    [],
    {},
    { ...board, stats: null },
    { ...board, totalPlayers: '5' },
    {
      ...board,
      entries: [{ id: 'player', nickname: 'Courier', score: '100', distance: 10, rank: 1 }],
    },
    { ...board, stats: { ...board.stats, totalPlaySeconds: -1 } },
    { ...board, updatedAt: 'not a date' },
  ];
  for (const payload of malformed) {
    globalThis.fetch = async () => json(payload);
    await assert.rejects(client.refresh(), /incomplete data/);
  }
  globalThis.fetch = async () => json(board);
  assert.deepEqual(await client.refresh(), board);
  client.dispose();
});

test('damaged persisted scores cannot become unvalidated submission requests', async () => {
  const prefix = 'nightline.pending-run.v1:';
  localStorage.setItem(
    prefix + ticket.id,
    JSON.stringify({ ticket, result: { ...result, coins: 'many' } }),
  );
  localStorage.setItem(prefix + 'broken-json', '{');
  localStorage.setItem(prefix + 'mismatched-id', JSON.stringify({ ticket, result }));
  const actions: string[] = [];
  globalThis.fetch = async (_url, options) => {
    actions.push(String(bodyOf(options).action));
    return json(board);
  };
  const client = new LeaderboardClient();
  await client.initialize();
  assert.deepEqual(actions, ['profile']);
  client.dispose();
});

test('two tabs retain separate failed scores and a reload automatically recovers both', async () => {
  const secondTicket = { ...ticket, id: 'efc8b93c-699d-49b2-8e6c-e8e29bf6468c' };
  globalThis.fetch = async () => {
    throw new TypeError('offline');
  };
  const a = new LeaderboardClient(),
    b = new LeaderboardClient();
  await Promise.all([
    assert.rejects(a.finishRun(ticket, result)),
    assert.rejects(b.finishRun(secondTicket, result)),
  ]);
  assert.ok(localStorage.getItem('nightline.pending-run.v1:' + ticket.id));
  assert.ok(localStorage.getItem('nightline.pending-run.v1:' + secondTicket.id));
  const delivered: string[] = [];
  globalThis.fetch = async (_url, options) => {
    const body = bodyOf(options);
    if (body.action === 'finish') {
      delivered.push(String(body.runId));
      return json(receipt);
    }
    return json(board);
  };
  await new LeaderboardClient().initialize();
  assert.deepEqual(new Set(delivered), new Set([ticket.id, secondTicket.id]));
  assert.equal(localStorage.length, 1);
});
