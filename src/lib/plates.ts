import { geometryToRings, type GeoGeometry, type Position } from "./geojson";

/**
 * Tectonic plate boundaries from Bird (2003), "An updated digital model of
 * plate boundaries" (G³ 4(3), doi:10.1029/2001GC000252), digitized as GeoJSON
 * by the open tectonicplates project and slimmed into public/data/ by
 * scripts/prepare-data.mjs.
 *
 * Pure, render-free parsing (see plates.test.ts); the overlay in
 * overlays/PlateBoundariesOverlay.ts renders what this module extracts.
 */

export interface PlateBoundary {
  /** Plate-pair name, e.g. "AF-AN" (Africa–Antarctica). */
  name: string;
  /** The boundary polyline as [lon, lat] positions. */
  points: Position[];
  /**
   * PB2002's own per-step attributes, when the supplied file carries them.
   *
   * Optional only for compatibility with callers constructing boundaries
   * outside the parser; parsed features always carry the object and use null
   * for fields the source left blank.
   */
  step?: PlateBoundaryStep;
}

/** Attributes retained verbatim from one PB2002 boundary step. */
export interface PlateBoundaryStep {
  /** First bordering plate's PB2002 code, from the source `PlateA` field. */
  plateA: string | null;
  /** Second bordering plate's PB2002 code, from the source `PlateB` field. */
  plateB: string | null;
  /**
   * The source `Type` field, verbatim. PB2002 sets this to "subduction" on
   * subduction steps and leaves it blank on every other step, so null means
   * "the source did not mark this step", not "measured as non-subduction".
   * The model does not distinguish spreading from transform steps here.
   */
  boundaryType: string | null;
  /**
   * The digitization credited for this step, from the source `Source` field
   * (e.g. "Mueller et al. [1987]"). PB2002 is a compilation of dozens of
   * separately sourced digitizations, not one uniform survey; this keeps the
   * per-step credit attached rather than crediting Bird (2003) alone.
   */
  sourceCitation: string | null;
}

/**
 * How the source marked a step's boundary type. "not-marked" and "unavailable"
 * are kept apart so a blank source field never reads as a missing file.
 */
export type PlateBoundaryClass = "subduction" | "not-marked" | "unavailable";

/**
 * Report the source's own boundary-type marking for a step. Categorical
 * passthrough of PB2002's `Type` field: it asserts nothing about relative
 * motion, dip, polarity, activity, seismicity, or hazard.
 */
export function plateBoundaryClass(
  boundary: PlateBoundary
): PlateBoundaryClass {
  if (!boundary.step) return "unavailable";
  return boundary.step.boundaryType === "subduction"
    ? "subduction"
    : "not-marked";
}

interface FeatureLike {
  properties?: {
    name?: unknown;
    plateA?: unknown;
    plateB?: unknown;
    type?: unknown;
    source?: unknown;
  };
  geometry?: GeoGeometry | null;
}

/**
 * Parse the slimmed plate-boundaries FeatureCollection, dropping malformed
 * features rather than throwing — a partially usable file still renders.
 */
export function parsePlateBoundaries(json: unknown): PlateBoundary[] {
  if (typeof json !== "object" || json === null) return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const out: PlateBoundary[] = [];
  for (const feature of features as FeatureLike[]) {
    const geometry = feature?.geometry;
    if (!geometry || typeof geometry.type !== "string") continue;
    const properties = feature.properties;
    const name = typeof properties?.name === "string" ? properties.name : "";
    const step: PlateBoundaryStep = {
      plateA: nonEmptyStringOrNull(properties?.plateA),
      plateB: nonEmptyStringOrNull(properties?.plateB),
      boundaryType: nonEmptyStringOrNull(properties?.type),
      sourceCitation: nonEmptyStringOrNull(properties?.source),
    };
    for (const ring of geometryToRings(geometry)) {
      // Keep only contiguous valid runs. Filtering individual positions would
      // join the vertices on either side of malformed source data and invent a
      // boundary segment that was never present in the supplied linework.
      for (const points of contiguousValidRuns(ring)) {
        // Each run inherits the feature's step attributes: splitting a run is
        // a geometry repair, not a change of which step the source described.
        if (points.length >= 2) out.push({ name, points, step });
      }
    }
  }
  return out;
}

function contiguousValidRuns(points: readonly Position[]): Position[][] {
  const runs: Position[][] = [];
  let current: Position[] = [];

  for (const point of points) {
    if (isValidPosition(point)) {
      current.push(point);
      continue;
    }
    if (current.length > 0) runs.push(current);
    current = [];
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/** Blank source fields read as unavailable rather than as an empty label. */
function nonEmptyStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
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
