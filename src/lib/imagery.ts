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
 * no longer centred). The honest trade-off until seam-stitched double
 * requests exist; without it a near-dateline search sends an illegal BBOX.
 */
export function legalLonBounds(bounds: Bounds): Bounds {
  const width = bounds.east - bounds.west;
  if (width >= 360) return { ...bounds, west: -180, east: 180 };
  if (bounds.west < -180) return { ...bounds, west: -180, east: -180 + width };
  if (bounds.east > 180) return { ...bounds, west: 180 - width, east: 180 };
  return bounds;
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
