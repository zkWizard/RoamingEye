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
      const points = ring.filter(
        (p) =>
          Array.isArray(p) &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1]) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90
      );
      if (points.length >= 2) out.push({ name, points });
    }
  }
  return out;
}
