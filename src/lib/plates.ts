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
}

interface FeatureLike {
  properties?: { name?: unknown };
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
    const name =
      typeof feature.properties?.name === "string"
        ? feature.properties.name
        : "";
    for (const ring of geometryToRings(geometry)) {
      // Keep only contiguous valid runs. Filtering individual positions would
      // join the vertices on either side of malformed source data and invent a
      // boundary segment that was never present in the supplied linework.
      for (const points of contiguousValidRuns(ring)) {
        if (points.length >= 2) out.push({ name, points });
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

function isValidPosition(position: Position): boolean {
  return (
    Array.isArray(position) &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 180 &&
    Math.abs(position[1]) <= 90
  );
}
