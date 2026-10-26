/**
 * Whether a camera sub-point is close enough to the United States that the
 * county overlay is worth fetching.
 *
 * The boxes cover the Census extract: the states, Alaska (including the
 * Aleutians, which cross into the eastern hemisphere), Hawaii, Puerto Rico,
 * the US Virgin Islands, American Samoa, Guam, and the Northern Marianas.
 * A point in southern Canada can fall in the continental box. That only
 * starts the lazy fetch; the lines themselves are US counties.
 */
export function viewingUnitedStates(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  // Continental United States. Northern Mexico stays below the latitude cut.
  if (lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.5) return true;
  // Alaska, including the Aleutians past the antimeridian.
  if (lat >= 51 && lat <= 71.5 && (lon <= -129 || lon >= 170)) return true;
  if (lat >= 18.7 && lat <= 22.5 && lon >= -160.5 && lon <= -154.5) return true;
  if (lat >= 17.6 && lat <= 18.6 && lon >= -67.5 && lon <= -64.5) return true;
  if (lat >= -14.6 && lat <= -11 && lon >= -171.2 && lon <= -168) return true;
  if (lat >= 13.2 && lat <= 20.6 && lon >= 144.5 && lon <= 146.2) return true;
  return false;
}
