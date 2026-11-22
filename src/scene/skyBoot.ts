import {
  ACESFilmicToneMapping,
  type BufferGeometry,
  type Camera,
  type Group,
  type Line,
  type Material,
  type Mesh,
  type Object3D,
  type Points,
  type Scene,
  type Sprite,
  type WebGLRenderer,
} from "three";
import { getSun } from "./Sun";
import { createStarfield, mountScattering, type AtmosphereLight } from "./Sky";

/**
 * Stars, the scattering limb, and filmic tone mapping.
 * Loaded after the first frame so none of it sits in the entry chunk.
 */

export interface SkyHooks {
  scene: Scene;
  renderer: WebGLRenderer;
  atmosphere: Mesh;
  /** Dark theme paints stars and a stronger limb. */
  isDark: () => boolean;
  /** Close views drape a data layer on the terrain mesh. Leave those colours flat. */
  scienceOnTerrain: () => boolean;
}

const DARK_GAIN = 0.9;
const LIGHT_GAIN = 0.42;

function materialsOf(object: Object3D): Material[] | null {
  if (!("material" in object)) return null;
  const material = (object as Mesh | Points | Line | Sprite).material;
  if (!material) return null;
  return Array.isArray(material) ? material : [material];
}

function underTerrain(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current.name === "terrain-globe") return true;
    current = current.parent;
  }
  return false;
}

/**
 * ACES on the satellite mesh only. Science colours, overlays, stars, and the
 * limb stay in the values the rest of the app already chose.
 */
function applyToneMapping(root: Object3D, scienceOnTerrain: boolean): void {
  root.traverse((object) => {
    const materials = materialsOf(object);
    if (!materials) return;
    const imagery = underTerrain(object) && !scienceOnTerrain;
    for (const material of materials) {
      if (material.toneMapped !== imagery) material.toneMapped = imagery;
    }
  });
}

export function bootSky(hooks: SkyHooks): void {
  const stars = createStarfield();
  hooks.scene.add(stars);
  const limb: AtmosphereLight = mountScattering(hooks.atmosphere);

  hooks.renderer.toneMapping = ACESFilmicToneMapping;
  hooks.renderer.toneMappingExposure = 1;

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
    const dark = hooks.isDark();
    stars.visible = dark;
    limb.setGain(dark ? DARK_GAIN : LIGHT_GAIN);
    const sun = getSun()?.illumination().satellite;
    if (sun) limb.setSun(sun.x, sun.y, sun.z);
    applyToneMapping(hooks.scene, hooks.scienceOnTerrain());
  };
}
