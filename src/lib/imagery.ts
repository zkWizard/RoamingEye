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
} as const;

/**
 * A bounded study region centred on a point, sized to stay genuinely
 * high-resolution (a small span, even if the searched place is large). Longitude
 * span widens with latitude so the ground footprint stays roughly square.
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
