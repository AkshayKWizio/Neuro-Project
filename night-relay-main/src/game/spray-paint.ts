import * as THREE from 'three';

/** A short cone of paint droplets between the nozzle and the final dot. */
export class SprayPaint {
  private geometry = new THREE.BufferGeometry();
  private positions = new Float32Array(64 * 3);
  private material = new THREE.PointsMaterial({
    color: 0xd9ff9b,
    size: 0.025,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  readonly points: THREE.Points;

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(time: number, active: boolean, nozzle: THREE.Vector3, target: THREE.Vector3): void {
    this.points.visible = active;
    if (!active) return;
    for (let i = 0; i < 64; i++) {
      const travel = (time * 5 + i / 64) % 1;
      const radius = 0.005 + travel * 0.047;
      const angle = i * 2.39996;
      this.positions[i * 3] = THREE.MathUtils.lerp(nozzle.x, target.x, travel);
      this.positions[i * 3 + 1] =
        THREE.MathUtils.lerp(nozzle.y, target.y, travel) + Math.sin(angle) * radius;
      this.positions[i * 3 + 2] =
        THREE.MathUtils.lerp(nozzle.z, target.z, travel) + Math.cos(angle) * radius;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
