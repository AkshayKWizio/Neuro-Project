import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createRelayFallback } from './relay-fallback';

export type HumanRunnerPose = 'idle' | 'spray' | 'startled' | 'caught';

export interface HumanRunnerModel {
  readonly group: THREE.Group;
  animate(elapsed: number, speed: number, jumping: boolean, sliding: boolean): void;
  dispose(): void;
  /** Resolves after the bundled skinned human replaces the loading silhouette. */
  readonly ready: Promise<boolean>;
  /** null returns control to ordinary running, jumping, and sliding. */
  pose(mode: HumanRunnerPose | null): void;
  /** Progress through the last painted dot: 0 starts the dab, 1 releases the nozzle. */
  spray(progress: number): void;
  /** The nozzle's world position while the human is holding the spray can. */
  getSprayTip(target: THREE.Vector3): THREE.Vector3 | null;
  isReady(): boolean;
}

type ActionPose = HumanRunnerPose | 'jump' | 'slide';
type Joint =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'leftArm'
  | 'leftForeArm'
  | 'leftHand'
  | 'rightArm'
  | 'rightForeArm'
  | 'rightHand'
  | 'leftUpLeg'
  | 'leftLeg'
  | 'leftFoot'
  | 'leftToe'
  | 'rightUpLeg'
  | 'rightLeg'
  | 'rightFoot'
  | 'rightToe';

interface BoneFrame {
  bone: THREE.Bone;
  bindPosition: THREE.Vector3;
  bindQuaternion: THREE.Quaternion;
  bindScale: THREE.Vector3;
  runPosition: THREE.Vector3;
  runQuaternion: THREE.Quaternion;
  outputQuaternion: THREE.Quaternion;
}

const ALIASES: Record<Joint, readonly string[]> = {
  hips: ['hips', 'pelvis'],
  spine: ['spine', 'spine01', 'spine1'],
  chest: ['spine2', 'spine02', 'chest', 'spine1'],
  neck: ['neck', 'neck1'],
  head: ['head'],
  leftArm: ['leftarm', 'leftupperarm', 'upperarml', 'arml'],
  leftForeArm: ['leftforearm', 'leftlowerarm', 'lowerarml', 'forearml'],
  leftHand: ['lefthand', 'handl'],
  rightArm: ['rightarm', 'rightupperarm', 'upperarmr', 'armr'],
  rightForeArm: ['rightforearm', 'rightlowerarm', 'lowerarmr', 'forearmr'],
  rightHand: ['righthand', 'handr'],
  leftUpLeg: ['leftupleg', 'leftupperleg', 'thighl', 'uplegl'],
  leftLeg: ['leftleg', 'leftlowerleg', 'calfl', 'shinl'],
  leftFoot: ['leftfoot', 'footl'],
  leftToe: ['lefttoebase', 'lefttoe', 'toel'],
  rightUpLeg: ['rightupleg', 'rightupperleg', 'thighr', 'uplegr'],
  rightLeg: ['rightleg', 'rightlowerleg', 'calfr', 'shinr'],
  rightFoot: ['rightfoot', 'footr'],
  rightToe: ['righttoebase', 'righttoe', 'toer'],
};

function normalizedBoneName(name: string): string {
  return name
    .toLowerCase()
    .replace(/mixamorig\d*|armature|bip01|bip001/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function disposeCharacter(scene: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const surface of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(surface);
      for (const value of Object.values(surface))
        if (value instanceof THREE.Texture) textures.add(value);
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
  });
  for (const shape of geometries) shape.dispose();
  for (const surface of materials) surface.dispose();
  for (const texture of textures) texture.dispose();
}

/** Preserve the authored hip bounce while preventing a running clip moving out of its lane. */
function inPlaceClip(source: THREE.AnimationClip): THREE.AnimationClip {
  const clip = source.clone();
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const name = normalizedBoneName(track.name.slice(0, -9));
    if (!['hips', 'pelvis', 'root', 'rootmotion', ''].includes(name)) continue;
    const values = track.values;
    const x = values[0];
    const z = values[2];
    for (let i = 0; i < values.length; i += 3) {
      values[i] = x;
      values[i + 2] = z;
    }
  }
  return clip;
}

function createSprayCan(): { group: THREE.Group; nozzle: THREE.Object3D } {
  const group = new THREE.Group();
  group.name = 'Higgsfield spray can';
  const label = document.createElement('canvas');
  label.width = 512;
  label.height = 256;
  const ctx = label.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#17201c';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#baff32';
    ctx.fillRect(0, 10, 512, 17);
    ctx.fillRect(0, 218, 512, 8);
    ctx.font = '900 38px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HIGGSFIELD', 256, 112);
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillStyle = '#edf1d8';
    ctx.fillText('NIGHT RELAY / 400 ML', 256, 150);
    ctx.fillText('MAKE YOUR MARK.', 256, 182);
  }
  const texture = new THREE.CanvasTexture(label);
  texture.colorSpace = THREE.SRGBColorSpace;
  const paint = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.54, metalness: 0.25 });
  const aluminium = new THREE.MeshStandardMaterial({
    color: 0xb9babc,
    roughness: 0.3,
    metalness: 0.8,
  });
  const cap = new THREE.MeshStandardMaterial({ color: 0xbaff32, roughness: 0.48 });
  const black = new THREE.MeshStandardMaterial({ color: 0x161b14, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.153, 20), paint);
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.031, 0.018, 20), aluminium);
  shoulder.position.y = 0.085;
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.0318, 0.0318, 0.006, 20), aluminium);
  bottom.position.y = -0.079;
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.017, 12), cap);
  button.position.y = 0.103;
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 8), black);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, 0.103, 0.012);
  const nozzle = new THREE.Object3D();
  nozzle.name = 'Spray nozzle tip';
  nozzle.position.set(0, 0.103, 0.016);
  group.add(body, shoulder, bottom, button, hole, nozzle);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  group.visible = false;
  return { group, nozzle };
}

/**
 * Real textured skin and clothing, deformed by a continuous skeletal rig.
 * The parent owns movement and collisions; this model owns only the human's performance.
 */
export function createHumanRunner(): HumanRunnerModel {
  const group = new THREE.Group();
  group.name = 'Night Relay human courier';
  const loadingRunner = createRelayFallback();
  group.add(loadingRunner.group);
  const visual = new THREE.Group();
  const facing = new THREE.Group();
  facing.rotation.y = Math.PI;
  visual.add(facing);
  group.add(visual);

  let disposed = false;
  let loaded = false;
  let model: THREE.Group | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let clipAction: THREE.AnimationAction | null = null;
  let frames: BoneFrame[] = [];
  const joints: Partial<Record<Joint, THREE.Bone>> = {};
  let actorPose: HumanRunnerPose | null = null;
  let activePose: ActionPose = 'idle';
  let poseBlend = 0;
  let previousElapsed = 0;
  let lastSpeed = 0;
  let lastJumping = false;
  let lastSliding = false;
  let airborneLastFrame = false;
  let landingTimer = 0;
  let baseSoleHeight = 0.08;
  let verticalOffset = 0;
  let animationTime = 0;
  let sprayProgress = 0;
  let carryCanTime = 0;
  const sprayCan = createSprayCan();
  loadingRunner.sprayGrip.add(sprayCan.group);
  const referenceQuaternion = new THREE.Quaternion();
  const canPosition = new THREE.Vector3();
  const canScale = new THREE.Vector3();
  const canQuaternion = new THREE.Quaternion();
  const canForward = new THREE.Vector3();

  function restoreBindPose(): void {
    for (const frame of frames) {
      frame.bone.position.copy(frame.bindPosition);
      frame.bone.quaternion.copy(frame.bindQuaternion);
      frame.bone.scale.copy(frame.bindScale);
    }
    group.updateMatrixWorld(true);
  }

  /** Point a limb in anatomical model space, independent of imported bone-axis conventions. */
  function pointJoint(key: Joint, childKey: Joint, x: number, y: number, z: number): void {
    const bone = joints[key];
    const child = joints[childKey];
    if (!bone || !child || !bone.parent) return;
    bone.updateWorldMatrix(true, true);
    const current = child
      .getWorldPosition(new THREE.Vector3())
      .sub(bone.getWorldPosition(new THREE.Vector3()));
    if (current.lengthSq() < 0.000001) return;
    current.normalize();
    const target = new THREE.Vector3(x, y, z).normalize().applyQuaternion(referenceQuaternion);
    const change = new THREE.Quaternion().setFromUnitVectors(current, target);
    const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(change);
    const inverseParent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(inverseParent.multiply(world));
    bone.updateWorldMatrix(false, true);
  }

  function turnJoint(key: Joint, x: number, y = 0, z = 0): void {
    const bone = joints[key];
    if (!bone?.parent) return;
    const change = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
    change.premultiply(referenceQuaternion).multiply(referenceQuaternion.clone().invert());
    const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(change);
    bone.quaternion.copy(
      bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world),
    );
    bone.updateWorldMatrix(false, true);
  }

  function setHumanPose(mode: ActionPose, elapsed: number): void {
    restoreBindPose();
    facing.getWorldQuaternion(referenceQuaternion);
    const breath = Math.sin(elapsed * 2.4) * 0.009;
    const startled = mode === 'startled';
    const caught = mode === 'caught';
    const spraying = mode === 'spray';
    const jumping = mode === 'jump';
    const sliding = mode === 'slide';
    const dab = Math.sin(Math.PI * THREE.MathUtils.smoothstep(sprayProgress, 0.28, 0.86));
    turnJoint(
      'spine',
      sliding ? 0.67 : jumping ? 0.15 : caught ? 0.23 : spraying ? 0.035 + breath : 0.02 + breath,
      spraying ? -0.045 : 0,
    );
    turnJoint(
      'chest',
      sliding ? 0.31 : jumping ? 0.1 : caught ? 0.17 : 0.014 + breath,
      spraying ? -0.07 : 0,
    );
    turnJoint(
      'neck',
      sliding ? -0.26 : caught ? -0.12 : spraying ? -0.025 : 0,
      startled ? -0.3 : spraying ? -0.055 : 0,
    );
    turnJoint(
      'head',
      sliding ? -0.24 : jumping ? -0.12 : caught ? -0.17 : spraying ? -0.055 : -0.025,
      startled ? -0.52 : spraying ? -0.035 : Math.sin(elapsed * 0.8) * 0.025,
    );
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      const arm: Joint = `${side}Arm`;
      const forearm: Joint = `${side}ForeArm`;
      const hand: Joint = `${side}Hand`;
      const thigh: Joint = `${side}UpLeg`;
      const shin: Joint = `${side}Leg`;
      const foot: Joint = `${side}Foot`;
      const toe: Joint = `${side}Toe`;
      if (sliding) {
        pointJoint(thigh, shin, sign * 0.14, -0.21, 0.97);
        pointJoint(shin, foot, sign * 0.025, -0.98, -0.17);
        pointJoint(foot, toe, 0, -0.03, 1);
        pointJoint(arm, forearm, sign * 0.36, -0.8, -0.44);
        pointJoint(forearm, hand, sign * 0.15, -0.58, 0.8);
      } else if (jumping) {
        pointJoint(thigh, shin, sign * 0.07, side === 'left' ? -0.37 : -0.62, 0.86);
        pointJoint(shin, foot, 0, -0.49, -0.87);
        pointJoint(foot, toe, 0, -0.14, 1);
        pointJoint(arm, forearm, sign * 0.2, -0.45, 0.86);
        pointJoint(forearm, hand, sign * 0.1, 0.6, 0.8);
      } else if (spraying && side === 'right') {
        // Shoulder reaches toward the carriage; the bent elbow puts the nozzle at eye level.
        pointJoint(arm, forearm, 0.25, -0.04 + dab * 0.025, 1);
        pointJoint(forearm, hand, 0.43, 0.32 + dab * 0.035, 0.91);
        turnJoint(hand, -0.075 * dab, 0, 0.02 * Math.sin(sprayProgress * Math.PI * 2));
      } else if (startled || caught) {
        pointJoint(arm, forearm, sign * (startled ? 0.5 : 0.26), -0.62, 0.72);
        pointJoint(forearm, hand, sign * 0.1, 0.45, 0.89);
        if (caught) {
          pointJoint(thigh, shin, sign * 0.07, -0.9, 0.42);
          pointJoint(shin, foot, 0, -0.97, -0.22);
          pointJoint(foot, toe, 0, -0.02, 1);
        }
      } else {
        pointJoint(arm, forearm, sign * 0.12, -1, 0.045);
        pointJoint(forearm, hand, sign * 0.035, -1, 0.13);
      }
    }
  }

  function updateSprayCan(dt: number): void {
    carryCanTime = Math.max(0, carryCanTime - dt);
    sprayCan.group.visible =
      actorPose === 'spray' || (actorPose === 'startled' && carryCanTime > 0);
    if (!sprayCan.group.visible) return;
    const hand = loaded ? joints.rightHand : loadingRunner.sprayGrip;
    if (!hand) {
      sprayCan.group.visible = false;
      return;
    }
    hand.updateWorldMatrix(true, false);
    facing.getWorldQuaternion(referenceQuaternion);
    canForward.set(0, 0, 1).applyQuaternion(referenceQuaternion);
    hand.getWorldPosition(canPosition).addScaledVector(canForward, 0.055);
    canPosition.y -= 0.013;
    // The asset uses centimetres. Counter its world scale so this remains a real 19 cm can.
    hand.getWorldScale(canScale);
    sprayCan.group.scale.set(1 / canScale.x, 1 / canScale.y, 1 / canScale.z);
    sprayCan.group.position.copy(hand.worldToLocal(canPosition));
    hand.getWorldQuaternion(canQuaternion).invert().multiply(referenceQuaternion);
    sprayCan.group.quaternion.copy(canQuaternion);
    sprayCan.group.updateWorldMatrix(false, true);
  }

  /** Ankle height is cheap to measure and keeps crouches planted without scanning the skin mesh. */
  function footHeight(): number {
    let y = Infinity;
    group.updateMatrixWorld(true);
    for (const key of ['leftFoot', 'rightFoot'] as const) {
      const foot = joints[key];
      if (!foot) continue;
      const local = group.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
      y = Math.min(y, local.y);
    }
    return Number.isFinite(y) ? y : baseSoleHeight;
  }

  function animate(elapsed: number, speed: number, jumping: boolean, sliding: boolean): void {
    lastSpeed = speed;
    lastJumping = jumping;
    lastSliding = sliding;
    const dt = THREE.MathUtils.clamp(elapsed - previousElapsed, 0.001, 0.045);
    previousElapsed = elapsed;
    if (!loaded || !mixer) {
      loadingRunner.pose(actorPose);
      loadingRunner.spray(sprayProgress);
      loadingRunner.animate(elapsed, actorPose ? 0 : speed, jumping, sliding);
      updateSprayCan(dt);
      return;
    }
    if (airborneLastFrame && !jumping) landingTimer = 0.22;
    airborneLastFrame = jumping;
    landingTimer = Math.max(0, landingTimer - dt);
    const landing = Math.sin((Math.PI * landingTimer) / 0.22);
    const cadence = THREE.MathUtils.clamp(0.82 + speed / 65, 0.82, 1.32);
    animationTime += dt * cadence;
    mixer.setTime(animationTime);
    const requestedPose: ActionPose | null =
      actorPose ?? (sliding ? 'slide' : jumping ? 'jump' : speed < 0.1 ? 'idle' : null);
    if (requestedPose) activePose = requestedPose;
    const damping = 1 - Math.exp(-18 * dt);
    poseBlend = THREE.MathUtils.lerp(poseBlend, requestedPose ? 1 : 0, damping);
    for (const frame of frames) {
      frame.runQuaternion.copy(frame.bone.quaternion);
      frame.runPosition.copy(frame.bone.position);
    }
    visual.position.y = 0;
    if (poseBlend > 0.002) {
      setHumanPose(activePose, elapsed);
      for (const frame of frames) {
        frame.bone.quaternion.slerpQuaternions(
          frame.runQuaternion,
          frame.bone.quaternion.clone(),
          poseBlend,
        );
        frame.bone.position.lerpVectors(frame.runPosition, frame.bindPosition, poseBlend);
      }
    }
    // Keep the captured run's natural hip/shoulder opposition; soften only pose transitions.
    for (const frame of frames) {
      if (poseBlend > 0.002)
        frame.bone.quaternion.slerpQuaternions(
          frame.outputQuaternion,
          frame.bone.quaternion.clone(),
          1 - Math.exp(-27 * dt),
        );
      frame.outputQuaternion.copy(frame.bone.quaternion);
    }
    facing.getWorldQuaternion(referenceQuaternion);
    if (landing > 0 && poseBlend < 0.5) {
      turnJoint('spine', landing * 0.045);
      turnJoint('leftUpLeg', landing * 0.08);
      turnJoint('rightUpLeg', landing * 0.08);
      turnJoint('leftLeg', -landing * 0.13);
      turnJoint('rightLeg', -landing * 0.13);
    }
    const crouched = activePose === 'slide' || activePose === 'caught';
    const groundedPose =
      activePose === 'idle' || activePose === 'spray' || activePose === 'startled' || crouched;
    const targetOffset =
      poseBlend > 0.002 && groundedPose
        ? (baseSoleHeight - footHeight()) * poseBlend
        : -landing * 0.028;
    verticalOffset = THREE.MathUtils.lerp(verticalOffset, targetOffset, 1 - Math.exp(-24 * dt));
    visual.position.y = verticalOffset;
    group.updateMatrixWorld(true);
    updateSprayCan(dt);
  }

  async function loadHuman(): Promise<boolean> {
    let result: GLTF;
    try {
      result = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/runner-relay.glb`);
    } catch (error) {
      console.error('The bundled human runner could not be loaded.', error);
      return false;
    }
    if (disposed) {
      disposeCharacter(result.scene);
      return false;
    }
    const asset = result.scene;
    asset.name = 'Night Relay original courier';
    asset.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(asset, true);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const metrics = new THREE.Group();
    metrics.scale.setScalar(1.85 / Math.max(size.y, 0.01));
    const origin = new THREE.Group();
    origin.position.set(-center.x, -bounds.min.y, -center.z);
    origin.add(asset);
    metrics.add(origin);
    facing.add(metrics);
    model = asset;
    const bones: THREE.Bone[] = [];
    asset.traverse((object) => {
      if (object instanceof THREE.Bone) bones.push(object);
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
      for (const surface of Array.isArray(object.material) ? object.material : [object.material]) {
        if (surface instanceof THREE.MeshStandardMaterial) {
          surface.roughness = Math.max(surface.roughness, 0.62);
          surface.metalness = Math.min(surface.metalness, 0.12);
          if (surface.map) surface.map.anisotropy = 4;
        }
      }
    });
    if (bones.length < 10 || result.animations.length === 0) {
      console.error(
        'The human asset must contain a skinned skeleton and its authored run animation.',
      );
      disposeCharacter(asset);
      metrics.removeFromParent();
      model = null;
      return false;
    }
    frames = bones.map((bone) => ({
      bone,
      bindPosition: bone.position.clone(),
      bindQuaternion: bone.quaternion.clone(),
      bindScale: bone.scale.clone(),
      runPosition: bone.position.clone(),
      runQuaternion: bone.quaternion.clone(),
      outputQuaternion: bone.quaternion.clone(),
    }));
    for (const [key, aliases] of Object.entries(ALIASES) as [Joint, readonly string[]][]) {
      joints[key] = bones.find((bone) => aliases.includes(normalizedBoneName(bone.name)));
    }
    if (joints.rightHand) {
      joints.rightHand.add(sprayCan.group);
    }
    group.updateMatrixWorld(true);
    baseSoleHeight = Math.max(0.035, footHeight());
    mixer = new THREE.AnimationMixer(asset);
    const run = result.animations.find((clip) => /run/i.test(clip.name)) ?? result.animations[0];
    clipAction = mixer.clipAction(inPlaceClip(run));
    clipAction.play();
    loadingRunner.dispose();
    loaded = true;
    group.userData.humanReady = true;
    group.userData.humanJoints = bones.length;
    group.userData.humanAnimation = run.name;
    animate(previousElapsed + 0.001, lastSpeed, lastJumping, lastSliding);
    return true;
  }

  return {
    group,
    ready: loadHuman(),
    animate,
    pose(mode) {
      if (actorPose === 'spray' && mode === 'startled') carryCanTime = 0.45;
      actorPose = mode;
      if (mode !== 'spray' && mode !== 'startled' && sprayCan) sprayCan.group.visible = false;
    },
    spray(progress) {
      sprayProgress = THREE.MathUtils.clamp(progress, 0, 1);
    },
    getSprayTip(target) {
      return sprayCan.group.visible ? sprayCan.nozzle.getWorldPosition(target) : null;
    },
    isReady: () => loaded,
    dispose() {
      disposed = true;
      clipAction?.stop();
      mixer?.stopAllAction();
      if (model) {
        mixer?.uncacheRoot(model);
        disposeCharacter(model);
      } else {
        disposeCharacter(sprayCan.group);
        loadingRunner.dispose();
      }
      group.removeFromParent();
    },
  };
}
