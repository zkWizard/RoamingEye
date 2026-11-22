/**
 * Where a satellite sits on the unit globe.
 *
 * Altitude is compressed so a station in low orbit floats clear of the
 * surface and a geostationary satellite stays inside a whole-Earth camera.
 * The card and the readout keep the true altitude in kilometres.
 */

const DEG2RAD = Math.PI / 180;

export function displayRadius(altKm: number): number {
  const alt = Number.isFinite(altKm) && altKm > 0 ? altKm : 0;
  const scaled = Math.log1p(alt / 400) * 0.12;
  return 1.012 + Math.min(scaled, 0.75);
}

/** Same mapping as lib/geo.latLngToVector3, on the unit sphere. */
export function unitVector(
  latDeg: number,
  lonDeg: number
): [number, number, number] {
  const phi = (90 - latDeg) * DEG2RAD;
  const theta = (lonDeg + 180) * DEG2RAD;
  const sinPhi = Math.sin(phi);
  return [-sinPhi * Math.cos(theta), Math.cos(phi), sinPhi * Math.sin(theta)];
}

export function latLonAltToXYZ(
  latDeg: number,
  lonDeg: number,
  altKm: number
): [number, number, number] {
  const [x, y, z] = unitVector(latDeg, lonDeg);
  const radius = displayRadius(altKm);
  return [x * radius, y * radius, z * radius];
}

/** Shortest-way blend of two longitudes, in degrees, wrapped to [-180, 180]. */
export function lerpLon(a: number, b: number, t: number): number {
  let delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  let value = a + delta * t;
  if (value > 180) value -= 360;
  if (value < -180) value += 360;
  return value;
}

export function orbitCountLabel(count: number): string {
  return `${new Intl.NumberFormat("en-US").format(count)} in orbit`;
}

export interface PointWrite {
  lat: ArrayLike<number>;
  lon: ArrayLike<number>;
  altKm: ArrayLike<number>;
  stride: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  out: Float32Array;
}

/**
 * Pack visible satellites into `out` as xyz triples. Satellites on the far
 * side of the Earth, or behind the camera, are left out. Returns how many
 * points were written.
 */
export function writePointBuffer(input: PointWrite): number {
  const { lat, lon, altKm, stride, cameraX, cameraY, cameraZ, out } = input;
  const step = stride < 1 ? 1 : stride;
  const cameraLen2 = cameraX * cameraX + cameraY * cameraY + cameraZ * cameraZ;
  let written = 0;
  for (let index = 0; index < lat.length; index += step) {
    const latDeg = lat[index];
    const lonDeg = lon[index];
    const alt = altKm[index];
    if (
      latDeg === undefined ||
      lonDeg === undefined ||
      alt === undefined ||
      !Number.isFinite(latDeg) ||
      !Number.isFinite(lonDeg) ||
      !Number.isFinite(alt)
    ) {
      continue;
    }
    const [x, y, z] = latLonAltToXYZ(latDeg, lonDeg, alt);
    const facing = x * cameraX + y * cameraY + z * cameraZ;
    // In front of the camera, and on the near side of the globe.
    if (facing <= 0 || cameraLen2 <= facing) continue;
    const offset = written * 3;
    if (offset + 2 >= out.length) break;
    out[offset] = x;
    out[offset + 1] = y;
    out[offset + 2] = z;
    written += 1;
  }
  return written;
}

/** How many propagated samples are real positions (not a decayed NaN). */
export function validCount(lat: ArrayLike<number>): number {
  let count = 0;
  for (let index = 0; index < lat.length; index += 1) {
    if (Number.isFinite(lat[index])) count += 1;
  }
  return count;
}
