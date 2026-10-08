export interface RecordingStatus {
  state: 'idle' | 'recording' | 'ready';
  remaining: number;
  url: string | null;
  filename: string;
}

const CLIP_SECONDS = 15;
const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

/** Records the game's own canvas. It never requests screen, camera, or microphone access. */
export class GameplayRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private deadline = 0;
  private state: RecordingStatus['state'] = 'idle';
  private remaining = 0;
  private url: string | null = null;
  private filename = 'higgsfield-night-relay.webm';
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onChange: (status: RecordingStatus) => void,
  ) {}

  public get isRecording(): boolean {
    return this.state === 'recording';
  }

  /** Call from a user gesture. False means capture could not start; an older clip is retained. */
  public start(): boolean {
    if (
      this.disposed ||
      this.recorder ||
      typeof MediaRecorder === 'undefined' ||
      typeof this.canvas.captureStream !== 'function'
    )
      return false;

    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let mimeType: string;
    try {
      const supported = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      if (!supported) return false;
      mimeType = supported;
      stream = this.canvas.captureStream(30);
      if (stream.getVideoTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
      this.stream = stream;
      this.recorder = recorder;
      this.chunks = [];
      const currentRecorder = recorder;
      recorder.ondataavailable = (event: BlobEvent): void => {
        if (!this.disposed && this.recorder === currentRecorder && event.data.size > 0)
          this.chunks.push(event.data);
      };
      recorder.onstop = (): void => {
        if (!this.disposed && this.recorder === currentRecorder)
          this.finish(currentRecorder.mimeType || mimeType);
      };
      recorder.onerror = (): void => {
        if (!this.disposed && this.recorder === currentRecorder) this.fail();
      };
      recorder.start(250);
    } catch {
      // Construction and start can fail even after MIME support was advertised.
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {
          /* Already stopped. */
        }
      }
      stream?.getTracks().forEach((track) => track.stop());
      this.recorder = null;
      this.stream = null;
      this.chunks = [];
      return false;
    }

    this.revokeUrl();
    this.state = 'recording';
    this.remaining = CLIP_SECONDS;
    this.deadline = performance.now() + CLIP_SECONDS * 1_000;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    this.filename = `higgsfield-samarkand-${stamp}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
    this.interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((this.deadline - performance.now()) / 1_000));
      if (remaining === 0) this.stop();
      else if (remaining !== this.remaining) {
        this.remaining = remaining;
        this.emit();
      }
    }, 200);
    this.timeout = setTimeout(() => this.stop(), CLIP_SECONDS * 1_000);
    this.emit();
    return true;
  }

  /** Final data arrives asynchronously; the ready callback carries the usable download URL. */
  public stop(): void {
    if (this.disposed || !this.recorder) return;
    this.clearTimers();
    try {
      if (this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      this.fail();
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseRecorder(true);
    this.revokeUrl();
    this.chunks = [];
    this.state = 'idle';
    this.remaining = 0;
  }

  private finish(mimeType: string): void {
    const chunks = this.chunks;
    this.releaseRecorder(false);
    this.chunks = [];
    if (chunks.length === 0) {
      this.fail();
      return;
    }

    try {
      const clip = new Blob(chunks, { type: mimeType });
      this.url = URL.createObjectURL(clip);
      if (mimeType.includes('mp4')) this.filename = this.filename.replace(/\.webm$/, '.mp4');
      this.state = 'ready';
      this.remaining = 0;
    } catch {
      this.fail();
      return;
    }
    this.emit();
  }

  private fail(): void {
    this.releaseRecorder(true);
    this.chunks = [];
    this.state = 'idle';
    this.remaining = 0;
    this.emit();
  }

  private clearTimers(): void {
    if (this.interval !== null) clearInterval(this.interval);
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.interval = null;
    this.timeout = null;
  }

  private releaseRecorder(stop: boolean): void {
    this.clearTimers();
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
      try {
        if (stop && this.recorder.state !== 'inactive') this.recorder.stop();
      } catch {
        /* Already stopped. */
      }
      this.recorder = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private revokeUrl(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private emit(): void {
    this.onChange({
      state: this.state,
      remaining: this.remaining,
      url: this.url,
      filename: this.filename,
    });
  }
}
