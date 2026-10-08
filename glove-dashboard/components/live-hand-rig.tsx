'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Hand } from 'lucide-react';

type Vector3 = { x: number; y: number; z: number };
type Quaternion = Vector3 & { w: number };
type Joint = { name: string; position: Vector3; orientation: Quaternion };
type GuidanceMode = 'pronation_supination' | 'circumduction' | 'hand_open_close' | 'calibration';

type CalibrationTransform = {
  Bone: number;
  LocalPosition: { X: number; Y: number; Z: number };
  LocalRotation: { X: number; Y: number; Z: number; W: number };
};
type CalibrationFrame = { FrameIndex: number; Transforms: Record<string, CalibrationTransform> };

type RigBone = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  target: THREE.Quaternion;
};

const waveBoneIds: Record<string, number> = {
  palm: 0, hand: 1,
  thumb_cmc: 2, thumb_mcp: 3, thumb_dip: 4, thumb_tip: 5,
  index_cmc: 6, index_mcp: 7, index_pip: 8, index_dip: 9, index_tip: 10,
  middle_cmc: 11, middle_mcp: 12, middle_pip: 13, middle_dip: 14, middle_tip: 15,
  ring_cmc: 16, ring_mcp: 17, ring_pip: 18, ring_dip: 19, ring_tip: 20,
  pinky_cmc: 21, pinky_mcp: 22, pinky_pip: 23, pinky_dip: 24, pinky_tip: 25,
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^(rt|lt|left|right)_/, '');
}

function findBone(jointName: string, bones: THREE.Bone[]) {
  const target = `wavebone_${waveBoneIds[jointName]}`;
  return bones.find((bone) => normalizeName(bone.name) === target);
}

export function LiveHandRig({ side, joints, guidanceMode }: { side: 'LEFT' | 'RIGHT'; joints?: Joint[]; guidanceMode?: GuidanceMode }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const jointRef = useRef(joints);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mappedBones, setMappedBones] = useState(0);

  useEffect(() => { jointRef.current = joints; }, [joints]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setStatus('loading');
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x687587, 1.85));
    const keyLight = new THREE.DirectionalLight(0xfff6ef, 2.8);
    keyLight.position.set(2.5, 3, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x70aaff, 1.05);
    rimLight.position.set(-3, 1, -2);
    scene.add(rimLight);

    let disposed = false;
    let frame = 0;
    let handRoot: THREE.Group | null = null;
    let displayRoot: THREE.Group | null = null;
    let gloveTexture: THREE.Texture | null = null;
    let calibrationFrames: CalibrationFrame[] = [];
    const rigBones = new Map<string, RigBone>();
    const calibrationBones = new Map<number, THREE.Bone>();

    if (guidanceMode === 'calibration') {
      fetch(`/api/models/${side.toLowerCase()}-basic-calibration.json`)
        .then(async (response) => {
          if (!response.ok) throw new Error('Calibration animation unavailable');
          return await response.json() as { Frames?: CalibrationFrame[] };
        })
        .then((animation: { Frames?: CalibrationFrame[] }) => { if (!disposed) calibrationFrames = animation.Frames ?? []; })
        .catch(() => { /* Keep the model visible if the optional guide cannot load. */ });
    }

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const viewHeight = 4.15;
      const viewWidth = viewHeight * aspect;
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    new FBXLoader().load(
      `/api/models/${side.toLowerCase()}-hand.fbx`,
      (model) => {
        if (disposed) return;
        handRoot = model;
        const bones: THREE.Bone[] = [];
        model.traverse((object) => {
          if ((object as THREE.Bone).isBone) bones.push(object as THREE.Bone);
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            mesh.frustumCulled = false;
            // FBXLoader cannot resolve the Unity-side texture references in
            // this package. Use the SDK's exact Reality glove texture through
            // our local bridge, with a solid source-matched skin material.
            const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xe0a38f });
            const gloveMaterial = new THREE.MeshLambertMaterial({ color: 0x202838 });
            new THREE.TextureLoader().load(
              `/api/models/${side.toLowerCase()}-glove.png`,
              (texture) => {
                if (disposed) { texture.dispose(); return; }
                texture.colorSpace = THREE.SRGBColorSpace;
                gloveTexture = texture;
                gloveMaterial.color.setHex(0xffffff);
                gloveMaterial.map = texture;
                gloveMaterial.needsUpdate = true;
              },
            );
            mesh.material = [skinMaterial, gloveMaterial];
          }
        });

        for (const bone of bones) {
          const match = normalizeName(bone.name).match(/^wavebone_(\d+)$/);
          if (match) calibrationBones.set(Number(match[1]), bone);
        }

        for (const jointName of Object.keys(waveBoneIds)) {
          const bone = findBone(jointName, bones);
          if (bone && !rigBones.has(jointName)) {
            rigBones.set(jointName, {
              bone,
              rest: bone.quaternion.clone(),
              target: bone.quaternion.clone(),
            });
          }
        }

        displayRoot = new THREE.Group();
        displayRoot.add(model);
        const sideYawOffset = side === 'LEFT' ? 0.08 : -0.08;
        const baseYaw = guidanceMode ? Math.PI + sideYawOffset : sideYawOffset;
        displayRoot.rotation.set(
          -0.04,
          baseYaw,
          Math.PI + (side === 'LEFT' ? -0.035 : 0.035),
        );
        scene.add(displayRoot);
        displayRoot.updateMatrixWorld(true);

        // Fit and center the fully transformed FBX, not its unrotated source
        // bounds. This keeps the fingertips and wrist inside the viewport.
        const orientedBounds = new THREE.Box3().setFromObject(displayRoot);
        const orientedSize = orientedBounds.getSize(new THREE.Vector3());
        const scale = (guidanceMode ? 3.58 : 3.46) / Math.max(orientedSize.x, orientedSize.y, orientedSize.z, 0.001);
        displayRoot.scale.setScalar(scale);
        displayRoot.updateMatrixWorld(true);
        const finalCenter = new THREE.Box3().setFromObject(displayRoot).getCenter(new THREE.Vector3());
        displayRoot.position.sub(finalCenter);
        displayRoot.position.y -= 0.04;
        displayRoot.updateMatrixWorld(true);
        setMappedBones(rigBones.size);
        setStatus('ready');
      },
      undefined,
      () => { if (!disposed) setStatus('error'); },
    );

    const animate = (now = 0) => {
      frame = requestAnimationFrame(animate);
      if (handRoot) {
        if (guidanceMode && displayRoot) {
          const duration = guidanceMode === 'hand_open_close' ? 4200 : guidanceMode === 'calibration' ? 5800 : 5200;
          const cycle = (now / duration) * Math.PI * 2;
          // A cosine ping-pong starts at pose one, travels fully to pose two,
          // and returns to pose one. The smoothstep keeps both end poses
          // visible long enough for a patient to understand the movement.
          const rawWave = (1 - Math.cos(cycle)) / 2;
          const wave = rawWave * rawWave * (3 - 2 * rawWave);
          displayRoot.rotation.x = -0.04;
          displayRoot.rotation.y = Math.PI + (side === 'LEFT' ? 0.08 : -0.08);
          displayRoot.rotation.z = Math.PI + (side === 'LEFT' ? -0.035 : 0.035);
          if (guidanceMode === 'calibration' && calibrationFrames.length) {
            // Smooth bidirectional ping-pong playback between closed fist and open hand.
            const cyclePosition = (now % duration) / duration;
            const pingPong = cyclePosition < 0.5 ? cyclePosition * 2 : (1 - cyclePosition) * 2;
            const smoothT = pingPong * pingPong * (3 - 2 * pingPong);
            const framePosition = smoothT * (calibrationFrames.length - 1);
            const frameIndex = Math.min(calibrationFrames.length - 1, Math.floor(framePosition));
            const nextIndex = Math.min(calibrationFrames.length - 1, frameIndex + 1);
            const blend = framePosition - frameIndex;
            const frameTransforms = calibrationFrames[frameIndex].Transforms;
            const nextTransforms = calibrationFrames[nextIndex].Transforms;
            for (const [name, transform] of Object.entries(frameTransforms)) {
              const bone = calibrationBones.get(transform.Bone);
              const next = nextTransforms[name] ?? transform;
              if (!bone) continue;
              bone.position.set(
                THREE.MathUtils.lerp(transform.LocalPosition.X, next.LocalPosition.X, blend) * 100,
                THREE.MathUtils.lerp(transform.LocalPosition.Y, next.LocalPosition.Y, blend) * 100,
                THREE.MathUtils.lerp(transform.LocalPosition.Z, next.LocalPosition.Z, blend) * 100,
              );
              bone.quaternion.slerpQuaternions(
                new THREE.Quaternion(transform.LocalRotation.X, transform.LocalRotation.Y, transform.LocalRotation.Z, transform.LocalRotation.W).normalize(),
                new THREE.Quaternion(next.LocalRotation.X, next.LocalRotation.Y, next.LocalRotation.Z, next.LocalRotation.W).normalize(),
                blend,
              );
            }
          } else if (guidanceMode === 'pronation_supination') {
            // Fixed overhead camera: rotate a complete half-turn about the
            // forearm axis so palm-down and palm-up are both clearly shown.
            displayRoot.rotation.y += (side === 'LEFT' ? -1 : 1) * wave * Math.PI;
          } else if (guidanceMode === 'circumduction') {
            // A complete clockwise circle followed by the same path in the
            // anticlockwise direction. The cosine-shaped orbit angle eases
            // naturally at each reversal instead of snapping direction.
            const orbitAngle = Math.PI * (1 - Math.cos(cycle));
            displayRoot.rotation.x += Math.sin(orbitAngle) * 0.46;
            displayRoot.rotation.y += Math.cos(orbitAngle) * 0.46;
          }

          // Hand open/close animates between the two poses. Circumduction
          // holds the same hand in a comfortable closed-fist pose throughout
          // the wrist circle. Calibration without frames opens and closes smoothly.
          if (guidanceMode === 'hand_open_close' || guidanceMode === 'circumduction' || (guidanceMode === 'calibration' && !calibrationFrames.length)) {
            const curl = guidanceMode === 'circumduction' ? 1 : (guidanceMode === 'calibration' ? (1 - wave) : wave);
            for (const [jointName, rigBone] of rigBones) {
              if (!/(index|middle|ring|pinky)_(cmc|mcp|pip|dip)/.test(jointName)) continue;
              const amount = curl * (jointName.endsWith('_cmc') ? 0.14 : jointName.endsWith('_mcp') ? 1.02 : jointName.endsWith('_pip') ? 1.2 : 0.82);
              const axis = new THREE.Vector3(-1, 0, 0);
              rigBone.target.copy(rigBone.rest).multiply(new THREE.Quaternion().setFromAxisAngle(axis, amount));
              rigBone.bone.quaternion.slerp(rigBone.target, 0.18);
            }
          }
        } else for (const joint of jointRef.current ?? []) {
          const rigBone = rigBones.get(joint.name.toLowerCase());
          if (!rigBone) continue;

          // Match JointVisualiserBase.UpdateJointVisuals from the Unity SDK.
          // Unity calls SetLocalPositionAndRotation with the received joint
          // transform, so these are absolute local transforms—not deltas to
          // multiply into the FBX bind pose. FBXLoader keeps the FBX's source
          // coordinate convention, which is also the convention emitted by
          // the Python SDK. Only the FBX centimetre-to-OSC-metre unit scale is
          // required here (verified against the package's BoneTransforms).
          const incoming = new THREE.Quaternion(
            joint.orientation.x,
            joint.orientation.y,
            joint.orientation.z,
            joint.orientation.w,
          ).normalize();
          rigBone.target.copy(incoming);
          rigBone.bone.position.set(
            joint.position.x * 100,
            joint.position.y * 100,
            joint.position.z * 100,
          );
          rigBone.bone.quaternion.copy(rigBone.target);
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      gloveTexture?.dispose();
      renderer.domElement.remove();
    };
  }, [side, guidanceMode]);

  const waitingForData = !guidanceMode && !joints?.length;
  return (
    <div className={`hand-viewport live-rig mesh-rig ${guidanceMode ? 'guidance-rig' : ''}`} aria-label={guidanceMode ? 'Exercise guidance animation' : `${side.toLowerCase()} hand live 3D rig`}>
      <div className="viewport-grid" />
      <div ref={mountRef} className="hand-canvas" />
      {status !== 'ready' && (
        <div className="rig-waiting">
          <Hand />
          <strong>{status === 'error' ? 'Hand model unavailable' : status === 'loading' ? 'Loading 3D hand' : 'Waiting for kinematic data'}</strong>
          <span>Preparing the glove hand model</span>
        </div>
      )}
      {status === 'ready' && waitingForData && <span className="rig-stream-status">NEUTRAL POSE · WAITING FOR 26 JOINTS</span>}
      <span className="mesh-badge">{guidanceMode ? 'TOP VIEW · MOVEMENT GUIDE' : 'LIVE GLOVE'}</span>
      <span className="view-label">{status === 'ready' ? guidanceMode ? 'OVERHEAD VIEW · FULL MOVEMENT LOOP' : `${mappedBones} BONES · ${waitingForData ? 'MODEL READY' : 'LIVE'}` : '3D HAND RIG'}</span>
    </div>
  );
}
