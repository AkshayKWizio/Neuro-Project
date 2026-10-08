export type ObstacleKind = 'train' | 'jump' | 'slide';
export type Lane = -1 | 0 | 1;
export type ObstaclePlacement = { lane: Lane; kind: ObstacleKind };

/** Shared route ceilings also let the leaderboard accept denser courses without guessing. */
export const ROUTE_FIRST_DISTANCE = 42;
export const ROUTE_MIN_GAP = 24;
export const ROUTE_MAX_COINS_PER_ROW = 7;
export const ROUTE_MAX_OBSTACLES_PER_ROW = 2;
export const ROUTE_OPENING_COINS = 6;

/** True only on the frame the trailing collision edge clears the runner at z=3. */
export function crossedObstacle(previousZ: number, currentZ: number, kind: ObstacleKind): boolean {
  if (!Number.isFinite(previousZ) || !Number.isFinite(currentZ)) return false;
  const clearZ = 3 + (kind === 'train' ? 6.8 : 0.6);
  return previousZ <= clearZ && currentZ > clearZ;
}

/** Test the runner's feet and current pose against an obstacle at world coordinates. */
export function hitsObstacle(
  kind: ObstacleKind,
  playerX: number,
  playerY: number,
  sliding: boolean,
  obstacleX: number,
  obstacleZ: number,
): boolean {
  const lateralReach = kind === 'train' ? 1.425 : 1.4;
  const longitudinalReach = kind === 'train' ? 6.8 : 0.6;

  if (
    Math.abs(playerX - obstacleX) >= lateralReach ||
    Math.abs(obstacleZ - 3) > longitudinalReach
  ) {
    return false;
  }

  if (kind === 'train') return playerY < 3.8;
  if (kind === 'jump') return playerY <= 1;

  const playerTop = playerY + (sliding ? 0.85 : 1.85);
  return playerTop > 1.25 && playerY < 2.5;
}

/** World units per second, increasing gently over the first 1,600 metres. */
export function getRunSpeed(distance: number): number {
  return Math.min(26, 14 + Math.max(0, distance) * 0.0075);
}
