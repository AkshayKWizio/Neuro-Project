// Compatibility layer for the shared audio module omitted from the team pull.
// Existing game-specific synths still generate their own effects.
export function setupGameAudio(options = {}) {
  let ctx = null;
  let sfxGain = null;
  let flightOscillator = null;
  let flightGain = null;
  const audio = {
    get ctx() { return ctx; },
    get sfxGain() { return sfxGain; },
    initAudioContext() {
      // Do not create blocked contexts repeatedly before a user gesture.
      if (!ctx && !navigator.userActivation?.hasBeenActive) return null;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        if (!ctx) {
          ctx = new AudioContext();
          sfxGain = ctx.createGain();
          sfxGain.gain.value = 0.35;
          sfxGain.connect(ctx.destination);
          if (options.theme === 'flight' || options.theme === 'arcade') {
            flightOscillator = ctx.createOscillator();
            flightGain = ctx.createGain();
            flightOscillator.type = 'sine';
            flightOscillator.frequency.value = 75;
            flightGain.gain.value = 0.008;
            flightOscillator.connect(flightGain);
            flightGain.connect(ctx.destination);
            flightOscillator.start();
          }
        }
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
        return ctx;
      } catch { return null; }
    },
    updateFlight(bank, speed) {
      if (!ctx || !flightOscillator || !flightGain) return;
      const intensity = Math.min(1, Math.abs(Number(bank) || 0));
      flightOscillator.frequency.setTargetAtTime(75 + intensity * 25 + Math.max(0, Number(speed) || 0) * 5, ctx.currentTime, 0.15);
      flightGain.gain.setTargetAtTime(0.008 + intensity * 0.004, ctx.currentTime, 0.15);
    },
    updateRolling(speed) {
      if (!ctx || !flightOscillator || !flightGain) return;
      const velocity = Math.max(0, Math.min(100, Number(speed) || 0));
      flightOscillator.frequency.setTargetAtTime(55 + velocity * 1.5, ctx.currentTime, 0.15);
      flightGain.gain.setTargetAtTime(0.006 + velocity * 0.00004, ctx.currentTime, 0.15);
    },
  };
  const unlock = () => { audio.initAudioContext(); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('pagehide', () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }, { once: true });
  return audio;
}
