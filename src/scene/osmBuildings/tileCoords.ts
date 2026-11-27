/**
 * Web-Mercator tile math for OpenFreeMap vector tiles (no rendering deps).
 */

const TILE_EXTENT = 4096;

export function tileIndex(
  latDeg: number,
  lonDeg: number,
  zoom: number
): [number, number] {
  const n = 2 ** zoom;
  const x = Math.floor(((lonDeg + 180) / 360) * n);
  const latRad = (latDeg * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return [x, y];
}

/** Lat/lon in degrees from a tile-local MVT coordinate. */
export function mvtToLatLon(
  x: number,
  y: number,
  tileX: number,
  tileY: number,
  zoom: number
): { lat: number; lon: number } {
  const scale = TILE_EXTENT;
  const worldX = tileX + x / scale;
  const worldY = tileY + y / scale;
  const n = 2 ** zoom;
  const lon = (worldX / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lon };
}

export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}
