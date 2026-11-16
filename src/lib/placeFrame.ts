import {
  ellipsoidRadiusUnits,
  MAX_CAMERA_DISTANCE,
  MIN_FLY_ALTITUDE_M,
  TERRAIN_SURFACE_SCALE,
  WGS84_EQUATORIAL_RADIUS_M,
} from "./cameraZoom";
import { MAX_FLY_DISTANCE } from "./navigation";

/** Half-angle a framed place should fill. Narrow enough that a phone's
 * horizontal view still holds a roughly square city. */
const FRAME_HALF_RAD = (12 * Math.PI) / 180;
const MIN_FLY_UNITS =
  (MIN_FLY_ALTITUDE_M / WGS84_EQUATORIAL_RADIUS_M) * TERRAIN_SURFACE_SCALE;

/**
 * Degrees of longitude a box covers, measured the short way.
 *
 * Two shapes show up for a place that crosses the date line. An explicit
 * crossing is stored with west > east (the width is east+360−west). A min/max
 * of the same outline comes out the long way around — Nominatim reports Fiji
 * as west=−180, east=180 — and that 360° span used to pin the camera at
 * {@link MAX_FLY_DISTANCE}. Anything wider than half the world is that long
 * way, so it folds back onto the short arc. A place that really is that wide
 * still frames from its latitude, or from sampled outline longitudes.
 */
export function longitudeSpanDegrees(west: number, east: number): number {
  if (!Number.isFinite(west) || !Number.isFinite(east)) return 0;
  const direct = east >= west ? east - west : east + 360 - west;
  return direct > 180 ? 360 - direct : direct;
}

/**
 * Shortest arc, in degrees, that contains every sample. This is the width of
 * an outline whose bounding box was flattened to the whole circle: the largest
 * empty gap is the part of the world the place does not occupy.
 */
export function longitudeSpanOfSamples(longitudes: readonly number[]): number {
  const unique = [
    ...new Set(
      longitudes
        .filter((lon) => Number.isFinite(lon))
        .map((lon) => {
          const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
          return Math.round(wrapped * 1e6) / 1e6;
        })
    ),
  ].sort((a, b) => a - b);
  if (unique.length <= 1) return 0;
  let maxGap = 0;
  for (let i = 0; i < unique.length; i++) {
    const a = unique[i];
    const b = i + 1 < unique.length ? unique[i + 1] : unique[0] + 360;
    const gap = b - a;
    if (gap > maxGap) maxGap = gap;
  }
  return Math.max(0, 360 - maxGap);
}

/** Longitudes from a GeoJSON geometry, including a collection of them. */
export function longitudesInGeometry(geometry: unknown): number[] {
  const out: number[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (node.length > 0 && typeof node[0] === "number") {
        if (Number.isFinite(node[0])) out.push(node[0]);
        return;
      }
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as { coordinates?: unknown; geometries?: unknown };
    if ("coordinates" in record) walk(record.coordinates);
    if ("geometries" in record) walk(record.geometries);
  };
  walk(geometry);
  return out;
}

/**
 * Timeline index a place pick should show: the newest month on the scrubber.
 * That list already drops months the layer never published, so the last entry
 * is the latest valid one. A static layer has no month to jump to.
 */
export function placePickMonthIndex(
  monthCount: number,
  staticLayer: boolean
): number | null {
  if (staticLayer || monthCount <= 0) return null;
  return monthCount - 1;
}

/**
 * Choose a camera distance that roughly frames a result's bounding box: a small
 * city zooms in close, a large country stays further out.
 *
 * `longitudes`, when the result came with an outline, replace the box's
 * east–west span. A date-line country is otherwise min/maxed to the whole
 * circle and the camera backs all the way out.
 *
 * Loaded with a search pick, not the first paint: the app chunk sits on its
 * size budget.
 *
 * The old formula floored every city at 1.1 (~600 km up), which is why a
 * search for Houston opened on a blob. The place now fills about 24° of the
 * view, and the closest frame is a neighbourhood — street level is the
 * wheel's job, not the flight's.
 *
 * @param boundingBox [south, north, west, east] in degrees, or null.
 */
export function flyToDistance(
  boundingBox: [number, number, number, number] | null,
  longitudes?: readonly number[]
): number {
  const midLatDeg = boundingBox ? (boundingBox[0] + boundingBox[1]) / 2 : 0;
  const surface = ellipsoidRadiusUnits(midLatDeg);
  if (!boundingBox) return Math.min(MAX_FLY_DISTANCE, surface + 0.7);
  const [south, north, west, east] = boundingBox;
  const latSpan = Math.abs(north - south);
  const midLat = midLatDeg * (Math.PI / 180);
  const lonDeg =
    longitudes && longitudes.length > 0
      ? longitudeSpanOfSamples(longitudes)
      : longitudeSpanDegrees(west, east);
  const lonSpan = lonDeg * Math.cos(midLat);
  const span = Math.max(latSpan, lonSpan); // degrees
  const gamma = (span * Math.PI) / 180 / 2;
  const altitude = Math.max(
    0,
    Math.cos(gamma) + Math.sin(gamma) / Math.tan(FRAME_HALF_RAD) - 1
  );
  const clamped = Math.min(
    Math.max(0, MAX_FLY_DISTANCE - surface),
    Math.max(MIN_FLY_UNITS, altitude)
  );
  return surface + clamped;
}

/** Fractions of the viewport chrome covers. 0 is a clear edge. */
export interface FrameOcclusion {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PairFrameView {
  /** Vertical field of view, degrees. Matches the globe camera. */
  fovDeg: number;
  /** Viewport width / height. */
  aspect: number;
  occlude: FrameOcclusion;
  /** Extra inset inside the free rectangle, as a fraction of the viewport. */
  padding: number;
}

export interface PairFrame {
  lat: number;
  lon: number;
  /** Distance from the globe centre, in globe radii. */
  distance: number;
}

/**
 * Camera pose that holds two places in the part of the screen the chrome
 * leaves open.
 *
 * A single-place flight frames one box. A pair used to take the maximum of
 * that distance and {@link MAX_FLY_DISTANCE}, and `MAX_FLY_DISTANCE` is the
 * furthest a search is allowed to sit, so every pair opened from orbit with
 * the two pins a few pixels apart. Phones then shoved the aim 18° south,
 * which only stays on screen at that orbital distance.
 *
 * The free rectangle is the viewport minus the compare card (a left column,
 * or a bottom sheet), the dock, and the header. Both places land inside it
 * with padding, and the aim shifts so that rectangle's centre, not the
 * screen centre, is where the pair sits.
 */
export function framePair(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  view: PairFrameView
): PairFrame {
  const mid = pairMidpoint(a, b);
  const cos = Math.cos((mid.lat * Math.PI) / 180);
  const east = (lon: number) => wrapDegrees(lon - mid.lon) * cos;
  const north = (lat: number) => lat - mid.lat;
  // Labels sit beside the point, so the ground span is wider than the
  // coordinates alone. A coincident pair still opens as a neighbourhood.
  const halfEast =
    Math.max(Math.abs(east(a.lon)), Math.abs(east(b.lon))) * 1.6 + 0.25;
  const halfNorth =
    Math.max(Math.abs(north(a.lat)), Math.abs(north(b.lat))) * 1.6 + 0.25;

  const free = freeRectangle(view.occlude, view.padding);
  const betaV = (view.fovDeg * Math.PI) / 180 / 2;
  const betaH = Math.atan(Math.tan(betaV) * Math.max(0.35, view.aspect));
  const ayMax = betaV * (1 - 2 * free.top);
  const ayMin = betaV * (2 * free.bottom - 1);
  const axMin = betaH * (2 * free.left - 1);
  const axMax = betaH * (1 - 2 * free.right);
  const halfV = Math.max(0.04, (ayMax - ayMin) / 2);
  const halfH = Math.max(0.04, (axMax - axMin) / 2);
  const ayCenter = (ayMax + ayMin) / 2;
  const axCenter = (axMax + axMin) / 2;

  const distance = Math.min(
    MAX_CAMERA_DISTANCE,
    Math.max(
      ellipsoidRadiusUnits(mid.lat) + MIN_FLY_UNITS,
      distanceFor((halfNorth * Math.PI) / 180, halfV),
      distanceFor((halfEast * Math.PI) / 180, halfH)
    )
  );

  const lat = clamp(
    mid.lat - (groundAngle(ayCenter, distance) * 180) / Math.PI,
    -75,
    75
  );
  const lonScale = Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  let lon =
    mid.lon - (groundAngle(axCenter, distance) * 180) / Math.PI / lonScale;
  lon = wrapDegrees(lon);
  return { lat, lon, distance };
}

function pairMidpoint(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): { lat: number; lon: number } {
  let delta = b.lon - a.lon;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return { lat: (a.lat + b.lat) / 2, lon: wrapDegrees(a.lon + delta / 2) };
}

function wrapDegrees(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Keep a band of the screen free even when the chrome is very tall. */
function freeRectangle(
  occlude: FrameOcclusion,
  padding: number
): FrameOcclusion {
  const pad = clamp(padding, 0, 0.12);
  const fit = (a: number, b: number): [number, number] => {
    // Leave a strip for the places even when a phone sheet covers most of
    // the lower view. 0.84 still lets that sheet push the aim, which a
    // tighter cap was rounding off until the pins sat on the sheet.
    const sum = a + b;
    if (sum <= 0.84) return [a, b];
    const scale = 0.84 / sum;
    return [a * scale, b * scale];
  };
  const [top, bottom] = fit(
    clamp(occlude.top, 0, 0.85) + pad,
    clamp(occlude.bottom, 0, 0.85) + pad
  );
  const [left, right] = fit(
    clamp(occlude.left, 0, 0.85) + pad,
    clamp(occlude.right, 0, 0.85) + pad
  );
  return { top, right, bottom, left };
}

/** Geocentric distance at which `ground` (radians from nadir) reaches `beta`. */
function distanceFor(ground: number, beta: number): number {
  if (!(beta > 0.02)) return MAX_CAMERA_DISTANCE;
  const sum = ground + beta;
  if (sum >= Math.PI / 2 - 0.02) return MAX_CAMERA_DISTANCE;
  return Math.sin(sum) / Math.sin(beta);
}

/** Ground angle (radians from nadir) that lands on camera angle `beta`. */
function groundAngle(beta: number, distance: number): number {
  if (Math.abs(beta) < 1e-6) return 0;
  const sign = Math.sign(beta);
  const b = Math.abs(beta);
  const s = Math.max(1.001, distance) * Math.sin(b);
  if (s >= 1) return sign * Math.acos(1 / Math.max(1.001, distance));
  return sign * (Math.asin(Math.min(1, s)) - b);
}
