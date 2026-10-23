import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  ImageOverlayPlugin,
  TerrariumMeshPlugin,
  XYZTilesOverlay,
} from "3d-tiles-renderer/plugins";

/** Esri World Imagery: keyless global satellite base map. */
const BASE_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
/** AWS Open Data Terrarium elevation tiles (keyless, global, ~zoom 15). */
const TERRARIUM_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const WGS84_EQUATORIAL_RADIUS_M = 6_378_137;
/**
 * The terrain sits just inside the unit globe, so the science sphere and every
 * overlay drawn at radius >= 1 stay above the highest summit (Everest is
 * ~0.0014 units). 0.4% is ~25 km: invisible at the app's closest zoom.
 */
const TERRAIN_SCALE = 0.996;

/**
 * Streamed photographic globe: satellite imagery draped over real terrain,
 * refined to the level the view needs. Rendered underneath the science layer,
 * so oceans and no-data areas show the planet instead of black.
 *
 * Tiles are ECEF metres (Z north); the app's globe is unit-radius with +Y
 * north (see latLngToVector3), so the group is scaled and turned -90° about X.
 */
export class TerrainGlobe {
  readonly object: THREE.Group;
  private readonly tiles: TilesRenderer;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly renderer: THREE.WebGLRenderer,
    globeRadius: number
  ) {
    const tiles = new TilesRenderer();
    tiles.registerPlugin(
      new TerrariumMeshPlugin({ url: TERRARIUM_URL, maxZoom: 15 })
    );
    tiles.registerPlugin(
      new ImageOverlayPlugin({
        renderer,
        overlays: [new XYZTilesOverlay({ url: BASE_IMAGERY_URL, levels: 19 })],
      })
    );
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);

    const group = tiles.group;
    group.rotation.x = -Math.PI / 2;
    group.scale.setScalar(
      (globeRadius * TERRAIN_SCALE) / WGS84_EQUATORIAL_RADIUS_M
    );
    group.name = "terrain-globe";
    this.tiles = tiles;
    this.object = group;
  }

  /** Per-frame: pick and load the tiles the current view needs. */
  update(): void {
    this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
    this.camera.updateMatrixWorld();
    this.tiles.update();
  }

  dispose(): void {
    this.tiles.dispose();
  }
}
