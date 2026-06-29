import { Vector3 } from "three";

/**
 * Geographic ↔ 3D coordinate helpers.
 *
 * These are pure functions with no rendering dependencies, which makes them
 * fast and deterministic to unit-test — the highest-value testing target in a
 * 3D app (see CONTRIBUTING.md).
 */

const DEG2RAD = Math.PI / 180;

/**
 * Convert a latitude/longitude (in degrees) to a point on a sphere of the
 * given radius, in Three.js world space.
 *
 * Convention: the prime meridian (lon 0°, lat 0°) maps to +Z, the globe's
 * north pole (lat 90°) maps to +Y. This matches an equirectangular texture
 * (such as NASA Blue Marble) mapped onto a Three.js SphereGeometry.
 *
 * @param latDeg Latitude in degrees, in [-90, 90].
 * @param lonDeg Longitude in degrees, in [-180, 180].
 * @param radius Sphere radius (defaults to 1, the unit globe).
 */
export function latLngToVector3(
  latDeg: number,
  lonDeg: number,
  radius = 1
): Vector3 {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;

  const x = radius * Math.cos(lat) * Math.sin(lon);
  const y = radius * Math.sin(lat);
  const z = radius * Math.cos(lat) * Math.cos(lon);

  return new Vector3(x, y, z);
}

/**
 * Great-circle distance between two lat/lng points along a sphere's surface,
 * using the haversine formula.
 *
 * @param radius Sphere radius — pass Earth's mean radius (6_371_000 m, the
 *   default) to get a distance in metres.
 */
export function greatCircleDistance(
  lat1Deg: number,
  lon1Deg: number,
  lat2Deg: number,
  lon2Deg: number,
  radius = 6_371_000
): number {
  const lat1 = lat1Deg * DEG2RAD;
  const lat2 = lat2Deg * DEG2RAD;
  const dLat = (lat2Deg - lat1Deg) * DEG2RAD;
  const dLon = (lon2Deg - lon1Deg) * DEG2RAD;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}
