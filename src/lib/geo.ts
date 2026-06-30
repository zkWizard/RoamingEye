import { Vector3 } from "three";

/**
 * Geographic ↔ 3D coordinate helpers.
 *
 * These are pure functions with no rendering dependencies, which makes them
 * fast and deterministic to unit-test — the highest-value testing target in a
 * 3D app (see CONTRIBUTING.md).
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface LatLng {
  lat: number;
  lon: number;
}

/**
 * Convert a latitude/longitude (in degrees) to a point on a sphere of the
 * given radius, in Three.js world space.
 *
 * The result is aligned with an equirectangular texture (such as the NASA GIBS
 * composites) mapped onto a Three.js SphereGeometry, so a point placed at a
 * given lat/lon lands on the correct spot of the rendered globe. The north pole
 * (lat 90°) maps to +Y.
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
  // Standard mapping for an equirectangular texture on a Three.js
  // SphereGeometry: phi is the polar angle from the +Y (north) pole, theta the
  // azimuth. The +180° longitude offset aligns the prime meridian with the way
  // SphereGeometry seams the texture. Calibrated against the rendered globe.
  const phi = (90 - latDeg) * DEG2RAD;
  const theta = (lonDeg + 180) * DEG2RAD;

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

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

/**
 * Inverse of {@link latLngToVector3}: a point on (or off) the globe back to
 * latitude/longitude in degrees. Longitude is wrapped to [-180, 180].
 */
export function vector3ToLatLng(v: Vector3): LatLng {
  const r = v.length();
  if (r === 0) return { lat: 0, lon: 0 };

  const phi = Math.acos(Math.min(1, Math.max(-1, v.y / r)));
  const lat = 90 - phi * RAD2DEG;

  let lon = Math.atan2(v.z, -v.x) * RAD2DEG - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;

  return { lat, lon };
}

/** Human-readable coordinate, e.g. "40.24°N, 3.69°W". */
export function formatLatLng({ lat, lon }: LatLng): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}
