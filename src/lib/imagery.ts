import type { YearMonth } from "./timeline";

/**
 * High-resolution "study region" imagery. Where the global layers are coarse
 * (NDVI is 1 km), this streams a sharp true-color patch for a small area on
 * demand from NASA GIBS HLS (Harmonized Landsat-Sentinel, ~30 m, 2015→present).
 *
 * HLS is per-scene daily imagery, so a given date may be cloudy or only
 * partially covered — stepping the timeline finds clearer passes.
 */

export interface Bounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export const HIRES_LAYER = {
  id: "hls",
  label: "High-res (HLS · 30 m)",
  wmsLayer: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance",
  nativeMeters: 30,
  // The cited source dataset (see DatasetRef in lib/timeline.ts).
  dataset: {
    shortName: "HLSS30",
    version: "2.0",
    doi: "10.5067/HLS/HLSS30.002",
    title: "HLS Sentinel-2 Surface Reflectance Daily Global 30m",
  },
} as const;

/**
 * A bounded study region centred on a point, sized to stay genuinely
 * high-resolution (a small span, even if the searched place is large). Longitude
 * span widens with latitude so the ground footprint stays roughly square.
 *
 * Near the antimeridian the box is expressed in continuous longitudes
 * (west < -180 or east > 180) so it stays centred on the point — correct for
 * sampling (lib/probe normalizes) and sphere meshes (trig is periodic).
 * WMS GetMap consumers must pass it through `legalLonBounds` first.
 */
export function regionAround(
  latDeg: number,
  lonDeg: number,
  spanDeg = 1.2
): Bounds {
  const half = spanDeg / 2;
  const south = Math.max(-85, latDeg - half);
  const north = Math.min(85, latDeg + half);
  const cos = Math.max(0.15, Math.cos(latDeg * (Math.PI / 180)));
  const lonHalf = Math.min(30, half / cos);
  return { south, north, west: lonDeg - lonHalf, east: lonDeg + lonHalf };
}

/**
 * Slide a bounds' longitudes into the legal WMS EPSG:4326 range. A GetMap
 * BBOX cannot cross ±180°, so a box that overflows the seam is shifted to
 * abut it — same size, and the point it was built around stays inside (just
 * no longer centred). Kept as the last-resort clamp for single-request
 * consumers; imagery that must stay CENTRED on a near-dateline point uses
 * `splitBoundsAtAntimeridian` and stitches the two legal GetMaps instead
 * (StudyRegion.loadTexture).
 */
export function legalLonBounds(bounds: Bounds): Bounds {
  const width = bounds.east - bounds.west;
  if (width >= 360) return { ...bounds, west: -180, east: 180 };
  if (bounds.west < -180) return { ...bounds, west: -180, east: -180 + width };
  if (bounds.east > 180) return { ...bounds, west: 180 - width, east: 180 };
  return bounds;
}

/** One legal (non-crossing) piece of a bounds, west→east order. */
export interface BoundsPart {
  bounds: Bounds;
  /** This piece's share of the full box's angular width, in (0, 1]. */
  fraction: number;
}

/**
 * Allocate an exact output width across antimeridian pieces without ever
 * issuing an invalid zero-width WMS request. Reserving one pixel per piece
 * matters when a boundary crosses the seam by less than half an output pixel;
 * ordinary rounding can otherwise erase that narrow (but real) geography.
 */
export function allocateBoundsPartWidths(
  parts: BoundsPart[],
  totalWidth: number
): number[] {
  if (!Number.isInteger(totalWidth) || totalWidth < parts.length) {
    throw new Error(
      "RoamingEye: imagery width must provide at least one pixel per bounds part"
    );
  }
  if (parts.length === 0) return [];

  const remaining = totalWidth - parts.length;
  const exact = parts.map((part) => part.fraction * remaining);
  const widths = exact.map((width) => 1 + Math.floor(width));
  const unassigned = totalWidth - widths.reduce((sum, width) => sum + width, 0);
  const remainderOrder = exact
    .map((width, index) => ({ index, remainder: width - Math.floor(width) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < unassigned; i++) widths[remainderOrder[i].index]++;
  return widths;
}

/**
 * Split a continuous-longitude box at the ±180° seam into legal WMS pieces.
 * RFC 7946 §3.1.9 canonized splitting at the antimeridian for geometry; this
 * is the imagery equivalent: each piece is a legal GetMap BBOX, pieces are
 * returned west→east in the box's own (continuous) frame so their images
 * concatenate left-to-right into the texture for the full box, and their
 * fractions sum to 1 for proportional pixel widths. Non-crossing boxes come
 * back unchanged as a single full-width piece — callers need no special
 * casing.
 */
export function splitBoundsAtAntimeridian(bounds: Bounds): BoundsPart[] {
  const width = bounds.east - bounds.west;
  if (width >= 360) {
    return [{ bounds: { ...bounds, west: -180, east: 180 }, fraction: 1 }];
  }
  // Normalize the continuous frame so any crossing appears as east > 180.
  let west = bounds.west;
  let east = bounds.east;
  while (west < -180) {
    west += 360;
    east += 360;
  }
  while (west >= 180) {
    west -= 360;
    east -= 360;
  }
  if (east <= 180) {
    return [{ bounds: { ...bounds, west, east }, fraction: 1 }];
  }
  const westWidth = 180 - west;
  return [
    {
      bounds: { ...bounds, west, east: 180 },
      fraction: westWidth / width,
    },
    {
      bounds: { ...bounds, west: -180, east: east - 360 },
      fraction: (width - westWidth) / width,
    },
  ];
}

export interface RegionImageOptions {
  width?: number;
  height?: number;
  format?: string;
}

/** Build a GIBS WMS GetMap URL for an arbitrary bounding box and date. */
export function gibsRegionUrl(
  wmsLayer: string,
  bounds: Bounds,
  time: string,
  options: RegionImageOptions = {}
): string {
  const { width = 2048, height = 2048, format = "image/jpeg" } = options;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: wmsLayer,
    CRS: "EPSG:4326",
    // WMS 1.3.0 EPSG:4326 axis order is lat,lon → minLat,minLon,maxLat,maxLon.
    BBOX: `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`,
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: format,
    TIME: time,
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
}

/** HLS is addressed by day; we sample mid-month for a given timeline month. */
export function studyDate(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}-15`;
}
