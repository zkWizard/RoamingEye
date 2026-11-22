import { Vector3 } from "three";
import { latLngToVector3, vector3ToLatLng } from "./geo";

/**
 * A tilted view of one ground point.
 *
 * `pitch` is degrees from straight down: 0 looks at the point's nadir, 90
 * would look along the horizon. `heading` is degrees clockwise from north.
 * `distance` is the geocentric radius the camera would have if pitch were 0,
 * the same number the share link stores as altitude above the unit sphere
 * plus one.
 */

export const PITCH_MAX_DEG = 80;
/** One tap of the 3D button. Steep enough to read relief, short of the horizon. */
export const PITCH_3D_DEG = 55;

const DEG = Math.PI / 180;
const NORTH = new Vector3(0, 1, 0);
const east = new Vector3();
const north = new Vector3();
const forward = new Vector3();
const up = new Vector3();

export interface GlobePose {
  lat: number;
  lon: number;
  /** Geocentric distance at pitch 0. */
  distance: number;
  pitch: number;
  heading: number;
}

export function clampPitch(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.min(PITCH_MAX_DEG, Math.max(0, deg));
}

export function wrapHeading(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Math.abs(wrapped) < 1e-8 ? 0 : wrapped;
}

/**
 * Eye and look-at for `pose`. The look-at sits on the unit sphere. The eye
 * keeps `distance` as its range from that point when pitch is 0, and slides
 * back along the heading as pitch grows. `surface` is the ground radius
 * under the point (the scaled ellipsoid).
 */
export function poseVectors(
  pose: GlobePose,
  surface: number
): { eye: Vector3; target: Vector3 } {
  const pitch = clampPitch(pose.pitch) * DEG;
  const heading = wrapHeading(pose.heading) * DEG;
  const target = latLngToVector3(pose.lat, pose.lon, surface);
  up.copy(target).normalize();
  north.copy(NORTH).addScaledVector(up, -up.dot(NORTH));
  if (north.lengthSq() < 1e-8) {
    north.set(0, 0, 1).addScaledVector(up, -up.z);
  }
  north.normalize();
  east.crossVectors(north, up).normalize();
  forward
    .copy(north)
    .multiplyScalar(Math.cos(heading))
    .addScaledVector(east, Math.sin(heading));
  const range = Math.max(pose.distance - surface, 1e-4);
  const eye = target
    .clone()
    .addScaledVector(up, range * Math.cos(pitch))
    .addScaledVector(forward, -range * Math.sin(pitch));
  return { eye, target };
}

/**
 * Push the eye out along its view until it clears `minDistance` from the
 * origin. The look-at stays put, so a tilt cannot bury the camera in the
 * ground. Returns the geocentric distance the nadir pose should grow to.
 */
export function rangeToClearGround(
  pose: GlobePose,
  surface: number,
  minDistance: number
): number {
  let distance = pose.distance;
  for (let i = 0; i < 4; i++) {
    const { eye } = poseVectors({ ...pose, distance }, surface);
    if (eye.length() >= minDistance - 1e-6) return distance;
    const deficit = minDistance - eye.length();
    distance +=
      deficit / Math.max(0.25, Math.cos(clampPitch(pose.pitch) * DEG));
  }
  return distance;
}

/** Where the eye sits, for the ground clamp's latitude. */
export function eyeLatLon(
  pose: GlobePose,
  surface: number
): { lat: number; lon: number; distance: number } {
  const { eye } = poseVectors(pose, surface);
  const ll = vector3ToLatLng(eye);
  return { lat: ll.lat, lon: ll.lon, distance: eye.length() };
}

export function applyPose(
  camera: {
    position: Vector3;
    lookAt: (x: number, y: number, z: number) => void;
  },
  pose: GlobePose,
  surface: number
): void {
  if (
    clampPitch(pose.pitch) < 0.05 &&
    Math.abs(wrapHeading(pose.heading)) < 0.05
  ) {
    camera.position.copy(latLngToVector3(pose.lat, pose.lon, pose.distance));
    camera.lookAt(0, 0, 0);
    return;
  }
  const { eye, target } = poseVectors(pose, surface);
  camera.position.copy(eye);
  camera.lookAt(target.x, target.y, target.z);
}
