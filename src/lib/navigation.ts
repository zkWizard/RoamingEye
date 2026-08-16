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
 * Choose a camera distance that roughly frames a result's bounding box: a small
 * city zooms in close, a large country stays further out.
 *
 * @param boundingBox [south, north, west, east] in degrees, or null.
 */
export function flyToDistance(
  boundingBox: [number, number, number, number] | null
): number {
  if (!boundingBox) return 1.7;
  const [south, north, west, east] = boundingBox;
  const latSpan = Math.abs(north - south);
  const midLat = ((north + south) / 2) * (Math.PI / 180);
  const lonSpan = Math.abs(east - west) * Math.cos(midLat);
  const span = Math.max(latSpan, lonSpan); // degrees

  const distance = MIN_FLY_DISTANCE + span * 0.03;
  return Math.min(MAX_FLY_DISTANCE, Math.max(MIN_FLY_DISTANCE, distance));
}
