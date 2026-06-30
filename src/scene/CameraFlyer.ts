import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { latLngToVector3 } from "../lib/geo";

/**
 * Animates the camera to focus a lat/lon on the globe — rotating the point to
 * face the viewer and zooming to the given distance. Ticked each frame from the
 * render loop; hands control back to OrbitControls when done.
 */
export class CameraFlyer {
  private active = false;
  private elapsed = 0;
  private duration = 1.4;
  private readonly startPos = new THREE.Vector3();
  private readonly endPos = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls
  ) {}

  /** True while a flight is in progress (the loop should not also drive controls). */
  get isFlying(): boolean {
    return this.active;
  }

  flyTo(lat: number, lon: number, distance: number, duration = 1.4): void {
    this.startPos.copy(this.camera.position);
    this.endPos
      .copy(latLngToVector3(lat, lon, 1))
      .normalize()
      .multiplyScalar(distance);
    this.duration = duration;
    this.elapsed = 0;
    this.active = true;
    this.controls.enabled = false; // take over until the flight finishes
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

    if (t >= 1) {
      this.active = false;
      this.controls.enabled = true;
      this.controls.update();
    }
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
