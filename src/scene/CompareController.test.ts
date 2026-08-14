import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompareController } from "./CompareController";
import { LAYERS } from "../lib/timeline";

/**
 * The comparison split has to be like-for-like: both halves are the same
 * product at the same resolution, so a difference across the seam belongs to
 * the two months and not to the renderer. HD tiles can only ever hold the
 * live month, so they must not be drawn on either side.
 */

/** Record what each scissored pass would actually draw. */
interface Pass {
  hdVisible: boolean;
  map: THREE.Texture | null;
}

function stubLoader(texture: THREE.Texture): void {
  vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(function (
    _url: string,
    onLoad?: (data: THREE.Texture) => void
  ) {
    onLoad?.(texture);
    return texture;
  } as THREE.TextureLoader["load"]);
}

function fakeRenderer(record: () => void): THREE.WebGLRenderer {
  return {
    getSize: (target: THREE.Vector2) => target.set(800, 400),
    setScissorTest: () => {},
    setScissor: () => {},
    render: () => record(),
  } as unknown as THREE.WebGLRenderer;
}

function splitPasses(hd: THREE.Object3D): {
  passes: Pass[];
  material: THREE.MeshStandardMaterial;
} {
  const liveTexture = new THREE.Texture();
  const pinnedTexture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: liveTexture });
  stubLoader(pinnedTexture);

  const controller = new CompareController(material, 1);
  controller.enable(LAYERS.ndvi, { year: 2019, month: 8 });
  expect(controller.showing).toBe(true);

  const passes: Pass[] = [];
  const renderer = fakeRenderer(() =>
    passes.push({ hdVisible: hd.visible, map: material.map })
  );
  controller.renderSplit(
    renderer,
    new THREE.Scene(),
    new THREE.PerspectiveCamera(),
    [hd]
  );
  expect(passes.map((pass) => pass.map)).toEqual([pinnedTexture, liveTexture]);
  return { passes, material };
}

describe("CompareController.renderSplit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses live-only imagery on BOTH sides of the split", () => {
    const hd = new THREE.Object3D();
    hd.visible = true;

    const { passes } = splitPasses(hd);

    // The live pass is the one that used to keep its HD tiles, leaving the
    // "after" half sharper than the "before" half it is being differenced
    // against.
    expect(passes.map((pass) => pass.hdVisible)).toEqual([false, false]);
  });

  it("restores the live-only overlay's own visibility after the split", () => {
    const shown = new THREE.Object3D();
    shown.visible = true;
    expect(splitPasses(shown).passes).toHaveLength(2);
    expect(shown.visible).toBe(true);

    // An overlay the user turned off stays off — the split saves and restores
    // the real state rather than switching tiles back on.
    const hidden = new THREE.Object3D();
    hidden.visible = false;
    expect(splitPasses(hidden).passes).toHaveLength(2);
    expect(hidden.visible).toBe(false);
  });

  it("hands the globe material back its live texture", () => {
    const hd = new THREE.Object3D();
    const { passes, material } = splitPasses(hd);
    expect(material.map).toBe(passes[1].map);
  });
});
