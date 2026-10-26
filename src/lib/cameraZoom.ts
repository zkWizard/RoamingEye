/**
 * Camera distance for a photographic globe.
 *
 * OrbitControls zooms by multiplying the distance to the globe's centre. Near
 * the surface that distance is almost constant (Earth's radius), so the wheel
 * ran out of travel around 400 km up — the old `minDistance` of 1.06 — and the
 * imagery never asked for a city tile. Zoom now multiplies altitude above the
 * local ellipsoid, which is what the picture on screen actually scales with.
 *
 * Distances are globe units. The terrain mesh is the WGS84 ellipsoid scaled by
 * {@link TERRAIN_SURFACE_SCALE} (see TerrainGlobe); radius 1 is the science
 * sphere, a little outside the highest summit.
 */

/** Matches the terrain group's scale in TerrainGlobe. */
export const TERRAIN_SURFACE_SCALE = 0.996;
export const WGS84_EQUATORIAL_RADIUS_M = 6_378_137;
/** WGS84 flattening. Polar radius is a·(1−f). */
const WGS84_F = 1 / 298.257223563;
const WGS84_B_OVER_A = 1 - WGS84_F;

/**
 * Closest the camera may sit to the ground, in metres. Near 250 m a 1440-wide
 * view spans a few city blocks and Esri's z18–z19 imagery is about one pixel
 * per screen pixel. Buildings are in the photograph, not the mesh, so this
 * does not have to clear a skyline.
 */
export const MIN_AGL_M = 250;
/**
 * Extra metres kept above sampled terrain when the ground itself is higher
 * than {@link MIN_AGL_M} (a plateau, a summit). Stops the camera entering the
 * mesh without pinning Houston to Everest's altitude.
 */
export const TERRAIN_CLEARANCE_M = 80;
/** Furthest zoom-out, from the globe centre. Unchanged from the orbital globe. */
export const MAX_CAMERA_DISTANCE = 4.5;
/**
 * One wheel notch or +/- press multiplies altitude by this (zoom out) or its
 * reciprocal (zoom in). Large enough that street level is a short spin of the
 * wheel, small enough that a city passes through districts on the way.
 */
export const ALTITUDE_ZOOM_STEP = 1.85;
/**
 * How quickly a wheel zoom glides to the altitude it asked for, per second.
 * The wheel sets a destination; the camera eases there instead of jumping,
 * so a spin stays one continuous move while the sharper tiles catch up.
 */
export const ZOOM_EASE_RATE = 16;
/** Search frames no closer than this, so a city opens as a city. Zoom continues. */
export const MIN_FLY_ALTITUDE_M = 1_800;

/** Geocentric radius of the scaled ellipsoid at a geodetic latitude, in globe units. */
export function ellipsoidRadiusUnits(latDeg: number): number {
  const lat = (latDeg * Math.PI) / 180;
  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const b2 = WGS84_B_OVER_A * WGS84_B_OVER_A;
  const radiusOverA = Math.sqrt(
    (cos * cos + b2 * b2 * sin * sin) / (cos * cos + b2 * sin * sin)
  );
  return TERRAIN_SURFACE_SCALE * radiusOverA;
}

/** Metres above the scaled ellipsoid. Negative if the camera is inside it. */
export function metresAboveEllipsoid(distance: number, latDeg: number): number {
  const units = distance - ellipsoidRadiusUnits(latDeg);
  return (units / TERRAIN_SURFACE_SCALE) * WGS84_EQUATORIAL_RADIUS_M;
}

/**
 * Nearest the camera may come at this latitude. `elevationMetres` is the
 * terrain height above the ellipsoid when a tile has loaded; until then the
 * floor is {@link MIN_AGL_M} above the ellipsoid.
 */
export function minimumCameraDistance(
  latDeg: number,
  elevationMetres = 0
): number {
  const elev = Number.isFinite(elevationMetres)
    ? Math.max(0, elevationMetres)
    : 0;
  const aboveM = Math.max(MIN_AGL_M, elev + TERRAIN_CLEARANCE_M);
  return (
    ellipsoidRadiusUnits(latDeg) +
    (aboveM / WGS84_EQUATORIAL_RADIUS_M) * TERRAIN_SURFACE_SCALE
  );
}

/**
 * Multiply altitude (distance above `surfaceRadius`) by `factor` and clamp.
 * `limits.min` / `limits.max` are geocentric distances.
 */
export function altitudeZoomDistance(
  distance: number,
  surfaceRadius: number,
  factor: number,
  limits: { min: number; max: number }
): number {
  if (!(factor > 0) || !Number.isFinite(factor)) return distance;
  const minAgl = Math.max(0, limits.min - surfaceRadius);
  const maxAgl = Math.max(minAgl, limits.max - surfaceRadius);
  const agl = Math.max(distance - surfaceRadius, minAgl);
  const next = Math.min(maxAgl, Math.max(minAgl, agl * factor));
  return surfaceRadius + next;
}

/**
 * Altitude multiplier for one wheel event. Matches three.js OrbitControls'
 * deltaMode scaling, including the ×10 a trackpad pinch gets (`ctrlKey`),
 * and caps a single event so one wild swipe cannot skip from orbit to the
 * pavement. Positive deltaY zooms out.
 */
export function wheelAltitudeFactor(
  deltaY: number,
  deltaMode = 0,
  ctrlKey = false
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  let delta = deltaY;
  if (deltaMode === 1) delta *= 16;
  else if (deltaMode === 2) delta *= 100;
  if (ctrlKey) delta *= 10;
  const notches = Math.max(-6, Math.min(6, delta / 100));
  return Math.pow(ALTITUDE_ZOOM_STEP, notches);
}

/**
 * Altitude multiplier for a two-finger pinch. Spreading the fingers zooms in
 * by the same ratio the fingers moved, which is how the ground stays stuck
 * to the gesture. Capped like a wheel event.
 */
export function pinchAltitudeFactor(
  previousSpan: number,
  nextSpan: number
): number {
  if (!(previousSpan > 0) || !(nextSpan > 0)) return 1;
  const raw = previousSpan / nextSpan;
  const lo = Math.pow(ALTITUDE_ZOOM_STEP, -6);
  const hi = Math.pow(ALTITUDE_ZOOM_STEP, 6);
  return Math.min(hi, Math.max(lo, raw));
}

/**
 * Glide `current` toward `target` (both geocentric distances). One frame
 * closes a fraction of the remaining altitude, so a burst of wheel ticks
 * stacks into one coast instead of a staircase. A long frame is capped so a
 * hitch cannot skip the whole glide.
 */
export function easedAltitudeDistance(
  current: number,
  target: number,
  surfaceRadius: number,
  deltaSeconds: number,
  rate = ZOOM_EASE_RATE
): { distance: number; settled: boolean } {
  if (!(deltaSeconds > 0) || !Number.isFinite(target)) {
    return { distance: current, settled: false };
  }
  const agl = Math.max(current - surfaceRadius, 0);
  const targetAgl = Math.max(target - surfaceRadius, 0);
  const alpha = 1 - Math.exp(-rate * Math.min(deltaSeconds, 0.05));
  const next = agl + (targetAgl - agl) * alpha;
  const span = Math.max(Math.abs(targetAgl - agl), 1e-8);
  const settled = Math.abs(next - targetAgl) <= Math.max(span * 0.012, 1e-7);
  return {
    distance: surfaceRadius + (settled ? targetAgl : next),
    settled,
  };
}

/** Ground metres per screen pixel at the nadir, for a perspective camera. */
export function nadirMetresPerPixel(
  altitudeMetres: number,
  viewportHeightPx: number,
  fovDeg: number
): number {
  const half = (fovDeg * Math.PI) / 180 / 2;
  const ground = 2 * Math.max(altitudeMetres, 1) * Math.tan(half);
  return ground / Math.max(1, viewportHeightPx);
}

/**
 * Screen-space error target for the terrain tiles, in pixels.
 *
 * 1 px from orbit never settles: the whole disc stays in refinement. Up close
 * the view is a neighbourhood, and a target near 1 px is what makes z18–z19
 * imagery actually get requested. The blend keeps a city overview within
 * about one zoom level of the screen without a flood of tiles.
 */
export function terrainErrorTarget(metresPerPixel: number): number {
  if (!(metresPerPixel > 0)) return 8;
  if (metresPerPixel >= 2500) return 8;
  if (metresPerPixel <= 4) return 1.25;
  const t = (metresPerPixel - 4) / (2500 - 4);
  return 1.25 + t * (8 - 1.25);
}

/**
 * Near/far for the current altitude. A fixed near of 0.01 is ~64 km, which
 * clips the globe as soon as the camera comes closer than that. Up close the
 * ground fills the frustum and only a few kilometres of depth are in frame,
 * so the far plane comes in with it and the depth ratio stays modest.
 */
export function clipPlanes(
  distance: number,
  surfaceRadius: number
): { near: number; far: number } {
  const altitude = Math.max(distance - surfaceRadius, 1e-8);
  const near = Math.min(0.08, Math.max(altitude * 0.12, 1e-6));
  const far =
    distance > surfaceRadius + 0.35 ? 80 : Math.max(altitude * 40, near * 50);
  return { near, far };
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Nearest intersection of a ray with a sphere about the origin. `direction`
 * must be a unit vector. Null when the ray misses or only hits behind the
 * origin.
 */
export function raySpherePoint(
  origin: Vec3,
  direction: Vec3,
  radius: number
): Vec3 | null {
  const b =
    origin.x * direction.x + origin.y * direction.y + origin.z * direction.z;
  const c =
    origin.x * origin.x +
    origin.y * origin.y +
    origin.z * origin.z -
    radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t <= 1e-8) t = -b + s;
  if (t <= 1e-8) return null;
  return {
    x: origin.x + direction.x * t,
    y: origin.y + direction.y * t,
    z: origin.z + direction.z * t,
  };
}

/**
 * Ground point under a view ray.
 *
 * Outside the unit sphere the mesh hit is the one hover and probe have always
 * used. Inside it — street level, where the ellipsoid sits near 0.995 — that
 * mesh is behind the camera and a hit is the far side of the planet, so the
 * ray is intersected with the local ellipsoid instead.
 */
export function resolveGroundPoint(
  cameraLength: number,
  latDeg: number,
  origin: Vec3,
  direction: Vec3,
  meshPoint: Vec3 | null
): Vec3 | null {
  if (cameraLength >= 1) return meshPoint;
  return raySpherePoint(origin, direction, ellipsoidRadiusUnits(latDeg));
}
