/**
 * Pure navigation helpers for the search "fly-to". Kept render-free so the
 * distance heuristic is unit-tested.
 */

/** Camera distance bounds from the globe centre (globe radius = 1). */
export const MIN_FLY_DISTANCE = 1.45;
export const MAX_FLY_DISTANCE = 2.8;

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
