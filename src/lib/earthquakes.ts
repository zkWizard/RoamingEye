/**
 * USGS earthquake feed model.
 *
 * Pure, render-free parsing of the USGS GeoJSON summary feed (see
 * earthquakes.test.ts). The overlay in overlays/EarthquakesOverlay.ts fetches
 * the feed and renders what this module extracts.
 *
 * Feed docs: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 * Served with permissive CORS, no key required. M4.5+/30-days is ~400 kB.
 */

export interface Earthquake {
  lat: number;
  lon: number;
  /** Hypocenter depth in km (positive down). */
  depthKm: number;
  magnitude: number;
  /** Event time, epoch milliseconds. */
  time: number;
  /** Human-readable location, e.g. "63 km SW of Kokopo, Papua New Guinea". */
  place: string;
}

/** Magnitude 4.5+, last 30 days — global significant seismicity. */
export const USGS_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";

/**
 * Seismology's conventional depth classes, used to color events:
 * shallow (< 70 km), intermediate (70–300 km), deep (> 300 km).
 */
export type DepthClass = "shallow" | "intermediate" | "deep";

export function depthClass(depthKm: number): DepthClass {
  if (depthKm < 70) return "shallow";
  if (depthKm <= 300) return "intermediate";
  return "deep";
}

/**
 * Marker color per depth class (seismological convention: shallow red,
 * intermediate amber, deep blue). Shared by the overlay and the legend so
 * the on-globe colors and the key can never drift apart.
 */
export const DEPTH_CLASS_COLORS: Record<DepthClass, string> = {
  shallow: "#ff5a4e",
  intermediate: "#ffb347",
  deep: "#5aa0ff",
};

/**
 * Parse the USGS GeoJSON summary feed, dropping malformed features rather
 * than throwing — a partially usable feed still renders.
 */
/** Number() that cannot throw: exotic values (null-prototype objects,
 * symbols) read as NaN instead of a TypeError — found by the fuzz suite. */
const toNumber = (v: unknown): number =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;

export function parseEarthquakeFeed(json: unknown): Earthquake[] {
  if (typeof json !== "object" || json === null) return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const out: Earthquake[] = [];
  for (const feature of features) {
    const coords = feature?.geometry?.coordinates;
    const props = feature?.properties;
    if (!Array.isArray(coords) || coords.length < 3 || !props) continue;

    const [lon, lat, depthKm] = coords.map(toNumber);
    const magnitude = toNumber(props.mag);
    const time = toNumber(props.time);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(depthKm) ||
      !Number.isFinite(magnitude) ||
      !Number.isFinite(time) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      continue;
    }

    out.push({
      lat,
      lon,
      depthKm,
      magnitude,
      time,
      place: typeof props.place === "string" ? props.place : "",
    });
  }
  return out;
}
