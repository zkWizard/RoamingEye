import { greatCircleDistance } from "./geo";
import type { Position } from "./geojson";
import { decodePlatePair, type DecodedPlatePair } from "./platePairs";
import { BIRD_2003_PLATE_BOUNDARY_SOURCE } from "./plateBoundaryContext";
import type { PlateBoundary } from "./plates";

/**
 * Total digitized length of the configured Bird (2003) plate boundaries,
 * aggregated per plate pair.
 *
 * Each overlay feature (see plates.ts) is a polyline of [lon, lat] vertices
 * carrying only a plate-pair label. This module sums the great-circle length
 * of those vertices and groups the totals by plate pair, decoding the label
 * through the PB2002 vocabulary (see platePairs.ts) so a place panel or export
 * can report how much boundary the bundled model maps for, say, Africa–
 * Antarctica.
 *
 * Pure geodesy on the supplied linework, provenance-first:
 *  - Length is the great-circle sum of the *digitized* vertices, so it inherits
 *    the digitization/generalization resolution of the bundled file; it is not
 *    the true length of the physical boundary.
 *  - It is a mapped-length inventory only. The linework carries no boundary
 *    type, motion, spreading or convergence rate, deformation, activity, or
 *    age, so this module never reports or infers any of those.
 *  - Spans between non-finite or out-of-range vertices are skipped, never
 *    bridged, so a malformed feature contributes only its valid portions.
 */

export const PLATE_BOUNDARY_LENGTH_UNITS = {
  coordinates: "decimal degrees (longitude, latitude)",
  length: "km (great-circle, mean-radius sphere)",
} as const;

/** Mean Earth radius in km (matches the seismicity context helper). */
export const EARTH_MEAN_RADIUS_KM = 6_371;

export interface PlateBoundaryLengthEntry {
  /**
   * Grouping label for the pair. The PB2002 canonical key ("AF-AN", order- and
   * delimiter-independent) when the source label decodes, otherwise the trimmed
   * source label, or null when the feature was unlabeled.
   */
  name: string | null;
  /**
   * Decoded plate pair when the label matches the PB2002 vocabulary, else null.
   * Decoded from the canonical key so the two plates read in a stable order
   * regardless of how the source spelled the label.
   */
  plates: DecodedPlatePair | null;
  /** Number of source polyline features summed into this entry. */
  featureCount: number;
  /** Total great-circle length of the grouped features, km. */
  lengthKm: number;
}

/**
 * A descriptive length inventory of the supplied boundaries, not a rate, a
 * boundary-type split, or a hazard statement.
 */
export interface PlateBoundaryLengthSummary {
  kind: "bird-2003-plate-boundary-length";
  isForecast: false;
  suppliedBoundaryCount: number;
  /** Features with at least two consecutive valid vertices (a measurable span). */
  usableBoundaryCount: number;
  totalLengthKm: number;
  /** Per plate-pair totals, ordered by length descending then label ascending. */
  entries: readonly PlateBoundaryLengthEntry[];
  provenance: typeof BIRD_2003_PLATE_BOUNDARY_SOURCE;
  units: typeof PLATE_BOUNDARY_LENGTH_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Length is the great-circle sum of the bundled Bird (2003) polyline vertices; it depends on the digitization and generalization resolution and is not the true length of the boundary.",
  "A mapped-length inventory only: it is not a spreading or convergence rate, slip, motion, deformation, activity, or age, none of which the linework supplies.",
  "Lengths are measured on a mean-radius sphere; the source supplies no boundary type, so they are not split by divergent, convergent, or transform character.",
  "A span between any pair of non-finite or out-of-range vertices is skipped rather than bridged, so a malformed feature contributes only its valid portions.",
] as const;

/**
 * Great-circle length of a polyline in km. Only spans between two adjacent
 * valid vertices are summed; an invalid vertex breaks the run rather than
 * being bridged across, so a malformed polyline never fabricates a long
 * segment. Returns 0 for a polyline with no measurable span.
 */
export function polylineLengthKm(points: readonly Position[]): number {
  let total = 0;
  for (let index = 0; index + 1 < points.length; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (!isValidPosition(start) || !isValidPosition(end)) continue;
    total += greatCircleDistance(
      start[1],
      start[0],
      end[1],
      end[0],
      EARTH_MEAN_RADIUS_KM
    );
  }
  return total;
}

/**
 * Sum the great-circle length of the supplied plate boundaries, grouped by
 * plate pair. Features that decode to the same PB2002 pair (in either label
 * order or with any delimiter) are summed together under one canonical key;
 * labels that do not decode are grouped by their trimmed literal string, and
 * unlabeled features are grouped under a null name.
 */
export function summarizePlateBoundaryLengths(
  boundaries: readonly PlateBoundary[]
): PlateBoundaryLengthSummary {
  const groups = new Map<string, MutableEntry>();
  let usableBoundaryCount = 0;

  for (const boundary of boundaries) {
    const lengthKm = polylineLengthKm(boundary.points);
    // A feature with no measurable span contributes no length and is not counted
    // as usable; it also cannot shift a group's total, so we skip it entirely.
    if (lengthKm <= 0) continue;
    usableBoundaryCount += 1;

    const label = typeof boundary.name === "string" ? boundary.name.trim() : "";
    const decoded = label.length > 0 ? decodePlatePair(label) : null;
    const key = decoded ? decoded.canonicalKey : label;
    const name = decoded
      ? decoded.canonicalKey
      : label.length > 0
        ? label
        : null;

    const existing = groups.get(key);
    if (existing) {
      existing.featureCount += 1;
      existing.lengthKm += lengthKm;
    } else {
      groups.set(key, {
        name,
        // Decode from the canonical key so the two plates read in a stable order
        // even when the first-seen feature spelled the pair in reverse.
        plates: decoded ? decodePlatePair(decoded.canonicalKey) : null,
        featureCount: 1,
        lengthKm,
      });
    }
  }

  const entries = [...groups.values()]
    .map((entry) => ({ ...entry }))
    .sort(compareEntries);
  const totalLengthKm = entries.reduce((sum, entry) => sum + entry.lengthKm, 0);

  return {
    kind: "bird-2003-plate-boundary-length",
    isForecast: false,
    suppliedBoundaryCount: boundaries.length,
    usableBoundaryCount,
    totalLengthKm,
    entries,
    provenance: BIRD_2003_PLATE_BOUNDARY_SOURCE,
    units: PLATE_BOUNDARY_LENGTH_UNITS,
    limitations: LIMITATIONS,
  };
}

interface MutableEntry {
  name: string | null;
  plates: DecodedPlatePair | null;
  featureCount: number;
  lengthKm: number;
}

function compareEntries(
  first: PlateBoundaryLengthEntry,
  second: PlateBoundaryLengthEntry
): number {
  // "￿" sorts the single unlabeled (null-name) group last, after every
  // real plate-pair label, when lengths tie.
  return (
    second.lengthKm - first.lengthKm ||
    (first.name ?? "￿").localeCompare(second.name ?? "￿", "en-US")
  );
}

function isValidPosition(position: Position): boolean {
  return (
    Array.isArray(position) &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 180 &&
    Math.abs(position[1]) <= 90
  );
}
