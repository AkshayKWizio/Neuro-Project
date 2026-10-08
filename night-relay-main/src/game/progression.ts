import type { ObstacleKind } from './rules';

export interface RunObjective {
  id: 'distance' | 'coins' | 'clean-passes';
  title: string;
  current: number;
  target: number;
  complete: boolean;
}

const COMBO_SECONDS = 4;
const MILESTONE_METRES = 250;

/** Scoring and session objectives, independent of rendering, storage, and input. */
export class RunProgress {
  private coinStreak = 0;
  private comboSeconds = 0;
  private earnedBonus = 0;
  private closeCalls = 0;
  private clearedObstacles = 0;
  private reachedMilestone = 0;
  private nextMilestone = 1;

  public get multiplier(): number {
    if (this.coinStreak >= 50) return 4;
    if (this.coinStreak >= 25) return 3;
    if (this.coinStreak >= 10) return 2;
    return 1;
  }

  public get streak(): number {
    return this.coinStreak;
  }
  public get comboRemaining(): number {
    return this.comboSeconds / COMBO_SECONDS;
  }
  /** Additional points from close calls and cleared barriers; excludes coin awards. */
  public get bonusScore(): number {
    return this.earnedBonus;
  }
  public get nearMisses(): number {
    return this.closeCalls;
  }
  public get obstaclesCleared(): number {
    return this.clearedObstacles;
  }

  public reset(): void {
    this.coinStreak = 0;
    this.comboSeconds = 0;
    this.earnedBonus = 0;
    this.closeCalls = 0;
    this.clearedObstacles = 0;
    this.reachedMilestone = 0;
    this.nextMilestone = 1;
  }

  /** Call only while playing. Each coin renews a four-second streak window. */
  public update(dt: number, distance: number): void {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.comboSeconds = Math.max(0, this.comboSeconds - elapsed);
    if (this.comboSeconds < 1e-9) {
      this.comboSeconds = 0;
      this.coinStreak = 0;
    }

    if (Number.isFinite(distance)) {
      this.reachedMilestone = Math.max(
        this.reachedMilestone,
        Math.floor(Math.max(0, distance) / MILESTONE_METRES),
      );
    }
  }

  /** Returns the full coin award; threshold coins immediately earn the new multiplier. */
  public collectCoin(): number {
    this.coinStreak += 1;
    this.comboSeconds = COMBO_SECONDS;
    return 50 * this.multiplier;
  }

  public nearMiss(): number {
    const award = 150 * this.multiplier;
    this.closeCalls += 1;
    this.earnedBonus += award;
    return award;
  }

  /** Call once after a successful jump or slide. Passing a train earns no clear bonus. */
  public clearObstacle(kind: ObstacleKind): number {
    if (kind === 'train') return 0;
    const award = 100 * this.multiplier;
    this.clearedObstacles += 1;
    this.earnedBonus += award;
    return award;
  }

  /** Drain in a loop if a frame crossed multiple 250-metre milestones. */
  public consumeMilestone(): number | null {
    if (this.nextMilestone > this.reachedMilestone) return null;
    const milestone = this.nextMilestone * MILESTONE_METRES;
    this.nextMilestone += 1;
    return milestone;
  }

  public getObjectives(distance: number, totalCoins: number): RunObjective[] {
    const objectives: Array<Omit<RunObjective, 'complete'>> = [
      { id: 'distance', title: 'Own the night', current: distance, target: 500 },
      { id: 'coins', title: 'Carry the light', current: totalCoins, target: 40 },
      {
        id: 'clean-passes',
        title: 'Find your flow',
        current: this.closeCalls + this.clearedObstacles,
        target: 6,
      },
    ];

    return objectives.map((objective) => {
      const current = Math.min(
        objective.target,
        Math.max(0, Math.floor(Number.isFinite(objective.current) ? objective.current : 0)),
      );
      return { ...objective, current, complete: current >= objective.target };
    });
  }
}
