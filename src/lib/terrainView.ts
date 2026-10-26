/**
 * When the science composite is drawn on the unit sphere, and when it is
 * draped on the terrain mesh instead.
 *
 * From orbit the sphere is the right surface: one equirectangular PNG covers
 * the whole planet, including the poles Web Mercator never tiles, and it is
 * what compare, probe, and hover already hit. Up close that shell sits ~25 km
 * above the terrain, so coastlines drift and mountains disappear under a
 * smooth ball. Inside the near band the same month is draped on the mesh.
 *
 * The two thresholds differ so a camera sitting on the boundary does not
 * flicker between the two representations.
 */

/** Enter the drape when the camera is nearer than this (globe radius = 1). */
export const DRAPE_ENTER_DISTANCE = 1.7;
/** Leave it only once the camera has backed out past this. */
export const DRAPE_EXIT_DISTANCE = 1.9;
/**
 * Web Mercator science tiles end near ±85°. Stay on the sphere before that,
 * with the same hysteresis as the distance band.
 */
export const DRAPE_ENTER_LATITUDE = 75;
export const DRAPE_EXIT_LATITUDE = 78;

export interface ScienceDrapeInput {
  /** Camera distance from the globe centre. */
  distance: number;
  /** Latitude, in degrees, of the point under the camera. */
  lat: number;
  /** An A/B split owns the sphere texture; draping would paint the same month on both sides. */
  comparing: boolean;
  /** The draped month is initialized and safe to show. */
  scienceReady: boolean;
  /** Whether the drape was showing last frame. */
  draped: boolean;
}

/** True when this frame should hide the science sphere and show the draped month. */
export function scienceShouldDrape(input: ScienceDrapeInput): boolean {
  if (input.comparing || !input.scienceReady) return false;
  const maxLat = input.draped ? DRAPE_EXIT_LATITUDE : DRAPE_ENTER_LATITUDE;
  const maxDistance = input.draped ? DRAPE_EXIT_DISTANCE : DRAPE_ENTER_DISTANCE;
  return Math.abs(input.lat) < maxLat && input.distance < maxDistance;
}
