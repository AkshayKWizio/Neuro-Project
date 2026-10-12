// Gameplay only: confirmed exercise events remain owned by the Python detector.
export class ArcheryRound {
  armed = true;
  shots = 0;
  hits = 0;
  score = 0;
  close() {
    if (!this.armed) return false;
    this.armed = false;
    this.shots++;
    return true;
  }
  open() { this.armed = true; }
  resolve(hit) {
    if (hit) { this.hits++; this.score += 100; }
    return hit;
  }
}

export class FlightRound {
  constructor(side = 'LEFT') { this.configure(side); }
  configure(side) {
    this.side = side === 'RIGHT' ? 'RIGHT' : 'LEFT';
    this.lane = this.side === 'LEFT' ? -1 : 1;
    this.pose = 'supination';
    this.ringLane = -this.lane;
    this.rings = 0;
    this.score = 0;
    this.hits = 0;
    this.shieldUntil = 0;
  }
  move(movement) {
    if (!['pronation', 'supination'].includes(movement) || movement === this.pose) return false;
    this.pose = movement;
    this.lane = (movement === 'supination' ? 1 : -1) * (this.side === 'LEFT' ? -1 : 1);
    return true;
  }
  collect(lane) {
    if (lane !== this.ringLane || lane !== this.lane) return false;
    this.rings++;
    this.score += 150;
    this.ringLane *= -1;
    return true;
  }
  missile(now) {
    if (now < this.shieldUntil) return false;
    this.shieldUntil = now + 1;
    this.hits++;
    this.score = Math.max(0, this.score - 50);
    return true; // Flight never ends because of a hit.
  }
}
