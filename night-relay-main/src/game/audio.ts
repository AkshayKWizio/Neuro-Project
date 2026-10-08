type AudioDestination = GainNode;

export interface RunningAudioContext {
  grounded?: boolean;
  wet?: boolean;
  /** @deprecated Retained for older callers; no longer affects playback. */
  chase?: number;
}

const SAMPLE_URLS = {
  stepA: `${import.meta.env.BASE_URL}audio/wet-step-a.mp3`,
  stepB: `${import.meta.env.BASE_URL}audio/wet-step-b.mp3`,
  stepC: `${import.meta.env.BASE_URL}audio/wet-step-c.mp3`,
  landing: `${import.meta.env.BASE_URL}audio/wet-landing.mp3`,
  breath: `${import.meta.env.BASE_URL}audio/runner-breath.mp3`,
} as const;
type SampleName = keyof typeof SAMPLE_URLS;
interface SamplePlayback {
  source: AudioBufferSourceNode;
  gain: GainNode;
}
const FOOTSTEPS: SampleName[] = ['stepA', 'stepB', 'stepC'];

/** Natural courier movement and a warm festival score, unlocked by a user gesture. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private running = false;
  private musicPlaying = false;
  private nextStep = 0;
  private step = 0;
  private sources = new Set<AudioScheduledSourceNode>();
  private sourceCleanup = new Map<AudioScheduledSourceNode, () => void>();
  private samples = new Map<SampleName, AudioBuffer>();
  private loops = new Map<'breath', SamplePlayback>();
  private loading: Promise<void> | null = null;
  private loadController: AbortController | null = null;
  private disposed = false;
  private nextFootstep = 0;
  private footstepIndex = 0;
  private lastRelaySignal = -Infinity;
  private lastPulse = -Infinity;
  private wet = true;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopSources();
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(enabled ? 0.38 : 0, this.context.currentTime, 0.04);
    }
  }

  public unlock(): void {
    if (this.disposed || typeof window === 'undefined') return;
    if (!this.context && navigator.userActivation && !navigator.userActivation.isActive) return;

    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.38 : 0;

        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -15;
        compressor.knee.value = 18;
        compressor.ratio.value = 3;
        this.master.connect(compressor);
        compressor.connect(this.context.destination);

        this.music = this.context.createGain();
        this.music.gain.value = 0;
        this.music.connect(this.master);

        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate * 0.15,
          this.context.sampleRate,
        );
        const data = this.noise.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) {
          data[index] = Math.random() * 2 - 1;
        }
      }

      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
      void this.loadSamples();
    } catch {
      // The game remains playable when browser or device audio is unavailable.
    }
  }

  /** Schedule a short look-ahead window from the animation loop, without timers. */
  public update(speed: number, running: boolean, details: RunningAudioContext = {}): void {
    this.wet = details.wet ?? this.wet;
    const wasRunning = this.running;
    this.running = running;
    if (wasRunning && !running) this.stopSources();
    const context = this.context;
    const music = this.music;
    if (!context || !music || context.state !== 'running') return;

    const now = context.currentTime;
    if (this.musicPlaying !== running) {
      this.musicPlaying = running;
      music.gain.setTargetAtTime(running ? 0.45 : 0, now, 0.08);
      this.nextStep = now + 0.04;
      this.nextFootstep = now + 0.12;
    }

    if (!running || !this.enabled) {
      this.nextStep = now + 0.04;
      return;
    }

    this.updateFoley(now, speed, details);

    if (this.nextStep < now - 0.2) this.nextStep = now + 0.02;
    const safeSpeed = Number.isFinite(speed) ? speed : 14;
    const stepLength = 60 / (94 + Math.max(0, safeSpeed - 14) * 1.5) / 4;
    let scheduled = 0;

    while (this.nextStep < now + 0.12 && scheduled < 4) {
      this.playMusicStep(this.nextStep, this.step, stepLength, music);
      this.nextStep += stepLength;
      this.step += 1;
      scheduled += 1;
    }
  }

  public coin(): void {
    if (!this.canPlay() || !this.master || !this.context) return;
    const now = this.context.currentTime;
    this.tone(1046.5, now, 0.12, 'sine', 0.21, this.master);
    this.tone(1568, now + 0.055, 0.16, 'sine', 0.14, this.master);
  }

  public jump(): void {
    if (!this.canPlay() || !this.master || !this.context) return;
    const now = this.context.currentTime;
    this.tone(160, now, 0.2, 'sine', 0.15, this.master, 440);
    this.percussion(now, 0.06, 0.055, 1300, this.master);
  }

  public hit(): void {
    if (!this.canPlay() || !this.master || !this.context) return;
    const now = this.context.currentTime;
    this.tone(100, now, 0.42, 'triangle', 0.45, this.master, 32);
    this.percussion(now, 0.13, 0.4, 650, this.master);
  }

  public powerup(): void {
    if (!this.canPlay() || !this.master || !this.context) return;
    const now = this.context.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      this.tone(frequency, now + index * 0.075, 0.35, 'triangle', 0.16, this.master!);
    });
  }

  public nearMiss(): void {
    if (!this.canPlay() || !this.master || !this.context) return;
    const now = this.context.currentTime;
    this.percussion(now, 0.13, 0.18, 1600, this.master);
    this.tone(420, now, 0.18, 'sine', 0.085, this.master, 165);
  }

  public combo(level: number): void {
    if (!this.canPlay() || !this.master || !this.context) return;
    const destination = this.master;
    const now = this.context.currentTime;
    const clampedLevel = Number.isFinite(level) ? Math.min(4, Math.max(1, level)) : 1;
    const root = 440 * 2 ** ((clampedLevel - 1) / 12);
    [0, 7, 12, 19].forEach((semitones, index) => {
      this.tone(root * 2 ** (semitones / 12), now + index * 0.075, 0.32, 'sine', 0.15, destination);
    });
  }

  /** @deprecated Use relaySignal() for the friendly camera drone. */
  public horn(): void {
    this.relaySignal();
  }

  public land(): void {
    if (!this.canPlay() || !this.master || !this.context) return;
    const now = this.context.currentTime;
    this.nextFootstep = now + 0.22;
    if (this.wet && this.playSample('landing', 0.9, 0.9)) return;
    this.tone(90, now, 0.09, 'sine', 0.18, this.master, 40);
    this.percussion(now, 0.045, 0.06, 850, this.master);
  }

  public magnetic(): void {
    if (!this.canPlay() || !this.master || !this.context) return;
    const destination = this.master;
    const now = this.context.currentTime;
    [659.25, 987.77, 1318.51, 1975.53].forEach((frequency, index) => {
      this.tone(frequency, now + index * 0.09, 0.4, 'sine', 0.12, destination);
    });
    this.tone(130.81, now, 0.5, 'sine', 0.15, destination, 261.63);
  }

  /** @deprecated Use relaySignal(); this compatibility call contains no speech. */
  public officerHey(): void {
    this.relaySignal();
  }

  /** @deprecated Use relaySignal(); this compatibility call contains no animal audio. */
  public dogBark(_strength = 1): void {
    this.relaySignal();
  }

  /** A warm, brief camera-ready chime from the courier's companion drone. */
  public relaySignal(): void {
    if (!this.canPlay() || !this.context || !this.master) return;
    const now = this.context.currentTime;
    if (now - this.lastRelaySignal < 0.45) return;
    this.lastRelaySignal = now;
    const destination = this.master;
    [440, 554.37, 659.25].forEach((frequency, index) => {
      this.tone(frequency, now + index * 0.085, 0.38, 'sine', 0.18 - index * 0.025, destination);
      this.tone(frequency * 2, now + index * 0.085, 0.18, 'sine', 0.035, destination);
    });
  }

  /** An expanding, rounded musical swell for a released light pulse. */
  public pulse(): void {
    if (!this.canPlay() || !this.context || !this.master) return;
    const context = this.context;
    const now = context.currentTime;
    if (now - this.lastPulse < 0.15) return;
    this.lastPulse = now;
    for (const [frequency, volume] of [
      [164.81, 0.22],
      [246.94, 0.12],
      [329.63, 0.06],
    ]) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 2, now + 0.38);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(volume, now + 0.11);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      oscillator.connect(envelope);
      envelope.connect(this.master);
      this.trackSource(oscillator, () => envelope.disconnect());
      oscillator.start(now);
      oscillator.stop(now + 0.82);
    }
    this.percussion(now + 0.04, 0.13, 0.04, 3600, this.master);
  }

  public sprayPaint(duration = 0.9): void {
    if (!this.canPlay() || !this.context || !this.noise || !this.master) return;
    duration = Number.isFinite(duration) ? Math.min(4, Math.max(0.15, duration)) : 0.9;
    const context = this.context,
      now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.noise;
    source.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = 3900;
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(0.16, now + 0.035);
    envelope.gain.setValueAtTime(0.16, now + Math.max(0.06, duration - 0.08));
    envelope.gain.linearRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    this.trackSource(source, () => {
      filter.disconnect();
      envelope.disconnect();
    });
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  /** Explicit pause/home control stops all cues, including an introduction chime or spray. */
  public stop(): void {
    this.running = false;
    this.musicPlaying = false;
    this.stopSources();
    if (this.context && this.music) this.music.gain.setValueAtTime(0, this.context.currentTime);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopSources();
    this.loadController?.abort();
    this.loadController = null;
    this.loading = null;
    this.samples.clear();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.music = null;
    this.noise = null;
    this.running = false;
    this.musicPlaying = false;
    this.step = 0;
  }

  private canPlay(): boolean {
    return !this.disposed && this.enabled && this.context?.state === 'running';
  }

  private loadSamples(): Promise<void> {
    if (this.loading) return this.loading;
    const context = this.context;
    if (!context || this.disposed) return Promise.resolve();
    const controller = new AbortController();
    this.loadController = controller;
    this.loading = Promise.allSettled(
      (Object.entries(SAMPLE_URLS) as [SampleName, string][]).map(async ([name, url]) => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Audio asset unavailable: ${name}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!this.disposed && this.context === context && this.loadController === controller)
          this.samples.set(name, buffer);
      }),
    ).then(() => undefined);
    // A missing or undecodable sample never prevents the procedural game audio from playing.
    return this.loading;
  }

  private updateFoley(now: number, speed: number, details: RunningAudioContext): void {
    const effort = Math.min(1, Math.max(0, ((Number.isFinite(speed) ? speed : 14) - 14) / 12));
    this.updateLoop('breath', 0.25 + effort * 0.16, 0.96 + effort * 0.1);

    if (details.grounded === false) {
      this.nextFootstep = now + 0.08;
    } else if (now >= this.nextFootstep) {
      const foot = FOOTSTEPS[this.footstepIndex % FOOTSTEPS.length]!;
      const side = this.footstepIndex++ % 2 === 0 ? -0.09 : 0.09;
      if (!this.wet || !this.playSample(foot, 0.72, 0.95 + Math.random() * 0.1, side)) {
        this.percussion(now, 0.055, 0.13, this.wet ? 1500 : 750, this.master!);
        this.tone(105, now, 0.055, 'sine', 0.1, this.master!, 45);
      }
      this.nextFootstep = now + 0.28 - effort * 0.055;
    }
  }

  private updateLoop(name: 'breath', volume: number, rate: number): void {
    const context = this.context;
    if (!context) return;
    let playback = this.loops.get(name);
    if (!playback) {
      playback = this.playSample(name, volume, rate, 0, true) ?? undefined;
      if (!playback) return;
      this.loops.set(name, playback);
    }
    playback.gain.gain.setTargetAtTime(volume, context.currentTime, 0.3);
    playback.source.playbackRate.setTargetAtTime(rate, context.currentTime, 0.3);
  }

  private playSample(
    name: SampleName,
    volume: number,
    rate = 1,
    pan = 0,
    loop = false,
  ): SamplePlayback | null {
    const context = this.context;
    const buffer = this.samples.get(name);
    if (!this.canPlay() || !context || !this.master || !buffer) return null;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = rate;
    gain.gain.value = loop ? 0 : volume;
    if (loop) gain.gain.setTargetAtTime(volume, context.currentTime, 0.15);
    panner.pan.value = pan;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.master);
    this.trackSource(source, () => {
      gain.disconnect();
      panner.disconnect();
    });
    source.start();
    return { source, gain };
  }

  private trackSource(source: AudioScheduledSourceNode, cleanup: () => void): void {
    this.sources.add(source);
    this.sourceCleanup.set(source, cleanup);
    source.onended = (): void => this.releaseSource(source);
  }

  private releaseSource(source: AudioScheduledSourceNode): void {
    source.onended = null;
    source.disconnect();
    this.sourceCleanup.get(source)?.();
    this.sourceCleanup.delete(source);
    this.sources.delete(source);
  }

  private stopSources(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* A source may already have finished. */
      }
      this.releaseSource(source);
    }
    this.loops.clear();
    this.nextFootstep = 0;
    this.lastRelaySignal = -Infinity;
    this.lastPulse = -Infinity;
  }

  private playMusicStep(
    time: number,
    step: number,
    length: number,
    destination: AudioDestination,
  ): void {
    const bassNotes = [65.406, 87.307, 73.416, 97.999];
    const root = bassNotes[Math.floor(step / 32) % bassNotes.length];
    const arpeggio = [0, 7, 12, 16, 19, 16, 12, 7];
    const frequency = root * 4 * 2 ** (arpeggio[Math.floor(step / 2) % arpeggio.length] / 12);

    if (step % 2 === 0) {
      this.tone(frequency, time, length * 2.7, 'sine', 0.075, destination);
      this.tone(frequency * 0.5, time + 0.03, length * 2, 'triangle', 0.025, destination);
    }

    if (step % 4 === 0) {
      this.tone(root, time, length * 3.5, 'sine', 0.28, destination);
      this.tone(85, time, 0.1, 'sine', 0.18, destination, 38);
    }

    if (step % 2 === 1) this.percussion(time, 0.028, 0.032, 5300, destination);
    if (step % 8 === 4) this.percussion(time, 0.08, 0.09, 1800, destination);
  }

  private tone(
    frequency: number,
    time: number,
    duration: number,
    waveform: OscillatorType,
    volume: number,
    destination: AudioDestination,
    endFrequency?: number,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (endFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + Math.min(0.018, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    this.trackSource(oscillator, () => envelope.disconnect());
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private percussion(
    time: number,
    duration: number,
    volume: number,
    cutoff: number,
    destination: AudioDestination,
  ): void {
    const context = this.context;
    if (!context || !this.noise) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.noise;
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;
    envelope.gain.setValueAtTime(volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    this.trackSource(source, () => {
      filter.disconnect();
      envelope.disconnect();
    });
    source.start(time);
    source.stop(time + duration + 0.01);
  }
}
