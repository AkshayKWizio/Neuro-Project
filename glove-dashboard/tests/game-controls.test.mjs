import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FlightRound } from '../public/games/gameplay-rules.js';
import * as THREE from '../public/games/lib/three.module.min.js';
import { gameCommand, createGameActionReceiver } from '../public/games/glove-controls.js';
import { rotationAction } from '../lib/rotation-controls.ts';
import { GameEventQueue, exerciseRepetitions } from '../lib/game-event-delivery.ts';

const origin = 'http://127.0.0.1:3000';
const parent = {};
const audioSource = readFileSync(new URL('../public/games/lib/rehab-audio.js', import.meta.url), 'utf8');
const audioState = { window: { addEventListener() {} }, navigator: { userActivation: { hasBeenActive: false } } };
vm.createContext(audioState);
vm.runInContext(audioSource.replace('export function', 'function') + '\nthis.audio = setupGameAudio();', audioState);
const event = (side, movement, exercise, action, timestamp = 10) => ({
  origin, source: parent,
  data: { type: 'neuro-game-action', movement, exercise, action, timestamp_ms: timestamp, side },
});

test('active games have their local modules and required Three.js APIs', () => {
  for (const game of ['sky-glider', 'balloon-blitz', 'rolling-wonder']) {
    const url = new URL(`../public/games/${game}/index.html`, import.meta.url);
    const html = readFileSync(url, 'utf8');
    for (const match of html.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) assert.ok(readFileSync(new URL(match[1], url)).length);
    }
    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    for (const match of script.matchAll(/\bTHREE\.([A-Za-z0-9_]+)/g)) assert.ok(match[1] in THREE, match[1]);
    for (const match of script.matchAll(/\bgameAudio\.([A-Za-z_]+)\(/g)) assert.equal(typeof audioState.audio[match[1]], 'function', `Missing audio API ${match[1]}`);
    assert.ok(html.includes('night-relay-ready'), `${game} missing ready signal`);
  }
});

test('requested destination-pose mapping covers both hands and both transitions', () => {
  assert.equal(rotationAction('LEFT', 'pronation').action, 'move_right');
  assert.equal(rotationAction('LEFT', 'supination').action, 'move_left');
  assert.equal(rotationAction('RIGHT', 'pronation').action, 'move_left');
  assert.equal(rotationAction('RIGHT', 'supination').action, 'move_right');
  assert.equal(rotationAction('LEFT', 'clockwise'), null);
});

test('new team games receive only their intended exercise commands', () => {
  for (const [game, movement, exercise, action, expected] of [
    ['sky_glider', 'pronation', 'pronation_supination', 'move_left', 'left'],
    ['sky_glider', 'supination', 'pronation_supination', 'move_right', 'right'],
    ['balloon_blitz', 'wrist_close', 'hand_open_close', 'primary_action', 'grip'],
    ['balloon_blitz', 'wrist_open', 'hand_open_close', 'secondary_action', 'release'],
    ['rolling_wonder', 'clockwise', 'circumduction', 'move_right', 'right'],
    ['rolling_wonder', 'anticlockwise', 'circumduction', 'move_left', 'left'],
  ]) assert.equal(gameCommand(game, event('LEFT', movement, exercise, action).data), expected);
  assert.equal(gameCommand('rolling_wonder', event('LEFT', 'pronation', 'pronation_supination', 'move_left').data), null);
});

test('receiver accepts each event once and rejects stale or untrusted messages', () => {
  let calls = 0;
  const receive = createGameActionReceiver('rolling_wonder', { right: () => calls++, left: () => calls++ }, origin, parent);
  const message = event('RIGHT', 'clockwise', 'circumduction', 'move_right');
  assert.equal(receive(message), true);
  assert.equal(receive(message), false);
  assert.equal(receive({ ...message, origin: 'http://other' }), false);
  assert.equal(receive({ ...message, source: {} }), false);
  assert.equal(receive(event('RIGHT', 'clockwise', 'circumduction', 'move_right', 9)), false);
  assert.equal(receive(event('RIGHT', 'anticlockwise', 'circumduction', 'move_left', 11)), true);
  assert.equal(calls, 2);
});

test('real Sky Glider callbacks steer correctly for all four hand transitions', () => {
  const html = readFileSync(new URL('../public/games/sky-glider/index.html', import.meta.url), 'utf8');
  const handFunction = html.slice(html.indexOf('    function setHand('), html.indexOf('    // Toggle hand'));
  const tiltFunction = html.slice(html.indexOf('    function moveToPose('), html.indexOf("    bindGloveControls('sky_glider'"));
  const bindings = html.slice(html.indexOf("    bindGloveControls('sky_glider'"), html.indexOf('    // Keyboard Fallback'));
  for (const [side, movement, expectedSign] of [
    ['LEFT', 'pronation', 1], ['LEFT', 'supination', -1],
    ['RIGHT', 'pronation', -1], ['RIGHT', 'supination', 1],
  ]) {
    let handlers;
    const labels = new Map();
    const state = {
      activeHand: 'LEFT', currentTiltDeg: 0, targetX: 0, LANE_RIGHT_X: 2,
      flight: new FlightRound(), planeGroup: {position:{x:0}}, activeRings: [], missiles: [],
      scene:{remove(){}}, nextTarget(){}, score:0, ringsCleared:0,
      document: { getElementById: id => { if (!labels.has(id)) labels.set(id, { style: {}, textContent: '', classList: { contains: () => false } }); return labels.get(id); } }, window: {parent:{postMessage(){}},location:{origin}},
      bindGloveControls: (_game, callbacks) => { handlers = callbacks; },
    };
    vm.createContext(state);
    vm.runInContext(handFunction + tiltFunction + bindings, state);
    const receive = createGameActionReceiver('sky_glider', handlers, origin, parent);
    receive({ origin, source: parent, data: { type: 'neuro-game-config', side, exercise: 'pronation_supination' } });
    assert.equal(state.activeHand, side);
    assert.equal(labels.get('hand-rule-badge').textContent, side === 'LEFT' ? 'Pro➔Sup: Left' : 'Pro➔Sup: Right');
    const mapping = rotationAction(side, movement);
    if (movement === 'supination') {
      const previous = rotationAction(side, 'pronation');
      receive(event(side, 'pronation', 'pronation_supination', previous.action, 9));
    }
    assert.equal(receive(event(side, movement, 'pronation_supination', mapping.action)), true);
    assert.equal(Math.sign(state.targetX), expectedSign, `${side} ${movement}`);
  }
});

test('detections during loading/countdown remain queued; event batches arrive once', () => {
  const old = { movement: 'pronation', timestamp_ms: 1, event_id: 1 };
  const first = { movement: 'supination', timestamp_ms: 2, event_id: 2 };
  const second = { movement: 'pronation', timestamp_ms: 3, event_id: 3 };
  const queue = new GameEventQueue([old]);
  const delivered = [];
  queue.observe([first, old]);
  assert.equal(queue.flush(false, event => delivered.push(event)), 0);
  queue.observe([second, first, old]);
  assert.equal(queue.flush(true, event => delivered.push(event)), 2);
  assert.deepEqual(delivered, [first, second]);
  queue.observe([second, first]);
  assert.equal(queue.flush(true, event => delivered.push(event)), 0);
});

test('detector repetition counts are independent of game score and cycle messages', () => {
  assert.equal(exerciseRepetitions('pronation_supination', { pronation: 3, supination: 2 }), 2);
  assert.equal(exerciseRepetitions('circumduction', { clockwise: 3, anticlockwise: 1 }), 4);
  assert.equal(exerciseRepetitions('hand_open_close', { wrist_close: 2, wrist_open: 1 }), 2);
});

test('game acknowledges accepted and blocked inputs without reapplying duplicates', () => {
  const acknowledgements = [];
  let applies = 0;
  const receive = createGameActionReceiver('sky_glider', {
    left: () => { applies++; return true; }, right: () => false,
  }, origin, parent, (data, applied) => acknowledgements.push({ movement: data.movement, applied }));
  const movement = event('RIGHT', 'pronation', 'pronation_supination', 'move_left');
  receive(movement);
  receive(movement);
  receive(event('RIGHT', 'supination', 'pronation_supination', 'move_right', 11));
  assert.equal(applies, 1);
  assert.deepEqual(acknowledgements.map(item => item.applied), [true, true, false]);
});
