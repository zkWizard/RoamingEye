import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  ImageOverlayPlugin,
  TerrariumMeshPlugin,
  XYZTilesOverlay,
} from "3d-tiles-renderer/plugins";
import { vector3ToLatLng } from "../lib/geo";
import { gibsMercatorLevels, gibsMercatorTemplate } from "../lib/tiles";
import { scienceShouldDrape } from "../lib/terrainView";
import type { LayerConfig, YearMonth } from "../lib/timeline";

/** Esri World Imagery: keyless global satellite base map. */
const BASE_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
/** AWS Open Data Terrarium elevation tiles (keyless, global, zoom 0–15). */
const TERRARIUM_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const WGS84_EQUATORIAL_RADIUS_M = 6_378_137;
/**
 * The terrain sits just inside the unit globe, so the science sphere and every
 * overlay drawn at radius >= 1 stay above the highest summit (Everest is
 * ~0.0014 units). 0.4% is ~25 km. Height stays at true scale: exaggeration
 * past ~3× would push Everest through that shell.
 */
const TERRAIN_SCALE = 0.996;
/** Esri World Imagery publishes zooms 0–19. `levels` is the count, not the max. */
const IMAGERY_LEVELS = 20;
/** Back off after a drape swap fails so a dead matrix does not retry every frame. */
const SWAP_RETRY_MS = 4000;

interface ScienceRequest {
  key: string;
  url: string;
  levels: number;
}

interface InitializableOverlay extends XYZTilesOverlay {
  whenReady(): Promise<void> | null;
}

/**
 * Streamed photographic globe: Esri imagery draped over Terrarium terrain,
 * refined to the level the view needs.
 *
 * From orbit the NASA composite stays on the unit sphere (transparent no-data,
 * so oceans show this mesh). Up close the same month is added as a second
 * overlay on the mesh itself — the sphere would otherwise hide the relief and
 * sit a fraction off the coastline. Compare mode never drapes: the split is
 * the sphere texture swapped, and a draped month would paint both sides alike.
 *
 * Tiles are ECEF metres (Z north); the app's globe is unit-radius with +Y
 * north, so the group is scaled and turned −90° about X.
 */
export class TerrainGlobe {
  readonly object: THREE.Group;
  /** This frame the science sphere should not draw; the mesh is carrying the month. */
  scienceDraped = false;

  private readonly tiles: TilesRenderer;
  private readonly imageOverlays: ImageOverlayPlugin;
  private desired: ScienceRequest | null = null;
  private science: XYZTilesOverlay | null = null;
  private scienceKey = "";
  private scienceReady = false;
  private swapChain: Promise<void> = Promise.resolve();
  private swapQueued = false;
  private retryAt = 0;
  private generation = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly renderer: THREE.WebGLRenderer,
    globeRadius: number
  ) {
    const tiles = new TilesRenderer();
    const imageOverlays = new ImageOverlayPlugin({
      renderer,
      overlays: [
        new XYZTilesOverlay({ url: BASE_IMAGERY_URL, levels: IMAGERY_LEVELS }),
      ],
    });
    // Terrain first, so its meshes exist before the imagery plugin wraps them.
    tiles.registerPlugin(
      new TerrariumMeshPlugin({ url: TERRARIUM_URL, maxZoom: 15 })
    );
    tiles.registerPlugin(imageOverlays);
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);
    // Mesh bounds omit the GPU displacement, so three.js's own frustum test
    // drops tiles whose summits cross it and the gap reads as a crack. The
    // tiles renderer already culls with the elevation-aware bounds.
    tiles.addEventListener("load-model", ({ scene }) => {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) child.frustumCulled = false;
      });
    });

    const group = tiles.group;
    group.rotation.x = -Math.PI / 2;
    group.scale.setScalar(
      (globeRadius * TERRAIN_SCALE) / WGS84_EQUATORIAL_RADIUS_M
    );
    group.name = "terrain-globe";
    this.tiles = tiles;
    this.imageOverlays = imageOverlays;
    this.object = group;
  }

  /** Remember the month to drape. The overlay is built only once the camera is close. */
  setScience(layer: LayerConfig, ym: YearMonth): void {
    if (!layer.wmts) {
      this.desired = null;
      this.retireScience();
      return;
    }
    const time = layer.static
      ? null
      : `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
    const key = `${layer.id}:${time ?? "static"}`;
    if (this.desired?.key === key) return;
    this.desired = {
      key,
      url: gibsMercatorTemplate(layer.wmsLayer, time, layer.wmts),
      levels: gibsMercatorLevels(layer.wmts),
    };
    if (this.scienceKey !== key) this.retireScience();
  }

  /**
   * Per-frame tile selection. Returns whether the science sphere should stop
   * drawing for this frame. `comparing` forces the sphere to stay, because
   * the split renders by swapping its texture.
   */
  update(comparing: boolean): boolean {
    const distance = this.camera.position.length();
    const { lat } = vector3ToLatLng(this.camera.position);
    // Ask the predicate as if the drape were ready: that is the camera band,
    // including its hysteresis, and the cue to start (or keep) loading.
    const inBand = scienceShouldDrape({
      distance,
      lat,
      comparing: false,
      scienceReady: true,
      draped: this.scienceDraped,
    });
    if (inBand) this.scheduleSwap();

    this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
    this.camera.updateMatrixWorld();
    this.tiles.update();

    const draped = scienceShouldDrape({
      distance,
      lat,
      comparing,
      scienceReady: this.scienceReady && this.scienceKey === this.desired?.key,
      draped: this.scienceDraped,
    });
    if (this.science) this.science.opacity = draped ? 1 : 0;
    this.scienceDraped = draped;
    return draped;
  }

  dispose(): void {
    this.generation++;
    this.tiles.dispose();
  }

  private retireScience(): void {
    this.scienceReady = false;
    this.scienceDraped = false;
    if (this.science) this.science.opacity = 0;
  }

  private scheduleSwap(): void {
    const desired = this.desired;
    if (!desired) return;
    if (this.scienceReady && this.scienceKey === desired.key) return;
    if (this.swapQueued || performance.now() < this.retryAt) return;
    this.swapQueued = true;
    const generation = ++this.generation;
    this.swapChain = this.swapChain
      .then(() => this.runSwap(desired, generation))
      .catch((err: unknown) => {
        console.warn("RoamingEye: science drape failed to swap", err);
        this.retryAt = performance.now() + SWAP_RETRY_MS;
      })
      .finally(() => {
        this.swapQueued = false;
      });
  }

  private async runSwap(
    job: ScienceRequest,
    generation: number
  ): Promise<void> {
    if (generation !== this.generation || this.desired?.key !== job.key) return;
    const previous = this.science;
    const next = new XYZTilesOverlay({
      url: job.url,
      levels: job.levels,
      opacity: 0,
    }) as InitializableOverlay;
    this.imageOverlays.addOverlay(next);
    try {
      await next.whenReady();
    } catch (err) {
      this.deleteQuietly(next);
      throw err;
    }
    if (generation !== this.generation || this.desired?.key !== job.key) {
      this.deleteQuietly(next);
      return;
    }
    this.science = next;
    this.scienceKey = job.key;
    this.scienceReady = true;
    if (previous && previous !== next) this.deleteQuietly(previous);
  }

  /**
   * Overlay removal races tile loads in 3d-tiles-renderer 0.5.3. The patch
   * covers the null tile controller; this covers a throw so a swap cannot
   * take the render loop down with it.
   */
  private deleteQuietly(overlay: XYZTilesOverlay): void {
    try {
      this.imageOverlays.deleteOverlay(overlay);
    } catch (err) {
      console.warn("RoamingEye: retiring a science overlay failed", err);
    }
  }
}
