import assert from 'node:assert/strict';
import test from 'node:test';
import { RunProgress } from './progression.ts';

test('threshold coins immediately raise the multiplier and cap it at four', () => {
  const progress = new RunProgress();
  for (let coin = 1; coin <= 60; coin += 1) {
    const expected = coin >= 50 ? 4 : coin >= 25 ? 3 : coin >= 10 ? 2 : 1;
    assert.equal(progress.collectCoin(), 50 * expected);
    assert.equal(progress.multiplier, expected);
    assert.equal(progress.streak, coin);
  }
  assert.equal(progress.bonusScore, 0, 'coin awards are separate from action bonuses');
});

test('a coin renews the timer and the streak expires at exactly four seconds', () => {
  const progress = new RunProgress();
  progress.collectCoin();
  progress.update(2, 20);
  assert.equal(progress.comboRemaining, 0.5);
  progress.collectCoin();
  assert.equal(progress.comboRemaining, 1);
  assert.equal(progress.streak, 2);
  progress.update(3.99, 50);
  assert.equal(progress.streak, 2);
  progress.update(0.01, 51);
  assert.equal(progress.comboRemaining, 0);
  assert.equal(progress.streak, 0);
  assert.equal(progress.multiplier, 1);
  assert.equal(progress.collectCoin(), 50);
  assert.equal(progress.streak, 1);
});

test('only elapsed playing time affects a streak and invalid time cannot extend it', () => {
  const progress = new RunProgress();
  progress.collectCoin();
  progress.update(0, 10);
  progress.update(-2, 10);
  progress.update(Number.NaN, 10);
  assert.equal(progress.comboRemaining, 1);
  progress.update(40, 10);
  assert.equal(progress.comboRemaining, 0);
  assert.equal(progress.streak, 0);
});

test('action rewards respect the current combo without extending a coin streak', () => {
  const progress = new RunProgress();
  for (let index = 0; index < 10; index += 1) progress.collectCoin();
  progress.update(2, 20);
  assert.equal(progress.nearMiss(), 300);
  assert.equal(progress.clearObstacle('jump'), 200);
  assert.equal(progress.clearObstacle('slide'), 200);
  assert.equal(progress.clearObstacle('train'), 0);
  assert.equal(progress.bonusScore, 700);
  assert.equal(progress.nearMisses, 1);
  assert.equal(progress.obstaclesCleared, 2);
  assert.equal(progress.comboRemaining, 0.5);
  progress.update(2, 40);
  assert.equal(progress.nearMiss(), 150);
  assert.equal(progress.bonusScore, 850);
});

test('milestones are ordered, queued across long frames, and awarded once', () => {
  const progress = new RunProgress();
  progress.update(1, 249.99);
  assert.equal(progress.consumeMilestone(), null);
  progress.update(1, 250);
  assert.equal(progress.consumeMilestone(), 250);
  assert.equal(progress.consumeMilestone(), null);
  progress.update(1, 1001);
  assert.equal(progress.consumeMilestone(), 500);
  assert.equal(progress.consumeMilestone(), 750);
  assert.equal(progress.consumeMilestone(), 1000);
  assert.equal(progress.consumeMilestone(), null);
  progress.update(1, 200);
  progress.update(1, 1001);
  assert.equal(progress.consumeMilestone(), null);
});

test('objectives count both kinds of clean passes and clamp completed progress', () => {
  const progress = new RunProgress();
  progress.nearMiss();
  progress.clearObstacle('jump');
  let objectives = progress.getObjectives(250.9, 20);
  assert.deepEqual(
    objectives.map(({ current, target, complete }) => ({ current, target, complete })),
    [
      { current: 250, target: 500, complete: false },
      { current: 20, target: 40, complete: false },
      { current: 2, target: 6, complete: false },
    ],
  );
  for (let index = 0; index < 5; index += 1) progress.clearObstacle('slide');
  objectives = progress.getObjectives(999, 100);
  assert.ok(objectives.every((objective) => objective.complete));
  assert.deepEqual(
    objectives.map((objective) => objective.current),
    [500, 40, 6],
  );
});

test('reset removes rewards, streaks, objective counts, and queued milestones', () => {
  const progress = new RunProgress();
  for (let index = 0; index < 50; index += 1) progress.collectCoin();
  progress.nearMiss();
  progress.clearObstacle('jump');
  progress.update(1, 800);
  progress.reset();
  assert.equal(progress.multiplier, 1);
  assert.equal(progress.streak, 0);
  assert.equal(progress.comboRemaining, 0);
  assert.equal(progress.bonusScore, 0);
  assert.equal(progress.nearMisses, 0);
  assert.equal(progress.obstaclesCleared, 0);
  assert.equal(progress.consumeMilestone(), null);
  assert.ok(progress.getObjectives(0, 0).every((objective) => objective.current === 0));
  progress.update(1, 250);
  assert.equal(progress.consumeMilestone(), 250);
});
