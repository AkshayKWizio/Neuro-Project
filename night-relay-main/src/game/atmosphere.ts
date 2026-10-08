import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export type Weather = 'rain' | 'clear';

interface RainDrop {
  x: number;
  y: number;
  z: number;
  length: number;
  speed: number;
}

/** Wet reflections, rain, footfall splashes, and local light—all rendered in the scene. */
export class Atmosphere {
  private root = new THREE.Group();
  private rainGeometry = new THREE.BufferGeometry();
  private rainMaterial = new THREE.LineBasicMaterial({
    color: 0xbdd8ee,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  private rain: THREE.LineSegments;
  private drops: RainDrop[] = [];
  private positions = new Float32Array(480 * 6);
  private reflector: Reflector;
  private reflectionSurface: THREE.ShaderMaterial;
  private elapsed = 0;
  private distance = 0;
  private weather: Weather = 'rain';
  private splashGeometry = new THREE.RingGeometry(0.035, 0.055, 16);
  private splashMaterial = new THREE.MeshBasicMaterial({
    color: 0xa6d8e1,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private splashes: { mesh: THREE.Mesh; life: number }[] = [];
  private sprayGeometry = new THREE.SphereGeometry(0.025, 4, 3);
  private sprayMaterial = new THREE.MeshBasicMaterial({
    color: 0xc6e6f1,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  private spray = new THREE.InstancedMesh(this.sprayGeometry, this.sprayMaterial, 128);
  private sprayParticles: {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    bounced: boolean;
  }[] = [];
  private sprayTransform = new THREE.Object3D();
  private lampLights: THREE.PointLight[] = [];
  private headLights: THREE.SpotLight[] = [];
  private lastStep = 0;
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(private scene: THREE.Scene) {
    scene.add(this.root);
    this.spray.count = 0;
    this.spray.frustumCulled = false;
    this.spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.spray);
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rain.frustumCulled = false;
    this.root.add(this.rain);
    for (let i = 0; i < 480; i++)
      this.drops.push({
        x: (Math.random() - 0.5) * 24,
        y: Math.random() * 20,
        z: 16 - Math.random() * 95,
        length: 0.12 + Math.random() * 0.22,
        speed: 9 + Math.random() * 7,
      });

    const shader = {
      name: 'NightlineWetPavement',
      uniforms: {
        tDiffuse: { value: null },
        color: { value: new THREE.Color(0x7a8c9a) },
        textureMatrix: { value: new THREE.Matrix4() },
        time: { value: 0 },
        distance: { value: 0 },
        wetness: { value: 1 },
      },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vReflection; varying vec3 vWorld;
        void main(){ vReflection=textureMatrix*vec4(position,1.); vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float distance; uniform float wetness;
        varying vec4 vReflection; varying vec3 vWorld;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec2 p=vec2(vWorld.x,vWorld.z-distance);
          float patches=noise(p*vec2(1.25,.27))*.65+noise(p*vec2(3.,.7))*.35;
          float puddle=smoothstep(.35,.72,patches);
          float sidewalk=smoothstep(5.45,5.7,abs(vWorld.x));
          vec2 uv=vReflection.xy/vReflection.w;
          float ripples=sin(p.x*19.+time*2.)*sin(p.y*15.-time*2.7);
          uv+=vec2(sin(p.y*33.),ripples)*.0006*wetness;
          vec3 reflection=texture2D(tDiffuse,uv).rgb*.5;
          reflection+=texture2D(tDiffuse,uv+vec2(.0015,.002)).rgb*.25;
          reflection+=texture2D(tDiffuse,uv-vec2(.0015,.002)).rgb*.25;
          float fade=1.-smoothstep(55.,105.,-vWorld.z);
          float alpha=(.035+puddle*.36+sidewalk*.08)*fade;
          gl_FragColor=vec4(reflection*vec3(.86,.96,1.03),alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    };
    this.reflector = new Reflector(new THREE.PlaneGeometry(18, 150), {
      textureWidth: 768,
      textureHeight: 768,
      clipBias: 0.003,
      multisample: 0,
      shader,
    });
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.set(0, 0.14, -52);
    this.reflector.renderOrder = 2;
    const surface = this.reflector.material;
    if (!(surface instanceof THREE.ShaderMaterial))
      throw new Error('Wet pavement requires a shader material.');
    this.reflectionSurface = surface;
    surface.transparent = true;
    surface.depthWrite = false;
    this.root.add(this.reflector);

    for (const side of [-1, 1])
      for (let i = 0; i < 2; i++) {
        const light = new THREE.PointLight(0xffb862, 24, 12, 2);
        light.position.set(side * 6.05, 4.9, -4 - i * 12);
        this.root.add(light);
        this.lampLights.push(light);
      }
    for (const side of [-1, 1]) {
      const light = new THREE.SpotLight(0xe1eeff, 28, 22, Math.PI / 5, 0.7, 1.6);
      light.position.set(side * 0.85, 1.1, -20);
      light.target.position.set(side * 0.85, 0.05, 1);
      this.root.add(light, light.target);
      this.headLights.push(light);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(0,0,0,.7)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 1.25),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, 0.19, 3);
    this.shadow.renderOrder = 3;
    this.root.add(this.shadow);
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
    this.rain.visible = weather === 'rain';
  }
  setQuality(quality: 'high' | 'balanced'): void {
    this.reflector.visible = quality === 'high';
    this.rainGeometry.setDrawRange(0, quality === 'high' ? 960 : 360);
  }

  splash(x: number, z: number, strength = 1): void {
    if (this.weather !== 'rain') return;
    for (let i = 0; i < (strength > 1 ? 3 : 1); i++) {
      const mesh = new THREE.Mesh(this.splashGeometry, this.splashMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + (Math.random() - 0.5) * 0.25, 0.19, z + (Math.random() - 0.5) * 0.3);
      mesh.scale.setScalar(0.4);
      this.root.add(mesh);
      this.splashes.push({ mesh, life: 0.4 });
    }
    for (let i = 0; i < Math.ceil(5 * strength) && this.sprayParticles.length < 128; i++) {
      this.sprayParticles.push({
        position: new THREE.Vector3(x, 0.22, z),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2.6,
          1 + Math.random() * 1.8 * strength,
          (Math.random() - 0.5) * 2,
        ),
        life: 0.45,
        bounced: false,
      });
    }
  }

  update(
    dt: number,
    speed: number,
    player: THREE.Vector3,
    running: boolean,
    nearTrain: THREE.Vector3 | null,
  ): void {
    this.elapsed += dt;
    this.distance += speed * dt;
    const surface = this.reflectionSurface;
    surface.uniforms.time.value = this.elapsed;
    surface.uniforms.distance.value = this.distance;
    surface.uniforms.wetness.value = this.weather === 'rain' ? 1 : 0.2;
    if (this.weather === 'rain') {
      for (let i = 0; i < this.drops.length; i++) {
        const drop = this.drops[i]!;
        drop.y -= drop.speed * dt;
        drop.x -= dt * 0.65;
        drop.z += speed * dt * 0.6;
        if (drop.y < 0.15) {
          drop.y = 16 + Math.random() * 5;
          drop.x = (Math.random() - 0.5) * 24;
        }
        if (drop.z > 18) drop.z = -78;
        const offset = i * 6;
        this.positions[offset] = drop.x;
        this.positions[offset + 1] = drop.y;
        this.positions[offset + 2] = drop.z;
        this.positions[offset + 3] = drop.x + 0.025;
        this.positions[offset + 4] = drop.y + drop.length;
        this.positions[offset + 5] = drop.z - 0.025;
      }
      this.rainGeometry.attributes.position.needsUpdate = true;
    }
    this.lampLights.forEach((light, i) => {
      light.position.z = 8 - (((i % 2) * 12 - this.distance + 240000) % 24);
    });
    this.headLights.forEach((light, i) => {
      light.visible = !!nearTrain;
      if (nearTrain) {
        light.position.set(nearTrain.x + (i ? -0.85 : 0.85), 1.4, nearTrain.z + 6.8);
        light.target.position.set(nearTrain.x + (i ? -0.85 : 0.85), 0.1, nearTrain.z + 22);
      }
    });
    this.shadow.position.x = player.x;
    this.shadow.scale.setScalar(1 + player.y * 0.24);
    this.shadow.material.opacity = 0.7 / (1 + player.y);
    if (running && player.y < 0.05 && this.elapsed - this.lastStep > 0.26) {
      this.lastStep = this.elapsed;
      this.splash(player.x + (Math.sin(this.elapsed * 12) > 0 ? 0.14 : -0.14), 3);
    }
    for (const splash of this.splashes) {
      splash.life -= dt;
      splash.mesh.position.z += speed * dt;
      splash.mesh.scale.setScalar((0.4 - splash.life) * 4 + 0.4);
    }
    this.splashes = this.splashes.filter((splash) => {
      if (splash.life <= 0) {
        this.root.remove(splash.mesh);
        return false;
      }
      return true;
    });
    this.sprayParticles = this.sprayParticles.filter((particle) => {
      particle.life -= dt;
      particle.velocity.y -= 12 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      particle.position.z += speed * dt;
      if (particle.position.y < 0.19) {
        if (particle.bounced) return false;
        particle.position.y = 0.19;
        particle.velocity.y = Math.abs(particle.velocity.y) * 0.3;
        particle.bounced = true;
      }
      return particle.life > 0;
    });
    this.spray.count = this.sprayParticles.length;
    this.sprayParticles.forEach((particle, index) => {
      this.sprayTransform.position.copy(particle.position);
      this.sprayTransform.scale.setScalar(Math.min(1, particle.life * 5));
      this.sprayTransform.updateMatrix();
      this.spray.setMatrixAt(index, this.sprayTransform.matrix);
    });
    this.spray.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.reflector.dispose();
    this.reflector.geometry.dispose();
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.splashGeometry.dispose();
    this.splashMaterial.dispose();
    this.spray.dispose();
    this.sprayGeometry.dispose();
    this.sprayMaterial.dispose();
    this.sprayParticles = [];
    this.shadow.material.map?.dispose();
    this.shadow.material.dispose();
    this.shadow.geometry.dispose();
    this.root.clear();
    this.splashes = [];
  }
}
