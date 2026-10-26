import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  ImageOverlayPlugin,
  TerrariumMeshPlugin,
  XYZTilesOverlay,
} from "3d-tiles-renderer/plugins";
import {
  metresAboveEllipsoid,
  minimumCameraDistance,
  nadirMetresPerPixel,
  TERRAIN_SURFACE_SCALE,
  terrainErrorTarget,
  WGS84_EQUATORIAL_RADIUS_M,
} from "../lib/cameraZoom";
import { vector3ToLatLng } from "../lib/geo";
import { imageryRequestPriority } from "../lib/imageryPriority";
import {
  gibsMercatorLevels,
  gibsMercatorTemplate,
  gibsNativeMetresPerPixel,
} from "../lib/tiles";
import { scienceOverlayOpacity, scienceShouldDrape } from "../lib/terrainView";
import type { LayerConfig, YearMonth } from "../lib/timeline";

/** Esri World Imagery: keyless global satellite base map. */
const BASE_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
/** AWS Open Data Terrarium elevation tiles (keyless, global, zoom 0–15). */
const TERRARIUM_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

/**
 * The terrain sits just inside the unit globe, so the science sphere and every
 * overlay drawn at radius >= 1 stay above the highest summit (Everest is
 * ~0.0014 units). 0.4% is ~25 km. Height stays at true scale: exaggeration
 * past ~3× would push Everest through that shell.
 */
const TERRAIN_SCALE = TERRAIN_SURFACE_SCALE;
/** Esri World Imagery publishes zooms 0–19. `levels` is the count, not the max. */
const IMAGERY_LEVELS = 20;
/**
 * Tile downloads per server from orbit. The library default is 25, which
 * crowded out a chart the visitor opened on purpose. Four is enough for a
 * whole-Earth view; a city or a street raises it (HTTP/2 multiplexes, and
 * the per-host cap of six only applies to HTTP/1). A chart still pauses
 * the queue, because that sample is hundreds of requests on its own.
 */
const STREAM_JOBS_PER_ORIGIN = 4;
/** Parallel imagery fetches once the view is a city, then a street. */
const CITY_JOBS_PER_ORIGIN = 8;
const STREET_JOBS_PER_ORIGIN = 12;
/**
 * Screen-space error used until the first frame measures the view. The live
 * target tightens as the camera comes down ({@link terrainErrorTarget}); 6 px
 * from orbit is what kept a whole-disc refine from running forever.
 */
const TERRAIN_ERROR_TARGET = 6;
/**
 * Tiles traversed synchronously per frame. Orbit stays modest so a whole-disc
 * refine cannot hitch; a close view walks the neighbourhood quickly enough
 * that the next zoom level is requested in the same gesture.
 */
const TILES_PROCESSED_ORBIT = 12;
const TILES_PROCESSED_CITY = 24;
const TILES_PROCESSED_STREET = 36;
/** Back off after a drape swap fails so a dead matrix does not retry every frame. */
const SWAP_RETRY_MS = 4000;
/**
 * The draped month is not worth a single request once it is this faint, and
 * it is not rebuilt until it would actually be visible again. The gap stops
 * a camera sitting on the boundary from creating and deleting the overlay
 * every frame.
 */
const SCIENCE_FADE_OUT = 0.02;
const SCIENCE_FADE_IN = 0.08;
/** Matches 3d-tiles-renderer's LOADING state. An in-flight tile can still be aborted. */
const TILE_LOADING = 2;

interface ScienceRequest {
  key: string;
  url: string;
  levels: number;
  /** Ground metres per texel at the layer's finest published zoom. */
  nativeMetres: number;
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
  private readonly terrain: TerrariumMeshPlugin;
  private readonly imageOverlays: ImageOverlayPlugin;
  private readonly bufferSize = new THREE.Vector2();
  private desired: ScienceRequest | null = null;
  private science: XYZTilesOverlay | null = null;
  private scienceKey = "";
  private scienceReady = false;
  private swapChain: Promise<void> = Promise.resolve();
  private swapQueued = false;
  private retryAt = 0;
  private generation = 0;
  private sampling = false;
  /** The science overlay was removed because the view no longer needs it. */
  private scienceHeldBack = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly renderer: THREE.WebGLRenderer,
    globeRadius: number
  ) {
    const tiles = new TilesRenderer();
    const imageOverlays = new ImageOverlayPlugin({
      renderer,
      // Leaf terrain tiles stop at z15. Splitting them is what lets the Esri
      // overlay keep going to z19 once the camera is close enough to need it.
      enableTileSplitting: true,
      overlays: [
        this.prioritizeImagery(
          new XYZTilesOverlay({ url: BASE_IMAGERY_URL, levels: IMAGERY_LEVELS })
        ),
      ],
    });
    const terrain = new TerrariumMeshPlugin({
      url: TERRARIUM_URL,
      maxZoom: 15,
    });
    // Terrain first, so its meshes exist before the imagery plugin wraps them.
    tiles.registerPlugin(terrain);
    tiles.registerPlugin(imageOverlays);
    // The plugin's recommended settings pin errorTarget at 1px, so the globe
    // keeps refining for the whole view. A few pixels of error still reads as
    // terrain up close, and the smaller queues keep the basemap from crowding
    // out the science fetches.
    tiles.errorTarget = TERRAIN_ERROR_TARGET;
    tiles.maxTilesProcessed = TILES_PROCESSED_ORBIT;
    tiles.downloadQueue.maxJobsPerOrigin = STREAM_JOBS_PER_ORIGIN;
    tiles.parseQueue.maxJobs = 2;
    // Parents stay on screen while their children download, so a zoom refines
    // a blurry photograph instead of opening a hole.
    tiles.loadAncestors = true;
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);
    // Mesh bounds omit the GPU displacement, so three.js's own frustum test
    // drops tiles whose summits cross it and the gap reads as a crack. The
    // tiles renderer already culls with the elevation-aware bounds.
    tiles.addEventListener("load-model", ({ scene }) => {
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.frustumCulled = false;
        // Layer 1 receives the terrain fill light (see main.ts).
        child.layers.enable(1);
      });
    });

    const group = tiles.group;
    group.rotation.x = -Math.PI / 2;
    group.scale.setScalar(
      (globeRadius * TERRAIN_SCALE) / WGS84_EQUATORIAL_RADIUS_M
    );
    group.name = "terrain-globe";
    this.tiles = tiles;
    this.terrain = terrain;
    this.imageOverlays = imageOverlays;
    this.object = group;
  }

  /**
   * Closest the camera may come here: street level over flat ground, and
   * above the loaded terrain where the ground rises.
   */
  minimumDistance(latDeg: number, lonDeg: number): number {
    const sampled = this.terrain.sampleCartographicElevation(
      (latDeg * Math.PI) / 180,
      (lonDeg * Math.PI) / 180
    );
    const elev =
      typeof sampled === "number" && Number.isFinite(sampled) ? sampled : 0;
    return minimumCameraDistance(latDeg, elev);
  }

  /**
   * A multi-month sample needs the connection and the main thread. Stop
   * queueing tiles until it finishes; in-flight downloads run out on their own.
   */
  setSampling(active: boolean): void {
    this.sampling = active;
    // Imagery overlays share this queue with the terrain meshes.
    this.tiles.downloadQueue.maxJobsPerOrigin = active
      ? 0
      : STREAM_JOBS_PER_ORIGIN;
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
      nativeMetres: gibsNativeMetresPerPixel(layer.wmts),
    };
    if (this.scienceKey !== key) this.retireScience();
  }

  /**
   * Per-frame tile selection. Returns whether the science sphere should stop
   * drawing for this frame. `comparing` forces the sphere to stay, because
   * the split renders by swapping its texture.
   *
   * `holdScience` keeps the draped month opaque past its native resolution
   * (the sharper-imagery toggle is off). Otherwise the month fades out as
   * the screen outresolves it, and the satellite base shows through. The
   * sphere still steps aside in that band: it is coarser than the base, so
   * leaving it up would paint the fade back on.
   */
  update(
    comparing: boolean,
    holdScience = false,
    /**
     * Altitude a wheel zoom is gliding toward. The fetch decision uses it so
     * a zoom into the satellite photo does not spend the glide requesting a
     * science overlay that will be invisible on arrival.
     */
    previewDistance: number | null = null
  ): boolean {
    const distance = this.camera.position.length();
    const { lat } = vector3ToLatLng(this.camera.position);
    const altitudeM = Math.max(1, metresAboveEllipsoid(distance, lat));
    this.renderer.getDrawingBufferSize(this.bufferSize);
    const metresPerPixel = nadirMetresPerPixel(
      altitudeM,
      this.bufferSize.y,
      this.camera.fov
    );
    // Recomputed every frame: an orbital target never requests z19, and a
    // street-level target from orbit would refine the whole disc.
    this.tiles.errorTarget = terrainErrorTarget(metresPerPixel);

    // Ask the predicate as if the drape were ready: that is the camera band,
    // including its hysteresis, and the cue to start (or keep) loading.
    const inBand = scienceShouldDrape({
      distance,
      lat,
      comparing: false,
      scienceReady: true,
      draped: this.scienceDraped,
    });
    const fadeFor = (metres: number): number =>
      scienceOverlayOpacity({
        altitudeMetres: metres,
        nativeMetresPerPixel:
          this.desired?.nativeMetres ?? Number.POSITIVE_INFINITY,
        viewportHeightPx: this.bufferSize.y,
        fovDeg: this.camera.fov,
        hold: holdScience,
      });
    const shown = fadeFor(altitudeM);
    const previewMetres =
      previewDistance == null
        ? altitudeM
        : Math.max(1, metresAboveEllipsoid(previewDistance, lat));
    const fade = fadeFor(Math.min(altitudeM, previewMetres));
    // A faded month is deleted, not merely hidden: opacity 0 still downloads.
    if (fade <= SCIENCE_FADE_OUT) this.holdBackScience();
    else if (inBand && !this.sampling && fade >= SCIENCE_FADE_IN) {
      this.scheduleSwap();
    }

    if (!this.sampling) {
      const street = metresPerPixel < 30;
      const city = metresPerPixel < 400;
      this.tiles.downloadQueue.maxJobsPerOrigin = street
        ? STREET_JOBS_PER_ORIGIN
        : city
          ? CITY_JOBS_PER_ORIGIN
          : STREAM_JOBS_PER_ORIGIN;
      this.tiles.parseQueue.maxJobs = metresPerPixel < 80 ? 4 : 2;
      this.tiles.maxTilesProcessed = street
        ? TILES_PROCESSED_STREET
        : city
          ? TILES_PROCESSED_CITY
          : TILES_PROCESSED_ORBIT;
      this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
      this.camera.updateMatrixWorld();
      this.tiles.update();
      // A zoom that has already moved on should not keep a connection busy
      // with the altitude it left. Queued tiles are dropped by the renderer;
      // in-flight ones are aborted here once they are no longer on screen.
      if (previewDistance != null) this.cancelStaleDownloads();
    }

    const ready = this.scienceReady && this.scienceKey === this.desired?.key;
    const draped = !comparing && inBand;
    if (this.science) this.science.opacity = draped && ready ? shown : 0;
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

  /**
   * Stop the science overlay from fetching. The month to drape is remembered,
   * so zooming back out builds it again.
   */
  private holdBackScience(): void {
    if (this.scienceHeldBack && !this.science) return;
    this.scienceHeldBack = true;
    if (!this.science && !this.swapQueued) return;
    this.generation++;
    const overlay = this.science;
    this.science = null;
    this.scienceKey = "";
    this.scienceReady = false;
    if (overlay) this.deleteQuietly(overlay);
  }

  /**
   * Drop terrain tiles that are still downloading after the camera has moved
   * past them. The renderer already forgets tiles that are only queued.
   */
  private cancelStaleDownloads(): void {
    const tiles = this.tiles as unknown as {
      loadingTiles?: Set<{ internal?: { loadingState?: number } }>;
    };
    const loading = tiles.loadingTiles;
    if (!loading) return;
    const drop: object[] = [];
    for (const tile of loading) {
      if (
        tile.internal?.loadingState === TILE_LOADING &&
        !this.tiles.lruCache.isUsed(tile)
      ) {
        drop.push(tile);
      }
    }
    for (const tile of drop) this.tiles.lruCache.remove(tile);
  }

  /**
   * Cache immutable tile URLs and fetch the ones under the camera first.
   * The shared queue sorts a lower priority number first.
   */
  private prioritizeImagery(overlay: XYZTilesOverlay): XYZTilesOverlay {
    const queued = overlay as unknown as {
      fetchOptions: RequestInit;
      downloadQueue: {
        add: (
          url: string,
          item: { priority: number },
          callback: () => Promise<Response>,
          signal?: AbortSignal | null
        ) => Promise<Response>;
      };
      fetch: (url: string, options?: RequestInit) => Promise<Response>;
    };
    queued.fetchOptions = { cache: "force-cache" };
    const camera = this.camera;
    queued.fetch = function (
      this: { downloadQueue: (typeof queued)["downloadQueue"] },
      url: string,
      options: RequestInit = {}
    ) {
      const { lat, lon } = vector3ToLatLng(camera.position);
      const priority = imageryRequestPriority(url, lat, lon, performance.now());
      const request: RequestInit = { ...options, cache: "force-cache" };
      return this.downloadQueue.add(
        url,
        { priority },
        () => fetch(url, request),
        options.signal ?? null
      );
    };
    return overlay;
  }

  private scheduleSwap(): void {
    this.scienceHeldBack = false;
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
    const next = this.prioritizeImagery(
      new XYZTilesOverlay({
        url: job.url,
        levels: job.levels,
        opacity: 0,
      })
    ) as InitializableOverlay;
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
