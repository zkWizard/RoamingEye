import * as THREE from "three";
import { vector3ToLatLng, latLngToVector3, type LatLng } from "../lib/geo";
import { dragBounds, boundsUsable } from "../lib/probe";
import type { Bounds } from "../lib/imagery";
import { GLOBE_RADIUS } from "../overlays/types";

/** Segments per rectangle edge, so the outline hugs the sphere's curvature. */
const EDGE_SEGMENTS = 24;
const OUTLINE_RADIUS = GLOBE_RADIUS * 1.006;

/**
 * "Draw a study region" interaction: while armed, a pointer drag on the globe
 * sweeps out a lat/lon bounding box, outlined live on the surface. On release
 * the box goes to `onComplete` (unless it was a stray click); the outline
 * stays up until `clear()` — it marks what an open region chart refers to.
 *
 * The host disables OrbitControls while armed (see onModeChange), so the drag
 * belongs to the drawer alone.
 */
export class RegionDrawer {
  readonly object = new THREE.Group();

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private armed = false;
  private anchor: LatLng | undefined;
  private outline: THREE.LineLoop | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly earth: THREE.Mesh,
    private readonly callbacks: {
      /** Fired when the drawer arms/disarms — disable OrbitControls while on. */
      onModeChange: (armed: boolean) => void;
      onComplete: (bounds: Bounds) => void;
    }
  ) {
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", () => this.onUp());
  }

  /** Whether the drawer currently owns pointer input. */
  get active(): boolean {
    return this.armed;
  }

  /** Arm or disarm draw mode (the "Draw region" button). */
  setArmed(on: boolean): void {
    if (on === this.armed) return;
    this.armed = on;
    this.anchor = undefined;
    this.canvas.style.cursor = on ? "crosshair" : "";
    this.callbacks.onModeChange(on);
  }

  /** Remove the drawn outline (the region's chart was dismissed). */
  clear(): void {
    if (!this.outline) return;
    this.object.remove(this.outline);
    this.outline.geometry.dispose();
    (this.outline.material as THREE.Material).dispose();
    this.outline = undefined;
  }

  private onDown(event: PointerEvent): void {
    if (!this.armed) return;
    const hit = this.pick(event);
    if (!hit) return;
    this.clear();
    this.anchor = hit;
  }

  private onMove(event: PointerEvent): void {
    if (!this.armed || !this.anchor) return;
    const hit = this.pick(event);
    if (!hit) return;
    this.showOutline(dragBounds(this.anchor, hit));
  }

  private onUp(): void {
    if (!this.armed || !this.anchor) return;
    this.setArmed(false);
    const bounds = this.outline?.userData.bounds as Bounds | undefined;
    if (bounds && boundsUsable(bounds)) {
      this.callbacks.onComplete(bounds);
    } else {
      this.clear(); // a stray click, not a region
    }
  }

  private pick(event: PointerEvent): LatLng | undefined {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.earth, false)[0];
    return hit ? vector3ToLatLng(hit.point) : undefined;
  }

  private showOutline(bounds: Bounds): void {
    this.clear();
    const positions: number[] = [];
    const push = (lat: number, lon: number): void => {
      const v = latLngToVector3(lat, lon, OUTLINE_RADIUS);
      positions.push(v.x, v.y, v.z);
    };
    // Four edges, each curved along the sphere: S edge W→E, E edge S→N,
    // N edge E→W, W edge N→S — a closed loop.
    for (let i = 0; i < EDGE_SEGMENTS; i++) {
      const t = i / EDGE_SEGMENTS;
      push(bounds.south, bounds.west + t * (bounds.east - bounds.west));
    }
    for (let i = 0; i < EDGE_SEGMENTS; i++) {
      const t = i / EDGE_SEGMENTS;
      push(bounds.south + t * (bounds.north - bounds.south), bounds.east);
    }
    for (let i = 0; i < EDGE_SEGMENTS; i++) {
      const t = i / EDGE_SEGMENTS;
      push(bounds.north, bounds.east - t * (bounds.east - bounds.west));
    }
    for (let i = 0; i < EDGE_SEGMENTS; i++) {
      const t = i / EDGE_SEGMENTS;
      push(bounds.north - t * (bounds.north - bounds.south), bounds.west);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    this.outline = new THREE.LineLoop(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x4ea1ff })
    );
    this.outline.userData.bounds = bounds;
    this.object.add(this.outline);
  }
}
