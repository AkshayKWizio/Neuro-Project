import * as THREE from 'three';

/** An original flying film camera; a festival companion, with no pursuit behavior. */
export function createRelayDrone(): {
  group: THREE.Group;
  animate: (elapsed: number, recording: boolean, pulse: boolean) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const shell = new THREE.MeshStandardMaterial({
    color: 0xffe0b7,
    roughness: 0.38,
    metalness: 0.45,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x132b41, roughness: 0.24, metalness: 0.7 });
  const light = new THREE.MeshBasicMaterial({ color: 0x76ffdf, toneMapped: false });
  const lens = new THREE.MeshStandardMaterial({
    color: 0x094653,
    metalness: 0.8,
    roughness: 0.08,
    emissive: 0x27dfd0,
    emissiveIntensity: 0.65,
  });
  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh => {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    body.add(item);
    return item;
  };
  const core = mesh(new THREE.SphereGeometry(0.3, 20, 12), shell, 0, 0, 0);
  core.scale.set(1.35, 0.7, 1);
  mesh(new THREE.BoxGeometry(0.38, 0.24, 0.25), dark, 0, -0.06, 0.24);
  const glass = mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.16, 20), lens, 0, -0.055, 0.42);
  glass.rotation.x = Math.PI / 2;
  const iris = mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 24), light, 0, -0.055, 0.51);
  const rotors: THREE.Mesh[] = [];
  for (const x of [-0.48, 0.48]) {
    mesh(new THREE.BoxGeometry(0.35, 0.035, 0.07), dark, x * 0.8, 0.03, 0);
    const guard = mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 24), shell, x, 0.08, 0);
    guard.rotation.x = Math.PI / 2;
    const rotor = mesh(new THREE.BoxGeometry(0.42, 0.013, 0.065), light, x, 0.08, 0);
    rotors.push(rotor);
  }
  const tally = mesh(new THREE.SphereGeometry(0.035, 8, 6), light, 0.18, 0.12, 0.19);
  const lamp = new THREE.PointLight(0x7af8de, 2, 4, 2);
  lamp.position.set(0, -0.1, 0.1);
  body.add(lamp);
  return {
    group,
    animate(elapsed, recording, pulse): void {
      body.position.y = Math.sin(elapsed * 2.8) * 0.06;
      body.rotation.z = Math.sin(elapsed * 1.7) * 0.055;
      rotors.forEach((rotor, index) => {
        rotor.rotation.y = elapsed * (index ? -45 : 45);
      });
      tally.visible = recording && Math.sin(elapsed * 5) > -0.25;
      light.color.setHex(pulse ? 0xff9ac8 : 0x76ffdf);
      iris.scale.setScalar(1 + (pulse ? Math.sin(elapsed * 18) * 0.16 : 0));
      lamp.intensity = pulse ? 5 : 2;
    },
    dispose(): void {
      body.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      shell.dispose();
      dark.dispose();
      light.dispose();
      lens.dispose();
    },
  };
}
