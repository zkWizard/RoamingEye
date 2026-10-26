/**
 * Pure navigation helpers for the search "fly-to" and keyboard steering.
 * Kept render-free so the distance heuristic is unit-tested.
 */

import {
  ALTITUDE_ZOOM_STEP,
  altitudeZoomDistance,
  ellipsoidRadiusUnits,
} from "./cameraZoom";

/** Furthest a search result frames, from the globe centre. */
export const MAX_FLY_DISTANCE = 2.8;

/** rotateSpeed at the boot view (altitude ~2.2 R) — the calibration point. */
export const BASE_ROTATE_SPEED = 0.45;
const BASE_ALTITUDE = 2.2;
/**
 * Floor so a degenerate distance cannot freeze the drag. Street level sits
 * well above it: the speed there comes from the altitude ratio, not the floor.
 * The old 0.01 floor was tuned for a 0.06 R minimum and flung the camera
 * across a city once the view got closer than that.
 */
const MIN_ROTATE_SPEED = 1e-6;

/**
 * Drag-rotation speed for a camera distance (globe centre, radius 1). A
 * constant speed feels right in orbit but flings the camera across whole
 * countries near the surface: the visible ground span shrinks with altitude
 * while the angle-per-pixel doesn't. Scaling linearly with altitude above the
 * local ellipsoid keeps the ground under the cursor tracking the drag at
 * every zoom — calibrated to feel identical to the old constant at the boot
 * view, capped there so far zoom-out gets no faster.
 */
export function rotateSpeedForDistance(distance: number, latDeg = 0): number {
  const altitude = Math.max(0, distance - ellipsoidRadiusUnits(latDeg));
  const speed = BASE_ROTATE_SPEED * (altitude / BASE_ALTITUDE);
  return Math.min(BASE_ROTATE_SPEED, Math.max(MIN_ROTATE_SPEED, speed));
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
/**
 * How much one +/- press multiplies altitude above the ellipsoid by.
 * The same step as one mouse-wheel notch ({@link ALTITUDE_ZOOM_STEP}).
 */
export const ZOOM_STEP = ALTITUDE_ZOOM_STEP;
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
 * one press is `BASE_STEP_DEGREES`; at street level it is a few metres.
 *
 * +/- multiply altitude above the local ellipsoid, not the distance to the
 * centre. A centre-distance zoom runs out of travel a few hundred kilometres
 * up, which is where the wheel used to stop.
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
    (rotateSpeedForDistance(view.distance, view.lat) / BASE_ROTATE_SPEED);
  const surface = ellipsoidRadiusUnits(view.lat);
  const zoomed = (factor: number): GlobeView => ({
    ...view,
    distance: altitudeZoomDistance(view.distance, surface, factor, bounds),
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
