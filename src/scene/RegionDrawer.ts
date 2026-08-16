import * as THREE from "three";
import { vector3ToLatLng, latLngToVector3, type LatLng } from "../lib/geo";
import { dragBounds, boundsUsable } from "../lib/probe";
import type { Bounds } from "../lib/imagery";
import { GLOBE_RADIUS } from "../overlays/types";

/** Segments per rectangle edge, so the outline hugs the sphere's curvature. */
const EDGE_SEGMENTS = 24;
const OUTLINE_RADIUS = GLOBE_RADIUS * 1.006;

/** What a keyboard corner press did, so the host can say so in the HUD. */
export type CornerOutcome = "anchored" | "completed" | "rejected";

/**
 * "Draw a study region" interaction: while armed, a pointer drag on the globe
 * sweeps out a lat/lon bounding box, outlined live on the surface. On release
 * the box goes to `onComplete` (unless it was a stray click); the outline
 * stays up until `clear()` — it marks what an open region chart refers to.
 *
 * The host disables OrbitControls while armed (see onModeChange), so the drag
 * belongs to the drawer alone.
 *
 * A drag is two corners and the travel between them, which a keyboard cannot
 * express in one gesture — so `markCorner`/`stretchTo` split it into the two
 * corners alone, taken from wherever the arrow keys have aimed the camera.
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

  /** Whether a first corner is down and the box is waiting on its opposite. */
  get anchored(): boolean {
    return this.armed && this.anchor !== undefined;
  }

  /**
   * Keyboard equivalent of `pointermove`: with a corner already down, stretch
   * the box out to `point`. The arrow keys steer the camera, so its subpoint
   * is the keyboard's cursor, and this is what makes the outline follow it.
   */
  stretchTo(point: LatLng): void {
    if (!this.anchored) return;
    this.showOutline(dragBounds(this.anchor as LatLng, point));
  }

  /**
   * Keyboard equivalent of the drag: the first press puts a corner down at
   * `point`, the second takes the box.
   *
   * A rejected second corner keeps the first one — one arrow press moves in a
   * single axis, so the box a user gets by pressing Enter, arrow, Enter is
   * flat and unusable, and dropping them back out of draw mode for it would
   * punish the likeliest honest mistake. They stay armed and are told to turn
   * further, which is the one thing that fixes it.
   */
  markCorner(point: LatLng): CornerOutcome {
    if (!this.armed) return "rejected";
    if (!this.anchor) {
      this.clear();
      this.anchor = point;
      return "anchored";
    }
    this.showOutline(dragBounds(this.anchor, point));
    const bounds = this.outline?.userData.bounds as Bounds | undefined;
    if (!bounds || !boundsUsable(bounds)) {
      this.clear();
      return "rejected";
    }
    this.setArmed(false);
    this.callbacks.onComplete(bounds);
    return "completed";
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
