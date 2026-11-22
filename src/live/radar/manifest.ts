/** RainViewer public radar manifest. Pure, so CI can stub the network. */

export const RAINVIEWER_MAPS =
  "https://api.rainviewer.com/public/weather-maps.json";
/** Radar tiles stop at this zoom. Higher zooms are not published. */
export const RADAR_MAX_ZOOM = 7;
const TWO_HOURS_SEC = 2 * 60 * 60;
const TWENTY_MIN_SEC = 20 * 60;

export interface RadarFrame {
  time: number;
  path: string;
}

export interface RadarManifest {
  host: string;
  /** Past frames from the last two hours, then nowcast, oldest first. */
  frames: RadarFrame[];
  /** Newest timestamp RainViewer published, past or nowcast. */
  newest: number;
}

interface RawFrame {
  time?: unknown;
  path?: unknown;
}

function readFrames(value: unknown): RadarFrame[] {
  if (!Array.isArray(value)) return [];
  const frames: RadarFrame[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as RawFrame;
    if (typeof row.time !== "number" || !Number.isFinite(row.time)) continue;
    if (typeof row.path !== "string" || !row.path.startsWith("/")) continue;
    frames.push({ time: row.time, path: row.path });
  }
  return frames.sort((a, b) => a.time - b.time);
}

/**
 * Past frames from the last two hours, plus every nowcast frame.
 * The last frame is RainViewer's newest, so it is within 20 minutes of
 * that timestamp (the difference is zero when the feed is well formed).
 */
export function parseRainViewerMaps(body: unknown): RadarManifest {
  if (!body || typeof body !== "object") {
    throw new Error("RainViewer response was not an object");
  }
  const root = body as { host?: unknown; radar?: unknown };
  if (typeof root.host !== "string" || !root.host.startsWith("https://")) {
    throw new Error("RainViewer response has no tile host");
  }
  const radar = root.radar;
  if (!radar || typeof radar !== "object") {
    throw new Error("RainViewer response has no radar block");
  }
  const block = radar as { past?: unknown; nowcast?: unknown };
  const past = readFrames(block.past);
  const nowcast = readFrames(block.nowcast);
  const published = [...past, ...nowcast];
  if (published.length === 0) {
    throw new Error("RainViewer published no radar frames");
  }
  const newest = published.reduce((max, frame) => Math.max(max, frame.time), 0);
  const recentPast = past.filter(
    (frame) => newest - frame.time <= TWO_HOURS_SEC
  );
  const frames = [...recentPast, ...nowcast].sort((a, b) => a.time - b.time);
  return { host: root.host.replace(/\/$/, ""), frames, newest };
}

export function latestFrame(manifest: RadarManifest): RadarFrame {
  const frame = manifest.frames[manifest.frames.length - 1];
  if (!frame) throw new Error("Radar manifest has no frames");
  return frame;
}

/** The frame on screen is RainViewer's newest, or within 20 minutes of it. */
export function latestFrameIsFresh(manifest: RadarManifest): boolean {
  return manifest.newest - latestFrame(manifest).time <= TWENTY_MIN_SEC;
}

export function radarTileUrl(
  host: string,
  path: string,
  z: number,
  x: number,
  y: number
): string {
  const zoom = clampRadarZoom(z);
  return `${host}${path}/256/${zoom}/${x}/${y}/2/1_1.png`;
}

export function clampRadarZoom(zoom: number, maxZoom = RADAR_MAX_ZOOM): number {
  if (!Number.isFinite(zoom)) return 0;
  return Math.min(maxZoom, Math.max(0, Math.floor(zoom)));
}

/** Web Mercator tile that contains a lat/lon at a zoom. */
export function radarTileAt(
  lat: number,
  lon: number,
  zoom: number
): { z: number; x: number; y: number } {
  const z = clampRadarZoom(zoom);
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n) % n;
  const latRad = (Math.min(85, Math.max(-85, lat)) * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = Math.min(
    n - 1,
    Math.max(0, Math.floor(((1 - merc / Math.PI) / 2) * n))
  );
  return { z, x: (x + n) % n, y };
}

/**
 * Tiles to drape. Whole world at zoom 0 to 2. A neighbourhood of the view
 * centre after that, never above the radar max zoom.
 */
export function radarTilesForView(
  lat: number,
  lon: number,
  zoom: number
): { z: number; x: number; y: number }[] {
  const z = clampRadarZoom(zoom);
  const n = 2 ** z;
  if (z <= 2) {
    const tiles = [];
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) tiles.push({ z, x, y });
    }
    return tiles;
  }
  const center = radarTileAt(lat, lon, z);
  const radius = z >= 7 ? 2 : 3;
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = (center.x + dx + n) % n;
      const y = center.y + dy;
      if (y < 0 || y >= n) continue;
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/** Geographic footprint of one Web Mercator tile. */
export function radarTileBounds(
  z: number,
  x: number,
  y: number
): { north: number; south: number; west: number; east: number } {
  const zoom = clampRadarZoom(z);
  const n = 2 ** zoom;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const north = tileLat(y, n);
  const south = tileLat(y + 1, n);
  return { north, south, west, east };
}

function tileLat(y: number, n: number): number {
  const merc = Math.PI * (1 - (2 * y) / n);
  return (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
}

/** Coarse zoom from camera distance in globe radii. Never above the radar cap. */
export function radarZoomForDistance(distance: number): number {
  if (distance > 2.8) return 2;
  if (distance > 2.2) return 3;
  if (distance > 1.75) return 4;
  if (distance > 1.45) return 5;
  if (distance > 1.18) return 6;
  return RADAR_MAX_ZOOM;
}
