/**
 * Pure navigation helpers for the search "fly-to". Kept render-free so the
 * distance heuristic is unit-tested.
 */

/** Camera distance bounds from the globe centre (globe radius = 1). */
export const MIN_FLY_DISTANCE = 1.1;
export const MAX_FLY_DISTANCE = 2.8;

/** rotateSpeed at the boot view (altitude 2.2 R) — the calibration point. */
export const BASE_ROTATE_SPEED = 0.45;
const BASE_ALTITUDE = 2.2;

/**
 * Drag-rotation speed for a camera distance (globe centre, radius 1). A
 * constant speed feels right in orbit but flings the camera across whole
 * countries near the surface: the visible ground span shrinks with altitude
 * while the angle-per-pixel doesn't. Scaling linearly with altitude keeps
 * the ground under the cursor tracking the drag at every zoom — calibrated
 * to feel identical to the old constant at the boot view, capped there so
 * far zoom-out gets no faster, floored so rotation never dead-stops at the
 * surface (min altitude 0.06 → ~37× slower than orbit).
 */
export function rotateSpeedForDistance(distance: number): number {
  const altitude = Math.max(0, distance - 1);
  const speed = BASE_ROTATE_SPEED * (altitude / BASE_ALTITUDE);
  return Math.min(BASE_ROTATE_SPEED, Math.max(0.01, speed));
}

/** A viewpoint: the lat/lon the camera looks straight down at, and its
 * distance from the globe centre (radius 1). */
export interface GlobeView {
  lat: number;
  lon: number;
  distance: number;
}

/** How far one arrow press turns the globe at the boot view, in degrees. */
export const BASE_STEP_DEGREES = 6;
/** How much one zoom press multiplies or divides the camera distance by. */
export const ZOOM_STEP = 1.18;
/**
 * Latitude the keyboard stops at. The camera's up vector is +Y, so a viewpoint
 * exactly over a pole has no defined heading and the globe spins on the spot;
 * stopping short keeps every arrow press a visible, reversible move.
 */
export const MAX_STEP_LATITUDE = 85;

/**
 * Move a viewpoint by one key press, or return null if the key isn't a globe
 * navigation key.
 *
 * The rotation step scales with altitude on exactly the ratio a drag does
 * (`rotateSpeedForDistance`), because the two are the same complaint: a step
 * that reads as a nudge in orbit crosses a continent near the surface, where
 * the visible ground span has shrunk but the angle has not. At the boot view
 * one press is `BASE_STEP_DEGREES`; at the closest zoom it is ~0.13°.
 *
 * Longitude is left unwrapped — `latLngToVector3` takes any angle, and the
 * caller's readback normalises it — so stepping east past the antimeridian
 * continues instead of jumping.
 */
export function stepGlobeView(
  view: GlobeView,
  key: string,
  bounds: { min: number; max: number }
): GlobeView | null {
  const step =
    BASE_STEP_DEGREES *
    (rotateSpeedForDistance(view.distance) / BASE_ROTATE_SPEED);
  const zoomed = (factor: number): GlobeView => ({
    ...view,
    distance: Math.min(
      bounds.max,
      Math.max(bounds.min, view.distance * factor)
    ),
  });
  switch (key) {
    case "ArrowLeft":
      return { ...view, lon: view.lon - step };
    case "ArrowRight":
      return { ...view, lon: view.lon + step };
    case "ArrowUp":
      return { ...view, lat: Math.min(MAX_STEP_LATITUDE, view.lat + step) };
    case "ArrowDown":
      return { ...view, lat: Math.max(-MAX_STEP_LATITUDE, view.lat - step) };
    case "+":
    case "=":
      return zoomed(1 / ZOOM_STEP);
    case "-":
    case "_":
      return zoomed(ZOOM_STEP);
    default:
      return null;
  }
}

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
 * @param boundingBox [south, north, west, east] in degrees, or null.
 */
export function flyToDistance(
  boundingBox: [number, number, number, number] | null,
  longitudes?: readonly number[]
): number {
  if (!boundingBox) return 1.7;
  const [south, north, west, east] = boundingBox;
  const latSpan = Math.abs(north - south);
  const midLat = ((north + south) / 2) * (Math.PI / 180);
  const lonDeg =
    longitudes && longitudes.length > 0
      ? longitudeSpanOfSamples(longitudes)
      : longitudeSpanDegrees(west, east);
  const lonSpan = lonDeg * Math.cos(midLat);
  const span = Math.max(latSpan, lonSpan); // degrees

  const distance = MIN_FLY_DISTANCE + span * 0.03;
  return Math.min(MAX_FLY_DISTANCE, Math.max(MIN_FLY_DISTANCE, distance));
}
