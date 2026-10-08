export const PULSE_CAPACITY = 6;
export const PULSE_SECONDS = 2.6;

/** Collect light, then deliberately spend it to pass through projected obstacles. */
export class RelayPulse {
  private fragments = 0;
  private seconds = 0;

  get charge(): number {
    return this.fragments;
  }
  get remaining(): number {
    return this.seconds;
  }
  get ready(): boolean {
    return this.fragments === PULSE_CAPACITY && this.seconds === 0;
  }
  get active(): boolean {
    return this.seconds > 0;
  }

  reset(): void {
    this.fragments = 0;
    this.seconds = 0;
  }

  collect(amount = 1): void {
    if (Number.isFinite(amount))
      this.fragments = Math.min(PULSE_CAPACITY, this.fragments + Math.max(0, Math.floor(amount)));
  }

  activate(): boolean {
    if (!this.ready) return false;
    this.fragments = 0;
    this.seconds = PULSE_SECONDS;
    return true;
  }

  /** Advance only during active gameplay, so a pause cannot consume a pulse. */
  update(dt: number): void {
    if (Number.isFinite(dt)) this.seconds = Math.max(0, this.seconds - Math.max(0, dt));
  }
}
