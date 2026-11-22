import {
  AgXToneMapping,
  SRGBColorSpace,
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
  /** Close views drape a data layer on the terrain mesh. Leave those colours ungraded. */
  scienceOnTerrain: () => boolean;
}

const LIMB_GAIN = 0.9;

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

function paintTone(object: Object3D, imagery: boolean): void {
  const materials = materialsOf(object);
  if (!materials) return;
  for (const material of materials) {
    if (material.toneMapped !== imagery) material.toneMapped = imagery;
  }
}

/**
 * AgX on the satellite mesh only. Science colours, overlays, stars, and the
 * limb stay in the values the rest of the app already chose. Walks the scene
 * once, then only the terrain group when a data drape starts or stops.
 */
function toneMapper(scene: Scene, scienceOnTerrain: () => boolean): () => void {
  let scanned = false;
  let draped: boolean | null = null;
  return () => {
    const onTerrain = scienceOnTerrain();
    if (!scanned) {
      scanned = true;
      scene.traverse((object) => {
        paintTone(object, underTerrain(object) && !onTerrain);
      });
    } else if (draped !== onTerrain) {
      scene.getObjectByName("terrain-globe")?.traverse((object) => {
        paintTone(object, !onTerrain);
      });
    }
    draped = onTerrain;
  };
}

export function bootSky(hooks: SkyHooks): void {
  const stars = createStarfield();
  hooks.scene.add(stars);
  const limb: AtmosphereLight = mountScattering(hooks.atmosphere);

  hooks.renderer.outputColorSpace = SRGBColorSpace;
  hooks.renderer.toneMapping = AgXToneMapping;
  hooks.renderer.toneMappingExposure = 1;
  const syncTone = toneMapper(hooks.scene, hooks.scienceOnTerrain);

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
    stars.visible = true;
    limb.setGain(LIMB_GAIN);
    const sun = getSun()?.illumination().shown;
    if (sun) limb.setSun(sun.x, sun.y, sun.z);
    syncTone();
  };
}
