import type { Bounds } from "./imagery";

/**
 * WMTS tile math for RFC-001 (tiled imagery streaming), milestone 1.
 *
 * NASA GIBS serves EPSG:4326 (geographic) tiles in named tile-matrix sets
 * ("2km", "1km", "500m", … "15.625m"). The scheme: level 0 is 2 columns × 1
 * row of 512-px tiles covering the whole ±90°/±180° map (each tile spans
 * 180°×180°); every level doubles both counts. Row 0 is the northernmost row
 * (WMTS convention), column 0 starts at -180°.
 *
 * Everything here is pure and render-free (see tiles.test.ts); the mesh /
 * texture plumbing lives in overlays/TiledImageryOverlay.ts (milestone 2).
 */

export const TILE_SIZE = 512;

export interface TileAddress {
  level: number;
  row: number;
  col: number;
}

/** Per-layer WMTS serving parameters (GIBS names its matrix sets by g.s.d.). */
export interface WmtsConfig {
  /** GIBS tile-matrix-set name, e.g. "1km". */
  set: string;
  /** Finest TileMatrix (zoom level) the layer is published at. */
  maxLevel: number;
  /** Tile image extension GIBS serves for this layer. */
  ext: "png" | "jpg";
}

/** Rows/columns in the tile grid at a level (cols = 2·rows). */
export function tileGridSize(level: number): { rows: number; cols: number } {
  const rows = 2 ** level;
  return { rows, cols: rows * 2 };
}

/** Degrees of latitude/longitude spanned by one tile edge at a level. */
export function tileSpanDegrees(level: number): number {
  return 180 / 2 ** level;
}

/** Ground resolution of a tile texel, in degrees per pixel. */
export function degreesPerPixel(level: number): number {
  return tileSpanDegrees(level) / TILE_SIZE;
}

/** Geographic bounds of a tile. */
export function tileBounds({ level, row, col }: TileAddress): Bounds {
  const span = tileSpanDegrees(level);
  const north = 90 - row * span;
  const west = -180 + col * span;
  return { north, south: north - span, west, east: west + span };
}

/** Wrap any longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped;
}

/** The tile containing a lat/lon at a level (lat clamped, lon wrapped). */
export function tileForLatLon(
  lat: number,
  lon: number,
  level: number
): TileAddress {
  const { rows, cols } = tileGridSize(level);
  const span = tileSpanDegrees(level);
  const clampedLat = Math.min(90, Math.max(-90, lat));
  const row = Math.min(
    rows - 1,
    Math.max(0, Math.floor((90 - clampedLat) / span))
  );
  const col = Math.min(
    cols - 1,
    Math.max(0, Math.floor((wrapLon(lon) + 180) / span))
  );
  return { level, row, col };
}

/**
 * The coarsest level whose texels are at least as fine as the target
 * resolution, clamped to the layer's finest published level.
 */
export function levelForDegPerPixel(
  targetDegPerPixel: number,
  maxLevel: number
): number {
  for (let level = 0; level <= maxLevel; level++) {
    if (degreesPerPixel(level) <= targetDegPerPixel) return level;
  }
  return maxLevel;
}

/**
 * How many degrees of great-circle arc are visible vertically from a camera
 * at `distance` (in globe radii, > 1) with the given vertical field of view.
 *
 * Two limits apply: the field-of-view window (near the surface you only see
 * what fits in the frustum) and the horizon (from far away you can never see
 * more than the visible cap). For a ray at angle β from the view axis, the
 * central angle γ to its surface intersection satisfies sin(β)·d = sin(β + γ)
 * (law of sines), so γ = asin(d·sin β) − β while d·sin β ≤ 1; beyond that the
 * ray misses and the horizon cap γ = acos(1/d) rules.
 */
export function visibleArcDegrees(distance: number, fovDeg: number): number {
  const d = Math.max(1.0001, distance);
  const horizonHalf = Math.acos(1 / d);
  const beta = (fovDeg / 2) * (Math.PI / 180);
  const s = d * Math.sin(beta);
  const fovHalf = s < 1 ? Math.asin(s) - beta : Number.POSITIVE_INFINITY;
  return 2 * Math.min(horizonHalf, fovHalf) * (180 / Math.PI);
}

/**
 * All tiles at a level intersecting a lat/lon window centred on a point,
 * handling the antimeridian by wrapping columns. The window is clamped to the
 * poles. `cap` bounds the result for safety (worst case near a pole at a fine
 * level); when the cap would be exceeded the central tiles win.
 */
export function tilesInView(
  centerLat: number,
  centerLon: number,
  latSpanDeg: number,
  lonSpanDeg: number,
  level: number,
  cap = 192
): TileAddress[] {
  const { rows, cols } = tileGridSize(level);
  const span = tileSpanDegrees(level);

  const north = Math.min(90, centerLat + latSpanDeg / 2);
  const south = Math.max(-90, centerLat - latSpanDeg / 2);
  const rowStart = Math.min(
    rows - 1,
    Math.max(0, Math.floor((90 - north) / span))
  );
  const rowEnd = Math.min(
    rows - 1,
    Math.max(0, Math.ceil((90 - south) / span) - 1)
  );

  // Column range, wrapped. A window ≥ 360° means every column.
  const fullRing = lonSpanDeg >= 360;
  const west = centerLon - lonSpanDeg / 2;
  const colStart = Math.floor((west + 180) / span);
  const colCount = fullRing
    ? cols
    : Math.min(cols, Math.ceil(lonSpanDeg / span) + 1);

  // Emit in rings outward from the centre tile so a cap keeps the middle.
  const center = tileForLatLon(centerLat, centerLon, level);
  const out: TileAddress[] = [];
  const seen = new Set<string>();
  const candidates: { tile: TileAddress; dist: number }[] = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let i = 0; i < colCount; i++) {
      const col = (((colStart + i) % cols) + cols) % cols;
      const key = `${row}:${col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Ring distance with column wraparound.
      const dCol = Math.min(
        Math.abs(col - center.col),
        cols - Math.abs(col - center.col)
      );
      const dist = Math.max(Math.abs(row - center.row), dCol);
      candidates.push({ tile: { level, row, col }, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);
  for (const c of candidates) {
    if (out.length >= cap) break;
    out.push(c.tile);
  }
  return out;
}

/**
 * Build a GIBS WMTS REST tile URL. Timed layers address a month by its first
 * day; static (time-less) layers omit the time path segment entirely.
 */
export function gibsWmtsTileUrl(
  gibsLayerId: string,
  time: string | null,
  wmts: WmtsConfig,
  tile: TileAddress
): string {
  const segments = [
    gibsLayerId,
    "default",
    ...(time ? [time] : []),
    wmts.set,
    String(tile.level),
    String(tile.row),
    String(tile.col),
  ];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${segments.join("/")}.${wmts.ext}`;
}
