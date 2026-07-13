import { greatCircleDistance } from "./geo";
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
      sourceEventTime: summarizeEarthquakes(valid).time,
      invalidQueryFields,
    },
    provenance: USGS_M45_MONTH_SOURCE,
    units: EARTHQUAKE_PLACE_CONTEXT_UNITS,
    limitations: LIMITATIONS,
  };
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

function compareObservations(
  first: NearbyEarthquakeObservation,
  second: NearbyEarthquakeObservation
): number {
  return (
    first.distanceKm - second.distanceKm ||
    second.time - first.time ||
    second.magnitude - first.magnitude ||
    first.place.localeCompare(second.place)
  );
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
