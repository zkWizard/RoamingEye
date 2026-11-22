import {
  DataTexture,
  LinearFilter,
  Material,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three";
import { realLightGlsl } from "../lib/realLight";

/**
 * Terminator, twilight, and ocean glint, injected into materials the globe
 * already has. Science colours stay exact unless `uScienceLight` is on.
 * `uNightEmissive` is the hook for issue #1200 (Black Marble): it is a gain
 * on the night side and stays 0 until that texture exists.
 */

export interface RealEarthUniforms {
  uSunImagery: { value: Vector3 };
  uSunScience: { value: Vector3 };
  uRealLight: { value: number };
  uScienceLight: { value: number };
  uNightEmissive: { value: number };
  uHasNight: { value: number };
  uNightMap: { value: Texture };
}

const PATCHED = "realEarth";

/** The overlay blend 3d-tiles-renderer writes into the terrain shader. */
export const OVERLAY_BLEND =
  /tint\.rgb \*= tint\.a;\s*diffuseColor = tint \+ diffuseColor \* \( 1\.0 - tint\.a \);/;

export function createRealEarthUniforms(): RealEarthUniforms {
  return {
    uSunImagery: { value: new Vector3(1, 0, 0) },
    uSunScience: { value: new Vector3(1, 0, 0) },
    uRealLight: { value: 1 },
    uScienceLight: { value: 0 },
    uNightEmissive: { value: 0 },
    uHasNight: { value: 0 },
    uNightMap: { value: blackNightMap() },
  };
}

function blackNightMap(): Texture {
  const data = new Uint8Array([0, 0, 0, 255]);
  const texture = new DataTexture(data, 1, 1, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function declare(
  shader: WebGLProgramParametersWithUniforms,
  uniforms: RealEarthUniforms,
  extra: string
): void {
  shader.uniforms.uSunImagery = uniforms.uSunImagery;
  shader.uniforms.uSunScience = uniforms.uSunScience;
  shader.uniforms.uRealLight = uniforms.uRealLight;
  shader.uniforms.uScienceLight = uniforms.uScienceLight;
  shader.uniforms.uNightEmissive = uniforms.uNightEmissive;
  shader.uniforms.uHasNight = uniforms.uHasNight;
  shader.uniforms.uNightMap = uniforms.uNightMap;
  const header = /* glsl */ `
uniform vec3 uSunImagery;
uniform vec3 uSunScience;
uniform float uRealLight;
uniform float uScienceLight;
uniform float uNightEmissive;
uniform float uHasNight;
uniform sampler2D uNightMap;
${extra}
${realLightGlsl()}
`;
  shader.fragmentShader = shader.fragmentShader.replace(
    "void main() {",
    `${header}\nvoid main() {`
  );
}

function rememberKey(material: Material): void {
  const previous = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previous()}|real-earth`;
}

type Compile = (
  shader: WebGLProgramParametersWithUniforms,
  renderer: WebGLRenderer
) => void;

function chain(material: Material, next: Compile): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    next(shader, renderer);
  };
  rememberKey(material);
  material.needsUpdate = true;
  material.userData[PATCHED] = true;
}

const TERRAIN_MAIN = /* glsl */ `
void main() {
  reBase = vec3(1.0);
  reImageryStraight = vec3(1.0);
  reImageryCover = 0.0;
  reScienceStraight = vec3(0.0);
  reScienceCover = 0.0;
`;

const TERRAIN_CAPTURE = /* glsl */ `
#if UNROLLED_LOOP_INDEX == 0
  reImageryStraight = tint.rgb;
  reImageryCover = tint.a;
#else
  reScienceStraight = tint.rgb * tint.a + reScienceStraight * (1.0 - tint.a);
  reScienceCover = tint.a + reScienceCover * (1.0 - tint.a);
#endif
tint.rgb *= tint.a;
diffuseColor = tint + diffuseColor * (1.0 - tint.a);
`;

const TERRAIN_LIGHT = /* glsl */ `
if (uRealLight > 0.5) {
  vec3 imagery = mix(reBase, reImageryStraight, clamp(reImageryCover, 0.0, 1.0));
  if (reImageryCover <= 0.0 && reScienceCover <= 0.0) {
    imagery = diffuseColor.rgb;
  }
  vec3 lit = reShade(imagery, uSunImagery, 1.0, uNightEmissive, RE_NIGHT_FLOOR, vec3(0.0), normal, vViewPosition);
  vec3 outc = lit;
  if (reScienceCover > 0.001) {
    vec3 sci = reScienceStraight / max(reScienceCover, 0.001);
    if (uScienceLight > 0.5) {
      sci = reShade(sci, uSunScience, 0.0, 0.0, RE_SCIENCE_FLOOR, vec3(0.0), normal, vViewPosition);
    }
    outc = sci * reScienceCover + lit * (1.0 - reScienceCover);
  }
  outgoingLight = outc;
}
#include <opaque_fragment>
`;

const SCIENCE_LIGHT = /* glsl */ `
if (uRealLight > 0.5) {
  if (uScienceLight > 0.5) {
    vec3 nightLights = vec3(0.0);
    #ifdef USE_UV
      if (uHasNight > 0.5) nightLights = texture2D(uNightMap, vMapUv).rgb * 1.8;
    #endif
    outgoingLight = reShade(diffuseColor.rgb, uSunScience, 0.0, 0.0, RE_SCIENCE_FLOOR, nightLights, normal, vViewPosition);
  } else {
    outgoingLight = diffuseColor.rgb;
  }
}
#include <opaque_fragment>
`;

let warnedTerrain = false;

/**
 * Imagery (overlay layer 0) gets the terminator, twilight, and ocean glint.
 * Later overlays are science colours: exact, unless `uScienceLight` is on,
 * and never with glint. Re-applied when a tile's material is created.
 */
export function patchTerrainMaterial(
  material: Material,
  uniforms: RealEarthUniforms
): void {
  if (material.userData[PATCHED]) return;
  chain(material, (shader) => {
    declare(
      shader,
      uniforms,
      /* glsl */ `
vec3 reBase;
vec3 reImageryStraight;
float reImageryCover;
vec3 reScienceStraight;
float reScienceCover;
`
    );
    if (!shader.fragmentShader.includes("void main() {")) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      TERRAIN_MAIN
    );
    if (shader.fragmentShader.includes("vec4 tint;")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "vec4 tint;",
        "vec4 tint;\n\treBase = diffuseColor.rgb;"
      );
    }
    if (OVERLAY_BLEND.test(shader.fragmentShader)) {
      shader.fragmentShader = shader.fragmentShader.replace(
        OVERLAY_BLEND,
        TERRAIN_CAPTURE
      );
    } else if (!warnedTerrain) {
      warnedTerrain = true;
      console.warn(
        "RoamingEye: terrain lighting could not find the imagery overlay blend"
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      TERRAIN_LIGHT
    );
  });
}

/**
 * The science sphere. Flat (the colormap, unchanged) unless the visitor turns
 * realistic lighting on for data layers.
 */
export function patchScienceMaterial(
  material: Material,
  uniforms: RealEarthUniforms
): void {
  if (material.userData[PATCHED]) return;
  chain(material, (shader) => {
    declare(shader, uniforms, "");
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      SCIENCE_LIGHT
    );
  });
}

const BASIC_LIGHT = /* glsl */ `
if (uRealLight > 0.5) {
  if (uScienceLight > 0.5) {
    vec3 nrm = normalize(mat3(viewMatrix) * normalize(vReWorld));
    vec3 viewPos = -(viewMatrix * vec4(vReWorld, 1.0)).xyz;
    outgoingLight = reShade(diffuseColor.rgb, uSunScience, 0.0, 0.0, RE_SCIENCE_FLOOR, vec3(0.0), nrm, viewPos);
  } else {
    outgoingLight = diffuseColor.rgb;
  }
}
#include <opaque_fragment>
`;

/**
 * Sharper-imagery tiles are unlit, so a colormap stays exact. The same
 * science-light switch shades them, using the sphere position as the normal.
 */
export function patchBasicScienceMaterial(
  material: Material,
  uniforms: RealEarthUniforms
): void {
  if (material.userData[PATCHED]) return;
  chain(material, (shader) => {
    declare(shader, uniforms, "varying vec3 vReWorld;");
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vReWorld;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n\tvReWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      BASIC_LIGHT
    );
  });
}
