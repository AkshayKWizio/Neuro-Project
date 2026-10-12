import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/games/lib/three.module.min.js';
import {createFestivalBow,createFestivalArrow,createFestivalShield,shieldImpactPose} from '../public/games/festival-archery-assets.js';
import {ArcheryRound} from '../public/games/gameplay-rules.js';

test('bow flexes, resets and keeps the nocked arrow attached to the string',()=>{
  const bow=createFestivalBow(),arrow=createFestivalArrow();
  const limb=bow.root.children[0].geometry;
  const resting=Array.from(limb.attributes.position.array);
  for(const draw of [0,0.5,1]) {
    bow.draw(draw);bow.nock(arrow,draw);arrow.updateMatrixWorld(true);
    const string=bow.root.children.find(child=>child.isLine&&child.geometry.attributes.position.count===3);
    const midpoint=new THREE.Vector3().fromBufferAttribute(string.geometry.attributes.position,1);
    bow.root.localToWorld(midpoint);
    const tail=arrow.localToWorld(new THREE.Vector3(0,0,0.8));
    assert.ok(tail.distanceTo(midpoint)<0.00001);
    assert.ok(Number.isFinite(limb.boundingSphere.radius));
  }
  assert.notDeepEqual(Array.from(limb.attributes.position.array),resting);
  bow.draw(0);assert.deepEqual(Array.from(limb.attributes.position.array),resting);
});

test('padded shield has visible coral face and bounded settling impact',()=>{
  const shield=createFestivalShield();
  assert.ok(shield.root.children.length>5);
  assert.equal(shield.faceMaterial.color.getHex(),0xe88a7e);
  assert.notEqual(shieldImpactPose(0.05).twist,0);
  for(const age of [0,0.05,0.2,0.65,1]) {
    const pose=shieldImpactPose(age);
    assert.ok(Math.abs(pose.twist)<=0.12);
    assert.ok(pose.scale>=1&&pose.scale<=1.055);
  }
  assert.deepEqual(shieldImpactPose(1),{twist:0,recoil:0,scale:1});
  assert.deepEqual(shieldImpactPose(0.05,true),{twist:0,recoil:0,scale:1});
});

test('actual obstacle collision triggers impact once without taking score',()=>{
  const html=readFileSync(new URL('../public/games/balloon-blitz/index.html',import.meta.url),'utf8');
  const start=html.indexOf('        if(!arrow.userData.shieldChecked');
  const block=html.slice(start,html.indexOf('        if (progress >= 1)',start));
  for(const x of [0,2]) {
    const round=new ArcheryRound();round.score=100;round.close();
    let impacts=0;
    const state={arrows:[{userData:{}}],round,shield:{position:{x}},progress:0.6,
      impactShield(){impacts++;},toast(){},updateHUD(){}};
    vm.createContext(state);
    const loop='for(let i=arrows.length-1;i>=0;i--){const arrow=arrows[i];'+block+'}';
    vm.runInContext(loop,state);vm.runInContext(loop,state);
    assert.equal(impacts,x===0?1:0);
    assert.equal(state.arrows.length,x===0?0:1);
    assert.equal(round.score,100);
    assert.equal(round.shots,1);
    assert.equal(round.hits,0);
  }
});
