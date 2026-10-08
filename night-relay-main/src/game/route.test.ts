import assert from 'node:assert/strict';
import test from 'node:test';
import { DISTRICTS, getDistrict, planRouteRow, routeRowDistance, routeRowGap } from './route.ts';
import {
  getRunSpeed,
  hitsObstacle,
  ROUTE_FIRST_DISTANCE,
  ROUTE_MIN_GAP,
  ROUTE_MAX_COINS_PER_ROW,
} from './rules.ts';

test('the route alternates between exactly two lanes and never creates jump or slide obstacles', () => {
  const rows = Array.from({ length: 600 }, (_, index) => planRouteRow(index));
  assert.equal(routeRowDistance(0), ROUTE_FIRST_DISTANCE);

  rows.forEach((row, index) => {
    assert.ok([-1, 1].includes(row.escapeLane));
    if (index > 0) assert.equal(row.escapeLane, -rows[index - 1]!.escapeLane);
    assert.equal(row.obstacles.length, 1);
    assert.equal(row.obstacles[0]!.kind, 'train');
    assert.equal(row.obstacles[0]!.lane, -row.escapeLane);
    assert.ok(row.coins.length <= ROUTE_MAX_COINS_PER_ROW);
    assert.ok(row.coins.every((coin) => coin.lane === row.escapeLane && coin.height === 1.15));
    assert.ok(routeRowGap(index) >= ROUTE_MIN_GAP);
  });
});

test('fragments and recharge pickups never sit inside a full projection, including neighboring rows', () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({
    ...planRouteRow(index),
    distance: routeRowDistance(index),
  }));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    for (const pickup of [...row.coins, ...(row.charge ? [row.charge] : [])]) {
      const pickupDistance = row.distance - pickup.offset;
      for (const neighbor of rows.slice(Math.max(0, index - 1), index + 2)) {
        for (const obstacle of neighbor.obstacles) {
          if (obstacle.kind === 'train' && obstacle.lane === pickup.lane) {
            assert.ok(
              Math.abs(pickupDistance - neighbor.distance) > 6.8 + 1.15,
              `pickup enters projection at row ${index}`,
            );
          }
        }
      }
    }
  }
});

test('the alternating two-lane path is physically reachable at every supported frame rate', () => {
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.04]) {
    for (const speedAt of [() => 14, () => 26, getRunSpeed]) {
      const rows = Array.from({ length: 90 }, (_, index) => ({
        ...planRouteRow(index),
        distance: routeRowDistance(index),
      }));
      let distance = 0;
      let cursor = 0;
      let x = rows[0]!.escapeLane * 1.6;
      while (distance < rows[rows.length - 1]!.distance + 8) {
        distance += speedAt(distance) * dt;
        if (cursor < rows.length - 1 && distance > rows[cursor]!.distance + 7) cursor++;
        const target = rows[cursor]!.escapeLane * 1.6;
        x = target + (x - target) * Math.exp(-17 * dt);
        for (const row of rows.slice(Math.max(0, cursor - 1), cursor + 2)) {
          for (const obstacle of row.obstacles)
            assert.equal(
              hitsObstacle(
                obstacle.kind,
                x,
                0,
                false,
                obstacle.lane * 1.6,
                3 + distance - row.distance,
              ),
              false,
              `escape route collision at ${distance.toFixed(1)}m, dt=${dt}`,
            );
        }
      }
    }
  }
});

test('route generation is deterministic', () => {
  const generate = () => Array.from({ length: 40 }, (_, index) => planRouteRow(index));
  assert.deepEqual(generate(), generate());
});

test('districts change at 250m boundaries and loop through the whole route', () => {
  assert.equal(getDistrict(-50), DISTRICTS[0]);
  assert.equal(getDistrict(249.99), DISTRICTS[0]);
  assert.equal(getDistrict(250), DISTRICTS[1]);
  assert.equal(getDistrict(500), DISTRICTS[2]);
  assert.equal(getDistrict(750), DISTRICTS[3]);
  assert.equal(getDistrict(1_000), DISTRICTS[0]);
});
