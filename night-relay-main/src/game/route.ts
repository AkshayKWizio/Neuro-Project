import {
  ROUTE_FIRST_DISTANCE,
  ROUTE_MIN_GAP,
  type Lane,
  type ObstaclePlacement,
} from './rules.ts';

export interface RoutePickup {
  lane: Lane;
  /** Positive offsets appear before the obstacle; negative offsets appear beyond it. */
  offset: number;
  height: number;
}

export interface RouteRow {
  obstacles: ObstaclePlacement[];
  coins: RoutePickup[];
  /** Always open; consecutive mature escape lanes are adjacent. */
  escapeLane: Lane;
  challenge: 'jump' | 'slide' | 'dodge' | 'choice' | 'breather';
  charge: RoutePickup | null;
}

const DODGE_OFFSETS = [8, 4, 0, -4, -8];

function trail(lane: Lane): RoutePickup[] {
  return DODGE_OFFSETS.map((offset) => ({ lane, offset, height: 1.15 }));
}

/** Gaps shrink with familiarity; a breathing row adds space before the next phrase. */
export function routeRowGap(index: number): number {
  if (index < 4) return [34, 32, 30, 28][Math.max(0, index)]!;
  if ((index - 4) % 12 === 11) return 30;
  if (index < 8) return 28;
  if (index < 12) return 26;
  return ROUTE_MIN_GAP;
}

export function routeRowDistance(index: number): number {
  let distance = ROUTE_FIRST_DISTANCE;
  for (let row = 0; row < index; row += 1) distance += routeRowGap(row);
  return distance;
}

/** A two-lane route alternates its open lane so every valid move reverses the previous one. */
export function planRouteRow(index: number): RouteRow {
  const escapeLane: Lane = index % 2 === 0 ? -1 : 1;
  const blockedLane: Lane = escapeLane === -1 ? 1 : -1;
  const charge = index % 9 === 7 ? { lane: escapeLane, offset: -11, height: 1.25 } : null;
  return {
    obstacles: [{ lane: blockedLane, kind: 'train' }],
    coins: trail(escapeLane),
    escapeLane,
    challenge: 'dodge',
    charge,
  };
}

export const DISTRICTS = [
  'REGISTAN SQUARE',
  'THE MOSAIC WALK',
  'LANTERN GARDENS',
  'SILK ROAD ARCADE',
] as const;
export function getDistrict(distance: number): string {
  return DISTRICTS[Math.floor(Math.max(0, distance) / 250) % DISTRICTS.length]!;
}
