/**
 * Display-only sun shading for the globe.
 *
 * The probe never calls this. It inverts the source colormap, so a night-side
 * pixel on screen does not move a legend value. `displayRgb` is the reference
 * the terrain and science shaders follow (see scene/realEarthMaterial.ts).
 *
 * `uNightEmissive` in that shader is the hook for issue #1200 (Black Marble).
 * It stays 0 here: this module does not add a night-lights texture.
 */

export interface RgbUnit {
  r: number;
  g: number;
  b: number;
}

/** Night side brightness as a fraction of the day-side albedo. Satellite base. */
export const NIGHT_FLOOR = 0.25;
/**
 * Linear night floor for a colormap. 0.16 encodes to about 40% of the day
 * side in sRGB, which is what a screenshot reads as. The probe never uses it.
 */
export const SCIENCE_NIGHT_FLOOR = 0.16;
/**
 * Soft terminator, in ndotl. About fifteen degrees of solar zenith, so the
 * edge is a gradient rather than a cut. Below the low edge is night; above
 * the high edge is day.
 */
export const TERMINATOR_LO = -0.22;
export const TERMINATOR_HI = 0.32;
/** Warm band around the terminator, in ndotl. */
export const TWILIGHT_LO = -0.28;
export const TWILIGHT_PEAK_LO = -0.04;
export const TWILIGHT_PEAK_HI = 0.04;
export const TWILIGHT_HI = 0.22;
export const TWILIGHT_COLOR: RgbUnit = { r: 1, g: 0.42, b: 0.16 };
export const TWILIGHT_GAIN = 0.38;
/** Night side of a colormap, slightly blue so it reads as shadow not fog. */
export const NIGHT_TINT: RgbUnit = { r: 0.78, g: 0.88, b: 1 };
/** Ocean glint. Thresholds are on linear albedo, matching the shader. */
export const WATER_LUMA_LO = 0.05;
export const WATER_LUMA_HI = 0.28;
export const WATER_BLUE_LO = 0.02;
export const WATER_BLUE_HI = 0.1;
export const GLINT_POWER = 64;
export const GLINT_GAIN = 0.85;
export const GLINT_COLOR: RgbUnit = { r: 1, g: 0.96, b: 0.88 };

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 1 on dark blue water, 0 on land and cloud. */
export function waterMask(albedo: RgbUnit): number {
  const luma = 0.2126 * albedo.r + 0.7152 * albedo.g + 0.0722 * albedo.b;
  const blue = albedo.b - Math.max(albedo.r, albedo.g);
  const dark = 1 - smoothstep(WATER_LUMA_LO, WATER_LUMA_HI, luma);
  const bluish = smoothstep(WATER_BLUE_LO, WATER_BLUE_HI, blue);
  return dark * bluish;
}

export interface ShadeInput {
  /** Lambert term, dot(normal, direction toward the sun). */
  nDotL: number;
  /** Specular term, dot(normal, half vector). Ignored when glint is 0. */
  nDotH?: number;
  /** 0 skips the ocean highlight. Science colours pass 0. */
  glint?: number;
  /**
   * Night-side emissive gain. 0 until a lights texture drives it (issue #1200).
   */
  nightEmissive?: number;
  /** City lights, already in linear colour, added on the night side. */
  nightLights?: RgbUnit;
  /** Defaults to the satellite floor. Science passes the gentler one. */
  nightFloor?: number;
  /** Cool the night side. Science turns this on. Satellite imagery does not. */
  coolNight?: boolean;
}

/**
 * Shade an albedo. `flat` returns the input unchanged so a colormap stays exact.
 */
export function displayRgb(
  albedo: RgbUnit,
  mode: "flat" | "shaded",
  input: ShadeInput
): RgbUnit {
  if (mode === "flat") return { r: albedo.r, g: albedo.g, b: albedo.b };
  const day = smoothstep(TERMINATOR_LO, TERMINATOR_HI, input.nDotL);
  const floor = input.nightFloor ?? NIGHT_FLOOR;
  const shade = floor + (1 - floor) * day;
  const lights = input.nightLights ?? { r: 0, g: 0, b: 0 };
  const tint = (channel: number) =>
    input.coolNight ? channel + (1 - channel) * day : 1;
  const twilight =
    smoothstep(TWILIGHT_LO, TWILIGHT_PEAK_LO, input.nDotL) *
    (1 - smoothstep(TWILIGHT_PEAK_HI, TWILIGHT_HI, input.nDotL));
  // Scale the warm add by the albedo. A flat add of twilight on a dark
  // colormap is brighter than noon once sRGB encodes it.
  const twScale = Math.max(albedo.r, albedo.g, albedo.b);
  const glintOn = input.glint ?? 0;
  const spec =
    Math.pow(Math.max(input.nDotH ?? 0, 0), GLINT_POWER) *
    waterMask(albedo) *
    day *
    glintOn *
    GLINT_GAIN;
  const emissive = (input.nightEmissive ?? 0) * (1 - day);
  return {
    r:
      albedo.r * shade * tint(NIGHT_TINT.r) +
      TWILIGHT_COLOR.r * twilight * TWILIGHT_GAIN * twScale +
      GLINT_COLOR.r * spec +
      emissive +
      lights.r * (1 - day),
    g:
      albedo.g * shade * tint(NIGHT_TINT.g) +
      TWILIGHT_COLOR.g * twilight * TWILIGHT_GAIN * twScale +
      GLINT_COLOR.g * spec +
      0.93 * emissive +
      lights.g * (1 - day),
    b:
      albedo.b * shade * tint(NIGHT_TINT.b) +
      TWILIGHT_COLOR.b * twilight * TWILIGHT_GAIN * twScale +
      GLINT_COLOR.b * spec +
      0.78 * emissive +
      lights.b * (1 - day),
  };
}

/** GLSL twin of {@link displayRgb}. Constants are interpolated from this module. */
export function realLightGlsl(): string {
  return /* glsl */ `
const float RE_NIGHT_FLOOR = ${NIGHT_FLOOR};
const float RE_SCIENCE_FLOOR = ${SCIENCE_NIGHT_FLOOR};
vec3 reShade(vec3 albedo, vec3 sunWorld, float glintOn, float emissive, float nightFloor, float coolNight, vec3 nightLights, vec3 nrm, vec3 viewPos) {
  vec3 sunV = normalize((viewMatrix * vec4(sunWorld, 0.0)).xyz);
  vec3 n = normalize(nrm);
  float ndl = dot(n, sunV);
  float day = smoothstep(${TERMINATOR_LO}, ${TERMINATOR_HI}, ndl);
  float shade = mix(nightFloor, 1.0, day);
  vec3 tint = vec3(1.0);
  if (coolNight > 0.5) tint = mix(vec3(${NIGHT_TINT.r}, ${NIGHT_TINT.g}, ${NIGHT_TINT.b}), vec3(1.0), day);
  float tw = smoothstep(${TWILIGHT_LO}, ${TWILIGHT_PEAK_LO}, ndl)
    * (1.0 - smoothstep(${TWILIGHT_PEAK_HI}, ${TWILIGHT_HI}, ndl));
  float twScale = max(albedo.r, max(albedo.g, albedo.b));
  vec3 color = albedo * shade * tint;
  color += vec3(${TWILIGHT_COLOR.r}, ${TWILIGHT_COLOR.g}, ${TWILIGHT_COLOR.b}) * tw * ${TWILIGHT_GAIN} * twScale;
  float luma = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  float blue = albedo.b - max(albedo.r, albedo.g);
  float water = (1.0 - smoothstep(${WATER_LUMA_LO}, ${WATER_LUMA_HI}, luma))
    * smoothstep(${WATER_BLUE_LO}, ${WATER_BLUE_HI}, blue);
  vec3 viewDir = normalize(viewPos);
  vec3 halfDir = normalize(sunV + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), ${GLINT_POWER}.0);
  color += vec3(${GLINT_COLOR.r}, ${GLINT_COLOR.g}, ${GLINT_COLOR.b}) * spec * water * day * glintOn * ${GLINT_GAIN};
  color += vec3(1.0, 0.93, 0.78) * emissive * (1.0 - day);
  color += nightLights * (1.0 - day);
  return color;
}
`;
}
