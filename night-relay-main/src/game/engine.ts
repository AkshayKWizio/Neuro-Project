import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createEnvironment } from './environment';
import {
  createInstallation,
  createFestivalBarrier,
  createLightFragment,
  createRelayCharge,
  createMuralWall,
} from './festival-models';
import {
  getRunSpeed,
  hitsObstacle,
  crossedObstacle,
  ROUTE_FIRST_DISTANCE,
  ROUTE_OPENING_COINS,
  type ObstacleKind,
} from './rules';
import { GameAudio } from './audio';
import { Atmosphere, type Weather } from './atmosphere';
import { RunProgress, type RunObjective } from './progression';
import { getDistrict, planRouteRow, routeRowGap } from './route';
import { createHumanRunner } from './human-runner';
import { createRelayDrone } from './relay-drone';
import { RelayPulse, PULSE_SECONDS } from './relay-pulse';
import { createTrainGraffiti, GRAFFITI_DOT } from './train-graffiti';
import { INTRO_TIMING, sampleIntroCamera } from './intro-camera';
import { SprayPaint } from './spray-paint';

export type GameMode = 'menu' | 'intro' | 'countdown' | 'playing' | 'paused' | 'over';
export type Action = 'left' | 'right' | 'jump' | 'slide' | 'pulse';
export interface GameSnapshot {
  mode: GameMode;
  distance: number;
  coins: number;
  score: number;
  speed: number;
  shield: number;
  pulseCharge: number;
  pulseReady: boolean;
  countdown: number;
  best: number;
  fps: number;
  multiplier: number;
  streak: number;
  comboRemaining: number;
  runSeconds: number;
  humanReady: boolean;
  introText: string;
  nearMisses: number;
  cleanMoves: number;
  peakFlow: number;
  objectives: RunObjective[];
  district: string;
  crashReason: string;
}
type EntityKind = ObstacleKind | 'coin' | 'powerup';
interface Entity {
  object: THREE.Group;
  kind: EntityKind;
  collected: boolean;
  previousZ: number;
  pickupHeight: number;
  express: boolean;
  warned: boolean;
  scored: boolean;
  nearMiss: boolean;
  clean: boolean;
  tutorial: boolean;
}
interface Spark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}
const LANE_SPACING = 1.6;
const LANES = [-LANE_SPACING, LANE_SPACING];
const BEST_KEY = 'night-relay.samarkand.best.v4';

export class NightlineGame {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(57, 1, 0.1, 330);
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private environment: ReturnType<typeof createEnvironment>;
  private lightingEnvironment: THREE.WebGLRenderTarget;
  private runner = createHumanRunner();
  private drone = createRelayDrone();
  private pulse = new RelayPulse();
  private pulseRing = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0x80ffe0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  private introWall: THREE.Group;
  private introTime = 0;
  private introSignaled = false;
  private introReady = false;
  private introSprayed = false;
  private introDistance = 0;
  private graffiti = createTrainGraffiti();
  private sprayPaint = new SprayPaint();
  private sprayTip = new THREE.Vector3();
  private paintTarget = new THREE.Vector3();
  private introCamera = {
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    fov: 57,
  };
  private runSeconds = 0;
  private weather: Weather = 'rain';
  private atmosphere: Atmosphere;
  private audio = new GameAudio();
  private progress = new RunProgress();
  private mode: GameMode = 'menu';
  private previousMode: GameMode = 'playing';
  private entities: Entity[] = [];
  private sparks: Spark[] = [];
  private templates: Record<EntityKind, THREE.Group>;
  private trainTemplates: THREE.Group[];
  private distance = 0;
  private coins = 0;
  private coinScore = 0;
  private peakFlow = 1;
  private best = 0;
  private targetLane = 1;
  private velocityY = 0;
  private playerY = 0;
  private jumpBuffer = 0;
  private slideTime = 0;
  private row = 0;
  private nextRow = ROUTE_FIRST_DISTANCE;
  private elapsed = 0;
  private countdown = 0;
  private lastTime = 0;
  private lastHud = 0;
  private frameId = 0;
  private fps = 60;
  private frames = 0;
  private fpsTime = 0;
  private cinematic = false;
  private disposed = false;
  private hitFlash = 0;
  private landingKick = 0;
  private crashReason = '';
  private completedObjectives = new Set<string>();
  private shieldMesh: THREE.Mesh;
  private resizeObserver: ResizeObserver;
  private particleGeometry = new THREE.SphereGeometry(0.045, 4, 4);
  private goldParticle = new THREE.MeshBasicMaterial({ color: 0x86ffe1, toneMapped: false });
  private cyanParticle = new THREE.MeshBasicMaterial({ color: 0x77ffe0, toneMapped: false });

  constructor(
    private container: HTMLElement,
    private onUpdate: (snapshot: GameSnapshot) => void,
    private onCue: (message: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.4));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Live 3D view of the Samarkand Registan light festival',
    );
    container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x233249);
    this.scene.fog = new THREE.FogExp2(0x3a485c, 0.009);
    this.scene.add(new THREE.HemisphereLight(0x8eadd5, 0x252130, 0.65));
    const sun = new THREE.DirectionalLight(0xffd29c, 1.15);
    sun.position.set(-16, 25, -30);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, {
      left: -18,
      right: 18,
      top: 25,
      bottom: -20,
      near: 1,
      far: 80,
    });
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    sun.target.position.set(0, 0, -10);
    this.scene.add(sun, sun.target);
    const moon = new THREE.DirectionalLight(0xa1c9ef, 1.35);
    moon.position.set(10, 15, 15);
    this.scene.add(moon);
    const followLight = new THREE.PointLight(0xfde2bd, 13, 13, 2);
    followLight.position.set(0, 4, 6);
    this.scene.add(followLight);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.lightingEnvironment = pmrem.fromScene(room, 0.02);
    this.scene.environment = this.lightingEnvironment.texture;
    this.scene.environmentIntensity = 0.3;
    room.dispose();
    pmrem.dispose();
    this.environment = createEnvironment(this.scene);
    this.atmosphere = new Atmosphere(this.scene);
    this.runner.group.position.set(0, 0, 3);
    this.scene.add(this.runner.group);
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 24, 20),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: `varying vec3 vNormal;varying vec3 vView;void main(){vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
        fragmentShader: `varying vec3 vNormal;varying vec3 vView;void main(){float edge=pow(1.-max(dot(normalize(vNormal),normalize(vView)),0.),2.6);gl_FragColor=vec4(vec3(.3,1.1,.87),.01+edge*.4);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
      }),
    );
    this.shieldMesh.scale.set(0.8, 1.15, 0.8);
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);
    this.trainTemplates = [
      createInstallation(0x27c5b3),
      createInstallation(0xf28f80),
      createInstallation(0x786fdd),
    ];
    this.introWall = createMuralWall();
    this.introWall.add(this.graffiti.group);
    this.introWall.visible = false;
    this.pulseRing.rotation.x = -Math.PI / 2;
    this.pulseRing.position.y = 0.18;
    this.drone.group.position.set(2, 2.5, -1.5);
    this.scene.add(this.introWall, this.drone.group, this.sprayPaint.points, this.pulseRing);
    this.templates = {
      train: this.trainTemplates[0]!,
      jump: createFestivalBarrier('jump'),
      slide: createFestivalBarrier('slide'),
      coin: createLightFragment(),
      powerup: createRelayCharge(),
    };
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.43, 0.45, 1.1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    } catch {
      /* Optional storage. */
    }
    this.camera.position.set(3.8, 5.1, 15);
    this.camera.lookAt(0, 2, -35);
    this.seedAttractScene();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.frameId = requestAnimationFrame(this.frame);
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth),
      h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }
  async whenReady(): Promise<void> {
    await Promise.allSettled([this.runner.ready, this.graffiti.ready]);
  }
  private seedAttractScene(): void {
    this.addEntity('train', -1, -24);
    this.addEntity('train', 1, -68, true);
    this.addEntity('train', -1, -116);
    for (let i = 0; i < 14; i++) this.addEntity('coin', 1, -7 - i * 3.1);
    for (let i = 0; i < 8; i++) this.addEntity('coin', 1, -120 - i * 3.1);
  }
  private addEntity(
    kind: EntityKind,
    lane: number,
    z: number,
    express = false,
    tutorial = false,
    height?: number,
  ): void {
    const source =
      kind === 'train'
        ? this.trainTemplates[(this.row + lane + 3) % this.trainTemplates.length]!
        : this.templates[kind];
    const object = source.clone(true);
    const baseHeight = height ?? (kind === 'coin' ? 1.15 : kind === 'powerup' ? 1.4 : 0);
    object.position.set(lane * LANE_SPACING, baseHeight, z);
    this.scene.add(object);
    this.entities.push({
      object,
      kind,
      collected: false,
      previousZ: z,
      pickupHeight: baseHeight,
      express,
      warned: false,
      scored: false,
      nearMiss: false,
      clean: false,
      tutorial,
    });
  }
  private clearEntities(): void {
    this.entities.forEach((entity) => this.scene.remove(entity.object));
    this.entities = [];
    this.sparks.forEach((spark) => this.scene.remove(spark.mesh));
    this.sparks = [];
  }
  private spawnRows(): void {
    while (this.nextRow < this.distance + 180) {
      const plan = planRouteRow(this.row);
      const z = 3 - (this.nextRow - this.distance);
      plan.obstacles.forEach((obstacle) =>
        this.addEntity(obstacle.kind, obstacle.lane, z),
      );
      for (const pickup of plan.coins)
        this.addEntity('coin', pickup.lane, z + pickup.offset, false, false, pickup.height);
      if (plan.charge)
        this.addEntity(
          'powerup',
          plan.charge.lane,
          z + plan.charge.offset,
          false,
          false,
          plan.charge.height,
        );
      this.nextRow += routeRowGap(this.row);
      this.row++;
    }
  }
  start(): void {
    this.audio.unlock();
    this.audio.stop();
    this.clearEntities();
    this.progress.reset();
    this.completedObjectives.clear();
    this.distance = 0;
    this.coins = 0;
    this.coinScore = 0;
    this.peakFlow = 1;
    this.targetLane = 1;
    this.playerY = 0;
    this.velocityY = 0;
    this.jumpBuffer = 0;
    this.slideTime = 0;
    this.pulse.reset();
    this.row = 0;
    this.nextRow = ROUTE_FIRST_DISTANCE;
    this.crashReason = '';
    this.hitFlash = 0;
    this.landingKick = 0;
    this.runner.group.position.set(-1.12, 0, 2.7);
    this.runner.group.rotation.set(0, Math.PI / 2, 0);
    this.runner.pose('spray');
    this.runner.spray(0);
    this.runSeconds = 0;
    this.introTime = 0;
    this.introDistance = 0;
    this.introSignaled = false;
    this.introReady = false;
    this.introSprayed = false;
    this.countdown = 0;
    this.mode = 'intro';
    this.graffiti.setFinish(0);
    this.sprayPaint.points.visible = false;
    this.introWall.position.set(-3.2, 0, -1);
    this.introWall.visible = true;
    this.drone.group.position.set(1.55, 2.2, -2.5);
    this.drone.group.rotation.y = 0;
    for (let i = 0; i < ROUTE_OPENING_COINS; i++) this.addEntity('coin', 1, 3 - (12 + i * 3.2));
    this.spawnRows();
    this.emit();
  }
  action(action: Action): void {
    if (this.mode !== 'playing') return;
    if (action === 'left') this.targetLane = Math.max(0, this.targetLane - 1);
    if (action === 'right') this.targetLane = Math.min(1, this.targetLane + 1);
    if (action === 'jump') this.jumpBuffer = 0.16;
    if (action === 'slide') {
      this.slideTime = 0.85;
      this.jumpBuffer = 0;
      if (this.playerY > 0.1) this.velocityY = -15;
    }
    if (action === 'pulse') {
      if (this.pulse.activate()) {
        this.audio.pulse();
        this.onCue('LIGHT PULSE · MOVE THROUGH PROJECTIONS');
        this.emit();
      } else if (!this.pulse.active)
        this.onCue(`COLLECT ${6 - this.pulse.charge} MORE LIGHT FRAGMENTS`);
    }
  }
  pause(): void {
    if (this.mode === 'playing' || this.mode === 'countdown' || this.mode === 'intro') {
      this.previousMode = this.mode;
      this.mode = 'paused';
      this.audio.stop();
      this.emit();
    } else if (this.mode === 'paused') {
      this.mode = this.previousMode;
      this.lastTime = performance.now();
      this.audio.unlock();
      this.emit();
    }
  }
  home(): void {
    this.distance = 0;
    this.coins = 0;
    this.coinScore = 0;
    this.peakFlow = 1;
    this.mode = 'menu';
    this.drone.group.rotation.y = 0;
    this.introWall.visible = false;
    this.sprayPaint.points.visible = false;
    this.runner.pose('idle');
    this.audio.stop();
    this.clearEntities();
    this.seedAttractScene();
    this.progress.reset();
    this.runner.group.position.set(0, 0, 3);
    this.runner.group.rotation.set(0, 0, 0);
    this.playerY = 0;
    this.velocityY = 0;
    this.slideTime = 0;
    this.pulse.reset();
    this.hitFlash = 0;
    this.emit();
  }
  setSound(enabled: boolean): void {
    this.audio.setEnabled(enabled);
    if (enabled) this.audio.unlock();
  }
  setCinematic(enabled: boolean): void {
    this.cinematic = enabled;
  }
  setWeather(weather: Weather): void {
    this.weather = weather;
    this.atmosphere.setWeather(weather);
  }
  setQuality(quality: 'high' | 'balanced'): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.4 : 1));
    this.bloom.enabled = quality === 'high';
    this.renderer.shadowMap.enabled = quality === 'high';
    this.atmosphere.setQuality(quality);
    this.resize();
  }
  private score(): number {
    return Math.floor(this.distance * 10 + this.coinScore + this.progress.bonusScore);
  }
  private emit(): void {
    this.onUpdate({
      mode: this.mode,
      distance: this.distance,
      coins: this.coins,
      score: this.score(),
      speed: getRunSpeed(this.distance),
      shield: this.pulse.remaining,
      pulseCharge: this.pulse.charge,
      pulseReady: this.pulse.ready,
      countdown: Math.ceil(this.countdown),
      best: this.best,
      fps: this.fps,
      runSeconds: this.runSeconds,
      humanReady: this.runner.isReady(),
      introText:
        this.mode === 'intro'
          ? this.introTime < INTRO_TIMING.signal
            ? 'THE LAST TOUCH.'
            : this.introTime < INTRO_TIMING.launch
              ? 'CAMERA READY.'
              : 'CARRY THE LIGHT.'
          : '',
      multiplier: this.progress.multiplier,
      streak: this.progress.streak,
      comboRemaining: this.progress.comboRemaining,
      nearMisses: this.progress.nearMisses,
      cleanMoves: this.progress.obstaclesCleared,
      peakFlow: this.peakFlow,
      objectives: this.progress.getObjectives(this.distance, this.coins),
      district: getDistrict(this.distance),
      crashReason: this.crashReason,
    });
  }
  private burst(position: THREE.Vector3, color: 'gold' | 'cyan', count = 9): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        this.particleGeometry,
        color === 'gold' ? this.goldParticle : this.cyanParticle,
      );
      mesh.position.copy(position);
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          Math.random() * 4,
          (Math.random() - 0.5) * 4,
        ),
        life: 0.55,
      });
    }
  }
  private crash(kind: ObstacleKind): void {
    if (this.mode !== 'playing') return;
    this.mode = 'over';
    this.runner.pose('caught');
    this.audio.stop();
    this.audio.hit();
    this.hitFlash = 0.35;
    this.crashReason =
      kind === 'train'
        ? 'Change paths or use Pulse to pass through a projection.'
        : kind === 'jump'
          ? 'Jump over the low light ribbons, or release your Pulse.'
          : 'Slide under the hanging light ribbons, or use Pulse.';
    const score = this.score();
    if (score > this.best) {
      this.best = score;
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {
        /* Optional storage. */
      }
    }
    this.burst(this.runner.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 'gold', 24);
    this.emit();
  }
  private updatePlayer(dt: number): void {
    if (this.jumpBuffer > 0 && this.playerY <= 0.02) {
      this.velocityY = 9.2;
      this.slideTime = 0;
      this.jumpBuffer = 0;
      this.audio.jump();
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    const wasAirborne = this.playerY > 0.05;
    this.playerY = Math.max(0, this.playerY + this.velocityY * dt);
    if (this.playerY > 0 || this.velocityY > 0) this.velocityY -= 25 * dt;
    else this.velocityY = 0;
    if (wasAirborne && this.playerY === 0) {
      this.landingKick = 0.16;
      this.audio.land();
      this.atmosphere.splash(this.runner.group.position.x, 3, 2);
    }
    this.slideTime = Math.max(0, this.slideTime - dt);
    this.pulse.update(dt);
    const oldX = this.runner.group.position.x;
    this.runner.group.position.x = THREE.MathUtils.damp(oldX, LANES[this.targetLane]!, 17, dt);
    this.runner.group.position.y = this.playerY;
    this.runner.group.rotation.z = THREE.MathUtils.damp(
      this.runner.group.rotation.z,
      (oldX - LANES[this.targetLane]!) * 0.09,
      12,
      dt,
    );
  }
  private updateEntities(dt: number, speed: number, menu: boolean): void {
    for (const entity of this.entities) {
      entity.previousZ = entity.object.position.z;
      entity.object.position.z += (speed + (entity.express ? (menu ? 3.5 : 11) : 0)) * dt;
      if (menu && entity.object.position.z > 28) entity.object.position.z -= 195;
      if (entity.kind === 'coin' || entity.kind === 'powerup') {
        entity.object.rotation.y += dt * 2.6;
        entity.object.position.y =
          entity.pickupHeight + Math.sin(this.elapsed * 3 + entity.object.position.z * 0.12) * 0.07;
      }
      if (this.mode !== 'playing' || entity.collected) continue;
      if (entity.express && !entity.warned && entity.object.position.z > -60) {
        entity.warned = true;
        this.audio.relaySignal();
        const track =
          entity.object.position.x < 0 ? 'LEFT' : entity.object.position.x > 0 ? 'RIGHT' : 'CENTER';
        this.onCue(`MOVING PROJECTION · ${track} PATH`);
      }
      if (entity.tutorial && !entity.warned && entity.object.position.z > -4) {
        entity.warned = true;
        this.onCue(entity.kind === 'jump' ? '↑ JUMP THE LIGHT RIBBON' : '↓ SLIDE UNDER THE RIBBON');
      }
    }
  }
  private checkCollisions(): void {
    for (const entity of this.entities) {
      if (entity.collected) continue;
      const xDistance = Math.abs(entity.object.position.x - this.runner.group.position.x);
      const zDistance = Math.abs(entity.object.position.z - 3);
      if (entity.kind === 'coin' || entity.kind === 'powerup') {
        if (
          zDistance < 1.15 &&
          xDistance < 0.85 &&
          Math.abs(entity.object.position.y - (this.playerY + 0.95)) < 1.1
        ) {
          entity.collected = true;
          entity.object.visible = false;
          this.burst(entity.object.position, entity.kind === 'coin' ? 'gold' : 'cyan');
          if (entity.kind === 'coin') {
            const before = this.progress.multiplier;
            const wasReady = this.pulse.ready;
            this.pulse.collect();
            this.coins++;
            this.coinScore += this.progress.collectCoin();
            this.peakFlow = Math.max(this.peakFlow, this.progress.multiplier);
            this.audio.coin();
            if (!wasReady && this.pulse.ready) this.onCue('PULSE READY · PRESS E OR TAP PULSE');
            if (this.progress.multiplier > before) {
              this.audio.combo(this.progress.multiplier);
              this.onCue(`${this.progress.multiplier}× FLOW · KEEP IT GOING`);
            }
          } else {
            this.pulse.collect(6);
            this.audio.powerup();
            this.onCue('LIGHT FULL · RELEASE YOUR PULSE');
          }
        }
        continue;
      }
      const hit = hitsObstacle(
        entity.kind,
        this.runner.group.position.x,
        this.playerY,
        this.slideTime > 0,
        entity.object.position.x,
        entity.object.position.z,
      );
      if (hit) {
        if (this.pulse.active) {
          entity.collected = true;
          entity.object.visible = false;
          this.burst(
            this.runner.group.position.clone().add(new THREE.Vector3(0, 1, 0)),
            'cyan',
            24,
          );
          this.onCue('PROJECTION DISSOLVED');
          this.audio.powerup();
          continue;
        } else {
          this.crash(entity.kind);
          return;
        }
      }
      if (entity.kind === 'train' && zDistance < 6.8 && xDistance >= 1.425 && xDistance < 2.25)
        entity.nearMiss = true;
      const correctPose =
        entity.kind === 'jump'
          ? this.playerY > 1
          : this.slideTime > 0 && this.playerY + 0.85 <= 1.25;
      if (entity.kind !== 'train' && zDistance <= 0.6 && xDistance < 1.4 && !hit && correctPose)
        entity.clean = true;
      if (
        !entity.scored &&
        crossedObstacle(entity.previousZ, entity.object.position.z, entity.kind)
      ) {
        entity.scored = true;
        if (entity.nearMiss) {
          const reward = this.progress.nearMiss();
          this.audio.nearMiss();
          this.onCue(`CLOSE CALL +${reward}`);
        } else if (entity.clean) {
          const reward = this.progress.clearObstacle(entity.kind);
          this.onCue(`CLEAN ${entity.kind === 'jump' ? 'JUMP' : 'SLIDE'} +${reward}`);
        }
      }
    }
  }
  private updateMilestones(): void {
    const milestone = this.progress.consumeMilestone();
    if (milestone !== null) {
      this.audio.combo(2);
      this.onCue(`${milestone} M · ${getDistrict(milestone)}`);
    }
    for (const objective of this.progress.getObjectives(this.distance, this.coins))
      if (objective.complete && !this.completedObjectives.has(objective.id)) {
        this.completedObjectives.add(objective.id);
        this.onCue(`MISSION COMPLETE · ${objective.title.toUpperCase()}`);
        this.audio.powerup();
      }
  }
  skipIntro(): void {
    if (this.mode !== 'intro') return;
    this.audio.stop();
    this.introTime = INTRO_TIMING.duration;
    this.introWall.visible = false;
    this.finishIntro();
  }
  private finishIntro(): void {
    this.mode = 'playing';
    this.runner.pose(null);
    this.runner.group.position.set(0, 0, 3);
    this.runner.group.rotation.set(0, 0, 0);
    this.sprayPaint.points.visible = false;
    this.graffiti.setFinish(1);
    this.drone.group.position.set(1.75, 2.5, -2.2);
    this.drone.group.rotation.y = 0;
    sampleIntroCamera(INTRO_TIMING.duration, this.camera.aspect, this.introCamera);
    this.camera.position.copy(this.introCamera.position);
    this.camera.quaternion.copy(this.introCamera.rotation);
    this.camera.fov = this.introCamera.fov;
    this.camera.updateProjectionMatrix();
    this.onCue('COLLECT LIGHT · CHARGE YOUR PULSE');
    this.emit();
  }
  private updateIntro(dt: number): void {
    this.introTime += dt;
    const time = this.introTime;
    if (time >= INTRO_TIMING.sprayStart && !this.introSprayed) {
      this.introSprayed = true;
      this.audio.sprayPaint(INTRO_TIMING.sprayEnd - INTRO_TIMING.sprayStart);
    }
    if (time >= INTRO_TIMING.signal && !this.introSignaled) {
      this.introSignaled = true;
      this.audio.relaySignal();
    }
    if (time >= INTRO_TIMING.ready && !this.introReady) {
      this.introReady = true;
      this.audio.relaySignal();
    }
    this.graffiti.setFinish(
      THREE.MathUtils.smoothstep(time, INTRO_TIMING.sprayStart, INTRO_TIMING.sprayEnd),
    );
    if (time < INTRO_TIMING.launch) {
      this.runner.pose(time < INTRO_TIMING.signal ? 'spray' : 'idle');
      this.runner.spray(Math.min(1, time / INTRO_TIMING.reveal));
      this.runner.animate(this.elapsed, 0, false, false);
      this.drone.animate(this.elapsed, time >= INTRO_TIMING.signal, false);
      this.paintTarget.set(GRAFFITI_DOT.x, GRAFFITI_DOT.y, GRAFFITI_DOT.z);
      this.introWall.localToWorld(this.paintTarget);
      const tip = this.runner.getSprayTip(this.sprayTip);
      this.sprayPaint.update(
        time,
        !!tip && time >= INTRO_TIMING.sprayStart && time <= INTRO_TIMING.sprayEnd,
        this.sprayTip,
        this.paintTarget,
      );
    } else {
      const launch = THREE.MathUtils.smootherstep(time, INTRO_TIMING.launch, INTRO_TIMING.duration);
      const turn = THREE.MathUtils.smootherstep(
        time,
        INTRO_TIMING.launch,
        INTRO_TIMING.launch + 0.95,
      );
      const speed =
        14 * THREE.MathUtils.smoothstep(time, INTRO_TIMING.launch, INTRO_TIMING.launch + 1.4);
      this.runner.pose(null);
      this.runner.group.rotation.y = ((1 - turn) * Math.PI) / 2;
      this.runner.group.position.set(-1.12 * (1 - turn), 0, 2.7 + turn * 0.3);
      this.runner.animate(this.elapsed, speed, false, false);
      this.sprayPaint.points.visible = false;
      this.introDistance += speed * dt;
      this.introWall.position.z = -1 + this.introDistance;
      this.environment.update(dt, speed, this.elapsed);
      this.drone.group.position.set(
        THREE.MathUtils.lerp(1.55, 1.75, launch),
        THREE.MathUtils.lerp(2.2, 2.5, launch),
        THREE.MathUtils.lerp(-2.5, -2.2, launch),
      );
      this.drone.group.rotation.y = 0;
      this.drone.animate(this.elapsed, true, false);
    }
    if (time >= INTRO_TIMING.duration) this.finishIntro();
  }
  private updateDrone(dt: number): void {
    if (this.mode === 'intro' || this.mode === 'paused') return;
    const targetX = this.runner.group.position.x + 1.75;
    this.drone.group.position.x = THREE.MathUtils.damp(this.drone.group.position.x, targetX, 3, dt);
    this.drone.group.position.y = THREE.MathUtils.damp(this.drone.group.position.y, 2.5, 3, dt);
    this.drone.group.position.z = THREE.MathUtils.damp(this.drone.group.position.z, -2.2, 3, dt);
    this.drone.animate(this.elapsed, this.mode === 'playing', this.pulse.active);
  }
  private updateCamera(dt: number, menu: boolean, playing: boolean): void {
    const ratio = this.camera.aspect;
    const viewingIntro =
      this.mode === 'intro' || (this.mode === 'paused' && this.previousMode === 'intro');
    if (viewingIntro) {
      sampleIntroCamera(this.introTime, ratio, this.introCamera);
      this.camera.position.copy(this.introCamera.position);
      this.camera.quaternion.copy(this.introCamera.rotation);
      this.camera.fov = this.introCamera.fov;
      this.camera.updateProjectionMatrix();
      return;
    }
    const x = menu
      ? ratio < 0.8
        ? 3
        : 3.8 + Math.sin(this.elapsed * 0.09) * 0.3
      : this.runner.group.position.x * (ratio < 0.8 ? 0.85 : 0.62);
    const y = menu
      ? ratio < 0.8
        ? 4.7
        : 5.1
      : 3.6 +
        this.playerY * 0.2 -
        this.landingKick +
        (playing && this.playerY < 0.05 ? Math.sin(this.elapsed * 15) * 0.018 : 0);
    const z = menu ? 15 : ratio < 0.8 ? 13 : 11.4;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, x, menu ? 2.5 : 12, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, y, 5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, z, 2.5, dt);
    this.camera.lookAt(
      menu ? 0 : this.runner.group.position.x * (ratio < 0.8 ? 0.7 : 0.48),
      menu ? 2.4 : 1.25 + this.playerY * 0.1,
      menu ? -35 : -13,
    );
    const desiredFov = playing
      ? 57 +
        Math.min(this.distance / 180, 6) +
        (this.cinematic ? 4 : 0) +
        (this.progress.multiplier > 1 ? 1.5 : 0)
      : 57;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, desiredFov, 3, dt);
    this.camera.updateProjectionMatrix();
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.landingKick = THREE.MathUtils.damp(this.landingKick, 0, 14, dt);
    if (this.hitFlash > 0) this.camera.position.x += (Math.random() - 0.5) * this.hitFlash;
  }
  private frame = (now: number): void => {
    if (this.disposed) return;
    const rawDt = (now - (this.lastTime || now)) / 1000;
    const dt = Math.min(rawDt, 0.04);
    this.lastTime = now;
    const effectDt = this.mode === 'paused' ? 0 : dt;
    this.elapsed += effectDt;
    this.frames++;
    this.fpsTime += rawDt;
    if (this.fpsTime >= 1) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    const playing = this.mode === 'playing',
      menu = this.mode === 'menu',
      active = playing || menu;
    const speed = playing ? getRunSpeed(this.distance) : menu ? 2.8 : 0;
    if (this.mode === 'intro') this.updateIntro(dt);
    if (this.mode === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.mode = 'playing';
        this.onCue('FIND YOUR FLOW.');
        this.emit();
      }
    }
    if (active) {
      this.environment.update(dt, speed, this.elapsed);
    }
    if (playing) {
      this.runSeconds += dt;
      this.distance += speed * dt;
      this.progress.update(dt, this.distance);
      this.updatePlayer(dt);
      if (this.introWall.visible) {
        this.introWall.position.z += speed * dt;
        if (this.introWall.position.z > 35) this.introWall.visible = false;
      }
    }
    if (active || this.mode === 'countdown') {
      if (menu) this.runner.pose('idle');
      this.runner.animate(
        this.elapsed,
        playing ? speed : 0,
        this.playerY > 0.05,
        this.slideTime > 0,
      );
    }
    if (this.mode === 'over') this.runner.animate(this.elapsed, 0, false, false);
    this.updateDrone(effectDt);
    if (active) this.updateEntities(dt, speed, menu);
    if (playing) this.checkCollisions();
    if (this.mode === 'playing') {
      this.entities = this.entities.filter((entity) => {
        if (entity.object.position.z > 28) {
          this.scene.remove(entity.object);
          return false;
        }
        return true;
      });
      this.spawnRows();
      this.updateMilestones();
    }
    for (const spark of this.sparks) {
      spark.life -= effectDt;
      spark.mesh.position.addScaledVector(spark.velocity, effectDt);
      spark.velocity.y -= 6 * effectDt;
      spark.mesh.scale.setScalar(Math.max(0, spark.life * 2));
    }
    this.sparks = this.sparks.filter((spark) => {
      if (spark.life <= 0) {
        this.scene.remove(spark.mesh);
        return false;
      }
      return true;
    });
    this.shieldMesh.visible = this.pulse.active;
    this.shieldMesh.position.copy(this.runner.group.position).add(new THREE.Vector3(0, 1, 0));
    this.shieldMesh.rotation.y = this.elapsed * 0.5;
    this.pulseRing.visible = this.pulse.active;
    this.pulseRing.position.x = this.runner.group.position.x;
    this.pulseRing.position.z = 3;
    const pulseProgress = 1 - this.pulse.remaining / PULSE_SECONDS;
    this.pulseRing.scale.setScalar(1 + pulseProgress * 22);
    this.pulseRing.material.opacity = this.pulse.active ? (1 - pulseProgress) * 0.8 : 0;
    const introRunning = this.mode === 'intro' && this.introTime >= INTRO_TIMING.launch;
    const presentationSpeed = introRunning
      ? 14 *
        THREE.MathUtils.smoothstep(this.introTime, INTRO_TIMING.launch, INTRO_TIMING.launch + 1.4)
      : speed;
    this.atmosphere.update(
      effectDt,
      presentationSpeed,
      this.runner.group.position,
      this.mode === 'playing' || introRunning,
      null,
    );
    this.updateCamera(dt, menu, playing);
    this.audio.update(presentationSpeed, this.mode === 'playing' || introRunning, {
      grounded: this.playerY < 0.05 && this.slideTime <= 0,
      wet: this.weather === 'rain',
    });
    this.lastHud += dt;
    if (this.lastHud > 0.1) {
      this.lastHud = 0;
      this.emit();
    }
    this.composer.render();
    this.frameId = requestAnimationFrame(this.frame);
  };
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.audio.dispose();
    this.composer.passes.forEach((pass) => pass.dispose());
    this.composer.dispose();
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    const collect = (object: THREE.Object3D): void => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(material);
      }
    };
    this.scene.traverse(collect);
    Object.values(this.templates).forEach((template) => template.traverse(collect));
    this.trainTemplates.forEach((template) => template.traverse(collect));
    geometries.add(this.particleGeometry);
    materials.add(this.goldParticle);
    materials.add(this.cyanParticle);
    materials.forEach((material) =>
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      }),
    );
    this.environment.dispose();
    this.atmosphere.dispose();
    this.runner.dispose();
    this.drone.dispose();
    this.graffiti.dispose();
    this.sprayPaint.dispose();
    this.lightingEnvironment.dispose();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.scene.clear();
    this.entities = [];
    this.sparks = [];
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
