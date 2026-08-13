import { greatCircleDistance } from "./geo";
import { formatReportedMagnitude } from "./magnitudeScale";
import {
  depthClass,
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  summarizeEarthquakes,
  USGS_FEED_URL,
  type DepthClass,
  type Earthquake,
  type EarthquakeRange,
  type EarthquakeSummary,
} from "./earthquakes";

/**
 * Source-aware place context for the live USGS M4.5+ earthquake overlay.
 *
 * The helper selects only supplied earthquake observations whose epicentres
 * fall within a requested great-circle radius. It is render-free so a place
 * panel, an export, or another UI can use the same evidence and coverage
 * contract without treating nearby events as a hazard assessment.
 */

export const USGS_M45_MONTH_SOURCE = {
  ...SEISMICITY_SOURCE,
  feedUrl: USGS_FEED_URL,
  feedWindow: "rolling past 30 days at source retrieval time",
  minimumMagnitude: 4.5,
} as const;

export const EARTHQUAKE_PLACE_CONTEXT_UNITS = {
  ...SEISMICITY_UNITS,
  coordinates: "decimal degrees",
  distance: "km (epicentral great-circle distance)",
  radius: "km (epicentral great-circle radius)",
} as const;

export interface EarthquakePlaceQuery {
  latitude: number;
  longitude: number;
  /** Inclusive radius around the query location, measured along Earth's surface. */
  radiusKm: number;
}

/**
 * Turn a `[south, north, west, east]` search extent into the smallest radial
 * query that still contains every corner of that extent.
 *
 * The nearby-seismicity helper is radial while place search is rectangular, so
 * some conversion is unavoidable. Circumscribing (rather than inscribing) the
 * extent keeps the query a superset of the searched area: no event inside the
 * boundary is silently dropped. The cost is that the circle also reaches
 * *outside* the boundary near its corners, so matched events are "near this
 * place", not "inside this place" — callers must say so, and every observation
 * carries its own `distanceKm` for exactly that reason.
 *
 * Bounds that are missing, non-finite, or outside valid coordinate ranges
 * produce a deliberately invalid query, which `nearbyEarthquakeContext`
 * reports as `invalid-query` rather than as an empty-but-valid result.
 */
export function searchExtentEarthquakeQuery(
  boundingBox: readonly [number, number, number, number] | null
): EarthquakePlaceQuery {
  if (!boundingBox || !isUsableExtent(boundingBox)) {
    return { latitude: NaN, longitude: NaN, radiusKm: NaN };
  }

  const [south, north, west, rawEast] = boundingBox;
  // A west > east extent crosses the antimeridian; unwrap the eastern edge so
  // the midpoint and corner distances are measured across the seam, not the
  // long way around the globe.
  const east = rawEast < west ? rawEast + 360 : rawEast;
  const latitude = (south + north) / 2;
  const longitude = normalizeLongitude((west + east) / 2);

  const radiusKm = Math.max(
    ...[south, north].flatMap((cornerLat) =>
      [west, east].map((cornerLon) =>
        greatCircleDistance(
          latitude,
          longitude,
          cornerLat,
          normalizeLongitude(cornerLon),
          EARTH_RADIUS_KM
        )
      )
    )
  );

  return { latitude, longitude, radiusKm };
}

function isUsableExtent(
  boundingBox: readonly [number, number, number, number]
): boolean {
  const [south, north, west, east] = boundingBox;
  return (
    boundingBox.every((value) => Number.isFinite(value)) &&
    Math.abs(south) <= 90 &&
    Math.abs(north) <= 90 &&
    south <= north &&
    Math.abs(west) <= 180 &&
    Math.abs(east) <= 180
  );
}

/** Wrap a longitude into [-180, 180]; +180 is preserved rather than flipped. */
function normalizeLongitude(longitude: number): number {
  if (longitude > 180) return ((longitude + 180) % 360) - 180;
  if (longitude < -180) return ((longitude - 180) % 360) + 180;
  return longitude;
}

export interface NearbyEarthquakeObservation extends Earthquake {
  /** Surface distance from the query point to the event epicentre. */
  distanceKm: number;
  depthClass: DepthClass;
}

export type EarthquakePlaceContextStatus =
  "available" | "no-events-in-radius" | "no-usable-events" | "invalid-query";

export type EarthquakePlaceQueryField = "latitude" | "longitude" | "radiusKm";

/**
 * Coverage is scoped to the event array supplied to this helper. The source
 * time range is an observed range, not a statement of feed completeness.
 */
export interface EarthquakePlaceCoverage {
  status: EarthquakePlaceContextStatus;
  suppliedEventCount: number;
  validEventCount: number;
  matchedEventCount: number;
  /** Observed epicentral-distance range for matched events, in kilometres. */
  matchedDistanceKm: EarthquakeRange;
  sourceEventTime: EarthquakeRange;
  invalidQueryFields: EarthquakePlaceQueryField[];
}

export interface EarthquakePlaceContext {
  kind: "usgs-nearby-earthquake-context";
  isForecast: false;
  query: EarthquakePlaceQuery;
  observations: NearbyEarthquakeObservation[];
  summary: EarthquakeSummary;
  coverage: EarthquakePlaceCoverage;
  provenance: typeof USGS_M45_MONTH_SOURCE;
  units: typeof EARTHQUAKE_PLACE_CONTEXT_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only valid events supplied to this helper; no matching event does not establish that a location is seismically quiet.",
  "The overlay feed is a global M4.5+ rolling 30-day summary, not a complete earthquake catalog.",
  "Distances are epicentral great-circle distances on a mean-radius Earth; hypocentre depth is reported separately and is not part of the distance.",
] as const;

const EARTH_RADIUS_KM = 6_371;

/**
 * Build source-aware nearby seismicity context for a place. Matches at the
 * radius boundary are included and results are ordered nearest first, then by
 * most recent event when distances tie.
 */
export function nearbyEarthquakeContext(
  earthquakes: readonly Earthquake[],
  query: EarthquakePlaceQuery
): EarthquakePlaceContext {
  const valid = earthquakes.filter(isValidEarthquake);
  const invalidQueryFields = queryValidationErrors(query);
  const observations =
    invalidQueryFields.length === 0 ? matchingObservations(valid, query) : [];
  const status: EarthquakePlaceContextStatus =
    invalidQueryFields.length > 0
      ? "invalid-query"
      : observations.length > 0
        ? "available"
        : valid.length === 0
          ? "no-usable-events"
          : "no-events-in-radius";

  return {
    kind: "usgs-nearby-earthquake-context",
    isForecast: false,
    query,
    observations,
    summary: summarizeEarthquakes(observations),
    coverage: {
      status,
      suppliedEventCount: earthquakes.length,
      validEventCount: valid.length,
      matchedEventCount: observations.length,
      matchedDistanceKm: rangeForObservations(observations),
      sourceEventTime: summarizeEarthquakes(valid).time,
      invalidQueryFields,
    },
    provenance: USGS_M45_MONTH_SOURCE,
    units: EARTHQUAKE_PLACE_CONTEXT_UNITS,
    limitations: LIMITATIONS,
  };
}

function rangeForObservations(
  observations: readonly NearbyEarthquakeObservation[]
): EarthquakeRange {
  if (observations.length === 0) return { min: null, max: null };
  // matchingObservations orders nearest first, but derive both bounds directly
  // so this coverage contract remains correct if presentation ordering changes.
  const distances = observations.map(({ distanceKm }) => distanceKm);
  return { min: Math.min(...distances), max: Math.max(...distances) };
}

function matchingObservations(
  earthquakes: readonly Earthquake[],
  query: EarthquakePlaceQuery
): NearbyEarthquakeObservation[] {
  return earthquakes
    .map((earthquake) => ({
      ...earthquake,
      distanceKm: greatCircleDistance(
        query.latitude,
        query.longitude,
        earthquake.lat,
        earthquake.lon,
        EARTH_RADIUS_KM
      ),
      depthClass: depthClass(earthquake.depthKm),
    }))
    .filter((earthquake) => earthquake.distanceKm <= query.radiusKm)
    .sort(compareObservations);
}

/**
 * The matched observation carrying the largest reported magnitude value.
 *
 * "Largest reported value", not "largest earthquake": the feed mixes magnitude
 * methods and no exact conversion between them is published (see
 * lib/magnitudeScale.ts), so this is a maximum over reported numbers rather
 * than a ranking of event size.
 *
 * Reported magnitudes are quantised to a tenth of a magnitude unit, so exact
 * ties between two matched events are ordinary rather than rare. The comparator
 * is therefore total and independent of input order — nearest epicentre first,
 * then most recent, then source-reported place — so this picker cannot change
 * its answer if the presentation ordering of `observations` changes.
 *
 * Returns null for an empty set: there is no observation to report, and naming
 * a placeholder would read as a finding.
 */
export function largestReportedMagnitudeObservation(
  observations: readonly NearbyEarthquakeObservation[]
): NearbyEarthquakeObservation | null {
  let largest: NearbyEarthquakeObservation | null = null;
  for (const observation of observations) {
    if (
      largest === null ||
      compareByReportedMagnitude(observation, largest) < 0
    ) {
      largest = observation;
    }
  }
  return largest;
}

function compareByReportedMagnitude(
  first: NearbyEarthquakeObservation,
  second: NearbyEarthquakeObservation
): number {
  return (
    second.magnitude - first.magnitude ||
    first.distanceKm - second.distanceKm ||
    second.time - first.time ||
    compareNullablePlace(first.place, second.place)
  );
}

/**
 * One-sentence magnitude composition for the whole matched set, phrased so the
 * mixing of magnitude methods is visible rather than implied.
 *
 * It characterises every matched event, which matters where a UI can only list
 * part of the set: the nearby-seismicity list is ordered nearest first and
 * truncated, so the largest value the feed reported near a place is routinely
 * absent from it, and nothing else in the section names the methods behind the
 * values shown.
 *
 * Returns null for an empty matched set — there is no composition to report,
 * and an absence of matched events is already stated by the section itself.
 */
export function reportedMagnitudeText(
  context: EarthquakePlaceContext
): string | null {
  const largest = largestReportedMagnitudeObservation(context.observations);
  if (largest === null) return null;

  const eventCount = context.coverage.matchedEventCount;
  const { reportedCounts, unavailableCount } = context.summary.magnitudeTypes;
  const reportedTypes = Object.entries(reportedCounts);
  const methodParts = reportedTypes.map(([type, count]) => `${type} ×${count}`);
  if (unavailableCount > 0) {
    methodParts.push(`type not reported ×${unavailableCount}`);
  }
  // A single method is stated plainly; only a genuinely mixed set carries the
  // comparability caveat, so a uniform set gains no noise.
  const methods =
    methodParts.length > 1
      ? ` Matched events mix magnitude methods (${methodParts.join(", ")}), which are not directly comparable.`
      : reportedTypes.length === 1
        ? ` Every matched event was reported as ${reportedTypes[0][0]}.`
        : " No matched event carried a reported magnitude method.";

  return (
    `Largest reported value across all ${eventCount} matched ${eventCount === 1 ? "event" : "events"}: ` +
    `${formatReportedMagnitude(largest.magnitude, largest.magnitudeType)}, ` +
    `${formatDistanceKm(largest.distanceKm)} km away.${methods}` +
    " This is a maximum over reported values, not a ranking of earthquake size and not a hazard statement."
  );
}

/** Distances span city blocks to whole countries; keep both legible. */
function formatDistanceKm(distanceKm: number): string {
  return distanceKm >= 10
    ? String(Math.round(distanceKm))
    : distanceKm.toFixed(1);
}

function compareObservations(
  first: NearbyEarthquakeObservation,
  second: NearbyEarthquakeObservation
): number {
  return (
    first.distanceKm - second.distanceKm ||
    second.time - first.time ||
    second.magnitude - first.magnitude ||
    compareNullablePlace(first.place, second.place)
  );
}

function compareNullablePlace(
  first: string | null,
  second: string | null
): number {
  if (first === null) return second === null ? 0 : 1;
  if (second === null) return -1;
  return first.localeCompare(second);
}

function isValidEarthquake(earthquake: Earthquake): boolean {
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

function queryValidationErrors(
  query: EarthquakePlaceQuery
): EarthquakePlaceQueryField[] {
  const invalid: EarthquakePlaceQueryField[] = [];
  if (!Number.isFinite(query.latitude) || Math.abs(query.latitude) > 90) {
    invalid.push("latitude");
  }
  if (!Number.isFinite(query.longitude) || Math.abs(query.longitude) > 180) {
    invalid.push("longitude");
  }
  if (!Number.isFinite(query.radiusKm) || query.radiusKm < 0) {
    invalid.push("radiusKm");
  }
  return invalid;
}
