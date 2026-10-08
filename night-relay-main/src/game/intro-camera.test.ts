import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { INTRO_TIMING, sampleIntroCamera } from './intro-camera.ts';

const pose = () => ({ position: new THREE.Vector3(), rotation: new THREE.Quaternion(), fov: 57 });

test('the entire intro stays continuous at 120fps on desktop and phone', () => {
  for (const aspect of [16 / 9, 390 / 844]) {
    const previous = pose();
    sampleIntroCamera(0, aspect, previous);
    for (let time = 1 / 120; time <= INTRO_TIMING.duration; time += 1 / 120) {
      const current = sampleIntroCamera(time, aspect, pose());
      assert.ok(
        previous.position.distanceTo(current.position) < 0.14,
        `camera position jumped at ${time}`,
      );
      assert.ok(
        previous.rotation.angleTo(current.rotation) < 0.05,
        `camera direction jumped at ${time}`,
      );
      assert.ok(Math.abs(current.rotation.length() - 1) < 0.00001);
      assert.ok(
        current.position.x > -1.5 && current.position.x < 8,
        'camera entered a train or building',
      );
      previous.position.copy(current.position);
      previous.rotation.copy(current.rotation);
    }
  }
});

test('the intro arrives at the exact gameplay camera without a final snap or FOV change', () => {
  for (const aspect of [16 / 9, 390 / 844]) {
    const end = sampleIntroCamera(INTRO_TIMING.duration, aspect, pose());
    const target = new THREE.Vector3(0, 1.25, -13);
    const expected = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(end.position, target, new THREE.Vector3(0, 1, 0)),
    );
    assert.ok(end.position.distanceTo(new THREE.Vector3(0, 3.6, aspect < 0.8 ? 13 : 11.4)) < 1e-8);
    assert.ok(end.rotation.angleTo(expected) < 1e-7);
    assert.equal(end.fov, 57);
    const before = sampleIntroCamera(INTRO_TIMING.duration - 0.001, aspect, pose());
    assert.ok(before.position.distanceTo(end.position) < 0.00001);
    assert.ok(before.rotation.angleTo(end.rotation) < 0.00001);
  }
});
