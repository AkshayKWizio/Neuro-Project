import {
  isLeaderboard,
  isProgressReceipt,
  isRecord,
  isRunResult,
  isRunTicket,
  isScoreReceipt,
  type Leaderboard,
  type LeaderboardRequest,
  type RunResult,
  type RunTicket,
  type ScoreReceipt,
} from '../shared/leaderboard';

const IDENTITY_KEY = 'nightline.identity.v1';
const PENDING_PREFIX = 'nightline.pending-run.v1:';
const HEARTBEAT_SECONDS = 10;

interface SavedRun {
  ticket: RunTicket;
  result: RunResult;
}
interface ActiveRun {
  ticket: Promise<RunTicket>;
  resolved?: RunTicket;
  seconds: number;
  acknowledged: number;
  lastAttempt: number;
  sending?: Promise<void>;
}
class LeaderboardRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/** Random browser identity, durable score delivery, and cumulative active-play heartbeats. */
export class LeaderboardClient {
  private readonly token: string;
  readonly persistent: boolean;
  private profile: Promise<Leaderboard> | undefined;
  private active: ActiveRun | undefined;
  private pending = new Map<string, SavedRun>();
  private deliveries = new Map<string, Promise<ScoreReceipt>>();
  private readonly reconnect = (): void => {
    void this.recoverRuns();
    void this.flushProgress();
  };

  constructor() {
    let token = '';
    let persistent = true;
    try {
      token = localStorage.getItem(IDENTITY_KEY) ?? '';
    } catch {
      persistent = false;
    }
    if (!/^[a-f0-9]{64}$/.test(token)) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      try {
        localStorage.setItem(IDENTITY_KEY, token);
      } catch {
        persistent = false;
      }
    }
    this.token = token;
    this.persistent = persistent;
    this.readPending();
    globalThis.addEventListener?.('online', this.reconnect);
  }

  initialize(): Promise<Leaderboard> {
    if (!this.profile)
      this.profile = (async () => {
        const board = await this.request(isLeaderboard, { action: 'profile' }, true);
        if (!this.pending.size) return board;
        await this.recoverRuns();
        return this.refresh();
      })().catch((error) => {
        this.profile = undefined;
        throw error;
      });
    return this.profile;
  }
  refresh(): Promise<Leaderboard> {
    return this.request(isLeaderboard);
  }
  rename(nickname: string): Promise<Leaderboard> {
    return this.request(isLeaderboard, { action: 'rename', nickname });
  }

  startRun(): Promise<RunTicket> {
    void this.flushProgress();
    const ticket = this.request(isRunTicket, { action: 'start' }, true);
    const active: ActiveRun = { ticket, seconds: 0, acknowledged: 0, lastAttempt: -Infinity };
    this.active = active;
    void ticket
      .then((value) => {
        active.resolved = value;
      })
      .catch(() => {
        /* The UI reports a local run. */
      });
    return ticket;
  }

  /** Simulation time excludes menus, cinematics, pauses, and hidden tabs. */
  trackProgress(seconds: number): void {
    const active = this.active;
    if (!active || !Number.isFinite(seconds) || seconds <= 0) return;
    active.seconds = Math.max(active.seconds, seconds);
    const due =
      active.acknowledged === 0
        ? seconds >= 0.5
        : seconds - active.acknowledged >= HEARTBEAT_SECONDS;
    if (due && performance.now() - active.lastAttempt >= 3_000) void this.sendProgress(active);
  }

  /** keepalive lets the final small request finish when the player leaves the page. */
  async flushProgress(leavingPage = false): Promise<void> {
    const active = this.active;
    if (!active) return;
    if (leavingPage && active.resolved && active.seconds > active.acknowledged) {
      // Dispatch now instead of waiting for an older in-flight request during page teardown.
      try {
        await this.request(
          isProgressReceipt,
          { action: 'progress', runId: active.resolved.id, runSeconds: active.seconds },
          false,
          true,
        );
      } catch {
        /* Page-exit delivery is best effort. */
      }
      return;
    }
    if (active.sending) await active.sending;
    if (active.seconds > active.acknowledged) await this.sendProgress(active);
  }

  finishRun(ticket: RunTicket, result: RunResult): Promise<ScoreReceipt> {
    let saved = this.pending.get(ticket.id);
    if (!saved) {
      saved = { ticket: { ...ticket }, result: { ...result } };
      this.pending.set(ticket.id, saved);
      try {
        localStorage.setItem(PENDING_PREFIX + ticket.id, JSON.stringify(saved));
      } catch {
        /* Tab-local delivery still works. */
      }
    }
    return this.deliver(saved);
  }

  private async sendProgress(active: ActiveRun): Promise<void> {
    if (active.sending || active.seconds <= active.acknowledged) return active.sending;
    active.lastAttempt = performance.now();
    const seconds = active.seconds;
    active.sending = (async () => {
      try {
        const ticket = await active.ticket;
        await this.request(
          isProgressReceipt,
          { action: 'progress', runId: ticket.id, runSeconds: seconds },
          false,
          true,
        );
        active.acknowledged = Math.max(active.acknowledged, seconds);
      } catch {
        /* A later cumulative heartbeat or finish includes the missed time. */
      } finally {
        active.sending = undefined;
      }
    })();
    return active.sending;
  }

  private deliver(run: SavedRun): Promise<ScoreReceipt> {
    const existing = this.deliveries.get(run.ticket.id);
    if (existing) return existing;
    const delivery = this.request(
      isScoreReceipt,
      { action: 'finish', runId: run.ticket.id, result: run.result },
      true,
      true,
    )
      .then((receipt) => {
        this.removePending(run.ticket.id);
        return receipt;
      })
      .catch((error) => {
        if (error instanceof LeaderboardRequestError && [400, 401, 404, 410].includes(error.status))
          this.removePending(run.ticket.id);
        throw error;
      })
      .finally(() => this.deliveries.delete(run.ticket.id));
    this.deliveries.set(run.ticket.id, delivery);
    return delivery;
  }

  private async recoverRuns(): Promise<void> {
    this.readPending();
    for (const run of this.pending.values()) {
      try {
        await this.deliver(run);
      } catch {
        /* Keep transient failures for the next connection or page load. */
      }
    }
  }
  private removePending(id: string): void {
    this.pending.delete(id);
    try {
      localStorage.removeItem(PENDING_PREFIX + id);
    } catch {
      /* Storage is optional. */
    }
  }
  private readPending(): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(PENDING_PREFIX)) continue;
        try {
          const run: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
          if (
            isRecord(run) &&
            isRunTicket(run.ticket) &&
            isRunResult(run.result) &&
            key === PENDING_PREFIX + run.ticket.id
          ) {
            this.pending.set(run.ticket.id, { ticket: run.ticket, result: run.result });
          }
        } catch {
          /* Ignore damaged optional queue entries. */
        }
      }
    } catch {
      /* A restricted browser can still deliver scores in this tab. */
    }
  }

  private async request<T>(
    isResponse: (value: unknown) => value is T,
    body?: LeaderboardRequest,
    retry = false,
    keepalive = false,
  ): Promise<T> {
    const attempts = retry ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await fetch('/api/leaderboard', {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(10_000),
          cache: 'no-store',
          keepalive,
        });
        const text = await response.text();
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new LeaderboardRequestError(
            'The leaderboard is temporarily unavailable. Your run will retry automatically.',
            response.status,
          );
        }
        if (!response.ok) {
          const message =
            isRecord(payload) && typeof payload.error === 'string'
              ? payload.error
              : 'The leaderboard is temporarily unavailable.';
          throw new LeaderboardRequestError(message, response.status);
        }
        if (!isResponse(payload))
          throw new LeaderboardRequestError(
            'The leaderboard returned incomplete data. Please try again.',
            502,
          );
        return payload;
      } catch (cause) {
        const error =
          cause instanceof LeaderboardRequestError
            ? cause
            : new LeaderboardRequestError(
                'Couldn’t reach the leaderboard. Please reconnect and try again.',
              );
        const transient = error.status === 0 || error.status === 429 || error.status >= 500;
        if (!transient || attempt === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    throw new Error('The leaderboard is temporarily unavailable.');
  }
  dispose(): void {
    void this.flushProgress(true);
    globalThis.removeEventListener?.('online', this.reconnect);
  }
}
