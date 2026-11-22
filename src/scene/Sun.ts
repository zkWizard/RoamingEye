import {
  Vector3,
  type BufferGeometry,
  type Camera,
  type DirectionalLight,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from "three";
import {
  illuminationInstants,
  sunDirection,
  type IlluminationQuery,
  type SunVector,
} from "../lib/solar";
import {
  createRealEarthUniforms,
  patchBasicScienceMaterial,
  patchScienceMaterial,
  patchTerrainMaterial,
  type RealEarthUniforms,
} from "./realEarthMaterial";

/** A terrain globe that can restamp lighting onto tiles as they load. */
export interface TerrainLightTarget {
  setRealLightPatch(patch: (material: Material) => void): void;
}

export interface SunHooks {
  scene: Scene;
  sunLight: DirectionalLight;
  earthMaterial: Material;
  getTerrain: () => TerrainLightTarget | null;
  /** Sharper science tiles. Patched so "Light the data" reaches them too. */
  getScienceRoot: () => Object3D;
  getClock: () => IlluminationQuery;
  /** Day and night on the satellite base. Default on. */
  getRealLight: () => boolean;
  /** Day and night on science colours. Default off, so legends stay exact. */
  getScienceLight: () => boolean;
}

export interface IlluminationSnapshot {
  satellite: SunVector;
  /** Null when no monthly layer is showing. The direction then matches satellite. */
  monthly: SunVector | null;
  /** The direction actually shading the globe this frame. */
  shown: SunVector;
}

export interface SunHandle {
  /**
   * Night-side emissive gain on the imagery. Issue #1200 (Black Marble) can
   * raise this once it has a lights texture. 0 leaves the night side dimmed.
   */
  setNightEmissive(value: number): void;
  /** Black Marble (or any night-lights map). Sampled on the science sphere. */
  setNightMap(texture: Texture): void;
  /** Latest sun directions, for the atmosphere and anything that follows. */
  illumination(): IlluminationSnapshot;
}

let active: SunHandle | null = null;

/** The sun attached to the scene, if the lighting chunk has loaded. */
export function getSun(): SunHandle | null {
  return active;
}

const FIXED = new Vector3(5, 3, 5);
const scratch = new Vector3();

function toVector(dir: SunVector, target: Vector3): Vector3 {
  return target.set(dir.x, dir.y, dir.z);
}

/**
 * Drive `sunLight` from the solar clock and patch the globe materials.
 * Call once, after the lights exist. Safe to call before the terrain chunk
 * has loaded: tiles are patched when it arrives and again on each load.
 */
export function attachSun(hooks: SunHooks): SunHandle {
  const uniforms = createRealEarthUniforms();
  patchScienceMaterial(hooks.earthMaterial, uniforms);

  let terrainBound = false;
  let snapshot: IlluminationSnapshot = {
    satellite: { x: 1, y: 0, z: 0 },
    monthly: null,
    shown: { x: 1, y: 0, z: 0 },
  };

  const update = (): void => {
    const realLight = hooks.getRealLight();
    const scienceLight = hooks.getScienceLight();
    uniforms.uRealLight.value = realLight ? 1 : 0;
    uniforms.uScienceLight.value = scienceLight ? 1 : 0;

    const clock = hooks.getClock();
    const instants = illuminationInstants(clock);
    const satellite = sunDirection(instants.satellite);
    const monthly = instants.monthly ? sunDirection(instants.monthly) : null;
    const aim = scienceLight && monthly ? monthly : satellite;
    snapshot = { satellite, monthly, shown: aim };
    // One terminator across the satellite oceans and the data on land.
    toVector(aim, uniforms.uSunImagery.value);
    toVector(aim, uniforms.uSunScience.value);

    if (realLight) {
      hooks.sunLight.position.copy(toVector(aim, scratch)).multiplyScalar(8);
    } else {
      hooks.sunLight.position.copy(FIXED);
    }

    if (!terrainBound) {
      const terrain = hooks.getTerrain();
      if (terrain) {
        terrainBound = true;
        terrain.setRealLightPatch((material) => {
          patchTerrainMaterial(material, uniforms);
        });
      }
    }

    hooks.getScienceRoot().traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (
          "isMeshBasicMaterial" in material &&
          material.isMeshBasicMaterial === true
        ) {
          patchBasicScienceMaterial(material, uniforms);
        }
      }
    });
  };

  const previous = hooks.scene.onBeforeRender;
  hooks.scene.onBeforeRender = function (
    this: Object3D,
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    material: Material,
    group: Group
  ) {
    previous.call(this, renderer, scene, camera, geometry, material, group);
    update();
  };

  const handle: SunHandle = {
    setNightEmissive(value: number) {
      uniforms.uNightEmissive.value = value;
    },
    setNightMap(texture) {
      uniforms.uNightMap.value = texture;
      uniforms.uHasNight.value = 1;
    },
    illumination: () => snapshot,
  };
  active = handle;
  update();
  return handle;
}

/** Exposed for tests that want the uniform object the shaders close over. */
export type { RealEarthUniforms };
