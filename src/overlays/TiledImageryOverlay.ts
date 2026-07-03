import * as THREE from "three";
import { latLngToVector3, vector3ToLatLng } from "../lib/geo";
import {
  gibsWmtsTileUrl,
  levelForDegPerPixel,
  tileBounds,
  tilesInView,
  visibleArcDegrees,
  type TileAddress,
} from "../lib/tiles";
import type { LayerConfig, YearMonth } from "../lib/timeline";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type MapOverlay } from "./types";

/**
 * RFC-001 milestone 2: single-level tiled imagery streaming.
 *
 * When enabled, the visible part of the globe is re-draped with WMTS tiles at
 * the finest level the current camera height justifies — so zooming in shows
 * the layer at (up to) its native resolution instead of magnifying the single
 * 2048-px base texture. One fixed LOD per view; quadtree subdivision, culling
 * refinements, and parent-tile fallback are milestones 3-5.
 *
 * Tiles are keyed by (layer, time, level, row, col); an LRU texture cache
 * bounds GPU memory, and a generation counter drops stale loads when the view
 * or timeline moves on.
 */

/** Tiles only activate when finer than the base texture (level 2 ≈ 2048 px). */
const MIN_LEVEL = 3;
/** LRU texture budget (~1 MB of GPU memory per 512² tile). */
const TEXTURE_CACHE_SIZE = 64;
/** Concurrent tile requests. */
const MAX_INFLIGHT = 6;
/** Curved-patch resolution; tiles at level ≥ 3 span ≤ 22.5°, so 12 is smooth. */
const MESH_SEGMENTS = 12;
/** Over-fetch factor around the exact visible window (rotation headroom). */
const VIEW_MARGIN = 1.35;

export class TiledImageryOverlay implements MapOverlay {
  readonly id = "hd";
  readonly label = "HD tiles";
  readonly icon = ICONS.hd;
  readonly object = new THREE.Group();

  private readonly loader = new THREE.TextureLoader();
  private readonly textures = new Map<string, THREE.Texture>(); // LRU
  private readonly meshes = new Map<string, THREE.Mesh>(); // currently shown
  private readonly loading = new Set<string>();
  private queue: { key: string; url: string; tile: TileAddress }[] = [];

  private layer: LayerConfig | undefined;
  private time: string | null = null;
  private generation = 0;
  private lastSignature = "";
  private lastUpdate = 0;

  constructor(private readonly maxAnisotropy = 1) {
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return Promise.resolve(); // tiles stream on update(); nothing to preload
  }

  /** Point the tiler at a layer + month (called on layer/timeline changes). */
  setView(layer: LayerConfig, ym: YearMonth): void {
    const time = layer.static
      ? null
      : `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
    if (this.layer?.id === layer.id && this.time === time) return;
    this.layer = layer;
    this.time = time;
    this.invalidate();
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
    const arcDeg = visibleArcDegrees(distance, camera.fov);

    // Pick the level whose texels roughly match device pixels on screen.
    const target = arcDeg / Math.max(1, viewportHeightPx);
    const level = levelForDegPerPixel(target, this.layer.wmts.maxLevel);
    if (level < MIN_LEVEL) {
      // The base texture is already this sharp — show nothing, save memory.
      this.clearMeshes();
      this.lastSignature = "";
      return;
    }

    const latSpan = arcDeg * VIEW_MARGIN;
    const lonSpan =
      (arcDeg * VIEW_MARGIN * camera.aspect) /
      Math.max(0.2, Math.cos(subpoint.lat * (Math.PI / 180)));
    const center = `${subpoint.lat.toFixed(1)}:${subpoint.lon.toFixed(1)}`;
    const signature = `${this.layer.id}:${this.time}:${level}:${center}:${latSpan.toFixed(1)}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    const wanted = tilesInView(
      subpoint.lat,
      subpoint.lon,
      latSpan,
      Math.min(360, lonSpan),
      level
    );
    this.reconcile(wanted);
  }

  // --- internals -------------------------------------------------------------

  /** Drop everything shown/queued (layer or month changed). */
  private invalidate(): void {
    this.generation++;
    this.queue = [];
    this.clearMeshes();
    this.lastSignature = "";
    // Cached textures for other keys stay — scrubbing back is instant.
  }

  private clearMeshes(): void {
    for (const mesh of this.meshes.values()) {
      this.object.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshBasicMaterial).dispose();
      // Textures belong to the LRU cache, not the mesh — not disposed here.
    }
    this.meshes.clear();
  }

  private reconcile(wanted: TileAddress[]): void {
    if (!this.layer?.wmts) return;
    const wantedKeys = new Set(wanted.map((t) => this.keyFor(t)));

    for (const [key, mesh] of this.meshes) {
      if (wantedKeys.has(key)) continue;
      this.object.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshBasicMaterial).dispose();
      this.meshes.delete(key);
    }

    this.queue = [];
    for (const tile of wanted) {
      const key = this.keyFor(tile);
      if (this.meshes.has(key)) continue;
      const cached = this.textures.get(key);
      if (cached) {
        this.touch(key, cached);
        this.addMesh(key, tile, cached);
      } else if (!this.loading.has(key)) {
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
    }
    this.pump();
  }

  private pump(): void {
    while (this.loading.size < MAX_INFLIGHT && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      const generation = this.generation;
      this.loading.add(job.key);
      this.loader.load(
        job.url,
        (texture) => {
          this.loading.delete(job.key);
          if (generation !== this.generation) {
            texture.dispose(); // superseded by a layer/month change
          } else {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = this.maxAnisotropy;
            this.touch(job.key, texture);
            this.evict();
            this.addMesh(job.key, job.tile, texture);
          }
          this.pump();
        },
        undefined,
        () => {
          // Missing tiles (ocean-only, over-zoom, outages) just stay base-res.
          this.loading.delete(job.key);
          this.pump();
        }
      );
    }
  }

  private addMesh(
    key: string,
    tile: TileAddress,
    texture: THREE.Texture
  ): void {
    if (this.meshes.has(key)) return;
    const b = tileBounds(tile);
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const radius = GLOBE_RADIUS * 1.0008; // above the globe, below line overlays

    for (let i = 0; i <= MESH_SEGMENTS; i++) {
      const v = i / MESH_SEGMENTS;
      const lat = b.south + (b.north - b.south) * v;
      for (let j = 0; j <= MESH_SEGMENTS; j++) {
        const u = j / MESH_SEGMENTS;
        const lon = b.west + (b.east - b.west) * u;
        const p = latLngToVector3(lat, lon, radius);
        positions.push(p.x, p.y, p.z);
        uvs.push(u, v);
      }
    }
    const stride = MESH_SEGMENTS + 1;
    for (let i = 0; i < MESH_SEGMENTS; i++) {
      for (let j = 0; j < MESH_SEGMENTS; j++) {
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
    this.meshes.set(key, mesh);
    this.object.add(mesh);
  }

  private keyFor(tile: TileAddress): string {
    return `${this.layer?.id}:${this.time}:${tile.level}:${tile.row}:${tile.col}`;
  }

  private touch(key: string, texture: THREE.Texture): void {
    this.textures.delete(key);
    this.textures.set(key, texture);
  }

  private evict(): void {
    while (this.textures.size > TEXTURE_CACHE_SIZE) {
      const oldest = this.textures.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      if (this.meshes.has(oldest)) {
        // Oldest is on screen — re-mark it hot instead of evicting.
        const tex = this.textures.get(oldest);
        if (tex) this.touch(oldest, tex);
        break;
      }
      this.textures.get(oldest)?.dispose();
      this.textures.delete(oldest);
    }
  }
}
