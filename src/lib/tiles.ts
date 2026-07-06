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

// --- Quadtree LOD selection (RFC-001 milestone 3–4) ---------------------------

/** Everything the LOD selector needs to know about the view. */
export interface LodView {
  /** Camera sub-satellite point, degrees. */
  lat: number;
  lon: number;
  /** Camera distance from the globe centre, in globe radii (> 1). */
  distance: number;
  /** Vertical field of view, degrees. */
  fovDeg: number;
  /** Viewport width / height. */
  aspect: number;
  /** Viewport height in device-independent pixels. */
  viewportHeightPx: number;
}

/** Rotation headroom beyond the exact FOV cone (pre-fetches the near-margin). */
const FOV_CONE_MARGIN = 1.6;

const DEG2RAD = Math.PI / 180;

/** Great-circle central angle between two points, radians (haversine). */
export function centralAngleRad(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const a =
    Math.sin(((lat2 - lat1) * DEG2RAD) / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) *
      Math.cos(lat2 * DEG2RAD) *
      Math.sin(((lon2 - lon1) * DEG2RAD) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Central angle from a point to the nearest point of a tile — 0 when the
 * point is inside the tile. Longitude is handled on the wrapped circle (a
 * tile just east of the antimeridian is near a point just west of it).
 */
export function angleToTileRad(
  lat: number,
  lon: number,
  tile: TileAddress
): number {
  const b = tileBounds(tile);
  const nearLat = Math.min(b.north, Math.max(b.south, lat));
  let best = Infinity;
  for (const candidate of [lon, lon - 360, lon + 360]) {
    const nearLon = Math.min(b.east, Math.max(b.west, candidate));
    best = Math.min(best, centralAngleRad(lat, lon, nearLat, nearLon));
  }
  return best;
}

/**
 * Select the leaf tiles to draw for a view, by screen-space error:
 * descend the quadtree from the root tiles, culling tiles wholly outside the
 * visible cone, and subdividing any tile whose texels would appear larger
 * than a device pixel *at that tile's distance from the camera*. Tiles near
 * the nadir end up fine; tiles toward the edge stay coarse — adaptive LOD
 * instead of one level everywhere.
 *
 * Visibility is the tighter of two cones around the sub-satellite point
 * (the camera is centre-locked, so the view axis is the nadir):
 *  - the horizon cap — nothing past the limb exists on screen;
 *  - the FOV window — the diagonal frustum footprint on the sphere, widened
 *    by a rotation-headroom margin so edge tiles are ready before they scroll
 *    into view.
 *
 * Only leaves at `minLevel` or finer are returned (coarser tiles are no
 * sharper than the base globe texture, so there is nothing to draw). The
 * result is a non-overlapping set; `cap` keeps the closest tiles if the
 * selection would exceed it.
 */
export function selectLodTiles(
  view: LodView,
  minLevel: number,
  maxLevel: number,
  cap = 160
): TileAddress[] {
  const d = Math.max(1.0001, view.distance);
  const horizonRad = Math.acos(1 / d);
  // Diagonal half-FOV: the widest ray the viewport can show.
  const betaDiag = Math.atan(
    Math.tan((view.fovDeg / 2) * DEG2RAD) *
      Math.sqrt(1 + Math.max(0.5, view.aspect) ** 2)
  );
  // Surface central angle where that ray lands (law of sines), if it hits.
  const s = d * Math.sin(betaDiag);
  const fovConeRad =
    s < 1 ? (Math.asin(s) - betaDiag) * FOV_CONE_MARGIN : Infinity;
  // Small extra margin so a tile pops in before its first pixel would.
  const visibleRad =
    Math.min(horizonRad, fovConeRad) + tileSpanDegrees(maxLevel) * DEG2RAD;
  const pixelAngleRad =
    (view.fovDeg * DEG2RAD) / Math.max(1, view.viewportHeightPx);

  const needsFiner = (tile: TileAddress, gammaRad: number): boolean => {
    if (tile.level >= maxLevel) return false;
    // Straight-line distance from the camera to the tile's nearest surface
    // point at central angle γ (law of cosines), then the apparent angular
    // size of one texel at that distance.
    const dist = Math.sqrt(
      Math.max(0.0001, d * d + 1 - 2 * d * Math.cos(gammaRad))
    );
    const texelArcRad = degreesPerPixel(tile.level) * DEG2RAD;
    return texelArcRad / dist > pixelAngleRad;
  };

  const emitted: { tile: TileAddress; gamma: number }[] = [];
  const visit = (tile: TileAddress): void => {
    const gamma = angleToTileRad(view.lat, view.lon, tile);
    if (gamma > visibleRad) return; // beyond the limb or the frustum — cull
    if (needsFiner(tile, gamma)) {
      const { level, row, col } = tile;
      visit({ level: level + 1, row: row * 2, col: col * 2 });
      visit({ level: level + 1, row: row * 2, col: col * 2 + 1 });
      visit({ level: level + 1, row: row * 2 + 1, col: col * 2 });
      visit({ level: level + 1, row: row * 2 + 1, col: col * 2 + 1 });
      return;
    }
    // A leaf. Coarser than minLevel means the base texture already matches
    // this sharpness — draw nothing here.
    if (tile.level >= minLevel) emitted.push({ tile, gamma });
  };
  visit({ level: 0, row: 0, col: 0 });
  visit({ level: 0, row: 0, col: 1 });

  emitted.sort((a, b) => a.gamma - b.gamma);
  return emitted.slice(0, cap).map((e) => e.tile);
}

// --- Parent-tile fallback & cache budgeting (RFC-001 milestone 5) -------------

/**
 * The ancestor of a tile `levelsUp` levels coarser, or null when no such
 * ancestor exists (at or above the root). `levelsUp` must be ≥ 1 — a tile is
 * not its own ancestor.
 */
export function ancestorOf(
  tile: TileAddress,
  levelsUp: number
): TileAddress | null {
  if (levelsUp < 1 || levelsUp > tile.level) return null;
  const n = 2 ** levelsUp;
  return {
    level: tile.level - levelsUp,
    row: Math.floor(tile.row / n),
    col: Math.floor(tile.col / n),
  };
}

/** A sub-rectangle of a texture, in UV space (v = 0 at the image bottom). */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * Where a tile's footprint sits inside its ancestor's texture, as a UV
 * rectangle. Rows count from the north (WMTS) while v counts from the south
 * (GL convention with the default flipY texture upload), hence the flip.
 */
export function ancestorUvRect(tile: TileAddress, levelsUp: number): UvRect {
  const n = 2 ** levelsUp;
  const colOffset = tile.col % n;
  const rowOffset = tile.row % n;
  return {
    u0: colOffset / n,
    u1: (colOffset + 1) / n,
    v0: 1 - (rowOffset + 1) / n,
    v1: 1 - rowOffset / n,
  };
}

/**
 * GPU bytes held by one cached tile texture: 512² RGBA texels plus the ~1/3
 * overhead of its mipmap chain.
 */
export const TILE_TEXTURE_BYTES = Math.round(
  TILE_SIZE * TILE_SIZE * 4 * (4 / 3)
);

/**
 * The tile-texture cache budget for a device, in bytes: ~24 MiB per GiB of
 * reported device memory, clamped to [48, 192] MiB. Callers pass
 * `navigator.deviceMemory` (absent on Safari/Firefox — the 4 GiB default
 * lands on a 96 MiB budget, about 70 tiles).
 */
export function textureBudgetBytes(deviceMemoryGb: number | undefined): number {
  const gb = deviceMemoryGb ?? 4;
  const mib = Math.min(192, Math.max(48, gb * 24));
  return mib * 1024 * 1024;
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
