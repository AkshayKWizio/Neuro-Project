import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Quaternion,Vector3,TextureLoader,Texture} from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {imuToFbx,WristImuPose,wristRollDegrees} from '../lib/wrist-imu.ts';
const packet=q=>({x:q.x,y:q.y,z:q.z,w:q.w});
const equivalent=(a,b)=>assert.ok(Math.abs(a.dot(b))>1-1e-6);

test('IMU conversion matches Unity reception then inverse kinematic conversion',()=>{
  const q=new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),1.2);
  const unity=new Quaternion(-q.y,-q.z,q.x,q.w);
  equivalent(imuToFbx(packet(q)),new Quaternion(unity.x,-unity.y,-unity.z,unity.w));
  assert.equal(imuToFbx({x:NaN,y:0,z:0,w:1}),null);
  assert.equal(imuToFbx({x:0,y:0,z:0,w:0}),null);
});
test('neutral-relative wrist movement retains rotations and sign-equivalent packets',()=>{
  const neutral=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),0.7);
  const pose=new WristImuPose();
  equivalent(pose.update(packet(neutral),0),new Quaternion());
  const incoming=neutral.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI));
  const expected=imuToFbx(packet(neutral)).invert().multiply(imuToFbx(packet(incoming)));
  equivalent(pose.update(packet(incoming),500),expected);
  equivalent(pose.update(packet(incoming),50000),expected); // held pose must not decay
  equivalent(pose.update({x:-incoming.x,y:-incoming.y,z:-incoming.z,w:-incoming.w},50100),expected);
  assert.equal(pose.update(undefined,50200),null);
});
test('tare settles briefly then captures neutral; roll is an actual degree angle',()=>{
  const pose=new WristImuPose(),q=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2);
  pose.update({x:0,y:0,z:0,w:1},0);
  assert.ok(Math.abs(wristRollDegrees(pose.update(packet(q),10))+90)<1e-6);
  pose.requestTare(100);
  equivalent(pose.update(packet(q),200),new Quaternion());
  equivalent(pose.update(packet(q),500),new Quaternion());
  equivalent(pose.update(packet(q),1000),new Quaternion());
});
test('SDK wrist pivot rotates fingertips while live finger bend remains independent',()=>{
  const loadTexture=TextureLoader.prototype.load;
  TextureLoader.prototype.load=()=>new Texture();
  try {
    for(const side of ['Left','Right']) {
      const bytes=readFileSync(new URL(`../hand_models/${side}HandAnims.FBX`,import.meta.url));
      const model=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
      const bones={};model.traverse(o=>{if(o.isBone)bones[o.name]=o;});
      const wrist=bones.WaveBone_1,mcp=bones.WaveBone_7,tip=bones.WaveBone_10;
      assert.ok(wrist&&mcp&&tip);
      mcp.quaternion.setFromAxisAngle(new Vector3(-1,0,0),0.65);
      const bent=mcp.quaternion.clone();model.updateMatrixWorld(true);
      const before=tip.getWorldPosition(new Vector3());
      const pivotBefore=wrist.getWorldPosition(new Vector3());
      wrist.quaternion.setFromAxisAngle(new Vector3(0,0,1),Math.PI/2);
      model.updateMatrixWorld(true);
      assert.ok(tip.getWorldPosition(new Vector3()).distanceTo(before)>0.1);
      assert.ok(wrist.getWorldPosition(new Vector3()).distanceTo(pivotBefore)<1e-6);
      equivalent(mcp.quaternion,bent);
    }
  } finally {TextureLoader.prototype.load=loadTexture;}
});
