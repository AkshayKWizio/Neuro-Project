// Games consume confirmed detector events, never independently classify raw IMU data.
export function gameCommand(game, data) {
  if (data.exercise === 'pronation_supination' && ['pronation', 'supination'].includes(data.movement)) {
    if (game !== 'sky_glider') return null;
    return data.action === 'move_left' ? 'left' : data.action === 'move_right' ? 'right' : null;
  }
  if (data.exercise === 'hand_open_close' && ['wrist_open', 'wrist_close'].includes(data.movement)) {
    if (game === 'balloon_blitz') return data.movement === 'wrist_close' ? 'grip' : 'release';
  }
  if (data.exercise === 'circumduction' && ['clockwise', 'anticlockwise'].includes(data.movement)) {
    if (game === 'rolling_wonder') return data.movement === 'clockwise' ? 'right' : 'left';
  }
  return null;
}

export function createGameActionReceiver(game, handlers, origin, parent, onHandled = () => {}) {
  const lastTimestamps = new Map();
  const lastResults = new Map();
  return event => {
    if (event.origin !== origin || event.source !== parent) return false;
    const data = event.data;
    if (!data || !['LEFT', 'RIGHT'].includes(data.side)) return false;
    if (data.type === 'neuro-game-config') {
      if (game !== 'sky_glider' || data.exercise !== 'pronation_supination' || !handlers.configure) return false;
      handlers.configure(data);
      return true;
    }
    if (data.type !== 'neuro-game-action') return false;
    const command = gameCommand(game, data);
    if (!command || !handlers[command] || !Number.isFinite(data.timestamp_ms)) return false;
    const key = `${data.side}:${data.exercise}`;
    if (data.timestamp_ms <= (lastTimestamps.get(key) ?? -Infinity)) {
      if (data.timestamp_ms === lastTimestamps.get(key)) onHandled(data, lastResults.get(key));
      return false;
    }
    lastTimestamps.set(key, data.timestamp_ms);
    const applied = handlers[command](data) !== false;
    lastResults.set(key, applied);
    onHandled(data, applied);
    return true;
  };
}

export function bindGloveControls(game, handlers) {
  const receive = createGameActionReceiver(game, handlers, window.location.origin, window.parent, (data, applied) => {
    window.parent.postMessage({
      type: 'neuro-game-action-ack', exercise: data.exercise, side: data.side,
      movement: data.movement, timestamp_ms: data.timestamp_ms, event_id: data.event_id, applied,
    }, window.location.origin);
  });
  window.addEventListener('message', receive);
  return () => window.removeEventListener('message', receive);
}
