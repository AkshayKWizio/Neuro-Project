import * as THREE from 'three';

export const INTRO_TIMING = {
  sprayStart: 0.55,
  sprayEnd: 1.45,
  reveal: 1.75,
  signal: 2.95,
  ready: 3.65,
  launch: 4.4,
  duration: 7.6,
} as const;

interface Shot {
  time: number;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  fov: number;
}
export interface IntroCameraPose {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  fov: number;
}

function shot(
  time: number,
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
): Shot {
  const point = new THREE.Vector3(...position);
  const look = new THREE.Matrix4().lookAt(
    point,
    new THREE.Vector3(...target),
    new THREE.Vector3(0, 1, 0),
  );
  return {
    time,
    position: point,
    rotation: new THREE.Quaternion().setFromRotationMatrix(look),
    fov,
  };
}

function shots(portrait: boolean): Shot[] {
  const fov = portrait ? 66 : 57;
  return [
    shot(0, portrait ? [5.9, 2.6, 8.4] : [4.8, 2.4, 6.2], [-1.84, 1.68, 0.6], fov),
    shot(
      INTRO_TIMING.reveal,
      portrait ? [5.65, 2.45, 7.95] : [4.6, 2.32, 5.6],
      [-1.84, 1.68, 0.6],
      fov,
    ),
    shot(3.15, portrait ? [4.8, 2.5, 7.8] : [4.1, 2.2, 5.6], [1.55, 2.2, -2.5], fov),
    shot(INTRO_TIMING.launch, portrait ? [4.8, 2.5, 7.8] : [4.1, 2.2, 5.6], [1.55, 2.2, -2.5], fov),
    shot(5.7, [3.6, 2.9, 8.6], [0, 1.25, -4], portrait ? 68 : fov),
    shot(6.8, [1.8, 3.6, portrait ? 13.4 : 12.15], [0, 1.25, -9], 59),
    shot(INTRO_TIMING.duration, [0, 3.6, portrait ? 13 : 11.4], [0, 1.25, -13], 57),
  ];
}

const desktop = shots(false);
const portrait = shots(true);

/** Zero velocity and acceleration at shot boundaries; orientation never crosses a look-at singularity. */
export function sampleIntroCamera(
  time: number,
  aspect: number,
  out: IntroCameraPose,
): IntroCameraPose {
  const sequence = aspect < 0.8 ? portrait : desktop;
  const t = THREE.MathUtils.clamp(time, 0, INTRO_TIMING.duration);
  let index = 0;
  while (index < sequence.length - 2 && t > sequence[index + 1]!.time) index++;
  const from = sequence[index]!;
  const to = sequence[index + 1]!;
  const progress = THREE.MathUtils.smootherstep(t, from.time, to.time);
  out.position.lerpVectors(from.position, to.position, progress);
  out.rotation.slerpQuaternions(from.rotation, to.rotation, progress);
  out.fov = THREE.MathUtils.lerp(from.fov, to.fov, progress);
  return out;
}
