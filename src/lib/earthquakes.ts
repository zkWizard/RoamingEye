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

import {
  formatReportedMagnitude,
  magnitudeMethodNote,
} from "./magnitudeMethod";

export interface Earthquake {
  lat: number;
  lon: number;
  /** Hypocenter depth in km (positive down). */
  depthKm: number;
  magnitude: number;
  /**
   * Magnitude method/type exactly as reported by USGS (for example "mww" or
   * "mb"). Null means the feed did not supply a non-empty type.
   *
   * Optional only for compatibility with callers constructing observations
   * outside the feed parser; summaries treat omission as unavailable.
   */
  magnitudeType?: string | null;
  /** Event time, epoch milliseconds. */
  time: number;
  /**
   * Source-supplied human-readable location, e.g.
   * "63 km SW of Kokopo, Papua New Guinea"; null when unavailable.
   */
  place: string | null;
  /**
   * Source-record identity and review metadata, when this event came from the
   * parsed USGS GeoJSON feed. Optional for caller-constructed observations;
   * parsed records always carry the object and use null for unavailable fields.
   */
  sourceRecord?: EarthquakeSourceRecord;
}

/** Metadata retained verbatim from one USGS GeoJSON feature. */
export interface EarthquakeSourceRecord {
  /** Stable catalog event identifier from GeoJSON feature.id. */
  id: string | null;
  /** USGS event page URL from properties.url. */
  url: string | null;
  /** Last source update, epoch milliseconds UTC. */
  updatedTime: number | null;
  /** Reported magnitude scale/type, such as "mw" or "mb". */
  magnitudeType: string | null;
  /** USGS review status, commonly "automatic" or "reviewed". */
  reviewStatus: string | null;
  /**
   * USGS-reported horizontal location uncertainty in km. Null when the feed
   * omits it; zero remains a reported value rather than an unavailable state.
   */
  horizontalErrorKm: number | null;
  /**
   * USGS-reported hypocentral-depth uncertainty in km. This is uncertainty on
   * `depthKm`, not depth itself, and is null when unavailable.
   */
  depthErrorKm: number | null;
}

export type EarthquakeFeedStatus =
  "available" | "no-usable-events" | "invalid-feed";

export type EarthquakeRejectionReason =
  | "invalid-geometry"
  | "invalid-coordinates"
  | "invalid-properties"
  | "invalid-measurements";

export interface EarthquakeFeedCoverage {
  status: EarthquakeFeedStatus;
  suppliedFeatureCount: number;
  usableEventCount: number;
  rejectedFeatureCount: number;
  rejectedByReason: Record<EarthquakeRejectionReason, number>;
}

/** Auditable parse result for a supplied USGS GeoJSON payload. */
export interface EarthquakeFeedParseResult {
  earthquakes: Earthquake[];
  coverage: EarthquakeFeedCoverage;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMICITY_UNITS;
}

/** Metadata published with one USGS GeoJSON summary-feed response. */
export interface EarthquakeFeedMetadata {
  /** Time the feed was generated, epoch milliseconds UTC. */
  generatedTime: number | null;
  /** Event count declared by metadata.count. */
  declaredEventCount: number | null;
  title: string | null;
  url: string | null;
  /** HTTP-style status value embedded in the feed metadata. */
  statusCode: number | null;
  apiVersion: string | null;
}

export interface EarthquakeFeedSnapshotCoverage {
  status: "available" | "invalid-feed";
  suppliedFeatureCount: number;
  parsedEventCount: number;
  droppedFeatureCount: number;
  /** Null when the source did not publish a usable metadata.count value. */
  declaredEventCountMatchesFeatures: boolean | null;
}

/**
 * A parsed feed response with source publication metadata and explicit parser
 * coverage. This describes the supplied response only; it is not a statement
 * about seismic completeness, hazard, or future activity.
 */
export interface EarthquakeFeedSnapshot {
  events: Earthquake[];
  metadata: EarthquakeFeedMetadata;
  coverage: EarthquakeFeedSnapshotCoverage;
}

/**
 * Compact, source-faithful text for inspecting one parsed feed observation.
 * The magnitude is left unconverted because summary feeds mix magnitude
 * types, but the reported type is named: an M 5.6 measured as body-wave `mb`
 * and one measured as W-phase moment `mww` are different measurements, not
 * two readings of one quantity. Depth remains in its native kilometres and
 * the event timestamp is rendered explicitly in UTC.
 */
export function formatEarthquakeObservation(earthquake: Earthquake): string {
  const timeUtc = new Date(earthquake.time).toISOString();
  const parts = [
    earthquake.place?.trim() || "Location not supplied",
    formatReportedMagnitude(earthquake.magnitude, earthquake.magnitudeType),
    `${earthquake.depthKm} km depth`,
    timeUtc.replace("Z", " UTC"),
  ];
  // Only appended where the reported value stands above the range USGS
  // documents for its own method, so a routine reading gains no noise.
  const note = magnitudeMethodNote(
    earthquake.magnitude,
    earthquake.magnitudeType
  );
  if (note !== null) parts.push(note);
  return parts.join(" · ");
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
  /** Exact reported magnitude-type labels and explicit unavailable coverage. */
  magnitudeTypes: {
    reportedCounts: Record<string, number>;
    unavailableCount: number;
  };
  depthKm: EarthquakeRange;
  time: EarthquakeRange;
  depthClassCounts: Record<DepthClass, number>;
  magnitudeClassCounts: Record<MagnitudeClass, number>;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMICITY_UNITS;
}

/**
 * Whether an event has the finite measurements and valid GeoJSON geography
 * required by seismic filters, summaries, and rendering consumers.
 */
export function isValidEarthquakeObservation(earthquake: Earthquake): boolean {
  return (
    Number.isFinite(earthquake.lat) &&
    Math.abs(earthquake.lat) <= 90 &&
    Number.isFinite(earthquake.lon) &&
    Math.abs(earthquake.lon) <= 180 &&
    Number.isFinite(earthquake.depthKm) &&
    Number.isFinite(earthquake.magnitude) &&
    Number.isFinite(earthquake.time)
  );
}

/** Magnitude 4.5+, last 30 days in the USGS global summary feed. */
export const USGS_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";

/**
 * Compact, source-faithful text for inspecting a rendered earthquake marker.
 * Values remain in the feed's native magnitude, kilometre, and UTC time units.
 */
export function earthquakeHoverLabel(earthquake: Earthquake): string {
  return `${earthquake.place} · M ${earthquake.magnitude} · ${
    earthquake.depthKm
  } km depth · ${new Date(earthquake.time).toISOString()}`;
}

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
 * The conventional USGS magnitude-class descriptors, which bin the reported
 * magnitude value into named categories of earthquake size:
 * great (≥ 8), major (7–7.9), strong (6–6.9), moderate (5–5.9),
 * light (4–4.9), minor (3–3.9), micro (< 3).
 *
 * These label the earthquake's magnitude (a measure of the energy released at
 * the source); they are NOT ground-shaking intensity (the separate Modified
 * Mercalli scale), a damage estimate, or a hazard rating, all of which also
 * depend on depth, distance, and local site conditions this feed does not
 * report. The USGS summary overlay is filtered to M4.5+, so events at the
 * micro/minor/light lower end appear only when this helper is given a broader
 * catalog.
 *
 * Reference: USGS "Earthquake Magnitude, Energy Release, and Shaking Intensity"
 * (https://www.usgs.gov/programs/earthquake-hazards/earthquake-magnitude-energy-release-and-shaking-intensity).
 */
export type MagnitudeClass =
  "micro" | "minor" | "light" | "moderate" | "strong" | "major" | "great";

/** Magnitude classes ordered weakest to strongest for deterministic iteration. */
export const MAGNITUDE_CLASS_ORDER: readonly MagnitudeClass[] = [
  "micro",
  "minor",
  "light",
  "moderate",
  "strong",
  "major",
  "great",
] as const;

/**
 * Bin a reported magnitude into its conventional USGS descriptor class. The
 * lower bound of each class is inclusive; non-finite magnitudes have no class
 * and return null so callers never mislabel malformed input.
 */
export function magnitudeClass(magnitude: number): MagnitudeClass | null {
  if (!Number.isFinite(magnitude)) return null;
  if (magnitude >= 8) return "great";
  if (magnitude >= 7) return "major";
  if (magnitude >= 6) return "strong";
  if (magnitude >= 5) return "moderate";
  if (magnitude >= 4) return "light";
  if (magnitude >= 3) return "minor";
  return "micro";
}

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
  return earthquakes.filter((earthquake) => {
    const { magnitude, depthKm, time } = earthquake;
    return (
      isValidEarthquakeObservation(earthquake) &&
      (filters.minMagnitude === undefined ||
        magnitude >= filters.minMagnitude) &&
      (filters.maxMagnitude === undefined ||
        magnitude <= filters.maxMagnitude) &&
      (filters.minDepthKm === undefined || depthKm >= filters.minDepthKm) &&
      (filters.maxDepthKm === undefined || depthKm <= filters.maxDepthKm) &&
      (filters.startTime === undefined || time >= filters.startTime) &&
      (filters.endTime === undefined || time <= filters.endTime)
    );
  });
}

/** Aggregate supplied events while retaining source and native unit labels. */
export function summarizeEarthquakes(
  earthquakes: readonly Earthquake[]
): EarthquakeSummary {
  const valid = earthquakes.filter(isValidEarthquakeObservation);
  const depthClassCounts: Record<DepthClass, number> = {
    shallow: 0,
    intermediate: 0,
    deep: 0,
  };
  const magnitudeClassCounts = emptyMagnitudeClassCounts();
  const magnitudeTypeCounts = new Map<string, number>();
  let unavailableMagnitudeTypeCount = 0;
  for (const earthquake of valid) {
    depthClassCounts[depthClass(earthquake.depthKm)] += 1;
    const magClass = magnitudeClass(earthquake.magnitude);
    // magClass is non-null here: valid events already passed a finite-magnitude
    // check, but the guard keeps the aggregation total-safe regardless.
    if (magClass !== null) magnitudeClassCounts[magClass] += 1;
    if (
      typeof earthquake.magnitudeType === "string" &&
      earthquake.magnitudeType.trim() !== ""
    ) {
      magnitudeTypeCounts.set(
        earthquake.magnitudeType,
        (magnitudeTypeCounts.get(earthquake.magnitudeType) ?? 0) + 1
      );
    } else {
      unavailableMagnitudeTypeCount += 1;
    }
  }

  return {
    eventCount: valid.length,
    magnitude: rangeFor(valid.map((earthquake) => earthquake.magnitude)),
    magnitudeTypes: {
      reportedCounts: Object.fromEntries(
        [...magnitudeTypeCounts.entries()].sort(([first], [second]) =>
          first < second ? -1 : first > second ? 1 : 0
        )
      ),
      unavailableCount: unavailableMagnitudeTypeCount,
    },
    depthKm: rangeFor(valid.map((earthquake) => earthquake.depthKm)),
    time: rangeFor(valid.map((earthquake) => earthquake.time)),
    depthClassCounts,
    magnitudeClassCounts,
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

/** A zeroed tally with one entry per class, so absent classes read as 0. */
function emptyMagnitudeClassCounts(): Record<MagnitudeClass, number> {
  return {
    micro: 0,
    minor: 0,
    light: 0,
    moderate: 0,
    strong: 0,
    major: 0,
    great: 0,
  };
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
  return parseEarthquakeFeedWithCoverage(json).earthquakes;
}

/**
 * Parse the USGS feed while retaining whether an empty result came from an
 * invalid payload, zero usable records, or a successfully parsed event set.
 * Each rejected feature is assigned exactly one reason in validation order.
 */
export function parseEarthquakeFeedWithCoverage(
  json: unknown
): EarthquakeFeedParseResult {
  const rejectedByReason: Record<EarthquakeRejectionReason, number> = {
    "invalid-geometry": 0,
    "invalid-coordinates": 0,
    "invalid-properties": 0,
    "invalid-measurements": 0,
  };
  const invalidFeed = (): EarthquakeFeedParseResult => ({
    earthquakes: [],
    coverage: {
      status: "invalid-feed",
      suppliedFeatureCount: 0,
      usableEventCount: 0,
      rejectedFeatureCount: 0,
      rejectedByReason,
    },
    source: SEISMICITY_SOURCE,
    units: SEISMICITY_UNITS,
  });

  if (typeof json !== "object" || json === null) return invalidFeed();
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return invalidFeed();

  const out: Earthquake[] = [];
  for (const feature of features) {
    const geometry = feature?.geometry;
    const coords = geometry?.coordinates;
    const props = feature?.properties;
    if (!props || typeof props !== "object") {
      rejectedByReason["invalid-properties"] += 1;
      continue;
    }
    if (
      geometry?.type !== "Point" ||
      !Array.isArray(coords) ||
      coords.length < 3
    ) {
      rejectedByReason["invalid-geometry"] += 1;
      continue;
    }

    const [lon, lat, depthKm] = coords.map(toNumber);
    const magnitude = toNumber(props.mag);
    const time = toNumber(props.time);
    // Kept as two checks rather than one predicate so each rejection is
    // counted under the reason that actually disqualified the feature.
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      rejectedByReason["invalid-coordinates"] += 1;
      continue;
    }
    if (
      !Number.isFinite(depthKm) ||
      !Number.isFinite(magnitude) ||
      !Number.isFinite(time)
    ) {
      rejectedByReason["invalid-measurements"] += 1;
      continue;
    }

    out.push({
      lat,
      lon,
      depthKm,
      magnitude,
      magnitudeType:
        typeof props.magType === "string" && props.magType.trim() !== ""
          ? props.magType
          : null,
      time,
      place: typeof props.place === "string" ? props.place : null,
      sourceRecord: {
        id: typeof feature.id === "string" ? feature.id : null,
        url: typeof props.url === "string" ? props.url : null,
        updatedTime: finiteNumberOrNull(props.updated),
        magnitudeType: typeof props.magType === "string" ? props.magType : null,
        reviewStatus: typeof props.status === "string" ? props.status : null,
        horizontalErrorKm: nonNegativeFiniteNumberOrNull(props.horizontalError),
        depthErrorKm: nonNegativeFiniteNumberOrNull(props.depthError),
      },
    });
  }
  const rejectedFeatureCount = features.length - out.length;
  return {
    earthquakes: out,
    coverage: {
      status: out.length > 0 ? "available" : "no-usable-events",
      suppliedFeatureCount: features.length,
      usableEventCount: out.length,
      rejectedFeatureCount,
      rejectedByReason,
    },
    source: SEISMICITY_SOURCE,
    units: SEISMICITY_UNITS,
  };
}

/**
 * Parse a USGS GeoJSON summary response while retaining its publication
 * metadata and reporting how many supplied features were usable.
 */
export function parseEarthquakeFeedSnapshot(
  json: unknown
): EarthquakeFeedSnapshot {
  const parsed = parseEarthquakeFeedWithCoverage(json);
  const feed =
    typeof json === "object" && json !== null
      ? (json as { features?: unknown; metadata?: unknown })
      : null;
  const metadata = parseFeedMetadata(feed?.metadata);
  return {
    events: parsed.earthquakes,
    metadata,
    coverage: {
      status:
        parsed.coverage.status === "invalid-feed"
          ? "invalid-feed"
          : "available",
      suppliedFeatureCount: parsed.coverage.suppliedFeatureCount,
      parsedEventCount: parsed.coverage.usableEventCount,
      droppedFeatureCount: parsed.coverage.rejectedFeatureCount,
      declaredEventCountMatchesFeatures:
        metadata.declaredEventCount === null || !Array.isArray(feed?.features)
          ? null
          : metadata.declaredEventCount === feed.features.length,
    },
  };
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = toNumber(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeFiniteNumberOrNull(value: unknown): number | null {
  const number = finiteNumberOrNull(value);
  return number !== null && number >= 0 ? number : null;
}

function parseFeedMetadata(value: unknown): EarthquakeFeedMetadata {
  const metadata =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const declaredEventCount = nonNegativeIntegerOrNull(metadata.count);
  return {
    generatedTime: finiteNumberOrNull(metadata.generated),
    declaredEventCount,
    title: stringOrNull(metadata.title),
    url: stringOrNull(metadata.url),
    statusCode: finiteNumberOrNull(metadata.status),
    apiVersion: stringOrNull(metadata.api),
  };
}

function nonNegativeIntegerOrNull(value: unknown): number | null {
  const number = toNumber(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
