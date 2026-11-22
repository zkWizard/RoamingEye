import * as THREE from "three";
import { fieldToRgba, type WindField } from "./field";
import { GLOBE_RADIUS } from "../../overlays/types";
import {
  ADVECT_FRAG,
  DISPLAY_FRAG,
  DISPLAY_VERT,
  FADE_FRAG,
  FULLSCREEN_VERT,
  STAMP_FRAG,
  STAMP_VERT,
} from "./shaders";
import {
  particleGrid,
  trailTextureSize,
  windParticleCount,
  WIND_PARTICLES_LOW,
} from "./tier";

/** Model hours advanced per real second, so the flow is visible on the globe. */
export const SIM_HOURS_PER_SECOND = 42;
const TRAIL_HALF_LIFE_SEC = 2.6;
const WARMUP_STEPS = 18;

export type WindColorMode = "speed" | "temperature";

interface NavigatorMemory {
  deviceMemory?: number;
}

function packUnit(norm: number): [number, number] {
  const x = Math.min(1, Math.max(0, norm)) * 65535;
  const hi = Math.min(255, Math.floor(x / 256));
  const lo = Math.min(255, Math.floor(x - hi * 256 + 0.5));
  return [hi, lo];
}

function makeTarget(
  width: number,
  height: number,
  nearest: boolean
): THREE.WebGLRenderTarget {
  const filter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    magFilter: filter,
    minFilter: filter,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

function fieldUniforms(field: WindField): Record<string, THREE.IUniform> {
  const { lat0, lon0, dLat, dLon, nLat, nLon } = field.header;
  return {
    uLat0: { value: lat0 },
    uLon0: { value: lon0 },
    uDLat: { value: dLat },
    uDLon: { value: dLon },
    uNLon: { value: nLon },
    uNLat: { value: nLat },
  };
}

/**
 * GPU wind: particles live in a ping-pong state target, and fading trails
 * accumulate in a second ping-pong target that is draped on the globe.
 */
export class WindSimulation {
  readonly object = new THREE.Group();
  private readonly renderer: THREE.WebGLRenderer;
  // Near 0 would put the fullscreen quad on the far plane and clip it, so the
  // advection and fade passes would draw nothing.
  private readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private readonly quadScene = new THREE.Scene();
  private readonly stampScene = new THREE.Scene();
  private readonly savedClear = new THREE.Color();
  private fieldTexture: THREE.DataTexture;
  private stateRead: THREE.Texture;
  private seedTexture: THREE.DataTexture | null = null;
  private stateA: THREE.WebGLRenderTarget;
  private stateB: THREE.WebGLRenderTarget;
  private trailA: THREE.WebGLRenderTarget;
  private trailB: THREE.WebGLRenderTarget;
  private advectMat: THREE.ShaderMaterial;
  private fadeMat: THREE.ShaderMaterial;
  private stampMat: THREE.ShaderMaterial;
  private displayMat: THREE.ShaderMaterial;
  private points: THREE.Points;
  private count: number;
  private lastNow = 0;
  private lastTierCheck = 0;
  private seed = Math.random() * 1000;

  constructor(renderer: THREE.WebGLRenderer, field: WindField) {
    if (!renderer.capabilities.isWebGL2) {
      throw new Error("Wind needs WebGL2");
    }
    this.renderer = renderer;
    this.ortho.position.z = 2;
    this.count = this.desiredCount();
    this.fieldTexture = this.uploadField(field);
    const grid = particleGrid(this.count);
    const trail = trailTextureSize(this.count);
    this.stateA = makeTarget(grid.width, grid.height, true);
    this.stateB = makeTarget(grid.width, grid.height, true);
    this.trailA = makeTarget(trail.width, trail.height, false);
    this.trailB = makeTarget(trail.width, trail.height, false);
    this.stateRead = this.seedState(grid.width, grid.height);

    const shared = fieldUniforms(field);
    this.advectMat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uState: { value: this.stateRead },
        uField: { value: this.fieldTexture },
        uDtHours: { value: 0 },
        uDtSeconds: { value: 0 },
        uSeed: { value: this.seed },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: ADVECT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fadeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.trailA.texture },
        uDecay: { value: 1 },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FADE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.stampMat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uState: { value: this.stateRead },
        uField: { value: this.fieldTexture },
        uStateSize: { value: new THREE.Vector2(grid.width, grid.height) },
        uPointSize: { value: this.count <= WIND_PARTICLES_LOW ? 2.6 : 3.4 },
        uMode: { value: 0 },
      },
      vertexShader: STAMP_VERT,
      fragmentShader: STAMP_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.displayMat = new THREE.ShaderMaterial({
      uniforms: { uTrail: { value: this.trailA.texture } },
      vertexShader: DISPLAY_VERT,
      fragmentShader: DISPLAY_FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.advectMat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.points = this.makePoints(grid.width, grid.height);
    this.stampScene.add(this.points);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.0015, 96, 64),
      this.displayMat
    );
    shell.frustumCulled = false;
    this.object.add(shell);
    this.clearTarget(this.trailA);
    this.clearTarget(this.trailB);
    for (let i = 0; i < WARMUP_STEPS; i++) this.step(1 / 45);
    this.lastNow = performance.now();
  }

  setColorMode(mode: WindColorMode): void {
    this.stampMat.uniforms.uMode.value = mode === "temperature" ? 1 : 0;
    this.clearTarget(this.trailA);
    this.clearTarget(this.trailB);
  }

  update(now: number, active: boolean): void {
    if (!active || document.hidden) {
      this.lastNow = now;
      return;
    }
    if (now - this.lastTierCheck > 2000) {
      this.lastTierCheck = now;
      this.applyCount(this.desiredCount());
    }
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    if (dt <= 0) return;
    this.step(dt);
  }

  dispose(): void {
    this.fieldTexture.dispose();
    this.seedTexture?.dispose();
    this.seedTexture = null;
    this.stateA.dispose();
    this.stateB.dispose();
    this.trailA.dispose();
    this.trailB.dispose();
    this.advectMat.dispose();
    this.fadeMat.dispose();
    this.stampMat.dispose();
    this.displayMat.dispose();
    this.points.geometry.dispose();
    const shell = this.object.children[0];
    if (shell instanceof THREE.Mesh) shell.geometry.dispose();
  }

  private desiredCount(): number {
    const nav = navigator as Navigator & NavigatorMemory;
    const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    return windParticleCount({
      deviceMemoryGb: nav.deviceMemory,
      hardwareConcurrency: nav.hardwareConcurrency,
      pixelRatio: this.renderer.getPixelRatio(),
      maxPixelRatio,
    });
  }

  private applyCount(count: number): void {
    if (count === this.count) return;
    this.count = count;
    const grid = particleGrid(count);
    const trail = trailTextureSize(count);
    this.stateA.dispose();
    this.stateB.dispose();
    this.trailA.dispose();
    this.trailB.dispose();
    this.seedTexture?.dispose();
    this.seedTexture = null;
    this.stateA = makeTarget(grid.width, grid.height, true);
    this.stateB = makeTarget(grid.width, grid.height, true);
    this.trailA = makeTarget(trail.width, trail.height, false);
    this.trailB = makeTarget(trail.width, trail.height, false);
    this.stateRead = this.seedState(grid.width, grid.height);
    (this.stampMat.uniforms.uStateSize.value as THREE.Vector2).set(
      grid.width,
      grid.height
    );
    this.stampMat.uniforms.uPointSize.value =
      count <= WIND_PARTICLES_LOW ? 2.6 : 3.4;
    this.stampScene.remove(this.points);
    this.points.geometry.dispose();
    this.points = this.makePoints(grid.width, grid.height);
    this.stampScene.add(this.points);
    this.clearTarget(this.trailA);
    this.clearTarget(this.trailB);
  }

  private uploadField(field: WindField): THREE.DataTexture {
    const { nLon, nLat } = field.header;
    const rgba = fieldToRgba(field);
    const texture = new THREE.DataTexture(
      rgba,
      nLon,
      nLat,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private seedState(width: number, height: number): THREE.DataTexture {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const lon = Math.random() * 360 - 180;
      const lat = (Math.asin(Math.random() * 2 - 1) * 180) / Math.PI;
      const [lonHi, lonLo] = packUnit((lon + 180) / 360);
      const [latHi, latLo] = packUnit((lat + 90) / 180);
      data[i * 4] = lonHi;
      data[i * 4 + 1] = lonLo;
      data[i * 4 + 2] = latHi;
      data[i * 4 + 3] = latLo;
    }
    const texture = new THREE.DataTexture(data, width, height);
    this.seedTexture?.dispose();
    this.seedTexture = texture;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private makePoints(width: number, height: number): THREE.Points {
    const count = width * height;
    const ids = new Float32Array(count);
    for (let i = 0; i < count; i++) ids[i] = i;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("aIndex", new THREE.Float32BufferAttribute(ids, 1));
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3)
    );
    const points = new THREE.Points(geometry, this.stampMat);
    points.frustumCulled = false;
    return points;
  }

  private step(dtSeconds: number): void {
    const dtHours = dtSeconds * SIM_HOURS_PER_SECOND;
    this.advectMat.uniforms.uState.value = this.stateRead;
    this.advectMat.uniforms.uDtHours.value = dtHours;
    this.advectMat.uniforms.uDtSeconds.value = dtSeconds;
    this.advectMat.uniforms.uSeed.value = this.seed += dtSeconds;
    const stateWrite =
      this.stateRead === this.stateA.texture ? this.stateB : this.stateA;
    (this.quadScene.children[0] as THREE.Mesh).material = this.advectMat;
    this.pass(stateWrite, this.quadScene, true);

    const decay = Math.pow(0.5, dtSeconds / TRAIL_HALF_LIFE_SEC);
    const showingA =
      this.displayMat.uniforms.uTrail.value === this.trailA.texture;
    const trailRead = showingA ? this.trailA : this.trailB;
    const trailWrite = showingA ? this.trailB : this.trailA;
    this.fadeMat.uniforms.uTex.value = trailRead.texture;
    this.fadeMat.uniforms.uDecay.value = decay;
    (this.quadScene.children[0] as THREE.Mesh).material = this.fadeMat;
    this.pass(trailWrite, this.quadScene, true);
    this.stampMat.uniforms.uState.value = stateWrite.texture;
    this.pass(trailWrite, this.stampScene, false);
    this.displayMat.uniforms.uTrail.value = trailWrite.texture;
    const leavingSeed =
      this.seedTexture !== null && this.stateRead === this.seedTexture;
    this.stateRead = stateWrite.texture;
    if (leavingSeed && this.seedTexture) {
      this.seedTexture.dispose();
      this.seedTexture = null;
    }
  }

  private clearTarget(target: THREE.WebGLRenderTarget): void {
    this.pass(target, this.quadScene, true, true);
  }

  private pass(
    target: THREE.WebGLRenderTarget,
    scene: THREE.Scene,
    clear: boolean,
    blank = false
  ): void {
    const renderer = this.renderer;
    const previous = renderer.getRenderTarget();
    const previousAuto = renderer.autoClear;
    renderer.getClearColor(this.savedClear);
    const previousAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.autoClear = false;
    if (clear || blank) {
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
    }
    if (!blank) renderer.render(scene, this.ortho);
    renderer.setRenderTarget(previous);
    renderer.autoClear = previousAuto;
    renderer.setClearColor(this.savedClear, previousAlpha);
  }
}
