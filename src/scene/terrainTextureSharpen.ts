import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Material,
  Mesh,
  Object3D,
  type Texture,
} from "three";

/**
 * Anisotropic filtering on streamed terrain tiles. Oblique views stretch
 * texels along the view axis; max anisotropy keeps the satellite base sharp.
 */

export function sharpenTerrainMaterial(
  material: Material | Material[],
  maxAnisotropy: number
): void {
  if (Array.isArray(material)) {
    for (const entry of material) sharpenTerrainMaterial(entry, maxAnisotropy);
    return;
  }
  const maps = material as {
    map?: Texture | null;
    bumpMap?: Texture | null;
    displacementMap?: Texture | null;
    emissiveMap?: Texture | null;
  };
  touchTexture(maps.map, maxAnisotropy);
  touchTexture(maps.bumpMap, maxAnisotropy);
  touchTexture(maps.displacementMap, maxAnisotropy);
  touchTexture(maps.emissiveMap, maxAnisotropy);
}

export function sharpenTerrainObject(
  root: Object3D,
  maxAnisotropy: number
): void {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    sharpenTerrainMaterial(child.material, maxAnisotropy);
  });
}

function touchTexture(
  texture: Texture | null | undefined,
  maxAnisotropy: number
): void {
  if (!texture) return;
  texture.anisotropy = maxAnisotropy;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
}
