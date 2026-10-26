/**
 * Download priority for a slippy-map tile.
 *
 * The shared queue sorts a lower number first. A tile requested a moment ago
 * still beats one from an earlier zoom, so spinning the wheel does not finish
 * the altitude just left. Within the same moment the tile under the camera
 * comes before the limb, and a finer tile comes before the parent it covers.
 */

export interface SlippyTile {
  z: number;
  x: number;
  y: number;
}

/** Last `{z}/{y}/{x}` in a tile URL. Esri and GIBS both publish that order. */
export function slippyTileFromUrl(url: string): SlippyTile | null {
  const match = url.match(/\/(\d+)\/(\d+)\/(\d+)(?:\.\w+)?(?:\?|#|$)/);
  if (!match) return null;
  const z = Number(match[1]);
  const y = Number(match[2]);
  const x = Number(match[3]);
  if (z > 22 || x < 0 || y < 0) return null;
  return { z, x, y };
}

/** Centre of a Web Mercator tile, in degrees. */
export function slippyTileCenter(tile: SlippyTile): {
  lat: number;
  lon: number;
} {
  const n = 2 ** tile.z;
  const lon = ((tile.x + 0.5) / n) * 360 - 180;
  const merc = Math.PI * (1 - (2 * (tile.y + 0.5)) / n);
  const lat = (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
  return { lat, lon };
}

/**
 * Queue priority for one imagery request. `now` is `performance.now()` so a
 * newer zoom sorts ahead of the tiles it replaced.
 */
export function imageryRequestPriority(
  url: string,
  latDeg: number,
  lonDeg: number,
  now: number
): number {
  const tile = slippyTileFromUrl(url);
  if (!tile) return -now;
  const center = slippyTileCenter(tile);
  const dLat = ((center.lat - latDeg) * Math.PI) / 180;
  const dLon =
    (((center.lon - lonDeg) * Math.PI) / 180) *
    Math.cos((latDeg * Math.PI) / 180);
  const distance = Math.hypot(dLat, dLon);
  return -now + distance * 80 - tile.z * 0.05;
}
