import {
  ellipsoidRadiusUnits,
  MIN_FLY_ALTITUDE_M,
  TERRAIN_SURFACE_SCALE,
  WGS84_EQUATORIAL_RADIUS_M,
} from "./cameraZoom";
import { MAX_FLY_DISTANCE } from "./navigation";

/** Half-angle a framed place should fill. Narrow enough that a phone's
 * horizontal view still holds a roughly square city. */
const FRAME_HALF_RAD = (12 * Math.PI) / 180;
const MIN_FLY_UNITS =
  (MIN_FLY_ALTITUDE_M / WGS84_EQUATORIAL_RADIUS_M) * TERRAIN_SURFACE_SCALE;

/**
 * Degrees of longitude a box covers, measured the short way.
 *
 * Two shapes show up for a place that crosses the date line. An explicit
 * crossing is stored with west > east (the width is east+360−west). A min/max
 * of the same outline comes out the long way around — Nominatim reports Fiji
 * as west=−180, east=180 — and that 360° span used to pin the camera at
 * {@link MAX_FLY_DISTANCE}. Anything wider than half the world is that long
 * way, so it folds back onto the short arc. A place that really is that wide
 * still frames from its latitude, or from sampled outline longitudes.
 */
export function longitudeSpanDegrees(west: number, east: number): number {
  if (!Number.isFinite(west) || !Number.isFinite(east)) return 0;
  const direct = east >= west ? east - west : east + 360 - west;
  return direct > 180 ? 360 - direct : direct;
}

/**
 * Shortest arc, in degrees, that contains every sample. This is the width of
 * an outline whose bounding box was flattened to the whole circle: the largest
 * empty gap is the part of the world the place does not occupy.
 */
export function longitudeSpanOfSamples(longitudes: readonly number[]): number {
  const unique = [
    ...new Set(
      longitudes
        .filter((lon) => Number.isFinite(lon))
        .map((lon) => {
          const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
          return Math.round(wrapped * 1e6) / 1e6;
        })
    ),
  ].sort((a, b) => a - b);
  if (unique.length <= 1) return 0;
  let maxGap = 0;
  for (let i = 0; i < unique.length; i++) {
    const a = unique[i];
    const b = i + 1 < unique.length ? unique[i + 1] : unique[0] + 360;
    const gap = b - a;
    if (gap > maxGap) maxGap = gap;
  }
  return Math.max(0, 360 - maxGap);
}

/** Longitudes from a GeoJSON geometry, including a collection of them. */
export function longitudesInGeometry(geometry: unknown): number[] {
  const out: number[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (node.length > 0 && typeof node[0] === "number") {
        if (Number.isFinite(node[0])) out.push(node[0]);
        return;
      }
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as { coordinates?: unknown; geometries?: unknown };
    if ("coordinates" in record) walk(record.coordinates);
    if ("geometries" in record) walk(record.geometries);
  };
  walk(geometry);
  return out;
}

/**
 * Timeline index a place pick should show: the newest month on the scrubber.
 * That list already drops months the layer never published, so the last entry
 * is the latest valid one. A static layer has no month to jump to.
 */
export function placePickMonthIndex(
  monthCount: number,
  staticLayer: boolean
): number | null {
  if (staticLayer || monthCount <= 0) return null;
  return monthCount - 1;
}

/**
 * Choose a camera distance that roughly frames a result's bounding box: a small
 * city zooms in close, a large country stays further out.
 *
 * `longitudes`, when the result came with an outline, replace the box's
 * east–west span. A date-line country is otherwise min/maxed to the whole
 * circle and the camera backs all the way out.
 *
 * Loaded with a search pick, not the first paint: the app chunk sits on its
 * size budget.
 *
 * The old formula floored every city at 1.1 (~600 km up), which is why a
 * search for Houston opened on a blob. The place now fills about 24° of the
 * view, and the closest frame is a neighbourhood — street level is the
 * wheel's job, not the flight's.
 *
 * @param boundingBox [south, north, west, east] in degrees, or null.
 */
export function flyToDistance(
  boundingBox: [number, number, number, number] | null,
  longitudes?: readonly number[]
): number {
  const midLatDeg = boundingBox ? (boundingBox[0] + boundingBox[1]) / 2 : 0;
  const surface = ellipsoidRadiusUnits(midLatDeg);
  if (!boundingBox) return Math.min(MAX_FLY_DISTANCE, surface + 0.7);
  const [south, north, west, east] = boundingBox;
  const latSpan = Math.abs(north - south);
  const midLat = midLatDeg * (Math.PI / 180);
  const lonDeg =
    longitudes && longitudes.length > 0
      ? longitudeSpanOfSamples(longitudes)
      : longitudeSpanDegrees(west, east);
  const lonSpan = lonDeg * Math.cos(midLat);
  const span = Math.max(latSpan, lonSpan); // degrees
  const gamma = (span * Math.PI) / 180 / 2;
  const altitude = Math.max(
    0,
    Math.cos(gamma) + Math.sin(gamma) / Math.tan(FRAME_HALF_RAD) - 1
  );
  const clamped = Math.min(
    Math.max(0, MAX_FLY_DISTANCE - surface),
    Math.max(MIN_FLY_UNITS, altitude)
  );
  return surface + clamped;
}
