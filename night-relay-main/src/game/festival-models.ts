import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const shapes = new Map<string, THREE.BufferGeometry>();
const surfaces = new Map<string, THREE.MeshStandardMaterial>();

function shape(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let value = shapes.get(key);
  if (!value) {
    value = build();
    shapes.set(key, value);
  }
  return value;
}

function material(
  color: number,
  emission = 0,
  intensity = 0,
  metallic = 0.12,
): THREE.MeshStandardMaterial {
  const key = `${color}:${emission}:${intensity}:${metallic}`;
  let value = surfaces.get(key);
  if (!value) {
    value = new THREE.MeshStandardMaterial({
      color,
      emissive: emission,
      emissiveIntensity: intensity,
      metalness: metallic,
      roughness: 0.42,
    });
    surfaces.set(key, value);
  }
  return value;
}

function box(
  parent: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  surface: THREE.Material,
  radius = 0.03,
): THREE.Mesh {
  const key = `box:${size.join(':')}:${radius}`;
  const geometry = shape(
    key,
    () => new RoundedBoxGeometry(...size, 2, Math.min(radius, Math.min(...size) / 2)),
  );
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function prism(
  parent: THREE.Group,
  radius: number,
  height: number,
  position: [number, number, number],
  surface: THREE.Material,
  sides = 6,
): THREE.Mesh {
  const geometry = shape(
    `prism:${radius}:${height}:${sides}`,
    () => new THREE.CylinderGeometry(radius, radius, height, sides),
  );
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function screenTexture(color: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const context = canvas.getContext('2d')!;
  const accent = `#${new THREE.Color(color).getHexString()}`;
  context.fillStyle = accent;
  context.fillRect(0, 0, 512, 768);
  const glow = context.createRadialGradient(240, 370, 30, 260, 410, 460);
  glow.addColorStop(0, '#effff5');
  glow.addColorStop(0.26, '#d3fff1');
  glow.addColorStop(0.62, accent);
  glow.addColorStop(1, `#${new THREE.Color(color).multiplyScalar(0.48).getHexString()}`);
  context.fillStyle = glow;
  context.fillRect(0, 0, 512, 768);
  context.lineJoin = 'round';
  for (let layer = 0; layer < 8; layer += 1) {
    const r = 42 + layer * 24;
    context.strokeStyle = layer % 2 ? '#f1fff7' : '#17545b';
    context.lineWidth = layer % 2 ? 6 : 8;
    context.globalAlpha = 0.95 - layer * 0.035;
    context.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = (point * Math.PI) / 4 + Math.PI / 8 + layer * 0.05;
      const x = 256 + Math.cos(angle) * r,
        y = 382 + Math.sin(angle) * r;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.stroke();
  }
  context.globalAlpha = 1;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(256, 382, 20, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#e8fff7';
  context.lineWidth = 3;
  for (let ray = 0; ray < 16; ray += 1) {
    const angle = (ray * Math.PI) / 8;
    context.beginPath();
    context.moveTo(256 + Math.cos(angle) * 209, 382 + Math.sin(angle) * 209);
    context.lineTo(256 + Math.cos(angle) * 241, 382 + Math.sin(angle) * 241);
    context.stroke();
  }
  context.fillStyle = '#103d46';
  context.font = '700 24px sans-serif';
  context.textAlign = 'center';
  context.fillText('HIGGSFIELD', 256, 91);
  context.font = '700 42px sans-serif';
  context.fillText('LIGHT / 07', 256, 655);
  context.font = '600 17px sans-serif';
  context.fillText('REGISTAN • NIGHT RELAY', 256, 699);
  for (let y = 0; y < 768; y += 4) {
    context.fillStyle = '#00000014';
    context.fillRect(0, y, 512, 1);
  }
  const value = new THREE.CanvasTexture(canvas);
  value.colorSpace = THREE.SRGBColorSpace;
  value.anisotropy = 4;
  return value;
}

/** A sequence of faceted light-art monoliths on one stage footprint; never a vehicle. */
export function createInstallation(color: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Registan projection sculpture';
  const dark = material(0x263d49, color, 0.055, 0.48);
  const accent = material(color, color, 1.5, 0.25);
  const white = material(0xe3fff4, color, 0.4, 0.5);
  const screenMap = screenTexture(color);
  const screen = new THREE.MeshStandardMaterial({
    map: screenMap,
    emissiveMap: screenMap,
    emissive: 0xffffff,
    emissiveIntensity: 1.35,
    roughness: 0.17,
    metalness: 0.04,
  });
  const glass = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.64,
    transparent: true,
    opacity: 0.36,
    metalness: 0.25,
    roughness: 0.12,
    depthWrite: false,
  });
  box(group, [2.5, 0.23, 13.6], [0, 0.245, 0], dark, 0.09);
  // A solid spine communicates the complete collision volume between the taller fins.
  box(group, [1.82, 2.8, 12.8], [0, 1.85, 0], dark, 0.15);
  for (let index = 0; index < 6; index += 1) {
    const z = -5.58 + index * 2.23;
    const fin = box(group, [2.42, 3.44, 0.66], [0, 2.02, z], dark, 0.06);
    fin.rotation.z = index % 2 ? 0.055 : -0.055;
    for (const side of [-1, 1])
      box(group, [0.055, 3.48, 0.085], [side * 1.19, 2.03, z + 0.38], accent, 0.018);
    box(group, [2.2, 0.065, 0.09], [0, 3.79, z + 0.36], white, 0.013);
    for (const end of [-1, 1]) {
      const mesh = new THREE.Mesh(
        shape('installation-screen', () => new THREE.PlaneGeometry(2.12, 2.96)),
        screen,
      );
      mesh.position.set(0, 2.06, z + end * 0.348);
      if (end < 0) mesh.rotation.y = Math.PI;
      group.add(mesh);
    }
  }
  for (const side of [-1, 1]) box(group, [0.06, 0.07, 13.2], [side * 1.23, 0.4, 0], accent, 0.01);
  // A large crystal facet and luminous diagonal corners read as a light sculpture.
  for (const end of [-1, 1]) {
    // The solid spine reaches z=±6.4; its leading artwork must sit outside it.
    const face = new THREE.Mesh(
      shape('installation-end-art', () => new THREE.PlaneGeometry(2.16, 3.05)),
      screen,
    );
    face.position.set(0, 2.03, end * 6.44);
    if (end < 0) face.rotation.y = Math.PI;
    group.add(face);
    const crystal = new THREE.Mesh(
      shape('installation-prismatic-light', () => new THREE.OctahedronGeometry(1)),
      glass,
    );
    crystal.scale.set(0.86, 1.4, 0.13);
    crystal.position.set(0, 2.08, end * 6.51);
    group.add(crystal);
    for (const side of [-1, 1]) {
      const upper = box(group, [0.045, 1.55, 0.06], [side * 0.74, 2.77, end * 6.53], accent, 0.012);
      upper.rotation.z = -side * 0.49;
      const lower = box(group, [0.045, 1.55, 0.06], [side * 0.74, 1.39, end * 6.53], accent, 0.012);
      lower.rotation.z = side * 0.49;
    }
  }
  return group;
}

function directionPlate(kind: 'jump' | 'slide'): THREE.MeshStandardMaterial {
  const key = `direction:${kind}`;
  let value = surfaces.get(key);
  if (value) return value;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = kind === 'jump' ? '#173b40' : '#342844';
  context.fillRect(0, 0, 512, 128);
  context.strokeStyle = kind === 'jump' ? '#8cffdc' : '#ffb1b5';
  context.lineWidth = 10;
  const up = kind === 'jump';
  for (const x of [71, 440]) {
    context.beginPath();
    context.moveTo(x - 22, up ? 79 : 45);
    context.lineTo(x, up ? 48 : 76);
    context.lineTo(x + 22, up ? 79 : 45);
    context.stroke();
  }
  context.fillStyle = '#f4f3dc';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 40px sans-serif';
  context.fillText(up ? 'UP / OVER' : 'LOW / FLOW', 256, 68);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  value = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: map,
    emissive: 0xffffff,
    emissiveIntensity: 0.52,
    roughness: 0.5,
  });
  surfaces.set(key, value);
  return value;
}

/** Festival rigging remains legible at speed: cyan low block, coral overhead light bar. */
export function createFestivalBarrier(kind: 'jump' | 'slide'): THREE.Group {
  const group = new THREE.Group();
  group.name = kind === 'jump' ? 'Low projection plinth — leap' : 'Overhead light rig — duck';
  const dark = material(0x203844, 0, 0, 0.45),
    cream = material(0xd7e2d5, 0, 0, 0.38);
  const accent =
    kind === 'jump' ? material(0x91ffdc, 0x42d8ba, 0.9) : material(0xffb2ac, 0xff807e, 0.8);
  if (kind === 'jump') {
    box(group, [2.47, 0.88, 1.4], [0, 0.63, 0], dark, 0.09);
    box(group, [2.55, 0.13, 1.48], [0, 1.08, 0], accent, 0.025);
    for (const side of [-1, 1]) box(group, [0.13, 1.0, 1.45], [side * 1.16, 0.6, 0], cream, 0.025);
    for (const end of [-1, 1]) {
      const sign = new THREE.Mesh(
        shape('jump-sign', () => new THREE.PlaneGeometry(2.1, 0.52)),
        directionPlate(kind),
      );
      sign.position.set(0, 0.69, end * 0.716);
      if (end < 0) sign.rotation.y = Math.PI;
      group.add(sign);
    }
  } else {
    for (const side of [-1, 1]) {
      box(group, [0.17, 2.46, 0.56], [side * 1.24, 1.35, 0], dark, 0.035);
      box(group, [0.055, 2.1, 0.08], [side * 1.24, 1.48, 0.32], accent, 0.012);
      box(group, [0.39, 0.16, 0.87], [side * 1.24, 0.23, 0], cream, 0.025);
    }
    box(group, [2.65, 1.07, 0.68], [0, 1.825, 0], dark, 0.055);
    box(group, [2.52, 0.065, 0.72], [0, 1.29, 0], accent, 0.016);
    for (const end of [-1, 1]) {
      const sign = new THREE.Mesh(
        shape('slide-sign', () => new THREE.PlaneGeometry(2.34, 0.61)),
        directionPlate(kind),
      );
      sign.position.set(0, 1.85, end * 0.352);
      if (end < 0) sign.rotation.y = Math.PI;
      group.add(sign);
    }
  }
  return group;
}

/** A floating film frame around a faceted light fragment; no coin/disc silhouette. */
export function createLightFragment(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Cyan film-frame fragment';
  const cyan = material(0xabfff1, 0x46eec9, 1.25, 0.25),
    pink = material(0xedbcff, 0xb978fa, 0.65, 0.2);
  for (const side of [-1, 1]) {
    box(group, [0.075, 0.63, 0.065], [side * 0.255, 0, 0], cyan, 0.015);
    box(group, [0.56, 0.055, 0.065], [0, side * 0.34, 0], cyan, 0.013);
    for (let hole = 0; hole < 4; hole += 1)
      box(group, [0.05, 0.05, 0.078], [side * 0.255, -0.23 + hole * 0.15, 0], pink, 0.008);
  }
  const core = new THREE.Mesh(
    shape('light-fragment-core', () => new THREE.OctahedronGeometry(0.185)),
    pink,
  );
  core.rotation.z = Math.PI / 8;
  core.rotation.x = 0.2;
  group.add(core);
  group.rotation.y = -0.22;
  return group;
}

export function createRelayCharge(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Relay pulse capacitor';
  const pale = material(0xc0f7ff, 0x6ce8ff, 0.7, 0.5),
    teal = material(0x122e3d, 0x154754, 0.2, 0.4);
  prism(group, 0.39, 0.66, [0, 0, 0], teal, 6);
  for (let side = 0; side < 6; side += 1) {
    const angle = (side * Math.PI) / 3;
    const bar = box(
      group,
      [0.075, 0.55, 0.045],
      [Math.sin(angle) * 0.365, 0, Math.cos(angle) * 0.365],
      pale,
      0.013,
    );
    bar.rotation.y = angle;
  }
  prism(group, 0.44, 0.08, [0, -0.39, 0], pale, 6);
  prism(group, 0.44, 0.08, [0, 0.39, 0], pale, 6);
  const core = new THREE.Mesh(
    shape('charge-top', () => new THREE.OctahedronGeometry(0.2)),
    material(0xe7b9ff, 0x9c65d9, 0.7),
  );
  core.position.y = 0.61;
  group.add(core);
  return group;
}

/** Commissioned community canvas: the retained graffiti API attaches to its +X face. */
export function createMuralWall(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Higgsfield community canvas — Registan light festival';
  const cream = material(0xc3cfbf, 0, 0, 0.08),
    frame = material(0x193743, 0, 0, 0.48);
  const edge = material(0xa6efd7, 0x54c7bd, 0.23, 0.5);
  box(group, [0.17, 3.08, 11.36], [1.246, 1.98, 0.2], cream, 0.02);
  for (const z of [-5.53, 5.93]) box(group, [0.28, 3.42, 0.18], [1.21, 2.0, z], frame, 0.025);
  for (const y of [0.32, 3.67]) box(group, [0.3, 0.16, 11.64], [1.21, y, 0.2], frame, 0.02);
  box(group, [0.015, 0.035, 11.42], [1.369, 3.53, 0.2], edge, 0.005);
  for (const z of [-4.7, 5.1]) {
    box(group, [0.22, 0.44, 0.22], [1.19, 0.24, z], frame, 0.02);
    box(group, [1.9, 0.14, 0.79], [1.02, 0.18, z], frame, 0.035);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#143743';
  context.fillRect(0, 0, 1024, 96);
  context.font = '700 29px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#b9eed3';
  context.fillText('COMMUNITY CANVAS   /   REGISTAN LIGHT FESTIVAL', 512, 49);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    shape('community-canvas-plaque', () => new THREE.PlaneGeometry(6.5, 0.27)),
    new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: 0xffffff,
      emissiveIntensity: 0.18,
      roughness: 0.67,
    }),
  );
  plaque.rotation.y = Math.PI / 2;
  plaque.position.set(1.37, 0.49, 0.2);
  group.add(plaque);
  return group;
}
