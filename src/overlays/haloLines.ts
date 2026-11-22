import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  Object3D,
  ShaderMaterial,
  Vector2,
  Vector3,
  type ColorRepresentation,
} from "three";
import { latLngToVector3 } from "../lib/geo";

/**
 * Political lines have to read on forest green, desert tan, snow, and the
 * black ocean of a land-masked layer. A one-pixel WebGL line cannot grow a
 * halo (the width is ignored), so each segment is a screen-space quad: a
 * light core with a dark edge, a few pixels wide at any zoom.
 */

export interface HaloStyle {
  widthPx: number;
  core: ColorRepresentation;
  halo: ColorRepresentation;
}

const VERTEX = /* glsl */ `
  attribute vec3 start;
  attribute vec3 end;
  attribute float side;
  attribute float along;
  uniform float uWidth;
  uniform vec2 uResolution;
  varying float vSide;
  void main() {
    vec4 clipA = projectionMatrix * modelViewMatrix * vec4(start, 1.0);
    vec4 clipB = projectionMatrix * modelViewMatrix * vec4(end, 1.0);
    vec2 ndcA = clipA.xy / clipA.w;
    vec2 ndcB = clipB.xy / clipB.w;
    vec2 dir = ndcB - ndcA;
    float len = length(dir);
    vec2 normal = len < 1e-6 ? vec2(0.0, 1.0) : vec2(-dir.y, dir.x) / len;
    vec2 offset = normal * side * uWidth / uResolution;
    vec4 clip = mix(clipA, clipB, along);
    gl_Position = vec4(clip.xy + offset * clip.w, clip.z, clip.w);
    vSide = side;
  }
`;

const FRAGMENT = /* glsl */ `
  varying float vSide;
  uniform vec3 uCore;
  uniform vec3 uHalo;
  void main() {
    float d = abs(vSide);
    float edge = smoothstep(0.28, 0.58, d);
    vec3 color = mix(uCore, uHalo, edge);
    float alpha = mix(0.95, 0.82, edge);
    alpha *= 1.0 - smoothstep(0.84, 1.0, d);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [-1, 1],
  [-1, 1],
  [1, 0],
  [1, 1],
];

/** A chord longer than this is an antimeridian jump, not a border. */
const MAX_SEGMENT_ANGLE = 0.35;

export function haloLineMesh(
  polylines: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  radius: number,
  style: HaloStyle
): Mesh | null {
  const starts: number[] = [];
  const ends: number[] = [];
  const sides: number[] = [];
  const alongs: number[] = [];
  const a = new Vector3();
  const b = new Vector3();

  for (const line of polylines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const p = line[i];
      const q = line[i + 1];
      if (!p || !q) continue;
      a.copy(latLngToVector3(p[1], p[0], radius));
      b.copy(latLngToVector3(q[1], q[0], radius));
      if (a.angleTo(b) > MAX_SEGMENT_ANGLE) continue;
      for (const [side, along] of CORNERS) {
        starts.push(a.x, a.y, a.z);
        ends.push(b.x, b.y, b.z);
        sides.push(side);
        alongs.push(along);
      }
    }
  }
  if (starts.length === 0) return null;

  const geometry = new BufferGeometry();
  geometry.setAttribute("start", new Float32BufferAttribute(starts, 3));
  geometry.setAttribute("end", new Float32BufferAttribute(ends, 3));
  geometry.setAttribute("side", new Float32BufferAttribute(sides, 1));
  geometry.setAttribute("along", new Float32BufferAttribute(alongs, 1));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uWidth: { value: style.widthPx },
      uResolution: {
        value: new Vector2(
          typeof window === "undefined" ? 1 : window.innerWidth,
          typeof window === "undefined" ? 1 : window.innerHeight
        ),
      },
      uCore: { value: new Color(style.core) },
      uHalo: { value: new Color(style.halo) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function setHaloResolution(
  object: Object3D,
  width: number,
  height: number
): void {
  object.traverse((child) => {
    const material = (child as Mesh).material;
    if (material instanceof ShaderMaterial && material.uniforms.uResolution) {
      material.uniforms.uResolution.value.set(width, height);
    }
  });
}
