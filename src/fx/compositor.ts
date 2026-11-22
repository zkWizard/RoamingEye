import {
  ClampToEdgeWrapping,
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { lookMode, type LookId } from "./looks";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uFrame;
uniform sampler2D uBloom;
uniform float uLook;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBloomStrength;
varying vec2 vUv;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float grain(vec2 uv) {
  vec2 p = floor(uv * uResolution + vec2(uTime * 48.0, uTime * 29.0));
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 thermal(float t) {
  vec3 c0 = vec3(0.02, 0.00, 0.08);
  vec3 c1 = vec3(0.28, 0.00, 0.58);
  vec3 c2 = vec3(0.75, 0.02, 0.18);
  vec3 c3 = vec3(1.00, 0.32, 0.02);
  vec3 c4 = vec3(1.00, 0.86, 0.12);
  vec3 c5 = vec3(1.00, 1.00, 0.96);
  t = clamp(pow(t, 0.8), 0.0, 1.0);
  if (t < 0.2) return mix(c0, c1, t / 0.2);
  if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
  if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
  if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
  return mix(c4, c5, (t - 0.8) / 0.2);
}

vec3 night(vec2 uv) {
  vec2 px = 2.0 / uResolution;
  float l = luma(texture2D(uFrame, uv).rgb);
  float nearby = max(
    max(luma(texture2D(uFrame, uv + vec2(px.x, 0.0)).rgb), luma(texture2D(uFrame, uv - vec2(px.x, 0.0)).rgb)),
    max(luma(texture2D(uFrame, uv + vec2(0.0, px.y)).rgb), luma(texture2D(uFrame, uv - vec2(0.0, px.y)).rgb))
  );
  float g = smoothstep(0.2, 0.75, l);
  g = pow(g, 2.6);
  float spark = smoothstep(0.58, 0.9, max(l, nearby));
  g = clamp(g + spark * 0.4, 0.0, 1.0);
  g = clamp(g + (grain(uv) - 0.5) * 0.09 * (0.2 + g), 0.0, 1.0);
  float vig = smoothstep(0.18, 0.62, length(uv - 0.5));
  vec3 phosphor = vec3(0.04, 0.42, 0.08) * g + vec3(0.35, 1.0, 0.45) * spark * g;
  return phosphor * (1.0 - vig);
}

vec3 noir(vec2 uv) {
  float l = luma(texture2D(uFrame, uv).rgb);
  l = smoothstep(0.16, 0.7, l);
  l = pow(l, 1.25);
  float vig = smoothstep(0.4, 0.9, length(uv - 0.5));
  l = clamp(l * (1.0 - vig * 0.7) + (grain(uv) - 0.5) * 0.035, 0.0, 1.0);
  return vec3(l * 0.92, l * 0.9, l * 0.86);
}

vec3 crt(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  vec2 curved = c * (1.0 + 0.12 * r2) * 0.5 + 0.5;
  if (curved.x < 0.0 || curved.y < 0.0 || curved.x > 1.0 || curved.y > 1.0) {
    return vec3(0.0);
  }
  float shift = 0.0022;
  vec3 col = vec3(
    texture2D(uFrame, curved + vec2(shift, 0.0)).r,
    texture2D(uFrame, curved).g,
    texture2D(uFrame, curved - vec2(shift, 0.0)).b
  );
  float scan = 0.72 + 0.28 * sin(curved.y * uResolution.y * 3.14159);
  float vig = smoothstep(0.35, 0.85, length(uv - 0.5));
  vec3 graded = pow(max(col, vec3(0.0)), vec3(1.2)) * 0.85;
  return graded * scan * (1.0 - vig * 0.72);
}

vec3 blueprint(vec2 uv) {
  vec2 px = 1.0 / uResolution;
  float l = luma(texture2D(uFrame, uv).rgb);
  float gx = luma(texture2D(uFrame, uv + vec2(px.x, 0.0)).rgb) - luma(texture2D(uFrame, uv - vec2(px.x, 0.0)).rgb);
  float gy = luma(texture2D(uFrame, uv + vec2(0.0, px.y)).rgb) - luma(texture2D(uFrame, uv - vec2(0.0, px.y)).rgb);
  float edge = smoothstep(0.03, 0.18, length(vec2(gx, gy)));
  float shape = smoothstep(0.22, 0.62, l);
  float grid = 0.0;
  if (fract(uv.x * 36.0) > 0.96 || fract(uv.y * 24.0) > 0.96) grid = 0.22;
  vec3 paper = vec3(0.03, 0.16, 0.42);
  vec3 ink = vec3(0.86, 0.95, 1.0);
  return mix(paper, ink, clamp(shape * 0.28 + edge * 1.35 + grid, 0.0, 1.0));
}

vec3 cinematic(vec2 uv) {
  vec3 c = texture2D(uFrame, uv).rgb + texture2D(uBloom, uv).rgb * uBloomStrength;
  float vig = smoothstep(0.28, 0.92, length((uv - 0.5) * vec2(0.85, 1.05)));
  c *= 1.0 - vig * 0.55;
  c += (grain(uv) - 0.5) * 0.045;
  if (uv.y < 0.07 || uv.y > 0.93) c = vec3(0.0);
  return c;
}

void main() {
  vec3 color;
  if (uLook < 1.5) color = night(vUv);
  else if (uLook < 2.5) color = thermal(luma(texture2D(uFrame, vUv).rgb));
  else if (uLook < 3.5) color = noir(vUv);
  else if (uLook < 4.5) color = crt(vUv);
  else if (uLook < 5.5) color = blueprint(vUv);
  else color = cinematic(vUv);
  gl_FragColor = vec4(color, 1.0);
}
`;

const EXTRACT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uFrame;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uFrame, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(0.9, 1.0, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uFrame;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(uFrame, vUv).rgb * 0.227027;
  sum += texture2D(uFrame, vUv + uDirection).rgb * 0.1945946;
  sum += texture2D(uFrame, vUv - uDirection).rgb * 0.1945946;
  sum += texture2D(uFrame, vUv + uDirection * 2.0).rgb * 0.1216216;
  sum += texture2D(uFrame, vUv - uDirection * 2.0).rgb * 0.1216216;
  sum += texture2D(uFrame, vUv + uDirection * 3.0).rgb * 0.054054;
  sum += texture2D(uFrame, vUv - uDirection * 3.0).rgb * 0.054054;
  gl_FragColor = vec4(sum, 1.0);
}
`;

/**
 * One full-screen pass over the frame that was just drawn. The scene is
 * copied off the canvas, recoloured, and drawn back. Natural never calls
 * this: the render loop skips the pass entirely.
 */
export class LookCompositor {
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private readonly scene = new Scene();
  private readonly material: ShaderMaterial;
  private readonly extractMat: ShaderMaterial;
  private readonly blurMat: ShaderMaterial;
  private readonly passScene = new Scene();
  private readonly size = new Vector2();
  private target: WebGLRenderTarget | null = null;
  private bloomA: WebGLRenderTarget | null = null;
  private bloomB: WebGLRenderTarget | null = null;
  private look: LookId = "natural";

  constructor(private readonly renderer: WebGLRenderer) {
    this.camera.position.z = 1;
    this.material = new ShaderMaterial({
      uniforms: {
        uFrame: { value: null },
        uBloom: { value: null },
        uLook: { value: 1 },
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uBloomStrength: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.extractMat = this.passMaterial(EXTRACT_FRAG, {
      uFrame: { value: null },
    });
    this.blurMat = this.passMaterial(BLUR_FRAG, {
      uFrame: { value: null },
      uDirection: { value: new Vector2(1, 0) },
    });
    const passQuad = new Mesh(new PlaneGeometry(2, 2), this.extractMat);
    passQuad.frustumCulled = false;
    this.passScene.add(passQuad);
  }

  setLook(id: LookId): void {
    this.look = id;
    this.material.uniforms.uLook.value = lookMode(id);
  }

  present(draw: (renderer: WebGLRenderer) => void): void {
    draw(this.renderer);
    if (this.look === "natural") return;
    const frame = this.frameTexture();
    if (!frame) return;
    this.renderer.initRenderTarget(frame);
    this.renderer.copyFramebufferToTexture(frame.texture);
    this.material.uniforms.uTime.value = performance.now() * 0.001;
    if (this.look === "cinematic") this.bloom(frame);
    else this.material.uniforms.uBloomStrength.value = 0;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
    this.bloomA?.dispose();
    this.bloomB?.dispose();
    this.bloomA = null;
    this.bloomB = null;
    this.material.dispose();
    this.extractMat.dispose();
    this.blurMat.dispose();
    for (const scene of [this.scene, this.passScene]) {
      const quad = scene.children[0];
      if (quad instanceof Mesh) quad.geometry.dispose();
    }
  }

  private bloom(frame: WebGLRenderTarget): void {
    const width = Math.max(1, Math.floor(frame.width / 4));
    const height = Math.max(1, Math.floor(frame.height / 4));
    if (
      !this.bloomA ||
      this.bloomA.width !== width ||
      this.bloomA.height !== height
    ) {
      this.bloomA?.dispose();
      this.bloomB?.dispose();
      this.bloomA = this.makeTarget(width, height);
      this.bloomB = this.makeTarget(width, height);
    }
    const bloomA = this.bloomA;
    const bloomB = this.bloomB;
    if (!bloomB) return;
    this.extractMat.uniforms.uFrame.value = frame.texture;
    this.pass(this.extractMat, bloomA);
    this.blurMat.uniforms.uFrame.value = bloomA.texture;
    this.blurMat.uniforms.uDirection.value.set(1 / width, 0);
    this.pass(this.blurMat, bloomB);
    this.blurMat.uniforms.uFrame.value = bloomB.texture;
    this.blurMat.uniforms.uDirection.value.set(0, 1 / height);
    this.pass(this.blurMat, bloomA);
    this.material.uniforms.uBloom.value = bloomA.texture;
    this.material.uniforms.uBloomStrength.value = 0.55;
  }

  private pass(material: ShaderMaterial, target: WebGLRenderTarget): void {
    const mesh = this.passScene.children[0];
    if (mesh instanceof Mesh) mesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.passScene, this.camera);
  }

  private passMaterial(
    fragmentShader: string,
    uniforms: ShaderMaterial["uniforms"]
  ): ShaderMaterial {
    return new ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }

  private frameTexture(): WebGLRenderTarget | null {
    this.renderer.getDrawingBufferSize(this.size);
    const width = Math.max(1, this.size.x);
    const height = Math.max(1, this.size.y);
    if (
      this.target &&
      this.target.width === width &&
      this.target.height === height
    ) {
      return this.target;
    }
    this.target?.dispose();
    this.target = this.makeTarget(width, height);
    this.material.uniforms.uFrame.value = this.target.texture;
    this.material.uniforms.uBloom.value = this.target.texture;
    this.material.uniforms.uResolution.value.set(width, height);
    return this.target;
  }

  private makeTarget(width: number, height: number): WebGLRenderTarget {
    const target = new WebGLRenderTarget(width, height, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    target.texture.colorSpace = NoColorSpace;
    target.texture.minFilter = LinearFilter;
    target.texture.magFilter = LinearFilter;
    target.texture.wrapS = ClampToEdgeWrapping;
    target.texture.wrapT = ClampToEdgeWrapping;
    target.texture.generateMipmaps = false;
    return target;
  }
}
