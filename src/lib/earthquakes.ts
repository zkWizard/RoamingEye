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

/**
 * Provenance retained by seismic filters and summaries. The USGS feed reports
 * earthquake magnitude values, hypocentre depth in kilometres, and UTC epoch
 * timestamps; it does not supply a hazard assessment or forecast.
 *
 * Source: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 */
export const SEISMICITY_SOURCE = {
  name: "USGS Earthquake Hazards Program GeoJSON summary feed",
  url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
} as const;

export const SEISMICITY_UNITS = {
  magnitude: "M",
  depth: "km",
  time: "epoch milliseconds (UTC)",
} as const;

/** Inclusive bounds for a descriptive subset of parsed USGS feed events. */
export interface EarthquakeFilters {
  minMagnitude?: number;
  maxMagnitude?: number;
  minDepthKm?: number;
  maxDepthKm?: number;
  startTime?: number;
  endTime?: number;
}

export interface EarthquakeRange {
  min: number | null;
  max: number | null;
}

/**
 * A descriptive aggregation of supplied events, not a risk score, diagnosis,
 * causal statement, or prediction. Null ranges make an empty input explicit.
 */
export interface EarthquakeSummary {
  eventCount: number;
  magnitude: EarthquakeRange;
  depthKm: EarthquakeRange;
  time: EarthquakeRange;
  depthClassCounts: Record<DepthClass, number>;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMICITY_UNITS;
}

/** Magnitude 4.5+, last 30 days in the USGS global summary feed. */
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
 * Select events inside inclusive magnitude, depth, and time bounds. Invalid
 * bounds return no events so callers never silently broaden a requested
 * filter. The returned array preserves feed order.
 */
export function filterEarthquakes(
  earthquakes: readonly Earthquake[],
  filters: EarthquakeFilters = {}
): Earthquake[] {
  if (!validFilters(filters)) return [];
  return earthquakes.filter(
    ({ magnitude, depthKm, time }) =>
      Number.isFinite(magnitude) &&
      Number.isFinite(depthKm) &&
      Number.isFinite(time) &&
      (filters.minMagnitude === undefined ||
        magnitude >= filters.minMagnitude) &&
      (filters.maxMagnitude === undefined ||
        magnitude <= filters.maxMagnitude) &&
      (filters.minDepthKm === undefined || depthKm >= filters.minDepthKm) &&
      (filters.maxDepthKm === undefined || depthKm <= filters.maxDepthKm) &&
      (filters.startTime === undefined || time >= filters.startTime) &&
      (filters.endTime === undefined || time <= filters.endTime)
  );
}

/** Aggregate supplied events while retaining source and native unit labels. */
export function summarizeEarthquakes(
  earthquakes: readonly Earthquake[]
): EarthquakeSummary {
  const valid = earthquakes.filter(
    ({ magnitude, depthKm, time }) =>
      Number.isFinite(magnitude) &&
      Number.isFinite(depthKm) &&
      Number.isFinite(time)
  );
  const depthClassCounts: Record<DepthClass, number> = {
    shallow: 0,
    intermediate: 0,
    deep: 0,
  };
  for (const earthquake of valid) {
    depthClassCounts[depthClass(earthquake.depthKm)] += 1;
  }

  return {
    eventCount: valid.length,
    magnitude: rangeFor(valid.map((earthquake) => earthquake.magnitude)),
    depthKm: rangeFor(valid.map((earthquake) => earthquake.depthKm)),
    time: rangeFor(valid.map((earthquake) => earthquake.time)),
    depthClassCounts,
    source: SEISMICITY_SOURCE,
    units: SEISMICITY_UNITS,
  };
}

function validFilters(filters: EarthquakeFilters): boolean {
  const values = Object.values(filters);
  if (values.some((value) => value !== undefined && !Number.isFinite(value))) {
    return false;
  }
  return (
    (filters.minMagnitude === undefined ||
      filters.maxMagnitude === undefined ||
      filters.minMagnitude <= filters.maxMagnitude) &&
    (filters.minDepthKm === undefined ||
      filters.maxDepthKm === undefined ||
      filters.minDepthKm <= filters.maxDepthKm) &&
    (filters.startTime === undefined ||
      filters.endTime === undefined ||
      filters.startTime <= filters.endTime)
  );
}

function rangeFor(values: readonly number[]): EarthquakeRange {
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

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
