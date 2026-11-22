import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from "three";
import { atmosphereFragmentShader } from "../lib/scatter";
import { starField } from "../lib/stars";

const STAR_VERTEX = /* glsl */ `
  attribute float aBright;
  varying float vBright;
  void main() {
    vBright = aBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aBright * 160.0 / -mv.z, 0.6, 2.6);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying float vBright;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float disk = dot(p, p);
    if (disk > 1.0) discard;
    float glow = exp(-disk * 3.2) * vBright;
    gl_FragColor = vec4(0.93, 0.95, 1.0, glow);
  }
`;

/** About six thousand stars. Hidden in light mode by the caller. */
export function createStarfield(): Points {
  const field = starField();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(field.positions, 3));
  geometry.setAttribute("aBright", new BufferAttribute(field.brightness, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
  });
  const points = new Points(geometry, material);
  points.name = "starfield";
  points.frustumCulled = false;
  return points;
}

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying float vRim;
  varying float vSun;
  uniform vec3 uSun;
  void main() {
    vec3 radial = normalize(position);
    vRim = 1.0 - abs(dot(radial, normalize(cameraPosition)));
    vSun = dot(radial, normalize(uSun));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export interface AtmosphereLight {
  setSun(x: number, y: number, z: number): void;
  /** 1 against the night sky, lower against the pale daytime page. */
  setGain(gain: number): void;
}

/**
 * Replace the flat fresnel shell with the single-scattering limb.
 * The mesh stays the toolbar's atmosphere object.
 */
export function mountScattering(mesh: Mesh): AtmosphereLight {
  const sun = new Vector3(1, 0.15, 0.35);
  const material = new ShaderMaterial({
    transparent: true,
    side: BackSide,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uSun: { value: sun },
      uGain: { value: 0.85 },
    },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: atmosphereFragmentShader(),
  });
  const previous = mesh.material;
  mesh.material = material;
  const old = Array.isArray(previous) ? previous : [previous];
  for (const entry of old) entry.dispose();
  return {
    setSun(x: number, y: number, z: number) {
      sun.set(x, y, z);
    },
    setGain(gain: number) {
      material.uniforms.uGain.value = gain;
    },
  };
}
