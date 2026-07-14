import { greatCircleDistance } from "./geo";
import { GVP_VOLCANO_SOURCE, VOLCANO_CONTEXT_UNITS } from "./volcanoContext";
import {
  eruptionClass,
  lastEruptionLabel,
  type EruptionClass,
  type Volcano,
} from "./volcanoes";

/**
 * Source-aware place context for the Smithsonian GVP Holocene volcano overlay.
 *
 * The helper selects only supplied volcano records whose summits fall within a
 * requested great-circle radius of a query point, orders them nearest first,
 * and names the nearest. It is render-free so a place panel, an export, or
 * another UI can share the same evidence and coverage contract without treating
 * a nearby volcano as an eruption forecast or a hazard assessment.
 *
 * This mirrors the nearby-seismicity contract in earthquakeContext.ts: it is a
 * spatial inventory around a point, not a statement about the selected boundary
 * itself and not a completeness claim about the catalog.
 */

export const GVP_HOLOCENE_VOLCANO_SOURCE = {
  ...GVP_VOLCANO_SOURCE,
  catalog:
    "Holocene volcanoes (eruptions within roughly the last 10,000 years)",
} as const;

export const VOLCANO_PROXIMITY_UNITS = {
  ...VOLCANO_CONTEXT_UNITS,
  distance: "km (summit great-circle distance)",
  radius: "km (summit great-circle radius)",
} as const;

export interface VolcanoProximityQuery {
  latitude: number;
  longitude: number;
  /** Inclusive radius around the query location, measured along Earth's surface. */
  radiusKm: number;
}

export interface NearbyVolcanoObservation {
  name: string;
  country: string | null;
  /** GVP primary volcano type, retained verbatim, e.g. "Stratovolcano". */
  primaryType: string | null;
  elevationMeters: number | null;
  lastEruptionYear: number | null;
  lastEruptionText: string;
  eruptionClass: EruptionClass;
  /** Summit great-circle distance from the query point. */
  distanceKm: number;
}

export type VolcanoProximityStatus =
  | "available"
  | "no-volcanoes-in-radius"
  | "no-usable-volcanoes"
  | "invalid-query";

export type VolcanoProximityQueryField = "latitude" | "longitude" | "radiusKm";

/**
 * Coverage is scoped to the record array supplied to this helper. A count of
 * zero matched records does not establish that a place is volcanically inactive.
 */
export interface VolcanoProximityCoverage {
  status: VolcanoProximityStatus;
  suppliedRecordCount: number;
  validRecordCount: number;
  matchedRecordCount: number;
  invalidQueryFields: VolcanoProximityQueryField[];
}

export interface VolcanoProximityContext {
  kind: "gvp-nearby-volcano-context";
  isForecast: false;
  query: VolcanoProximityQuery;
  observations: NearbyVolcanoObservation[];
  /** The nearest matched volcano, or null when none fall within the radius. */
  nearest: NearbyVolcanoObservation | null;
  coverage: VolcanoProximityCoverage;
  provenance: typeof GVP_HOLOCENE_VOLCANO_SOURCE;
  units: typeof VOLCANO_PROXIMITY_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only valid records supplied to this helper; no matching volcano does not establish that a location is volcanically inactive.",
  "The bundled dataset is the GVP Holocene inventory, not a complete record of every volcanic feature or vent.",
  "Distances are summit great-circle distances on a mean-radius Earth; they do not account for edifice extent, flow reach, or any hazard footprint.",
  "Does not forecast eruptions, rank hazards, score risk, or infer causes.",
] as const;

const EARTH_RADIUS_KM = 6_371;

/**
 * Build source-aware nearby-volcano context for a place. Matches at the radius
 * boundary are included; results are ordered nearest first, then by most recent
 * known eruption when distances tie, then by name for a stable order.
 */
export function nearbyVolcanoContext(
  volcanoes: readonly Volcano[],
  query: VolcanoProximityQuery
): VolcanoProximityContext {
  const valid = volcanoes.filter(isValidVolcano);
  const invalidQueryFields = queryValidationErrors(query);
  const observations =
    invalidQueryFields.length === 0 ? matchingObservations(valid, query) : [];
  const status: VolcanoProximityStatus =
    invalidQueryFields.length > 0
      ? "invalid-query"
      : observations.length > 0
        ? "available"
        : valid.length === 0
          ? "no-usable-volcanoes"
          : "no-volcanoes-in-radius";

  return {
    kind: "gvp-nearby-volcano-context",
    isForecast: false,
    query,
    observations,
    nearest: observations[0] ?? null,
    coverage: {
      status,
      suppliedRecordCount: volcanoes.length,
      validRecordCount: valid.length,
      matchedRecordCount: observations.length,
      invalidQueryFields,
    },
    provenance: GVP_HOLOCENE_VOLCANO_SOURCE,
    units: VOLCANO_PROXIMITY_UNITS,
    limitations: LIMITATIONS,
  };
}

function matchingObservations(
  volcanoes: readonly Volcano[],
  query: VolcanoProximityQuery
): NearbyVolcanoObservation[] {
  return volcanoes
    .map((volcano) => toObservation(volcano, query))
    .filter((observation) => observation.distanceKm <= query.radiusKm)
    .sort(compareObservations);
}

function toObservation(
  volcano: Volcano,
  query: VolcanoProximityQuery
): NearbyVolcanoObservation {
  return {
    name: volcano.name,
    country: volcano.country,
    primaryType: volcano.type,
    elevationMeters: volcano.elevation,
    lastEruptionYear: volcano.lastEruptionYear,
    lastEruptionText: lastEruptionLabel(volcano.lastEruptionYear),
    eruptionClass: eruptionClass(volcano.lastEruptionYear),
    distanceKm: greatCircleDistance(
      query.latitude,
      query.longitude,
      volcano.lat,
      volcano.lon,
      EARTH_RADIUS_KM
    ),
  };
}

function compareObservations(
  first: NearbyVolcanoObservation,
  second: NearbyVolcanoObservation
): number {
  return (
    first.distanceKm - second.distanceKm ||
    recencyRank(second.lastEruptionYear) -
      recencyRank(first.lastEruptionYear) ||
    first.name.localeCompare(second.name, "en-US")
  );
}

/**
 * Order key for "most recent eruption": a known year sorts by the year itself,
 * and a null year (Holocene evidence only, with no dated eruption) sorts as the
 * least recent. This never averages or invents a year — it only ranks records
 * that already have one ahead of those that do not.
 */
function recencyRank(lastEruptionYear: number | null): number {
  return lastEruptionYear ?? Number.NEGATIVE_INFINITY;
}

function isValidVolcano(volcano: Volcano): boolean {
  return (
    typeof volcano.name === "string" &&
    volcano.name.length > 0 &&
    Number.isFinite(volcano.lat) &&
    Math.abs(volcano.lat) <= 90 &&
    Number.isFinite(volcano.lon) &&
    Math.abs(volcano.lon) <= 180
  );
}

function queryValidationErrors(
  query: VolcanoProximityQuery
): VolcanoProximityQueryField[] {
  const invalid: VolcanoProximityQueryField[] = [];
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
