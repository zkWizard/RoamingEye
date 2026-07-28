import * as THREE from "three";
import { latLngToVector3, vector3ToLatLng } from "../lib/geo";
import { loadAbortableTexture } from "../lib/textures";
import {
  ancestorOf,
  ancestorUvRect,
  clampedTileBounds,
  gibsWmtsTileUrl,
  meshSegmentsForSpan,
  selectLodTiles,
  tileBounds,
  textureBudgetBytes,
  TILE_TEXTURE_BYTES,
  type TileAddress,
  type UvRect,
} from "../lib/tiles";
import {
  addMonths,
  compareYm,
  DATA_LATEST,
  type LayerConfig,
  type YearMonth,
} from "../lib/timeline";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type MapOverlay } from "./types";

/**
 * RFC-001 milestones 2–6: quadtree-LOD tiled imagery streaming.
 *
 * On by default: the visible part of the globe is re-draped with WMTS tiles
 * selected by screen-space error (lib/tiles.ts selectLodTiles): the quadtree
 * is descended per view, tiles beyond the horizon are culled, and each tile
 * subdivides until its texels match device pixels at *its own* distance from
 * the camera — fine at the nadir, coarser toward the limb, up to the layer's
 * native resolution. The single full-globe texture remains underneath as the
 * far-zoom level 0 (it matches quadtree level ~2), so from orbit nothing
 * streams at all.
 *
 * While a tile's own texture loads, the tile shows the nearest cached
 * ancestor cropped to its footprint (parent-tile fallback) — zooming refines
 * progressively instead of opening holes. Scrubbing the timeline keeps the
 * previous month's tiles draped until each replacement lands (no flash back
 * to base resolution), and once a view settles the adjacent months' tiles
 * are prefetched so stepping through time in HD is warm. Tiles are keyed by
 * (layer, time, level, row, col); the LRU texture cache is bounded by a
 * device-scaled GPU-memory budget (textures on screen are never evicted),
 * and a generation counter drops stale loads when the layer changes.
 */

/** Tiles only activate when finer than the base texture: the 2048-px globe
 * is 0.176°/px, and level 2 of the GIBS pyramid (0.141°/px) is the first
 * level sharper than that. */
const MIN_LEVEL = 2;
/** Concurrent tile requests. */
const MAX_INFLIGHT = 6;
/** Once a view settles, warm this many nearest tiles for the ±1 months. */
const PREFETCH_TILES = 12;

/** A tile currently draped on the globe. */
interface ShownTile {
  mesh: THREE.Mesh;
  /** Cache key of the texture the mesh displays (an ancestor's, if provisional). */
  textureKey: string;
  /** True while showing an ancestor stand-in instead of the tile's own texture. */
  provisional: boolean;
}

export interface VisibleTileCoverage {
  requested: number;
  loaded: number;
  failed: number;
}

export class TiledImageryOverlay implements MapOverlay {
  readonly id = "hd";
  readonly label = "HD tiles";
  readonly icon = ICONS.hd;
  readonly object = new THREE.Group();
  /** Streaming is the default rendering path (RFC-001 milestone 6). */
  readonly defaultOn = true;

  private readonly textures = new Map<string, THREE.Texture>(); // LRU
  private readonly shown = new Map<string, ShownTile>(); // by address key
  private readonly loading = new Set<string>();
  private queue: { key: string; url: string; tile: TileAddress }[] = [];
  private wantedKeys = new Set<string>();
  private readonly budgetBytes = textureBudgetBytes(
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  );

  private layer: LayerConfig | undefined;
  private time: string | null = null;
  private ym: YearMonth | undefined;
  private lastWanted: TileAddress[] = [];
  private generation = 0;
  private generationAbort = new AbortController();
  private lastSignature = "";
  private lastUpdate = 0;
  private failedWanted = new Set<string>();
  private coverageListener?: (coverage: VisibleTileCoverage) => void;

  constructor(private readonly maxAnisotropy = 1) {
    this.object.visible = false;
  }

  onVisibleCoverageChange(
    listener: (coverage: VisibleTileCoverage) => void
  ): void {
    this.coverageListener = listener;
    this.emitCoverage();
  }

  ensureLoaded(): Promise<void> {
    return Promise.resolve(); // tiles stream on update(); nothing to preload
  }

  /** Point the tiler at a layer + month (called on layer/timeline changes). */
  setView(layer: LayerConfig, ym: YearMonth): void {
    const time = layer.static ? null : timeString(ym);
    if (this.layer?.id === layer.id && this.time === time) return;
    const layerChanged = this.layer !== undefined && this.layer.id !== layer.id;
    this.layer = layer;
    this.time = time;
    this.ym = layer.static ? undefined : ym;
    // A month change keeps the previous month draped until replacements land
    // (warm scrub); a layer change clears — another product's colormap on the
    // globe would be misleading, and the base texture swaps from cache anyway.
    if (layerChanged) this.invalidate();
    else this.retime();
  }

  /**
   * Per-frame hook (cheap, self-throttled): recompute the wanted tile set
   * when the camera has meaningfully moved, then create/remove tile meshes.
   */
  update(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    if (!this.object.visible || !this.layer?.wmts) return;
    const now = performance.now();
    if (now - this.lastUpdate < 250) return;
    this.lastUpdate = now;

    const distance = camera.position.length();
    const subpoint = vector3ToLatLng(camera.position);

    const center = `${subpoint.lat.toFixed(1)}:${subpoint.lon.toFixed(1)}`;
    const signature = `${this.layer.id}:${this.time}:${center}:${distance.toFixed(2)}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    // Adaptive LOD: quadtree descent with horizon culling and per-tile
    // screen-space-error subdivision (see lib/tiles.ts).
    const wanted = selectLodTiles(
      {
        lat: subpoint.lat,
        lon: subpoint.lon,
        distance,
        fovDeg: camera.fov,
        aspect: camera.aspect,
        viewportHeightPx,
      },
      MIN_LEVEL,
      this.layer.wmts.maxLevel
    );
    if (wanted.length === 0) {
      // The base texture is already this sharp — show nothing, save memory.
      this.clearMeshes();
      this.wantedKeys.clear();
      this.lastWanted = [];
      this.failedWanted.clear();
      this.emitCoverage();
      return;
    }
    this.reconcile(wanted);
  }

  // --- internals -------------------------------------------------------------

  /** Drop everything shown/queued and abandon in-flight loads (layer changed). */
  private invalidate(): void {
    this.generation++;
    // Superseded generations' downloads are cancelled outright — a month
    // scrub across N months must not pay for N screenfuls of stale tiles.
    this.generationAbort.abort();
    this.generationAbort = new AbortController();
    this.queue = [];
    this.wantedKeys.clear();
    this.lastWanted = [];
    this.clearMeshes();
    this.lastSignature = "";
    // Cached textures for other keys stay — switching back is instant.
  }

  /**
   * The month moved within the same layer: keep every draped tile as a
   * provisional stand-in (the old month is far better than a base-res flash)
   * and let reconcile() replace each one as the new month's texture lands.
   * In-flight loads are kept too — they complete into the cache, which is
   * exactly what keeps scrubbing back a month instant.
   */
  private retime(): void {
    for (const entry of this.shown.values()) entry.provisional = true;
    this.queue = [];
    this.wantedKeys.clear();
    this.lastWanted = [];
    this.lastSignature = ""; // force a reconcile on the next update()
  }

  private clearMeshes(): void {
    for (const key of [...this.shown.keys()]) this.removeShown(key);
  }

  private removeShown(addrKey: string): void {
    const entry = this.shown.get(addrKey);
    if (!entry) return;
    this.object.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    (entry.mesh.material as THREE.MeshBasicMaterial).dispose();
    // Textures belong to the LRU cache, not the mesh — not disposed here.
    this.shown.delete(addrKey);
  }

  private reconcile(wanted: TileAddress[]): void {
    if (!this.layer?.wmts) return;
    const wantedByAddr = new Map(wanted.map((t) => [addrKey(t), t]));

    for (const key of [...this.shown.keys()]) {
      if (!wantedByAddr.has(key)) this.removeShown(key);
    }

    this.wantedKeys = new Set(wanted.map((t) => this.keyFor(t)));
    this.failedWanted = new Set(
      [...this.failedWanted].filter((key) => this.wantedKeys.has(key))
    );
    this.lastWanted = wanted;
    this.queue = [];
    for (const [akey, tile] of wantedByAddr) {
      const key = this.keyFor(tile);
      const entry = this.shown.get(akey);
      if (entry && !entry.provisional && entry.textureKey === key) continue;

      const cached = this.textures.get(key);
      if (cached) {
        this.touch(key, cached);
        this.show(tile, key, cached, null);
        continue;
      }
      if (!this.loading.has(key)) {
        this.queue.push({
          key,
          url: gibsWmtsTileUrl(
            this.layer.wmsLayer,
            this.time,
            this.layer.wmts,
            tile
          ),
          tile,
        });
      }
      // No texture yet: drape the nearest cached ancestor over this tile's
      // footprint so zooming refines instead of opening a hole (milestone 5).
      if (!entry) this.showFallback(tile);
    }
    this.emitCoverage();
    this.pump();
  }

  /**
   * Queue the nearest visible tiles for the previous/next month, cache-only
   * (completed loads never match wantedKeys, so nothing is draped). Months
   * outside the layer's published record are skipped; the LRU budget still
   * governs, and prefetched entries are evictable since nothing shows them.
   */
  private enqueuePrefetch(): void {
    if (!this.layer?.wmts || !this.ym || this.lastWanted.length === 0) return;
    // Only fill genuine cache headroom: prefetching past the budget would
    // evict, go idle, and re-prefetch in a cycle.
    let headroom = Math.floor(
      this.budgetBytes / TILE_TEXTURE_BYTES - this.textures.size
    );
    for (const delta of [-1, 1]) {
      const neighbor = addMonths(this.ym, delta);
      if (compareYm(neighbor, this.layer.start) < 0) continue;
      if (compareYm(neighbor, this.layer.latest ?? DATA_LATEST) > 0) continue;
      const time = timeString(neighbor);
      for (const tile of this.lastWanted.slice(0, PREFETCH_TILES)) {
        if (headroom <= 0) return;
        const key = this.keyFor(tile, time);
        if (this.textures.has(key) || this.loading.has(key)) continue;
        headroom--;
        this.queue.push({
          key,
          url: gibsWmtsTileUrl(
            this.layer.wmsLayer,
            time,
            this.layer.wmts,
            tile
          ),
          tile,
        });
      }
    }
  }

  /** Show `tile` with the nearest cached ancestor texture, if any exists. */
  private showFallback(tile: TileAddress): void {
    for (let up = 1; up <= tile.level - 1; up++) {
      const anc = ancestorOf(tile, up);
      if (!anc) return;
      const key = this.keyFor(anc);
      const texture = this.textures.get(key);
      if (texture) {
        this.touch(key, texture);
        this.show(tile, key, texture, ancestorUvRect(tile, up), true);
        return;
      }
    }
  }

  private pump(): void {
    // Idle — every wanted tile has loaded (or failed). Warm the cache for the
    // adjacent months so stepping the timeline in HD swaps instantly.
    if (this.queue.length === 0 && this.loading.size === 0) {
      this.enqueuePrefetch();
    }
    while (this.loading.size < MAX_INFLIGHT && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      const generation = this.generation;
      this.loading.add(job.key);
      // Cancellation is per-GENERATION (layer/month change), not per camera
      // move: a tile the camera has left stays worth finishing — it lands in
      // the LRU cache and draping it later is instant.
      loadAbortableTexture(job.url, {
        signal: this.generationAbort.signal,
        retries: 0,
      })
        .then((texture) => {
          this.loading.delete(job.key);
          if (generation !== this.generation) {
            texture.dispose(); // superseded by a layer/month change
          } else {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = this.maxAnisotropy;
            this.touch(job.key, texture);
            // Only drape it if the view still wants it — the camera may have
            // moved on while the request was in flight (it stays cached).
            if (this.wantedKeys.has(job.key)) {
              this.show(job.tile, job.key, texture, null);
            }
            this.failedWanted.delete(job.key);
            this.emitCoverage();
            this.evict();
          }
          this.pump();
        })
        .catch(() => {
          // Abort (superseded generation) or a missing tile (ocean-only,
          // over-zoom, outages) — both keep the parent-tile fallback.
          this.loading.delete(job.key);
          if (
            generation === this.generation &&
            this.wantedKeys.has(job.key) &&
            !this.generationAbort.signal.aborted
          ) {
            this.failedWanted.add(job.key);
            this.emitCoverage();
          }
          this.pump();
        });
    }
  }

  private emitCoverage(): void {
    if (!this.coverageListener) return;
    let loaded = 0;
    for (const key of this.wantedKeys) {
      if (this.textures.has(key)) loaded++;
    }
    this.coverageListener({
      requested: this.wantedKeys.size,
      loaded,
      failed: this.failedWanted.size,
    });
  }

  /**
   * Drape `tile` with `texture` (cropped to `uvRect` when it belongs to an
   * ancestor), replacing whatever the tile currently shows.
   */
  private show(
    tile: TileAddress,
    textureKey: string,
    texture: THREE.Texture,
    uvRect: UvRect | null,
    provisional = false
  ): void {
    const akey = addrKey(tile);
    this.removeShown(akey);

    // Mesh vertices cover the on-globe (clamped) footprint; UV fractions are
    // measured against the full grid-space tile, which automatically crops
    // the padding of edge tiles that overhang +180°/−90° (see lib/tiles.ts).
    const raw = tileBounds(tile);
    const b = clampedTileBounds(tile);
    const rect = uvRect ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const radius = GLOBE_RADIUS * 1.0008; // above the globe, below line overlays
    const segsU = meshSegmentsForSpan(b.east - b.west);
    const segsV = meshSegmentsForSpan(b.north - b.south);

    for (let i = 0; i <= segsV; i++) {
      const lat = b.south + ((b.north - b.south) * i) / segsV;
      const vFrac = (lat - raw.south) / (raw.north - raw.south);
      for (let j = 0; j <= segsU; j++) {
        const lon = b.west + ((b.east - b.west) * j) / segsU;
        const uFrac = (lon - raw.west) / (raw.east - raw.west);
        const p = latLngToVector3(lat, lon, radius);
        positions.push(p.x, p.y, p.z);
        uvs.push(
          rect.u0 + (rect.u1 - rect.u0) * uFrac,
          rect.v0 + (rect.v1 - rect.v0) * vFrac
        );
      }
    }
    const stride = segsU + 1;
    for (let i = 0; i < segsV; i++) {
      for (let j = 0; j < segsU; j++) {
        const a = i * stride + j;
        indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide, // robust against patch winding orientation
      })
    );
    this.shown.set(akey, { mesh, textureKey, provisional });
    this.object.add(mesh);
  }

  private keyFor(tile: TileAddress, time: string | null = this.time): string {
    return `${this.layer?.id}:${time}:${tile.level}:${tile.row}:${tile.col}`;
  }

  private touch(key: string, texture: THREE.Texture): void {
    this.textures.delete(key);
    this.textures.set(key, texture);
  }

  /**
   * Evict least-recently-used textures until the cache fits the GPU-memory
   * budget. Textures currently draped on the globe (including as fallback
   * sources) are skipped, never evicted.
   */
  private evict(): void {
    let bytes = this.textures.size * TILE_TEXTURE_BYTES;
    if (bytes <= this.budgetBytes) return;
    const inUse = new Set<string>();
    for (const entry of this.shown.values()) inUse.add(entry.textureKey);
    for (const key of [...this.textures.keys()]) {
      if (bytes <= this.budgetBytes) break;
      if (inUse.has(key)) continue;
      this.textures.get(key)?.dispose();
      this.textures.delete(key);
      bytes -= TILE_TEXTURE_BYTES;
    }
  }
}

/** Time-independent identity of a tile slot on the globe. */
function addrKey(tile: TileAddress): string {
  return `${tile.level}:${tile.row}:${tile.col}`;
}

/** GIBS WMTS time path segment for a month (addressed by its first day). */
function timeString(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
}
