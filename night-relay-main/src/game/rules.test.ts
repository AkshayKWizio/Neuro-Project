import assert from 'node:assert/strict';
import test from 'node:test';
import { crossedObstacle, getRunSpeed, hitsObstacle } from './rules.ts';

test('clear rewards wait for the trailing edge and fire once even across long frames', () => {
  assert.equal(crossedObstacle(3, 9, 'train'), false);
  assert.equal(crossedObstacle(9, 9.8, 'train'), false);
  assert.equal(crossedObstacle(9.8, 9.9, 'train'), true);
  assert.equal(crossedObstacle(9.9, 10.2, 'train'), false);
  assert.equal(crossedObstacle(3, 3.6, 'jump'), false);
  assert.equal(crossedObstacle(3.6, 3.7, 'jump'), true);
  assert.equal(crossedObstacle(2, 4, 'slide'), true);
  assert.equal(crossedObstacle(4, 2, 'slide'), false);
  assert.equal(crossedObstacle(0, Number.POSITIVE_INFINITY, 'train'), false);
});

test('train collision covers the full car length, with forgiving lane edges', () => {
  assert.equal(hitsObstacle('train', 0, 0, false, 0, -3.7), true);
  assert.equal(hitsObstacle('train', 0, 0, false, 0, 9.7), true);
  assert.equal(hitsObstacle('train', 0, 0, false, 0, -3.9), false);
  assert.equal(hitsObstacle('train', 0, 0, false, 0, 9.9), false);
  assert.equal(hitsObstacle('train', 1.2, 0, false, 0, 3), true);
  assert.equal(hitsObstacle('train', 1.6, 0, false, 0, 3), false);
  assert.equal(hitsObstacle('train', 3.2, 0, false, 0, 3), false);
  assert.equal(hitsObstacle('train', 0, 2, false, 0, 3), true);
  assert.equal(hitsObstacle('train', 0, 3.81, false, 0, 3), false);
});

test('low barriers must be jumped; sliding does not bypass them', () => {
  assert.equal(hitsObstacle('jump', 0, 0, false, 0, 3), true);
  assert.equal(hitsObstacle('jump', 0, 0, true, 0, 3), true);
  assert.equal(hitsObstacle('jump', 0, 1, false, 0, 3), true);
  assert.equal(hitsObstacle('jump', 0, 1.01, false, 0, 3), false);
  assert.equal(hitsObstacle('jump', 0, 0, false, 0, 3.61), false);
  assert.equal(hitsObstacle('jump', 1.6, 0, false, 0, 3), false);
});

test('overhead beams accept a grounded slide but reject airborne crouches', () => {
  assert.equal(hitsObstacle('slide', 0, 0, false, 0, 3), true);
  assert.equal(hitsObstacle('slide', 0, 0, true, 0, 3), false);
  assert.equal(hitsObstacle('slide', 0, 0.6, true, 0, 3), true);
  assert.equal(hitsObstacle('slide', 0, 1.8, false, 0, 3), true);
  assert.equal(hitsObstacle('slide', 0, 2.51, false, 0, 3), false);
  assert.equal(hitsObstacle('slide', 0, 0, false, 3.2, 3), false);
});

test('running speed begins gently and never exceeds the playable cap', () => {
  assert.equal(getRunSpeed(-1), 14);
  assert.equal(getRunSpeed(0), 14);
  assert.equal(getRunSpeed(800), 20);
  assert.equal(getRunSpeed(1600), 26);
  assert.equal(getRunSpeed(100_000), 26);
});
