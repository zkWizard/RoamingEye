import {
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from "three";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";
import {
  parseBuildingHeight,
  parseBuildingMinHeight,
  placeLabelName,
} from "./buildingHeight";
import { mvtToLatLon, tileIndex, tileKey } from "./tileCoords";
import { PlaceLabelLayer, type PlaceLabel } from "./placeLabels";

const DEG2RAD = Math.PI / 180;
const TILE_URL = "https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf";
const BUILDING_ZOOM = 14;
const MAX_TILES = 9;
const MAX_BUILDINGS = 320;

const sharedMaterial = new MeshLambertMaterial({
  color: 0xc4bcb2,
  flatShading: true,
});

const _matrix = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scale = new Vector3();
const _origin = new Vector3();

type TileRecord = { group: Group; key: string };

/**
 * Extruded OSM building footprints (OpenFreeMap vector tiles) at city zoom.
 * Loaded lazily from TerrainGlobe; fetches only the tiles under the camera.
 */
export class OsmBuildingsLayer {
  readonly root: Group;

  private readonly tiles = new Map<string, TileRecord>();
  private readonly inflight = new Set<string>();
  private readonly places = new PlaceLabelLayer();
  private visible = false;

  constructor(
    private readonly parent: Group,
    private readonly sampleElevation: (
      latDeg: number,
      lonDeg: number
    ) => number,
    private readonly terrainHeightScale: () => number
  ) {
    this.root = new Group();
    this.root.name = "osm-buildings";
    parent.add(this.root);
    this.root.visible = false;
  }

  shouldShow(obliqueMpp: number, pitchDeg: number): boolean {
    return pitchDeg >= 5 && obliqueMpp > 0 && obliqueMpp < 120;
  }

  update(view: {
    lat: number;
    lon: number;
    obliqueMpp: number;
    pitchDeg: number;
    cameraDistance: number;
    camera: import("three").PerspectiveCamera;
    viewportHeightPx: number;
  }): void {
    const show = this.shouldShow(view.obliqueMpp, view.pitchDeg);
    this.visible = show;
    this.root.visible = show;
    this.places.update(view.camera, view.viewportHeightPx, view.pitchDeg, show);
    if (!show) return;

    const [cx, cy] = tileIndex(view.lat, view.lon, BUILDING_ZOOM);
    const wanted = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        wanted.add(tileKey(BUILDING_ZOOM, cx + dx, cy + dy));
      }
    }
    for (const key of this.tiles.keys()) {
      if (!wanted.has(key)) this.dropTile(key);
    }
    for (const key of wanted) {
      if (this.tiles.has(key) || this.inflight.has(key)) continue;
      if (this.tiles.size + this.inflight.size >= MAX_TILES) break;
      void this.loadTile(key);
    }
  }

  dispose(): void {
    for (const key of [...this.tiles.keys()]) this.dropTile(key);
    this.places.dispose();
    this.parent.remove(this.root);
  }

  private dropTile(key: string): void {
    const entry = this.tiles.get(key);
    if (!entry) return;
    entry.group.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
      }
    });
    this.root.remove(entry.group);
    this.tiles.delete(key);
  }

  private async loadTile(key: string): Promise<void> {
    const [z, x, y] = key.split("/").map(Number);
    this.inflight.add(key);
    try {
      const url = TILE_URL.replace("{z}", String(z))
        .replace("{x}", String(x))
        .replace("{y}", String(y));
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) return;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength === 0) return;
      if (!this.visible) return;
      const { meshes, places } = await this.parseTile(buffer, x, y, z);
      if (!this.visible) {
        for (const mesh of meshes) mesh.geometry.dispose();
        return;
      }
      const group = new Group();
      for (const mesh of meshes) group.add(mesh);
      this.root.add(group);
      this.tiles.set(key, { group, key });
      if (places.length) {
        this.places.setPlaces(places);
      }
    } catch {
      /* empty tile / network */
    } finally {
      this.inflight.delete(key);
    }
  }

  private async parseTile(
    buffer: ArrayBuffer,
    tileX: number,
    tileY: number,
    zoom: number
  ): Promise<{ meshes: Mesh[]; places: PlaceLabel[] }> {
    const [{ VectorTile }, { default: Pbf }] = await Promise.all([
      import("@mapbox/vector-tile"),
      import("pbf"),
    ]);
    const tile = new VectorTile(new Pbf(new Uint8Array(buffer)));
    const meshes: Mesh[] = [];
    const places: PlaceLabel[] = [];
    const layer = tile.layers.building;
    let count = 0;
    if (layer) {
      for (let i = 0; i < layer.length && count < MAX_BUILDINGS; i++) {
        const feature = layer.feature(i);
        if (feature.type !== 3) continue;
        const mesh = this.meshForFootprint(
          feature as {
            loadGeometry: () => { x: number; y: number }[][];
            properties: unknown;
          },
          tileX,
          tileY,
          zoom,
          feature.properties as Record<string, unknown>
        );
        if (mesh) {
          meshes.push(mesh);
          count++;
        }
      }
    }
    const placeLayer = tile.layers.place;
    if (placeLayer) {
      for (let i = 0; i < placeLayer.length; i++) {
        const feature = placeLayer.feature(i);
        if (feature.type !== 1) continue;
        const props = feature.properties as Record<string, unknown>;
        const name = placeLabelName(props);
        const rank =
          typeof props.rank === "number" ? (props.rank as number) : 99;
        if (!name || rank > 14) continue;
        const pt = feature.loadGeometry()[0]?.[0];
        if (!pt) continue;
        const mx = pt.x;
        const my = pt.y;
        const { lat, lon } = mvtToLatLon(mx, my, tileX, tileY, zoom);
        places.push({ name, lat, lon, rank });
      }
    }
    return { meshes, places };
  }

  private meshForFootprint(
    feature: {
      loadGeometry: () => { x: number; y: number }[][];
      properties: unknown;
    },
    tileX: number,
    tileY: number,
    zoom: number,
    props: Record<string, unknown>
  ): Mesh | null {
    const rings = feature.loadGeometry();
    const ring = rings[0];
    if (!ring || ring.length < 3) return null;
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    for (const pt of ring) {
      const { lat, lon } = mvtToLatLon(pt.x, pt.y, tileX, tileY, zoom);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
    const lat = (minLat + maxLat) / 2;
    const lon = (minLon + maxLon) / 2;
    const metresLat = (((maxLat - minLat) * Math.PI) / 180) * 6_371_000;
    const metresLon =
      (((maxLon - minLon) * Math.PI) / 180) *
      6_371_000 *
      Math.cos(lat * DEG2RAD);
    if (metresLat < 2 || metresLon < 2) return null;
    const height = parseBuildingHeight(props) * this.terrainHeightScale();
    const minH = parseBuildingMinHeight(props) + this.sampleElevation(lat, lon);
    const geometry = new BoxGeometry(
      Math.max(2, metresLon),
      Math.max(2, height),
      Math.max(2, metresLat)
    );
    const mesh = new Mesh(geometry, sharedMaterial);
    mesh.frustumCulled = false;
    WGS84_ELLIPSOID.getCartographicToPosition(
      lat * DEG2RAD,
      lon * DEG2RAD,
      minH + height / 2,
      _pos
    );
    mesh.position.copy(_pos);
    WGS84_ELLIPSOID.getEastNorthUpFrame(
      lat * DEG2RAD,
      lon * DEG2RAD,
      minH,
      _matrix
    );
    _matrix.decompose(_origin, _quat, _scale);
    mesh.quaternion.copy(_quat);
    return mesh;
  }
}
