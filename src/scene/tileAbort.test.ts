import { describe, expect, it } from "vitest";
// The app resolves 3d-tiles-renderer to these sources (vite.config.ts), so the
// patch in patches/ is what runs. The package "import" condition points at the
// prebuilt bundle, which the patch does not touch.
import {
  ImageOverlay,
  ImageOverlayPlugin,
} from "../../node_modules/3d-tiles-renderer/src/three/plugins/images/ImageOverlayPlugin.js";

/**
 * A place search (and satellite follow) flies the camera while tiles are
 * still loading. 3d-tiles-renderer 0.5.4 then reads `.signal` on an init or
 * a controller that the drop already cleared, and the page toasts
 * "Cannot read properties of undefined (reading 'signal')".
 */

interface FetchSurface {
  downloadQueue: {
    add: (
      url: string,
      item: unknown,
      callback: unknown,
      signal: AbortSignal | null
    ) => Promise<unknown>;
  };
  fetch: (url: string, options?: RequestInit | null) => Promise<unknown>;
}

interface PluginSurface {
  tiles: unknown;
  overlayInfo: Map<unknown, unknown>;
  tileControllers: Map<unknown, unknown>;
  _initTileSceneOverlayInfo: (
    scene: unknown,
    tile: unknown,
    overlay: unknown
  ) => Promise<void>;
}

describe("a tile dropped mid-load", () => {
  it("does not throw reading signal when fetch is called with a null init", async () => {
    const overlay = new ImageOverlay() as unknown as FetchSurface;
    overlay.downloadQueue = {
      add(
        _url: string,
        _item: unknown,
        _callback: unknown,
        signal: AbortSignal | null
      ) {
        return Promise.resolve(signal);
      },
    };
    await expect(
      overlay.fetch("https://example.invalid/tile.png", null)
    ).resolves.toBeNull();
  });

  it("does not throw reading signal when the overlay controller is already gone", async () => {
    const plugin = new ImageOverlayPlugin(
      {} as ConstructorParameters<typeof ImageOverlayPlugin>[0]
    ) as unknown as PluginSurface;
    const tile = { boundingVolume: { region: null } };
    const overlay = {
      isReady: true,
      isPlanarProjection: false,
      projection: null,
      lockTextureSafe() {
        /* the tile was dropped before a texture was locked */
      },
    };
    plugin.tiles = {
      surface: null,
      visibleTiles: new Set(),
      group: { matrixWorldInverse: {} },
    };
    plugin.overlayInfo = new Map([
      [overlay, { controller: undefined, tileInfo: new Map() }],
    ]);
    plugin.tileControllers = new Map();
    const scene = {
      updateMatrixWorld() {},
      traverse() {},
      parent: null,
    };
    await expect(
      plugin._initTileSceneOverlayInfo(scene, tile, overlay)
    ).resolves.toBeUndefined();
  });
});
