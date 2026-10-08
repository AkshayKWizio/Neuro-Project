import * as THREE from 'three';

/** Mural-wall-local coordinates: the +X side faces the runner in the opening scene. */
export const GRAFFITI_DOT = Object.freeze({ x: 1.365, y: 1.65, z: 3.7 });

export interface TrainGraffiti {
  group: THREE.Group;
  ready: Promise<void>;
  setFinish(progress: number): void;
  dispose(): void;
}

const WIDTH = 2048;
const HEIGHT = 512;
const WORLD_WIDTH = 10.8;
const WORLD_HEIGHT = 2.7;
const CENTER_Z = 0.2;
const CENTER_Y = 1.98;
const CREAM = '#fff4d5';
const INK = '#14272b';
const MINT = '#bbf567';
const CORAL = '#ff916e';

/** A seeded spray pattern keeps the artwork stable across reloads and rerenders. */
function randomSource(seed: number): () => number {
  let value = seed;
  return (): number => {
    value = Math.imul(value ^ (value >>> 15), 1 | value);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function circle(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function stroke(
  context: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  color: string,
  width: number,
): void {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  for (const [index, point] of points.entries()) {
    if (index === 0) context.moveTo(point[0], point[1]);
    else context.lineTo(point[0], point[1]);
  }
  context.stroke();
}

function star(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(0.16);
  context.fillStyle = color;
  context.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = (index * Math.PI) / 4;
    const radius = index % 2 ? size * 0.22 : size;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
  context.restore();
}

function phone(context: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.strokeStyle = INK;
  context.fillStyle = INK;
  context.lineWidth = 23;
  context.beginPath();
  context.roundRect(-43, -72, 86, 144, 17);
  context.stroke();
  context.fill();
  context.strokeStyle = CREAM;
  context.lineWidth = 7;
  context.stroke();
  stroke(
    context,
    [
      [-12, -57],
      [12, -57],
    ],
    CREAM,
    4,
  );
  stroke(
    context,
    [
      [-12, 57],
      [12, 57],
    ],
    CREAM,
    4,
  );
  context.fillStyle = MINT;
  context.beginPath();
  context.moveTo(-12, -24);
  context.lineTo(22, -4);
  context.lineTo(-12, 17);
  context.closePath();
  context.fill();
  star(context, 20, 28, 10, CORAL);
  context.restore();
}

function camera(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.save();
  context.translate(x, y);
  context.rotate(0.1);
  context.fillStyle = INK;
  context.strokeStyle = MINT;
  context.lineWidth = 6;
  context.beginPath();
  context.roundRect(-46, -27, 92, 61, 10);
  context.fill();
  context.stroke();
  stroke(
    context,
    [
      [-27, -27],
      [-20, -42],
      [13, -42],
      [22, -27],
    ],
    MINT,
    6,
  );
  context.beginPath();
  context.arc(0, 3, 19, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = CREAM;
  circle(context, 32, -12, 4);
  context.restore();
}

function drawArtwork(context: CanvasRenderingContext2D, logo?: HTMLImageElement): void {
  const random = randomSource(946501);
  context.clearRect(0, 0, WIDTH, HEIGHT);

  // Uneven aerosol underpainting, rather than a rectangular sticker or banner.
  for (let index = 0; index < 220; index += 1) {
    const x = 98 + random() * 1830;
    const y = 210 + Math.sin(x / 220) * 34 + (random() - 0.5) * 100;
    context.fillStyle = index % 5 === 0 ? '#59797336' : '#1536392a';
    context.beginPath();
    context.ellipse(x, y, 45 + random() * 92, 22 + random() * 43, -0.14, 0, Math.PI * 2);
    context.fill();
  }
  stroke(
    context,
    [
      [110, 242],
      [294, 179],
      [647, 220],
      [1030, 155],
      [1410, 186],
      [1844, 165],
    ],
    INK,
    100,
  );
  stroke(
    context,
    [
      [135, 290],
      [510, 318],
      [822, 283],
      [1215, 317],
      [1611, 274],
      [1880, 285],
    ],
    INK,
    69,
  );
  stroke(
    context,
    [
      [473, 345],
      [906, 349],
      [1321, 323],
      [1715, 333],
    ],
    MINT,
    18,
  );
  stroke(
    context,
    [
      [492, 367],
      [961, 368],
      [1534, 347],
    ],
    CORAL,
    4,
  );

  // Speckled overspray and gravity-led drips make the paint sit on wet metal.
  for (let index = 0; index < 1700; index += 1) {
    const x = 73 + random() * 1870;
    const y = 150 + random() * 241;
    context.fillStyle = index % 4 === 0 ? '#d3fa8766' : index % 3 === 0 ? '#182b3266' : '#ffffff44';
    circle(context, x, y, 0.4 + random() * 1.9);
  }
  for (let index = 0; index < 24; index += 1) {
    const x = 150 + random() * 1640;
    const y = 320 + random() * 25;
    const length = 13 + random() * 47;
    const color = index % 3 ? '#173335' : '#bbed71';
    stroke(
      context,
      [
        [x, y],
        [x + random() * 2, y + length],
      ],
      color,
      1.8 + random() * 2.8,
    );
    context.fillStyle = color;
    circle(context, x + 1, y + length, 2.1);
  }

  // The official glyph remains intact; the halo is original spray decoration.
  context.save();
  context.translate(243, 206);
  context.rotate(-0.11);
  context.strokeStyle = MINT;
  context.lineWidth = 12;
  context.beginPath();
  context.ellipse(0, 0, 121, 107, -0.3, 0.18, Math.PI * 1.86);
  context.stroke();
  stroke(
    context,
    [
      [-91, 62],
      [-105, 99],
      [-61, 89],
    ],
    MINT,
    9,
  );
  if (logo) context.drawImage(logo, -80, -79, 161, 161);
  context.restore();

  // Stacked offset passes imitate broad, slightly imperfect spray lettering.
  context.save();
  context.translate(462, 302);
  context.rotate(-0.025);
  context.font = 'italic 800 210px Barlow, Impact, sans-serif';
  context.textBaseline = 'alphabetic';
  context.lineJoin = 'round';
  const width = context.measureText('HIGGSFIELD').width;
  context.scale(1410 / width, 1);
  context.strokeStyle = INK;
  context.lineWidth = 25;
  context.strokeText('HIGGSFIELD', 0, 0);
  context.strokeStyle = CORAL;
  context.lineWidth = 9;
  context.strokeText('HIGGSFIELD', 5, 8);
  context.fillStyle = MINT;
  context.fillText('HIGGSFIELD', 5, 7);
  const fill = context.createLinearGradient(0, -170, 0, 10);
  fill.addColorStop(0, '#ffffed');
  fill.addColorStop(0.52, '#fff3d0');
  fill.addColorStop(1, '#dbffa4');
  context.fillStyle = fill;
  context.fillText('HIGGSFIELD', 0, 0);
  context.restore();

  phone(context, 1610, 113, 0.2);
  phone(context, 1790, 389, -0.25);
  camera(context, 1149, 91);
  star(context, 1425, 96, 25, CORAL);
  star(context, 1950, 241, 33, MINT);
  star(context, 422, 156, 19, CREAM);
  stroke(
    context,
    [
      [1693, 76],
      [1720, 66],
      [1707, 42],
      [1742, 54],
    ],
    CORAL,
    6,
  );
  stroke(
    context,
    [
      [1910, 351],
      [1941, 337],
      [1931, 368],
    ],
    CREAM,
    7,
  );

  // The runner completes this period; its separate mesh is controlled by setFinish.
  const dotX = WIDTH * (0.5 + (CENTER_Z - GRAFFITI_DOT.z) / WORLD_WIDTH);
  const dotY = HEIGHT * (0.5 + (CENTER_Y - GRAFFITI_DOT.y) / WORLD_HEIGHT);
  context.save();
  context.font = 'italic 800 35px Barlow, Impact, sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'alphabetic';
  context.strokeStyle = INK;
  context.lineWidth = 8;
  context.strokeText('NIGHT RELAY', dotX - 12, dotY + 5);
  context.fillStyle = CREAM;
  context.fillText('NIGHT RELAY', dotX - 12, dotY + 5);
  context.restore();

  context.save();
  context.font = '700 18px Manrope, sans-serif';
  context.fillStyle = CREAM;
  context.globalAlpha = 0.88;
  context.fillText('SAMARKAND / MAKE YOUR OWN REALITY', 759, 411);
  context.restore();

  // A few tiny missing paint flecks retain the wall's underlying panel texture.
  context.globalCompositeOperation = 'destination-out';
  for (let index = 0; index < 1100; index += 1) {
    context.fillStyle = `rgba(0,0,0,${0.2 + random() * 0.5})`;
    context.fillRect(
      95 + random() * 1840,
      132 + random() * 220,
      0.7 + random() * 1.6,
      0.6 + random() * 1.3,
    );
  }
  context.globalCompositeOperation = 'source-over';
}

function loadLogo(): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = (): void => resolve(image);
    image.onerror = (): void => resolve(undefined);
    image.src = `${import.meta.env.BASE_URL}branding/higgsfield-mark.svg`;
  });
}

/** Two transparent planes, no per-frame canvas uploads, and no remote runtime requests. */
export function createTrainGraffiti(): TrainGraffiti {
  const group = new THREE.Group();
  group.name = 'Higgsfield Night Relay — community mural';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Festival mural requires a 2D canvas context.');
  drawArtwork(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.035,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0,
    emissive: '#d7e1b4',
    emissiveMap: texture,
    emissiveIntensity: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const geometry = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT);
  const paint = new THREE.Mesh(geometry, material);
  paint.name = 'Higgsfield sprayed wordmark and creative icons';
  paint.rotation.y = Math.PI / 2;
  paint.position.set(1.362, CENTER_Y, CENTER_Z);
  paint.receiveShadow = true;
  group.add(paint);

  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = 96;
  dotCanvas.height = 96;
  const dotContext = dotCanvas.getContext('2d')!;
  const random = randomSource(914);
  const halo = dotContext.createRadialGradient(48, 48, 5, 48, 48, 38);
  halo.addColorStop(0, '#e7ffb2');
  halo.addColorStop(0.38, '#d6ff97');
  halo.addColorStop(0.6, '#c2ff6bb0');
  halo.addColorStop(1, '#c2ff6b00');
  dotContext.fillStyle = halo;
  circle(dotContext, 48, 48, 38);
  dotContext.fillStyle = '#eaffbb';
  circle(dotContext, 48, 48, 14);
  for (let index = 0; index < 80; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 14 + random() * 27;
    dotContext.fillStyle = `rgba(220,255,164,${random() * 0.6})`;
    circle(
      dotContext,
      48 + Math.cos(angle) * radius,
      48 + Math.sin(angle) * radius,
      0.6 + random(),
    );
  }
  const dotTexture = new THREE.CanvasTexture(dotCanvas);
  dotTexture.colorSpace = THREE.SRGBColorSpace;
  const dotMaterial = new THREE.MeshStandardMaterial({
    map: dotTexture,
    transparent: true,
    depthWrite: false,
    roughness: 0.64,
    emissive: '#cfff84',
    emissiveMap: dotTexture,
    emissiveIntensity: 0.24,
  });
  const dotGeometry = new THREE.PlaneGeometry(0.23, 0.23);
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  dot.name = 'Final sprayed period';
  dot.position.set(GRAFFITI_DOT.x, GRAFFITI_DOT.y, GRAFFITI_DOT.z);
  dot.rotation.y = Math.PI / 2;
  dot.visible = false;
  group.add(dot);

  let disposed = false;
  const ready = Promise.all([
    loadLogo(),
    document.fonts.load('italic 800 210px Barlow').catch(() => []),
    document.fonts.load('700 18px Manrope').catch(() => []),
  ]).then(([logo]): void => {
    if (disposed) return;
    drawArtwork(context, logo);
    texture.needsUpdate = true;
  });

  return {
    group,
    ready,
    setFinish(progress: number): void {
      const amount = THREE.MathUtils.clamp(progress, 0, 1);
      dot.visible = amount > 0;
      dot.scale.setScalar(0.22 + Math.sqrt(amount) * 0.78);
      dotMaterial.opacity = Math.min(1, amount * 2.2);
    },
    dispose(): void {
      disposed = true;
      group.removeFromParent();
      texture.dispose();
      dotTexture.dispose();
      material.dispose();
      dotMaterial.dispose();
      geometry.dispose();
      dotGeometry.dispose();
    },
  };
}
