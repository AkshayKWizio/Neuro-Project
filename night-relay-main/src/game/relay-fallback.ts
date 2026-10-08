import * as THREE from 'three';
import type { HumanRunnerPose } from './human-runner';

export interface RelayFallbackModel {
  readonly group: THREE.Group;
  animate(elapsed: number, speed: number, jumping: boolean, sliding: boolean): void;
  dispose(): void;
  readonly sprayGrip: THREE.Group;
  pose(mode: HumanRunnerPose | null): void;
  spray(progress: number): void;
}

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

/** A small original courier is visible immediately, including when the detailed asset is offline. */
export function createRelayFallback(): RelayFallbackModel {
  const group = new THREE.Group();
  group.name = 'Night Relay courier loading model';
  const facing = new THREE.Group();
  facing.rotation.y = Math.PI;
  group.add(facing);
  const body = new THREE.Group();
  facing.add(body);
  const shapes: THREE.BufferGeometry[] = [];
  const surfaces: THREE.Material[] = [];
  const material = (color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial => {
    const surface = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    surfaces.push(surface);
    return surface;
  };
  const orange = material(0xed7929);
  const orangeDark = material(0xae4b25);
  const plum = material(0x49354d);
  const violet = material(0x392744);
  const hairHighlight = material(0x604568);
  const skin = material(0xb67d58);
  const eyeWhite = material(0xe4ded0);
  const eye = material(0x211b20);
  const lips = material(0x955953);
  const silver = material(0xc7dcd5, 0.36, 0.25);
  const white = material(0xe7e6d7);
  const aqua = material(0x9dc8c6, 0.6);

  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh {
    shapes.push(geometry);
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function oval(
    parent: THREE.Object3D,
    surface: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ): THREE.Mesh {
    const object = mesh(parent, new THREE.SphereGeometry(1, 16, 12), surface, x, y, z);
    object.scale.set(sx, sy, sz);
    return object;
  }
  function segment(
    parent: THREE.Object3D,
    surface: THREE.Material,
    length: number,
    top: number,
    bottom: number,
  ): THREE.Mesh {
    return mesh(
      parent,
      new THREE.CylinderGeometry(top, bottom, length, 14),
      surface,
      0,
      -length / 2,
      0,
    );
  }
  function seam(
    parent: THREE.Object3D,
    surface: THREE.Material,
    points: readonly (readonly [number, number, number])[],
    radius = 0.006,
  ): void {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    mesh(parent, new THREE.TubeGeometry(curve, 16, radius, 5, false), surface, 0, 0, 0);
  }

  const torso = new THREE.Group();
  torso.position.y = 0.91;
  body.add(torso);
  const profile = [
    [0.19, 0],
    [0.2, 0.05],
    [0.17, 0.2],
    [0.2, 0.38],
    [0.22, 0.47],
    [0.17, 0.52],
    [0.07, 0.55],
  ];
  const jacket = mesh(
    torso,
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    ),
    orange,
    0,
    0,
    0,
  );
  jacket.scale.z = 0.68;
  const collar = mesh(
    torso,
    new THREE.CylinderGeometry(0.077, 0.085, 0.06, 18),
    orangeDark,
    0,
    0.555,
    0,
  );
  collar.scale.z = 0.8;
  seam(
    torso,
    silver,
    [
      [-0.055, 0.015, 0.14],
      [0.01, 0.22, 0.119],
      [0.05, 0.48, 0.115],
    ],
    0.003,
  );
  seam(
    torso,
    plum,
    [
      [-0.18, 0.075, 0.135],
      [0.03, 0.26, 0.152],
      [0.14, 0.49, 0.09],
    ],
    0.018,
  );
  seam(
    torso,
    plum,
    [
      [-0.18, 0.075, -0.12],
      [0.02, 0.28, -0.155],
      [0.14, 0.49, -0.09],
    ],
    0.018,
  );
  oval(torso, plum, -0.105, 0.28, -0.17, 0.13, 0.16, 0.05);
  seam(
    torso,
    silver,
    [
      [-0.18, 0.24, -0.205],
      [-0.11, 0.2, -0.219],
      [-0.02, 0.26, -0.202],
    ],
    0.007,
  );

  const head = new THREE.Group();
  head.position.y = 1.6;
  body.add(head);
  mesh(head, new THREE.CylinderGeometry(0.045, 0.052, 0.105, 14), skin, 0, -0.105, 0);
  oval(head, skin, 0, 0.015, 0, 0.105, 0.14, 0.092);
  oval(head, skin, 0, -0.05, 0.04, 0.078, 0.068, 0.063);
  for (const side of [-1, 1]) {
    oval(head, skin, side * 0.102, -0.005, -0.003, 0.017, 0.031, 0.015);
    oval(head, eyeWhite, side * 0.037, 0.026, 0.084, 0.021, 0.008, 0.009);
    oval(head, eye, side * 0.037, 0.026, 0.092, 0.008, 0.008, 0.004);
    seam(
      head,
      violet,
      [
        [side * 0.019, 0.048, 0.087],
        [side * 0.039, 0.052, 0.087],
        [side * 0.058, 0.047, 0.081],
      ],
      0.004,
    );
  }
  oval(head, skin, 0, -0.001, 0.093, 0.016, 0.025, 0.018);
  oval(head, lips, 0, -0.037, 0.099, 0.024, 0.005, 0.003);
  const hair = mesh(
    head,
    new THREE.SphereGeometry(1, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.64),
    violet,
    0,
    0.038,
    -0.014,
  );
  hair.scale.set(0.118, 0.15, 0.11);
  oval(head, violet, -0.081, 0.008, 0.04, 0.043, 0.103, 0.046).rotation.z = -0.13;
  oval(head, hairHighlight, -0.03, 0.116, 0.036, 0.07, 0.044, 0.073).rotation.z = -0.3;

  function arm(side: number): Limb {
    const upper = new THREE.Group();
    upper.position.set(side * 0.21, 1.36, 0);
    body.add(upper);
    oval(upper, side > 0 ? plum : orange, 0, -0.024, 0, 0.069, 0.09, 0.074);
    segment(upper, orange, 0.255, 0.062, 0.047);
    seam(
      upper,
      silver,
      [
        [side * 0.056, -0.04, 0.017],
        [side * 0.044, -0.12, 0.027],
        [side * 0.04, -0.21, 0.028],
      ],
      0.005,
    );
    const lower = new THREE.Group();
    lower.position.y = -0.255;
    upper.add(lower);
    oval(lower, orange, 0, 0, 0, 0.048, 0.058, 0.052);
    segment(lower, orange, 0.245, 0.047, 0.033);
    mesh(lower, new THREE.CylinderGeometry(0.036, 0.035, 0.025, 12), plum, 0, -0.235, 0);
    oval(lower, skin, 0, -0.283, 0.007, 0.033, 0.059, 0.024);
    oval(lower, skin, -side * 0.029, -0.27, 0.015, 0.013, 0.032, 0.012).rotation.z = side * 0.4;
    return { upper, lower };
  }
  function leg(side: number): Limb {
    const upper = new THREE.Group();
    upper.position.set(side * 0.1, 0.95, 0);
    body.add(upper);
    segment(upper, plum, 0.42, 0.106, 0.068);
    oval(upper, plum, side * 0.09, -0.22, 0, 0.028, 0.08, 0.06);
    const lower = new THREE.Group();
    lower.position.y = -0.42;
    upper.add(lower);
    oval(lower, plum, 0, 0, 0, 0.068, 0.065, 0.066);
    segment(lower, plum, 0.39, 0.064, 0.042);
    mesh(lower, new THREE.CylinderGeometry(0.045, 0.045, 0.024, 12), silver, 0, -0.348, 0);
    oval(lower, white, 0, -0.415, 0.05, 0.06, 0.054, 0.124);
    oval(lower, aqua, 0, -0.45, 0.05, 0.063, 0.021, 0.127);
    return { upper, lower };
  }
  const arms = [arm(1), arm(-1)];
  const legs = [leg(1), leg(-1)];
  const sprayGrip = new THREE.Group();
  sprayGrip.position.set(0, -0.28, 0);
  arms[1].lower.add(sprayGrip);
  const bounds = new THREE.Box3().setFromObject(facing);
  const height = bounds.max.y - bounds.min.y;
  facing.scale.setScalar(1.85 / height);
  facing.position.y = -bounds.min.y * facing.scale.y;
  let pose: HumanRunnerPose | null = null;
  let progress = 0;
  const worldQuaternion = new THREE.Quaternion();
  const facingQuaternion = new THREE.Quaternion();

  return {
    group,
    sprayGrip,
    pose(mode) {
      pose = mode;
    },
    spray(value) {
      progress = THREE.MathUtils.clamp(value, 0, 1);
    },
    animate(elapsed, speed, jumping, sliding) {
      const running = !pose && speed > 0.1;
      const phase = elapsed * (8 + speed * 0.18);
      const stride = running ? Math.sin(phase) : 0;
      body.position.y = sliding
        ? -0.65
        : jumping
          ? 0
          : running
            ? Math.abs(Math.cos(phase)) * 0.025
            : Math.sin(elapsed * 2.2) * 0.004;
      torso.rotation.y = stride * 0.055;
      body.rotation.x = sliding ? 0.57 : running ? 0.09 : 0;
      head.rotation.y = pose === 'startled' ? -0.7 : Math.sin(elapsed * 0.7) * 0.035;
      for (let index = 0; index < 2; index += 1) {
        const opposition = index === 0 ? 1 : -1;
        arms[index].upper.rotation.set(
          running ? stride * opposition * 0.75 : -0.08,
          0,
          -opposition * 0.065,
        );
        arms[index].lower.rotation.x = running ? -0.95 + stride * opposition * 0.2 : -0.1;
        legs[index].upper.rotation.x = sliding
          ? -1.25
          : jumping
            ? -0.8
            : -stride * opposition * 0.73;
        legs[index].lower.rotation.x = sliding
          ? 1.55
          : jumping
            ? 1.15
            : running
              ? Math.max(0, stride * opposition) * 1.28
              : 0.025;
      }
      if (pose === 'spray') {
        arms[1].upper.rotation.set(-1.6, 0.15, 0.3);
        arms[1].lower.rotation.x = -0.3 - Math.sin(progress * Math.PI) * 0.025;
      } else if (pose === 'startled') {
        arms[1].upper.rotation.x = -1.05;
        arms[1].lower.rotation.x = -0.8;
      }
      group.updateMatrixWorld(true);
      // The grip stays vertical while its parent arm reaches; this matches a real spray can.
      facing.getWorldQuaternion(facingQuaternion);
      arms[1].lower.getWorldQuaternion(worldQuaternion).invert().multiply(facingQuaternion);
      sprayGrip.quaternion.copy(worldQuaternion);
      sprayGrip.updateWorldMatrix(false, true);
    },
    dispose() {
      for (const geometry of shapes) geometry.dispose();
      for (const surface of surfaces) surface.dispose();
      group.removeFromParent();
    },
  };
}
