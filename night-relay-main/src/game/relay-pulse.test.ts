import assert from 'node:assert/strict';
import test from 'node:test';
import { RelayPulse, PULSE_SECONDS } from './relay-pulse.ts';

test('a pulse requires six fragments and spending them starts a bounded protection window', () => {
  const pulse = new RelayPulse();
  for (let index = 0; index < 5; index++) pulse.collect();
  assert.equal(pulse.activate(), false);
  assert.equal(pulse.remaining, 0);
  pulse.collect();
  assert.equal(pulse.ready, true);
  assert.equal(pulse.activate(), true);
  assert.equal(pulse.charge, 0);
  assert.equal(pulse.remaining, PULSE_SECONDS);
  pulse.update(PULSE_SECONDS - 0.01);
  assert.equal(pulse.active, true);
  pulse.update(0.02);
  assert.equal(pulse.active, false);
});

test('collecting during a pulse cannot extend it; saved light can trigger the next one', () => {
  const pulse = new RelayPulse();
  pulse.collect(6);
  pulse.activate();
  pulse.update(1);
  pulse.collect(20);
  assert.equal(pulse.charge, 6);
  assert.equal(pulse.activate(), false);
  assert.equal(pulse.remaining, PULSE_SECONDS - 1);
  pulse.update(2);
  assert.equal(pulse.activate(), true);
  pulse.reset();
  assert.equal(pulse.active, false);
  assert.equal(pulse.charge, 0);
});

test('invalid deltas or pickups cannot manufacture light or extend protection', () => {
  const pulse = new RelayPulse();
  pulse.collect(NaN);
  pulse.collect(Infinity);
  pulse.collect(-20);
  assert.equal(pulse.charge, 0);
  pulse.collect(6);
  pulse.activate();
  pulse.update(NaN);
  pulse.update(-1);
  assert.equal(pulse.remaining, PULSE_SECONDS);
});
