import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import type { PerspectiveCamera } from "three";
import { latLngToVector3, vector3ToLatLng } from "../../lib/geo";
import { meshSegmentsForSpan } from "../../lib/tiles";
import { GLOBE_RADIUS } from "../../overlays/types";
import {
  latestFrameIsFresh,
  parseRainViewerMaps,
  RAINVIEWER_MAPS,
  radarTileBounds,
  radarTilesForView,
  radarTileUrl,
  radarZoomForDistance,
  type RadarFrame,
  type RadarManifest,
} from "./manifest";
import { startRadarPlay, stepRadarPlay, type RadarPlay } from "./loop";

const FRAME_MS = 800;
const RADIUS = GLOBE_RADIUS * 1.0011;

type RadarMesh = Mesh<BufferGeometry, MeshBasicMaterial>;

interface ShownTile {
  mesh: RadarMesh;
  url: string;
}

/**
 * RainViewer frames draped on the globe. The playhead lives here and does
 * not write the monthly timeline.
 */
export class RadarDrape {
  readonly object = new Group();
  private manifest: RadarManifest | null = null;
  private play: RadarPlay = { index: 0, playing: false };
  private shown = new Map<string, ShownTile>();
  private readonly loader = new TextureLoader();
  private lastStep = 0;
  private viewKey = "";

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async load(): Promise<void> {
    const response = await this.fetchImpl.call(globalThis, RAINVIEWER_MAPS);
    if (!response.ok) throw new Error(`RainViewer HTTP ${response.status}`);
    this.manifest = parseRainViewerMaps(await response.json());
    if (!latestFrameIsFresh(this.manifest)) {
      throw new Error("RainViewer newest frame is older than 20 minutes");
    }
    this.play = startRadarPlay(this.manifest.frames.length);
    this.viewKey = "";
  }

  update(
    camera: PerspectiveCamera,
    active: boolean,
    now = performance.now()
  ): void {
    this.object.visible = active && this.manifest !== null;
    if (!active || !this.manifest || document.hidden) {
      this.lastStep = now;
      return;
    }
    if (this.play.playing && now - this.lastStep >= FRAME_MS) {
      this.play = stepRadarPlay(this.play, this.manifest.frames.length);
      this.lastStep = now;
      this.viewKey = "";
    }
    const aim = vector3ToLatLng(camera.position);
    const zoom = radarZoomForDistance(camera.position.length());
    const frame = this.manifest.frames[this.play.index];
    if (!frame) return;
    const key = `${frame.path}:${zoom}:${aim.lat.toFixed(1)}:${aim.lon.toFixed(1)}`;
    if (key === this.viewKey) return;
    this.viewKey = key;
    this.syncTiles(frame, aim.lat, aim.lon, zoom);
  }

  playing(): boolean {
    return this.play.playing;
  }

  toggle(): void {
    this.play = { ...this.play, playing: !this.play.playing };
    this.lastStep = performance.now();
  }

  private syncTiles(
    frame: RadarFrame,
    lat: number,
    lon: number,
    zoom: number
  ): void {
    if (!this.manifest) return;
    const wanted = radarTilesForView(lat, lon, zoom);
    const keep = new Set<string>();
    for (const tile of wanted) {
      const id = `${tile.z}/${tile.x}/${tile.y}`;
      const url = radarTileUrl(
        this.manifest.host,
        frame.path,
        tile.z,
        tile.x,
        tile.y
      );
      keep.add(id);
      const existing = this.shown.get(id);
      if (existing) {
        if (existing.url !== url) this.swapTexture(existing, url);
        continue;
      }
      const bounds = radarTileBounds(tile.z, tile.x, tile.y);
      const mesh = buildTileMesh(bounds);
      this.swapTexture({ mesh, url: "" }, url);
      this.shown.set(id, { mesh, url });
      this.object.add(mesh);
    }
    for (const [id, tile] of this.shown) {
      if (keep.has(id)) continue;
      tile.mesh.material.map?.dispose();
      tile.mesh.geometry.dispose();
      this.object.remove(tile.mesh);
      this.shown.delete(id);
    }
  }

  private swapTexture(tile: ShownTile, url: string): void {
    const map = this.loader.load(url);
    map.colorSpace = SRGBColorSpace;
    tile.mesh.material.map?.dispose();
    tile.mesh.material.map = map;
    tile.mesh.material.needsUpdate = true;
    tile.url = url;
  }
}

function buildTileMesh(bounds: {
  north: number;
  south: number;
  west: number;
  east: number;
}): RadarMesh {
  const segsU = meshSegmentsForSpan(bounds.east - bounds.west);
  const segsV = meshSegmentsForSpan(bounds.north - bounds.south);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segsV; i++) {
    const lat = bounds.south + ((bounds.north - bounds.south) * i) / segsV;
    const v = i / segsV;
    for (let j = 0; j <= segsU; j++) {
      const lon = bounds.west + ((bounds.east - bounds.west) * j) / segsU;
      const u = j / segsU;
      const p = latLngToVector3(lat, lon, RADIUS);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  }
  const stride = segsU + 1;
  for (let i = 0; i < segsV; i++) {
    for (let j = 0; j < segsU; j++) {
      const a = i * stride + j;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = new MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(geometry, material);
}
