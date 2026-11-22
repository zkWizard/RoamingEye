import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { latLngToVector3 } from "../lib/geo";

/**
 * Animates the camera to focus a lat/lon on the globe, rotating the point to
 * face the viewer and zooming to the given distance. A flight can also blend
 * pitch and heading. Ticked each frame from the render loop; hands control
 * back to OrbitControls when done. The camera stays on the nadir orbit while
 * it flies. The caller applies the blended gaze after the controls update.
 */

/** Pitch (degrees from nadir) and heading (degrees clockwise from north). */
export interface FlightGaze {
  pitch: number;
  heading: number;
}

export class CameraFlyer {
  private active = false;
  private elapsed = 0;
  private duration = 1.4;
  private readonly startPos = new Vector3();
  private readonly endPos = new Vector3();
  private startPitch = 0;
  private startHeading = 0;
  private endPitch = 0;
  private endHeading = 0;
  private pitchNow = 0;
  private headingNow = 0;
  private gazing = false;
  private gazeFresh = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly controls: OrbitControls,
    /** prefers-reduced-motion: place the camera instantly, no tween. */
    private readonly instant = false
  ) {}

  /** True while a flight is in progress (the loop should not also drive controls). */
  get isFlying(): boolean {
    return this.active;
  }

  /**
   * The gaze a flight is leaving. Call this with the view's current pitch and
   * heading before {@link flyTo} so the blend starts there. The camera itself
   * stays on the nadir orbit: OrbitControls reads that pose, and the caller
   * applies the blended gaze afterwards.
   */
  armGaze(pitch: number, heading: number): void {
    this.pitchNow = pitch;
    this.headingNow = heading;
  }

  /**
   * Fly the nadir point to `lat`/`lon`. Pass `gaze` to blend pitch and heading
   * along the same ease. Omit it and the flight is the straight-down one this
   * class has always flown.
   *
   * `startPos` is the camera position at the call. The caller puts the nadir
   * camera back first, or a tilted eye would be read as the orbit.
   */
  flyTo(
    lat: number,
    lon: number,
    distance: number,
    duration = 1.4,
    gaze?: FlightGaze
  ): void {
    this.startPos.copy(this.camera.position);
    this.endPos
      .copy(latLngToVector3(lat, lon, 1))
      .normalize()
      .multiplyScalar(distance);
    if (gaze) {
      this.gazing = true;
      this.startPitch = this.pitchNow;
      this.startHeading = this.headingNow;
      this.endPitch = gaze.pitch;
      this.endHeading = gaze.heading;
      this.blendGaze(0);
    } else {
      this.gazing = false;
      this.gazeFresh = false;
    }
    if (this.instant) {
      // Reduced motion: land at the destination in a single step.
      this.camera.position.copy(this.endPos);
      this.camera.lookAt(0, 0, 0);
      if (this.gazing) this.blendGaze(1);
      this.controls.update();
      return;
    }
    this.duration = duration;
    this.elapsed = 0;
    this.active = true;
    this.controls.enabled = false; // drive the camera until it lands or is grabbed
  }

  /**
   * Hand the camera straight back mid-flight: a press, wheel or arrow key on
   * the globe. The camera stays exactly where the flight had got to (the live
   * position, not the destination), so nothing jumps, and OrbitControls picks
   * up from there. Input is never locked out for the length of a transition.
   */
  cancel(): void {
    if (!this.active) return;
    this.active = false;
    this.controls.enabled = true;
    this.controls.update();
  }

  update(delta: number): void {
    if (!this.active) return;
    this.elapsed += delta;
    const t = Math.min(1, this.elapsed / this.duration);
    const e = easeInOutCubic(t);

    // Spherical-ish blend: interpolate direction, then radius.
    const dir = this.startPos
      .clone()
      .normalize()
      .lerp(this.endPos.clone().normalize(), e)
      .normalize();
    const radius =
      this.startPos.length() +
      (this.endPos.length() - this.startPos.length()) * e;

    this.camera.position.copy(dir.multiplyScalar(radius));
    this.camera.lookAt(0, 0, 0);
    if (this.gazing) this.blendGaze(e);

    if (t >= 1) {
      this.active = false;
      this.controls.enabled = true;
      this.controls.update();
    }
  }

  /**
   * Pitch and heading blended so far, once per update (and once for an instant
   * landing). Null when this flight did not ask for a gaze.
   */
  takeGaze(): FlightGaze | null {
    if (!this.gazeFresh) return null;
    this.gazeFresh = false;
    const pose = { pitch: this.pitchNow, heading: this.headingNow };
    if (!this.active) this.gazing = false;
    return pose;
  }

  private blendGaze(e: number): void {
    this.pitchNow = this.startPitch + (this.endPitch - this.startPitch) * e;
    this.headingNow = lerpHeading(this.startHeading, this.endHeading, e);
    this.gazeFresh = true;
  }
}

function lerpHeading(from: number, to: number, t: number): number {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  let value = from + delta * t;
  value = ((((value + 180) % 360) + 360) % 360) - 180;
  return Math.abs(value) < 1e-8 ? 0 : value;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
