/**
 * Pure navigation helpers for the search "fly-to". Kept render-free so the
 * distance heuristic is unit-tested.
 */

/** Camera distance bounds from the globe centre (globe radius = 1). */
export const MIN_FLY_DISTANCE = 1.45;
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
