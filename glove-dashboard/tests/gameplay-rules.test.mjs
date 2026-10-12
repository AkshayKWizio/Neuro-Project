import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import { ArcheryRound, FlightRound } from '../public/games/gameplay-rules.js';

test('archery fires once on close and requires open to reload', () => {
  const game = new ArcheryRound();
  assert.equal(game.close(), true);
  assert.equal(game.close(), false);
  game.resolve(true);
  game.open(); game.open();
  assert.equal(game.close(), true);
  game.resolve(false);
  assert.deepEqual([game.shots, game.hits, game.score], [2, 1, 100]);
});
for (const side of ['LEFT', 'RIGHT']) {
  test(`${side} flight starts supinated and accepts only alternating poses`, () => {
    const game = new FlightRound(side);
    const start = side === 'LEFT' ? -1 : 1;
    assert.equal(game.lane, start);
    assert.equal(game.ringLane, -start);
    assert.equal(game.move('supination'), false);
    assert.equal(game.move('pronation'), true);
    assert.equal(game.lane, -start);
    assert.equal(game.move('pronation'), false);
    assert.equal(game.collect(start), false);
    assert.equal(game.collect(-start), true);
    assert.equal(game.ringLane, start);
    assert.equal(game.collect(-start), false);
    assert.equal(game.move('supination'), true);
    assert.equal(game.collect(start), true);
    assert.equal(game.score, 300);
  });
}
test('missile hits penalise once during shield interval; no game-over', () => {
  const game = new FlightRound();
  game.move('pronation'); game.collect(1);
  assert.equal(game.missile(5), true);
  assert.equal(game.missile(5.3), false);
  assert.equal(game.score, 100);
  assert.equal(game.move('supination'), true);
  assert.equal(game.collect(-1), true);
  assert.equal(game.score, 250);
});

test('real flight loop schedules a same-lane missile after collection, then opposite ring', () => {
  const html=readFileSync(new URL('../public/games/sky-glider/index.html',import.meta.url),'utf8');
  const loop=html.slice(html.indexOf('      // Endless two-lane course.'),html.indexOf('      const shaking ='));
  for(const side of ['LEFT','RIGHT']) {
    const flight=new FlightRound(side);flight.move('pronation');
    const collectedLane=flight.lane;
    const schedule=[];
    const state={flight,delta:0.001,now:1000,shakeUntil:0,
      activeRings:[{position:{x:collectedLane*3.2,y:2.4,z:2.2},userData:{cleared:false,isLeftLane:collectedLane===-1,gem:{rotation:{y:0}},inner:{rotation:{z:0}}}}],
      missiles:[],planeGroup:{position:{x:collectedLane*3.2,z:2.2}},scene:{remove(){}},
      spawnSparkBurst(){},sfx:{ringHit(){},miss(){}},showToast(){},updateFlightHUD(){},
      spawnMissile:(z,lane)=>schedule.push(['missile',z,lane]),
      nextTarget:()=>schedule.push(['ring',-82,flight.ringLane]),
    };
    vm.createContext(state);vm.runInContext('{'+loop+'}',state);
    assert.deepEqual(schedule,[['missile',-40,collectedLane],['ring',-82,-collectedLane]]);
    assert.equal(flight.rings,1);
    assert.ok((82-40)/14>=3,'At least three seconds between missile and next ring');
    state.activeRings[0].position.z=15;
    vm.runInContext('{'+loop+'}',state);
    assert.equal(schedule.length,2,'Removing collected ring must not delete missile or create a duplicate target');
  }
});
