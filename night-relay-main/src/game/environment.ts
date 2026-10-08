import * as THREE from 'three';

export interface Environment {
  update(delta: number, speed: number, elapsed: number): void;
  dispose(): void;
}

type Material = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
const BLOCK_LENGTH = 48;
const BLOCK_COUNT = 6;
const WORLD_LENGTH = BLOCK_LENGTH * BLOCK_COUNT;

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return (): number => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('Festival artwork requires a 2D canvas context.');
  return [element, context];
}

function star(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  rotation = Math.PI / 8,
): void {
  context.fillStyle = color;
  context.beginPath();
  for (let index = 0; index < 16; index += 1) {
    const angle = rotation + (index * Math.PI) / 8;
    const distance = index % 2 ? radius * 0.51 : radius;
    const px = x + Math.cos(angle) * distance,
      py = y + Math.sin(angle) * distance;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
}

/** Original eight-point rosettes and interlaced geometry, not scans of historic tilework. */
function mosaicCanvas(accent: string, seed: number): HTMLCanvasElement {
  const [element, context] = canvas(512, 512);
  const random = seededRandom(seed);
  context.fillStyle = '#153361';
  context.fillRect(0, 0, 512, 512);
  for (let row = -1; row < 5; row += 1) {
    for (let column = -1; column < 5; column += 1) {
      const x = column * 128 + 64,
        y = row * 128 + 64;
      context.strokeStyle = '#dfcfa0';
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(x, y - 88);
      context.lineTo(x + 88, y);
      context.lineTo(x, y + 88);
      context.lineTo(x - 88, y);
      context.closePath();
      context.stroke();
      star(context, x, y, 55, '#dbd1a7');
      star(context, x, y, 48, accent);
      star(context, x, y, 24, '#162b58', 0);
      star(context, x, y, 11, '#efe2b3', 0);
      for (const dx of [-64, 64]) {
        context.fillStyle = '#2b91a2';
        context.beginPath();
        context.arc(x + dx, y + 64, 12, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#d3c597';
        context.lineWidth = 2;
        context.stroke();
      }
    }
  }
  for (let index = 0; index < 15000; index += 1) {
    context.fillStyle = random() > 0.5 ? '#ffeaca12' : '#00162214';
    context.fillRect(random() * 512, random() * 512, random() * 2 + 0.6, random() * 2 + 0.6);
  }
  context.strokeStyle = '#152f4944';
  context.lineWidth = 0.7;
  for (let line = 0; line < 512; line += 16) {
    context.beginPath();
    context.moveTo(line, 0);
    context.lineTo(line, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, line);
    context.lineTo(512, line);
    context.stroke();
  }
  return element;
}

function stoneCanvas(): HTMLCanvasElement {
  const [element, context] = canvas(512, 512);
  const random = seededRandom(812);
  context.fillStyle = '#8d806a';
  context.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row += 1) {
    for (let col = -1; col < 5; col += 1) {
      const warmth = Math.floor(random() * 21);
      context.fillStyle = `rgb(${155 + warmth},${143 + warmth},${121 + warmth})`;
      const x = col * 128 + (row % 2) * 64;
      context.fillRect(x + 1.6, row * 64 + 1.6, 124.8, 60.8);
      context.fillStyle = '#ffefce22';
      context.fillRect(x + 3, row * 64 + 3, 121, 1.5);
    }
  }
  for (let index = 0; index < 16000; index += 1) {
    context.fillStyle = random() > 0.5 ? '#ffffff10' : '#342c2310';
    context.fillRect(random() * 512, random() * 512, 1 + random() * 3, 1 + random());
  }
  return element;
}

function pointedArch(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(-width / 2, height * 0.56);
  shape.bezierCurveTo(-width / 2, height * 0.73, -width * 0.24, height * 0.94, 0, height);
  shape.bezierCurveTo(
    width * 0.24,
    height * 0.94,
    width / 2,
    height * 0.73,
    width / 2,
    height * 0.56,
  );
  shape.lineTo(width / 2, 0);
  shape.closePath();
  return shape;
}

function archFrame(
  width: number,
  height: number,
  openingWidth: number,
  openingHeight: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const outer = new THREE.Shape();
  outer.moveTo(-width / 2, 0);
  outer.lineTo(width / 2, 0);
  outer.lineTo(width / 2, height);
  outer.lineTo(-width / 2, height);
  outer.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-openingWidth / 2, 0.035);
  hole.lineTo(-openingWidth / 2, openingHeight * 0.56);
  hole.bezierCurveTo(
    -openingWidth / 2,
    openingHeight * 0.73,
    -openingWidth * 0.24,
    openingHeight * 0.94,
    0,
    openingHeight,
  );
  hole.bezierCurveTo(
    openingWidth * 0.24,
    openingHeight * 0.94,
    openingWidth / 2,
    openingHeight * 0.73,
    openingWidth / 2,
    openingHeight * 0.56,
  );
  hole.lineTo(openingWidth / 2, 0.035);
  hole.closePath();
  outer.holes.push(hole);
  const value = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 20 });
  const uv = value.attributes.uv;
  for (let index = 0; index < uv.count; index += 1)
    uv.setXY(index, uv.getX(index) / width + 0.5, uv.getY(index) / height);
  return value;
}

/** Thousands of repeated stone, ceramic, and lantern details share material batches. */
class Batches {
  private items = new Map<THREE.BufferGeometry, Map<Material, THREE.Matrix4[]>>();
  private transform = new THREE.Object3D();
  add(
    geometry: THREE.BufferGeometry,
    material: Material,
    position: [number, number, number],
    scale: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ): void {
    let byMaterial = this.items.get(geometry);
    if (!byMaterial) {
      byMaterial = new Map();
      this.items.set(geometry, byMaterial);
    }
    let matrices = byMaterial.get(material);
    if (!matrices) {
      matrices = [];
      byMaterial.set(material, matrices);
    }
    this.transform.position.set(...position);
    this.transform.scale.set(...scale);
    this.transform.rotation.set(...rotation);
    this.transform.updateMatrix();
    matrices.push(this.transform.matrix.clone());
  }
  finish(group: THREE.Group): void {
    for (const [geometry, byMaterial] of this.items) {
      for (const [material, matrices] of byMaterial) {
        const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
  }
}

export function createEnvironment(scene: THREE.Scene): Environment {
  const root = new THREE.Group();
  root.name = 'Samarkand — Registan light festival';
  scene.add(root);
  scene.fog = new THREE.FogExp2(0x31445b, 0.0052);
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [],
    textures: THREE.Texture[] = [];
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => {
    geometries.push(value);
    return value;
  };
  const standard = (
    parameters: THREE.MeshStandardMaterialParameters,
  ): THREE.MeshStandardMaterial => {
    const value = new THREE.MeshStandardMaterial(parameters);
    materials.push(value);
    return value;
  };
  const basic = (parameters: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial => {
    const value = new THREE.MeshBasicMaterial(parameters);
    materials.push(value);
    return value;
  };
  const texture = (element: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture => {
    const value = new THREE.CanvasTexture(element);
    value.colorSpace = THREE.SRGBColorSpace;
    value.anisotropy = 4;
    value.wrapS = value.wrapT = THREE.RepeatWrapping;
    value.repeat.set(repeatX, repeatY);
    textures.push(value);
    return value;
  };
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const plane = geometry(new THREE.PlaneGeometry(1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 16));
  const taper = geometry(new THREE.CylinderGeometry(0.74, 1, 1, 20));
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));
  const cone = geometry(new THREE.ConeGeometry(1, 1, 12));
  const smallArch = geometry(new THREE.ShapeGeometry(pointedArch(1, 1), 16));
  const archBorder = geometry(archFrame(1.4, 1.7, 0.94, 1.42, 0.12));
  const domeProfile = [
    new THREE.Vector2(0, 1.43),
    new THREE.Vector2(0.11, 1.39),
    new THREE.Vector2(0.3, 1.26),
    new THREE.Vector2(0.55, 1.04),
    new THREE.Vector2(0.78, 0.78),
    new THREE.Vector2(0.94, 0.5),
    new THREE.Vector2(1, 0.23),
    new THREE.Vector2(0.98, 0),
  ];
  const domeSurface = new THREE.SplineCurve(domeProfile.reverse()).getPoints(36);
  const dome = geometry(new THREE.LatheGeometry(domeSurface, 48));
  const domeRib = geometry(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        domeSurface.map((point) => new THREE.Vector3(0, point.y, point.x + 0.007)),
      ),
      28,
      0.013,
      5,
      false,
    ),
  );
  const stoneMap = texture(stoneCanvas(), 3, 3),
    groundMap = texture(stoneCanvas(), 48, 88);
  const blueMap = texture(mosaicCanvas('#279da7', 438), 2, 3),
    goldMap = texture(mosaicCanvas('#bea66d', 112), 2, 3);
  const turquoiseMap = texture(mosaicCanvas('#29bdbe', 255), 3, 2),
    borderMap = texture(mosaicCanvas('#20aaab', 299), 1, 24);
  const sandstone = standard({ color: '#c9b48e', map: stoneMap, roughness: 0.88 });
  const paleStone = standard({ color: '#e2caa3', roughness: 0.82 });
  const tile = standard({
    map: blueMap,
    color: '#d5ffff',
    roughness: 0.38,
    metalness: 0.08,
    emissive: '#237f99',
    emissiveIntensity: 0.2,
  });
  const goldTile = standard({
    map: goldMap,
    color: '#ffebc2',
    roughness: 0.5,
    emissive: '#aa7940',
    emissiveIntensity: 0.13,
  });
  const turquoise = standard({
    color: '#39b7b7',
    map: turquoiseMap,
    roughness: 0.31,
    metalness: 0.14,
    emissive: '#13787f',
    emissiveIntensity: 0.16,
  });
  const deepBlue = standard({ color: '#101d39', roughness: 0.9 }),
    gold = standard({ color: '#d2af6d', roughness: 0.4, metalness: 0.68 });
  const wood = standard({ color: '#473323', roughness: 0.79 }),
    bronze = standard({ color: '#3b3935', roughness: 0.49, metalness: 0.65 });
  const foliage = standard({ color: '#315751', roughness: 0.92 }),
    darkFoliage = standard({ color: '#243f38', roughness: 0.96 });
  const glow = basic({ color: '#ffdab0' }),
    cyan = basic({ color: '#84ffe6' }),
    coral = basic({ color: '#ffa79c' }),
    lilac = basic({ color: '#ada7ff' });
  const ground = new THREE.Mesh(
    geometry(new THREE.PlaneGeometry(240, 440)),
    standard({ map: groundMap, roughness: 0.53, metalness: 0.06, color: '#cbb99d' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0.12, -120);
  ground.receiveShadow = true;
  root.add(ground);
  const paving = new Batches();
  const borderMaterial = standard({
    map: borderMap,
    color: '#b5e2d1',
    roughness: 0.56,
    metalness: 0.08,
  });
  for (const side of [-1, 1]) {
    paving.add(box, paleStone, [side * 6.16, 0.15, -116], [0.16, 0.08, 370]);
    paving.add(
      plane,
      borderMaterial,
      [side * 6.65, 0.163, -116],
      [0.78, 370, 1],
      [-Math.PI / 2, 0, 0],
    );
    paving.add(box, gold, [side * 7.14, 0.16, -116], [0.035, 0.027, 370]);
    paving.add(
      plane,
      borderMaterial,
      [side * 17.1, 0.163, -116],
      [1.1, 370, 1],
      [-Math.PI / 2, 0, 0],
    );
  }
  paving.finish(root);

  function addDome(batch: Batches, x: number, y: number, z: number, radius: number): void {
    batch.add(cylinder, sandstone, [x, y - 0.55, z], [radius * 0.91, 1.1, radius * 0.91]);
    batch.add(cylinder, tile, [x, y + 0.42, z], [radius * 0.86, 1.7, radius * 0.86]);
    batch.add(dome, turquoise, [x, y + 1.2, z], [radius, radius, radius]);
    for (let index = 0; index < 32; index += 1) {
      const angle = (index * Math.PI) / 16;
      batch.add(domeRib, turquoise, [x, y + 1.2, z], [radius, radius, radius], [0, angle, 0]);
    }
    batch.add(cylinder, gold, [x, y + radius * 1.43 + 1.8, z], [0.08, 1.7, 0.08]);
    batch.add(sphere, gold, [x, y + radius * 1.43 + 1.85, z], [0.25, 0.25, 0.25]);
  }

  function addMinaret(batch: Batches, x: number, z: number, height: number, radius: number): void {
    batch.add(cylinder, sandstone, [x, 0.6, z], [radius * 1.14, 1.2, radius * 1.14]);
    batch.add(taper, tile, [x, height / 2 + 0.7, z], [radius, height, radius]);
    for (let band = 0; band < 7; band += 1) {
      const y = 1.5 + (band * (height - 1)) / 7,
        r = radius * (1 - (y / height) * 0.23);
      batch.add(cylinder, band % 2 ? turquoise : goldTile, [x, y, z], [r * 1.02, 0.23, r * 1.02]);
    }
    batch.add(cylinder, goldTile, [x, height + 0.65, z], [radius * 0.95, 0.75, radius * 0.95]);
    batch.add(cylinder, sandstone, [x, height + 1.1, z], [radius * 1.01, 0.2, radius * 1.01]);
    batch.add(cylinder, deepBlue, [x, height + 1.8, z], [radius * 0.62, 1.3, radius * 0.62]);
    for (let pillar = 0; pillar < 8; pillar += 1) {
      const angle = (pillar * Math.PI) / 4;
      batch.add(
        cylinder,
        turquoise,
        [x + Math.sin(angle) * radius * 0.65, height + 1.8, z + Math.cos(angle) * radius * 0.65],
        [0.08, 1.4, 0.08],
      );
    }
    batch.add(cone, turquoise, [x, height + 2.75, z], [radius * 0.92, 1.1, radius * 0.92]);
    batch.add(sphere, gold, [x, height + 3.42, z], [0.13, 0.2, 0.13]);
  }

  function madrasa(
    label: string,
    width: number,
    portalHeight: number,
    variant: number,
  ): THREE.Group {
    const building = new THREE.Group();
    building.name = label;
    const batch = new Batches();
    const portalWidth = variant === 1 ? 17 : 19,
      archWidth = portalWidth * 0.58,
      archHeight = portalHeight * 0.74;
    const facade = variant === 1 ? goldTile : tile;
    batch.add(box, sandstone, [0, 6.3, -4.5], [width, 12.4, 11]);
    batch.add(box, facade, [0, 6.4, 1.12], [width - 0.45, 12.2, 0.28]);
    batch.add(box, paleStone, [0, 12.63, 1.2], [width + 0.2, 0.42, 0.67]);
    batch.add(box, turquoise, [0, 11.8, 1.4], [width, 0.32, 0.24]);
    const portal = geometry(archFrame(portalWidth, portalHeight, archWidth, archHeight, 3.4));
    batch.add(portal, facade, [0, 0.15, 0.4], [1, 1, 1]);
    batch.add(smallArch, deepBlue, [0, 0.18, 1.29], [archWidth * 0.997, archHeight, 1]);
    batch.add(smallArch, wood, [0, 0.2, 1.32], [archWidth * 0.43, archHeight * 0.56, 1]);
    batch.add(
      smallArch,
      goldTile,
      [0, archHeight * 0.57, 1.34],
      [archWidth * 0.32, archHeight * 0.32, 1],
    );
    // Raised courses frame a genuinely recessed pointed portal.
    for (const side of [-1, 1]) {
      batch.add(
        box,
        turquoise,
        [side * (portalWidth / 2 - 0.38), portalHeight / 2, 3.88],
        [0.24, portalHeight, 0.2],
      );
      batch.add(
        box,
        paleStone,
        [side * (portalWidth / 2 - 0.82), portalHeight / 2, 3.9],
        [0.1, portalHeight - 0.38, 0.18],
      );
      batch.add(
        box,
        goldTile,
        [side * (portalWidth / 2 - 1.23), portalHeight / 2, 3.93],
        [0.35, portalHeight - 0.76, 0.18],
      );
      batch.add(
        box,
        turquoise,
        [side * (archWidth / 2 + 0.12), archHeight * 0.285, 3.96],
        [0.22, archHeight * 0.57, 0.28],
      );
    }
    batch.add(box, goldTile, [0, portalHeight - 0.95, 3.94], [portalWidth - 1.7, 1.0, 0.2]);
    batch.add(box, paleStone, [0, portalHeight + 0.15, 2.13], [portalWidth + 0.25, 0.35, 4.0]);
    const outline = pointedArch(archWidth + 0.45, archHeight + 0.3).getPoints(28);
    for (let index = 1; index < outline.length - 1; index += 1) {
      const a = outline[index - 1],
        b = outline[index];
      if (a.y < archHeight * 0.5 || b.y < archHeight * 0.5) continue;
      batch.add(
        box,
        index % 4 ? turquoise : paleStone,
        [(a.x + b.x) / 2, (a.y + b.y) / 2 + 0.13, 4.0],
        [a.distanceTo(b) + 0.04, 0.26, 0.2],
        [0, 0, Math.atan2(b.y - a.y, b.x - a.x)],
      );
    }
    for (const side of [-1, 1]) {
      for (let bay = 0; bay < 4; bay += 1) {
        const x = side * (portalWidth / 2 + 2.5 + bay * 4.6);
        if (Math.abs(x) > width / 2 - 1.5) continue;
        for (let floor = 0; floor < 2; floor += 1) {
          const y = 0.55 + floor * 5.65;
          batch.add(archBorder, facade, [x, y, 1.39], [2.38, 2.88, 1]);
          batch.add(smallArch, deepBlue, [x, y + 0.17, 1.42], [2.18, 3.98, 1]);
          batch.add(smallArch, wood, [x, y + 0.25, 1.45], [1.26, 2.53, 1]);
          batch.add(box, gold, [x, y + 0.49, 1.48], [1.13, 0.035, 0.035]);
        }
      }
    }
    addMinaret(batch, -width / 2 + 0.3, 1.9, portalHeight * 0.86, 1.15);
    addMinaret(batch, width / 2 - 0.3, 1.9, portalHeight * 0.86, 1.15);
    if (variant === 1) addDome(batch, -portalWidth * 0.72, 12.8, -6, 7.2);
    else if (variant === 2) {
      addDome(batch, -portalWidth * 0.75, 12.5, -6.5, 4.7);
      addDome(batch, portalWidth * 0.75, 12.5, -6.5, 4.7);
    } else {
      addMinaret(batch, -width / 2 + 1.7, -13.6, portalHeight * 0.77, 1.05);
      addMinaret(batch, width / 2 - 1.7, -13.6, portalHeight * 0.77, 1.05);
    }
    batch.finish(building);
    return building;
  }

  const central = madrasa('Tillya-Kori inspired golden portal and turquoise dome', 61, 25, 1);
  central.position.set(0, 0, -119);
  root.add(central);
  const west = madrasa('Ulugh Beg inspired stellar mosaic portal', 52, 30, 0);
  west.position.set(-47, 0, -80);
  west.rotation.y = 0.72;
  root.add(west);
  const east = madrasa('Sher-Dor inspired paired domes and grand portal', 52, 30, 2);
  east.position.set(47, 0, -80);
  east.rotation.y = -0.72;
  root.add(east);
  for (const [x, z, color] of [
    [-47, -52, '#86d5df'],
    [0, -86, '#ffcb85'],
    [47, -52, '#8bf2dd'],
  ] as const) {
    const light = new THREE.PointLight(color, 150, 95, 1.4);
    light.position.set(x, 11, z);
    root.add(light);
  }

  const [bannerCanvas, bannerContext] = canvas(256, 640);
  bannerContext.fillStyle = '#152936';
  bannerContext.fillRect(0, 0, 256, 640);
  bannerContext.strokeStyle = '#62dec9';
  bannerContext.lineWidth = 8;
  bannerContext.strokeRect(13, 15, 230, 610);
  star(bannerContext, 128, 130, 57, '#b9edca');
  star(bannerContext, 128, 130, 27, '#122c3d', 0);
  bannerContext.textAlign = 'center';
  bannerContext.fillStyle = '#f7e7c5';
  bannerContext.font = '700 27px sans-serif';
  bannerContext.fillText('HIGGSFIELD', 128, 256);
  bannerContext.font = '700 44px sans-serif';
  bannerContext.fillText('NIGHT', 128, 334);
  bannerContext.fillText('RELAY', 128, 387);
  bannerContext.font = '500 18px sans-serif';
  bannerContext.fillStyle = '#8bf0da';
  bannerContext.fillText('SAMARKAND', 128, 465);
  bannerContext.fillText('LIGHT FESTIVAL', 128, 500);
  const banner = standard({
    map: texture(bannerCanvas),
    roughness: 0.8,
    side: THREE.DoubleSide,
    emissive: '#6d7d67',
    emissiveIntensity: 0.13,
  });
  const [poolCanvas, poolContext] = canvas(128, 128);
  const radial = poolContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  radial.addColorStop(0, '#ffdfb677');
  radial.addColorStop(0.42, '#ffc07c28');
  radial.addColorStop(1, '#ffc07c00');
  poolContext.fillStyle = radial;
  poolContext.fillRect(0, 0, 128, 128);
  const pool = basic({
    map: texture(poolCanvas),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const medallion = geometry(new THREE.CircleGeometry(1, 8));
  const blocks: THREE.Group[] = [];
  for (let blockIndex = 0; blockIndex < BLOCK_COUNT; blockIndex += 1) {
    const block = new THREE.Group();
    block.name = `Festival promenade ${blockIndex + 1}`;
    const batch = new Batches();
    for (const side of [-1, 1]) {
      const x = side * 22.8;
      // Low arcades leave the three monumental portals visible above them.
      batch.add(box, sandstone, [x + side * 3.1, 3.75, -24], [6.5, 7.5, 47.6]);
      batch.add(box, turquoise, [x - side * 0.23, 7.36, -24], [0.4, 0.3, 47.6]);
      batch.add(box, paleStone, [x - side * 0.32, 7.75, -24], [0.56, 0.25, 48]);
      for (let bay = 0; bay < 7; bay += 1) {
        const z = -3.2 - bay * 6.9;
        batch.add(
          smallArch,
          deepBlue,
          [x - side * 0.23, 0.3, z],
          [4.25, 5.7, 1],
          [0, (-side * Math.PI) / 2, 0],
        );
        batch.add(
          archBorder,
          tile,
          [x - side * 0.35, 0.28, z],
          [4.2, 3.87, 1],
          [0, (-side * Math.PI) / 2, 0],
        );
        batch.add(
          smallArch,
          wood,
          [x - side * 0.41, 0.42, z],
          [2.2, 3.65, 1],
          [0, (-side * Math.PI) / 2, 0],
        );
      }
      for (let index = 0; index < 4; index += 1) {
        const z = -3 - index * 12,
          lampX = side * 7.85;
        batch.add(cylinder, bronze, [lampX, 1.55, z], [0.05, 2.86, 0.05]);
        batch.add(cylinder, gold, [lampX, 0.25, z], [0.18, 0.26, 0.18]);
        batch.add(cylinder, gold, [lampX, 2.76, z], [0.28, 0.13, 0.28]);
        batch.add(sphere, glow, [lampX, 3.13, z], [0.21, 0.33, 0.21]);
        batch.add(cone, gold, [lampX, 3.52, z], [0.32, 0.35, 0.32]);
        for (let rib = 0; rib < 6; rib += 1) {
          const angle = (rib * Math.PI) / 3;
          batch.add(
            cylinder,
            bronze,
            [lampX + Math.cos(angle) * 0.21, 3.13, z + Math.sin(angle) * 0.21],
            [0.012, 0.65, 0.012],
          );
        }
        batch.add(plane, pool, [lampX, 0.17, z], [6.5, 7.5, 1], [-Math.PI / 2, 0, 0]);
        batch.add(box, sandstone, [side * 12.2, 0.33, z - 4], [3.3, 0.45, 3.6]);
        batch.add(box, foliage, [side * 12.2, 0.7, z - 4], [2.9, 0.4, 3.2]);
        batch.add(cone, darkFoliage, [side * 12.2, 2.3, z - 4], [0.75, 3.1, 0.75]);
        batch.add(cone, foliage, [side * 12.2, 3.0, z - 4], [0.55, 2.5, 0.55]);
        batch.add(box, wood, [side * 9.8, 0.62, z + 2.1], [1.3, 0.19, 2.3]);
        batch.add(box, gold, [side * 9.8, 0.3, z + 1.2], [0.8, 0.6, 0.08]);
        batch.add(box, gold, [side * 9.8, 0.3, z + 3], [0.8, 0.6, 0.08]);
        batch.add(box, index % 2 ? cyan : coral, [side * 5.8, 0.185, z], [0.12, 0.04, 0.26]);
      }
      for (const z of [-11, -35]) {
        batch.add(cylinder, gold, [side * 10.6, 3.05, z], [0.035, 6, 0.035]);
        batch.add(box, gold, [side * 10.03, 5.99, z], [1.23, 0.06, 0.06]);
        batch.add(plane, banner, [side * 10.03, 4.49, z], [1.09, 2.83, 1]);
      }
      for (let lantern = 0; lantern < 9; lantern += 1) {
        const z = -1 - lantern * 5.5,
          y = 5.8 + Math.sin(lantern * 0.78) * 0.35;
        batch.add(
          sphere,
          lantern % 3 === 0 ? coral : lantern % 3 === 1 ? cyan : lilac,
          [side * 15.7, y, z],
          [0.19, 0.29, 0.19],
        );
        batch.add(cylinder, gold, [side * 15.7, y + 0.4, z], [0.012, 0.25, 0.012]);
        batch.add(
          box,
          bronze,
          [side * 15.7, y + 0.54, z - 2.72],
          [0.015, 0.015, 5.55],
          [Math.sin(lantern * 0.5) * 0.03, 0, 0],
        );
      }
    }
    for (const z of [-12, -36])
      batch.add(
        medallion,
        borderMaterial,
        [0, 0.162, z],
        [2.2, 2.2, 1],
        [-Math.PI / 2, 0, Math.PI / 8],
      );
    batch.finish(block);
    root.add(block);
    blocks.push(block);
  }
  const skyline = new Batches(),
    random = seededRandom(970);
  for (let index = 0; index < 40; index += 1) {
    const x = -135 + index * 6.9,
      height = 3 + random() * 5;
    skyline.add(
      box,
      sandstone,
      [x, height / 2, -151 - random() * 17],
      [5 + random() * 4, height, 10],
    );
  }
  skyline.finish(root);
  let distance = 0;
  return {
    update(delta: number, speed: number, _elapsed: number): void {
      distance += speed * delta;
      groundMap.offset.y = -(distance / 5) % 1;
      borderMap.offset.y = -(distance / 15.4) % 1;
      for (let index = 0; index < blocks.length; index += 1)
        blocks[index].position.z =
          48 - ((index * BLOCK_LENGTH - distance + WORLD_LENGTH * 10000) % WORLD_LENGTH);
    },
    dispose(): void {
      root.removeFromParent();
      for (const value of geometries) value.dispose();
      for (const value of materials) value.dispose();
      for (const value of textures) value.dispose();
    },
  };
}
