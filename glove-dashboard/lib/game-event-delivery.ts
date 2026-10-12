export type DetectorEvent = { movement: string; timestamp_ms: number; event_id?: number };
export function detectorEventKey(event: DetectorEvent) {
  return event.event_id !== undefined ? `id:${event.event_id}` : `time:${event.timestamp_ms}:${event.movement}`;
}

// Retain confirmed events while the iframe initializes or the countdown runs.
// The initial snapshot is history, not a new movement to replay on mounting.
export class GameEventQueue {
  private seen = new Set<string>();
  private pending: DetectorEvent[] = [];
  constructor(baseline: DetectorEvent[] = []) {
    for (const event of baseline) this.seen.add(detectorEventKey(event));
  }
  observe(events: DetectorEvent[]) {
    let added = 0;
    for (const event of [...events].sort((a, b) => a.timestamp_ms - b.timestamp_ms)) {
      const key = detectorEventKey(event);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.pending.push(event);
      added++;
    }
    return added;
  }
  flush(ready: boolean, send: (event: DetectorEvent) => void) {
    if (!ready) return 0;
    const pending = this.pending.splice(0);
    for (const event of pending) send(event);
    return pending.length;
  }
}

export function exerciseRepetitions(mode: string, counts: Record<string, number>) {
  if (mode === 'pronation_supination') return Math.min(counts.pronation ?? 0, counts.supination ?? 0);
  if (mode === 'hand_open_close') return counts.wrist_close ?? 0;
  return (counts.clockwise ?? 0) + (counts.anticlockwise ?? 0);
}
