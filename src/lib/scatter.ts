/**
 * Single-scattering limb of a thin atmosphere.
 *
 * `sun` is the radial dotted with the sun direction: 1 at local noon, 0 on
 * the terminator, -1 at midnight. `rim` is 0 at the disk centre and 1 on
 * the silhouette. The same constants are written into the fragment shader,
 * so a change here is the change on the globe.
 */

export const RAYLEIGH = [0.3, 0.52, 1] as const;
export const WARM = [1, 0.42, 0.22] as const;
export const RIM_POWER = 2.4;
export const DAY_LO = -0.08;
export const DAY_HI = 0.4;
export const NIGHT_LO = -0.6;
export const NIGHT_HI = -0.08;
export const TWILIGHT_CENTER = 0.02;
export const TWILIGHT_SIGMA = 0.14;
/** How much of the limb survives on the night side. */
export const NIGHT_KEEP = 1 - 0.88;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface ScatterSample {
  r: number;
  g: number;
  b: number;
  /** 0 in the disk centre and on the night side, up to 1 on the day limb. */
  alpha: number;
}

/** One sample of the limb. Pure: the shader evaluates the same expression. */
export function scatterSample(sun: number, rim: number): ScatterSample {
  const day = smoothstep(DAY_LO, DAY_HI, sun);
  const night = 1 - smoothstep(NIGHT_LO, NIGHT_HI, sun);
  const sigma = TWILIGHT_SIGMA;
  const twilight = Math.exp(
    -((sun - TWILIGHT_CENTER) ** 2) / (2 * sigma * sigma)
  );
  const warmMix = Math.min(1, twilight * (1 - night * 0.35));
  const r = RAYLEIGH[0] * (1 - warmMix) + WARM[0] * warmMix;
  const g = RAYLEIGH[1] * (1 - warmMix) + WARM[1] * warmMix;
  const b = RAYLEIGH[2] * (1 - warmMix) + WARM[2] * warmMix;
  const limb = Math.min(1, Math.max(0, rim)) ** RIM_POWER;
  const alpha =
    limb * (0.05 + 0.95 * day) * (NIGHT_KEEP + (1 - NIGHT_KEEP) * (1 - night));
  return { r, g, b, alpha };
}

const TWILIGHT_DENOM = 2 * TWILIGHT_SIGMA * TWILIGHT_SIGMA;

/** Fragment shader. Vertex stage writes `vRim` and `vSun`. */
export function atmosphereFragmentShader(): string {
  return /* glsl */ `
    varying float vRim;
    varying float vSun;
    uniform float uGain;
    void main() {
      float day = smoothstep(${DAY_LO}, ${DAY_HI}, vSun);
      float night = 1.0 - smoothstep(${NIGHT_LO}, ${NIGHT_HI}, vSun);
      float twilight = exp(-pow(vSun - ${TWILIGHT_CENTER}, 2.0) / ${TWILIGHT_DENOM});
      float warmMix = min(1.0, twilight * (1.0 - night * 0.35));
      vec3 color = mix(
        vec3(${RAYLEIGH[0]}, ${RAYLEIGH[1]}, ${RAYLEIGH[2]}),
        vec3(${WARM[0]}, ${WARM[1]}, ${WARM[2]}),
        warmMix
      );
      float limb = pow(clamp(vRim, 0.0, 1.0), ${RIM_POWER});
      float alpha = limb * (0.05 + 0.95 * day) * mix(${NIGHT_KEEP}, 1.0, 1.0 - night) * uGain;
      gl_FragColor = vec4(color, alpha);
    }
  `;
}
