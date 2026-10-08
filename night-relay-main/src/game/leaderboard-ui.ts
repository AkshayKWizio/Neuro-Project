import { LeaderboardClient } from './leaderboard-client';
import type { Leaderboard, PlayerStanding, RunResult, RunTicket } from '../shared/leaderboard';

export const leaderboardMarkup = `
<dialog id="leaderboard-dialog" class="leaderboard-dialog" aria-labelledby="board-title">
  <button class="dialog-close icon-button" aria-label="Close leaderboard">✕</button>
  <span class="eyebrow">SAMARKAND. EVERY COURIER.</span><h2 id="board-title">THE NIGHT<br>BELONGS TO…</h2>
  <dl class="board-totals" aria-label="Community activity">
    <div><dt>HOURS PLAYED</dt><dd id="board-total-hours">—</dd></div>
    <div><dt>PLAYERS</dt><dd id="board-total-players">—</dd></div>
    <div><dt>COUNTRIES</dt><dd id="board-total-countries">—</dd></div>
  </dl>
  <p id="board-tracking-note" class="board-tracking-note">Loading community activity…</p>
  <div class="board-heading"><strong>GLOBAL LEADERBOARD</strong><span id="board-player-count">SAMARKAND · EDITION 01</span><button id="board-refresh" aria-label="Refresh leaderboard">↻</button></div>
  <div id="board-status" class="board-status" role="status">Connecting to the city…</div>
  <ol id="board-entries" class="board-entries" aria-label="Top couriers"></ol>
  <div id="board-self" class="board-self" hidden></div>
  <div class="board-identity"><span>YOUR COURIER</span><strong id="board-courier-name">Getting your automatic name…</strong><p id="identity-note">No signup. Your name is automatic and this browser remembers you.</p></div>
  <details id="nickname-editor" class="nickname-editor"><summary>Edit name <span>optional</span></summary>
    <form id="nickname-form" class="nickname-form"><label for="nickname">COURIER NAME</label><div><input id="nickname" name="nickname" maxlength="20" minlength="3" autocomplete="nickname" placeholder="Your automatic courier name" required><button type="submit" id="nickname-save">SAVE NAME ↗</button></div><p>3–20 characters. Changing your name keeps your scores.</p><span id="nickname-status" role="status"></span></form>
  </details>
  <p class="board-footnote">Your best completed run counts. Equal scores are ordered by who got there first. Clearing this browser’s saved data creates a new courier.</p>
  <button class="primary-button dialog-done">BACK TO THE RELAY <span>→</span></button>
</dialog>`;

/** The results card owns this section; delayed responses never open or focus a dialog. */
export const resultLeaderboardMarkup = `
<section id="result-leaderboard" class="result-leaderboard" aria-labelledby="result-board-title" hidden>
  <div class="result-board-heading"><h3 id="result-board-title">YOUR PLACE IN THE NIGHT</h3><span>GLOBAL</span></div>
  <p id="result-board-status" class="result-board-status" role="status">Updating your standing…</p>
  <div id="result-board-self" class="result-board-self" aria-live="polite" aria-atomic="true"></div>
  <ol id="result-board-entries" class="board-entries result-board-entries" aria-label="Leading couriers"></ol>
  <button id="result-view-board" class="result-view-board" type="button">VIEW FULL BOARD <span aria-hidden="true">↗</span></button>
</section>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const format = new Intl.NumberFormat('en-US');
const hoursFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
type ResultState = 'idle' | 'posting' | 'saved' | 'local' | 'retry';

/** Names are rendered as text; requests stay outside the render loop and old runs cannot replace current results. */
export class LeaderboardUI {
  private client: LeaderboardClient;
  private board: Leaderboard | undefined;
  private ticket: Promise<RunTicket | null> | undefined;
  private runVersion = 0;
  private requestVersion = 0;
  private pending:
    { ticket: Promise<RunTicket | null>; result: RunResult; version: number } | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private submittingVersions = new Set<number>();
  private resultVisible = false;
  private resultState: ResultState = 'idle';
  private resultMessage = '';
  private readonly reconnect = (): void => {
    if (this.pending) void this.submit();
    void this.refresh();
  };

  constructor(client = new LeaderboardClient()) {
    this.client = client;
    if (!client.persistent)
      $('identity-note').textContent =
        'Your name is automatic. Browser storage is unavailable, so this identity lasts for this tab only.';
    $('board-refresh').onclick = () => {
      void this.refresh();
    };
    $<HTMLFormElement>('nickname-form').onsubmit = (event) => {
      event.preventDefault();
      void this.saveName();
    };
    $('nickname').addEventListener('input', () => {
      $('nickname').dataset.dirty = 'true';
    });
    $('score-sync').onclick = () => {
      if (this.pending) void this.submit();
    };
    $('result-view-board')?.addEventListener('click', () => {
      $('leaderboard')?.click();
    });
    $('leaderboard-dialog').addEventListener('close', () => this.stopRefresh());
    globalThis.addEventListener('online', this.reconnect);
    const version = this.requestVersion;
    void client
      .initialize()
      .then((board) => {
        if (version === this.requestVersion) this.render(board);
      })
      .catch((error) => {
        if (version === this.requestVersion) this.showError(error);
      });
  }

  open(): void {
    void this.refresh();
    this.stopRefresh();
    this.interval = setInterval(() => {
      if (!document.hidden) void this.refresh();
    }, 30_000);
  }

  beginRun(): void {
    this.runVersion++;
    this.pending = undefined;
    this.resultVisible = false;
    this.resultState = 'idle';
    const resultBoard = $('result-leaderboard');
    if (resultBoard) resultBoard.hidden = true;
    this.ticket = this.client.startRun().catch(() => null);
    this.setSync('Saving your place on the board…', false);
  }

  finishRun(result: RunResult): void {
    this.resultVisible = true;
    this.resultState = 'posting';
    this.resultMessage = 'Posting your run. Your global rank will appear here.';
    const resultBoard = $('result-leaderboard');
    if (resultBoard) resultBoard.hidden = false;
    this.renderResult();
    // Show the current community immediately, including if this run cannot be posted.
    void this.refresh();
    this.pending = {
      ticket: this.ticket ?? Promise.resolve(null),
      result: { ...result },
      version: this.runVersion,
    };
    void this.submit();
  }

  private setSync(message: string, canRetry: boolean, saved = false): void {
    const sync = $<HTMLButtonElement>('score-sync');
    sync.textContent = message;
    sync.disabled = !canRetry;
    sync.classList.toggle('synced', saved);
    sync.classList.toggle('needs-retry', canRetry);
  }

  private async submit(): Promise<void> {
    const pending = this.pending;
    if (!pending || this.submittingVersions.has(pending.version)) return;
    this.submittingVersions.add(pending.version);
    if (pending.version === this.runVersion) {
      this.resultState = 'posting';
      this.resultMessage = 'Posting your run. Your global rank will appear here.';
      this.setSync('Posting your run…', false);
      this.renderResult();
    }
    try {
      const ticket = await pending.ticket;
      if (!ticket) {
        if (pending.version === this.runVersion) {
          this.resultState = 'local';
          this.resultMessage = 'This run is local. Your existing global standing is shown below.';
          this.setSync('Local run · reconnect for your next ranked run', false);
          this.pending = undefined;
          this.renderResult();
        }
        return;
      }
      const receipt = await this.client.finishRun(ticket, pending.result);
      if (pending.version !== this.runVersion) return;
      // A GET started before submission must not overwrite the just-saved ranking.
      this.requestVersion++;
      $('board-refresh').classList.remove('refreshing');
      this.resultState = 'saved';
      this.resultMessage = receipt.personalBest
        ? 'New personal best. Your standing is updated.'
        : 'Run saved. Rankings use each courier’s best score.';
      this.setSync(
        receipt.personalBest
          ? 'SCORE SAVED · NEW PERSONAL BEST'
          : 'SCORE SAVED TO THE GLOBAL BOARD',
        false,
        true,
      );
      this.pending = undefined;
      this.render(receipt.leaderboard);
    } catch (error) {
      if (pending.version === this.runVersion) {
        this.resultState = 'retry';
        this.resultMessage = 'Your run has not reached the board yet. Retry when you’re connected.';
        this.setSync(
          `${error instanceof Error ? error.message : 'Score not posted.'} Tap to retry.`,
          true,
        );
        this.renderResult();
      }
    } finally {
      this.submittingVersions.delete(pending.version);
      if (this.pending && this.pending !== pending) void this.submit();
    }
  }

  async refresh(): Promise<void> {
    const version = ++this.requestVersion;
    $('board-refresh').classList.add('refreshing');
    try {
      const board = await this.client.refresh();
      if (version === this.requestVersion) this.render(board);
    } catch (error) {
      if (version === this.requestVersion) this.showError(error);
    } finally {
      if (version === this.requestVersion) $('board-refresh').classList.remove('refreshing');
    }
  }

  private async saveName(): Promise<void> {
    const button = $<HTMLButtonElement>('nickname-save');
    button.disabled = true;
    $('nickname-status').textContent = 'Saving…';
    try {
      const board = await this.client.rename($<HTMLInputElement>('nickname').value);
      this.requestVersion++;
      $('board-refresh').classList.remove('refreshing');
      $('nickname').dataset.dirty = 'false';
      this.render(board);
      $('nickname-status').textContent = 'Name saved. Your scores stay with you.';
    } catch (error) {
      $('nickname-status').textContent =
        error instanceof Error ? error.message : 'Name could not be saved.';
    } finally {
      button.disabled = false;
    }
  }

  private entryRow(entry: PlayerStanding, meId: string | undefined): HTMLLIElement {
    const isYou = entry.id === meId;
    const row = document.createElement('li');
    row.className = `board-row${entry.rank === 1 ? ' leader' : ''}${isYou ? ' is-you' : ''}`;
    const place = document.createElement('span');
    place.className = 'board-place';
    place.textContent = entry.rank === 1 ? '♛' : String(entry.rank ?? '—').padStart(2, '0');
    place.setAttribute('aria-label', `Rank ${entry.rank ?? 'unranked'}`);
    const name = document.createElement('div'),
      title = document.createElement('strong');
    title.textContent = entry.nickname;
    name.append(title);
    const detail = document.createElement('small');
    detail.textContent = `${entry.rank === 1 ? 'CITY LEADER · ' : ''}${isYou ? 'YOU · ' : ''}${format.format(entry.distance ?? 0)} METERS`;
    name.append(detail);
    const score = document.createElement('strong');
    score.className = 'board-score';
    score.textContent = format.format(entry.score ?? 0);
    score.setAttribute('aria-label', `${format.format(entry.score ?? 0)} points`);
    row.append(place, name, score);
    return row;
  }

  private renderStats(board: Leaderboard): void {
    const stats = board.stats;
    if (!stats) return; // A cached older deployment may not yet provide aggregate fields.
    const hours = stats.totalPlaySeconds / 3600;
    $('board-total-hours').textContent =
      hours > 0 && hours < 0.1 ? '<0.1' : hoursFormat.format(hours);
    $('board-total-hours').setAttribute(
      'aria-label',
      `${format.format(Math.round(stats.totalPlaySeconds / 60))} minutes played`,
    );
    $('board-total-players').textContent = format.format(stats.totalPlayers);
    $('board-total-countries').textContent = format.format(stats.totalCountries);
    const since = new Date(stats.trackingSince);
    $('board-tracking-note').textContent = Number.isNaN(since.getTime())
      ? 'Players are unique browsers that played. Playtime and countries count from the start of tracking.'
      : `Playtime & countries tracked since ${dateFormat.format(since)} · Players are unique browsers that played.`;
  }

  private render(board: Leaderboard): void {
    this.board = board;
    this.renderStats(board);
    $('board-player-count').textContent =
      `${format.format(board.totalPlayers)} ${board.totalPlayers === 1 ? 'RANKED COURIER' : 'RANKED COURIERS'}`;
    $('board-status').hidden = board.entries.length > 0;
    $('board-status').textContent =
      'The city is yours to claim. Finish a run to become its first leader.';
    const entries = $('board-entries');
    entries.replaceChildren(...board.entries.map((entry) => this.entryRow(entry, board.me?.id)));
    const me = board.me;
    $('board-self').hidden = !me;
    if (me) {
      $('board-self').textContent = me.rank
        ? `YOUR GLOBAL RANK  #${format.format(me.rank)}  ·  ${format.format(me.score ?? 0)} POINTS`
        : `${me.nickname} · Finish a run to join the rankings.`;
      if ($('nickname').dataset.dirty !== 'true' && document.activeElement !== $('nickname'))
        $<HTMLInputElement>('nickname').value = me.nickname;
      $('board-courier-name').textContent = me.nickname;
      $('player-name').textContent = me.nickname;
      $('player-rank').textContent =
        me.rank === 1
          ? 'CITY LEADER'
          : me.rank
            ? `RANK #${format.format(me.rank)}`
            : 'CLAIM YOUR PLACE';
    }
    this.renderResult();
  }

  private renderResult(): void {
    if (!this.resultVisible || !$('result-leaderboard')) return;
    const entries = $('result-board-entries');
    entries.replaceChildren();
    for (const entry of this.board?.entries.slice(0, 3) ?? [])
      entries.append(this.entryRow(entry, this.board?.me?.id));
    $('result-board-status').textContent = this.resultMessage;
    const self = $('result-board-self');
    self.replaceChildren();
    self.classList.toggle('waiting', this.resultState === 'posting');
    const me = this.board?.me;
    const label = document.createElement('span');
    label.className = 'result-self-label';
    label.textContent =
      this.resultState === 'posting'
        ? 'YOUR GLOBAL RANK · UPDATING'
        : me?.rank === 1
          ? 'YOU LEAD THE CITY'
          : 'YOUR GLOBAL RANK';
    const rank = document.createElement('strong');
    rank.className = 'result-self-rank';
    rank.textContent = me?.rank ? `#${format.format(me.rank)}` : '—';
    const name = document.createElement('span');
    name.className = 'result-self-name';
    name.textContent = me?.nickname ?? 'Your automatic courier';
    const score = document.createElement('span');
    score.className = 'result-self-score';
    score.textContent = me?.rank
      ? `${format.format(me.score ?? 0)} POINTS · PERSONAL BEST`
      : this.resultState === 'posting'
        ? 'Your score is being posted…'
        : 'Complete a connected run to join the board.';
    self.append(label, rank, name, score);
  }

  private showError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : 'The leaderboard is temporarily unavailable.';
    $('board-status').hidden = false;
    $('board-status').textContent = `${this.board ? 'Showing the last update. ' : ''}${message}`;
    if (!this.board)
      $('board-tracking-note').textContent =
        'Community activity is temporarily unavailable. You can keep playing.';
    if (this.resultVisible && !this.board && this.resultState !== 'posting') {
      this.resultMessage = 'Global standings are temporarily unavailable. You can keep playing.';
      this.renderResult();
    }
  }

  private stopRefresh(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
  }
  dispose(): void {
    this.stopRefresh();
    this.requestVersion++;
    this.runVersion++;
    globalThis.removeEventListener('online', this.reconnect);
  }
}
