import * as THREE from "three";
import { vector3ToLatLng, formatLatLng } from "../lib/geo";
import type {
  Admin1Region,
  CountryIndex,
  RegionIndex,
} from "../lib/countryIndex";
import type { HoverLineSource, HoverPointSource } from "../overlays/types";

// Hit radius around a point marker, in world units — a little wider than the
// markers themselves (~0.022) feel, so they don't demand pixel-perfect aim.
const POINT_THRESHOLD = 0.012;

// Hit radius around a line, in world units. Tighter than the point threshold:
// plate linework spans the whole globe, so a generous radius would shadow the
// point markers sitting on top of it.
const LINE_THRESHOLD = 0.006;

// A marker hit may sit slightly beyond the earth hit near the limb (markers
// float just above the surface); anything farther than this is on the far
// side of the globe and ignored.
const FAR_SIDE_SLACK = 0.05;

/**
 * Shows a small readout near the cursor for whatever point of the globe is
 * under it — coordinates always, plus the country/territory once the lookup
 * index is available. Overlay point markers (cities, volcanoes) registered
 * via addPointSource take precedence with their own text. Hidden while
 * dragging (rotate/zoom) or off the globe.
 */
export class HoverInspector {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly sources: Array<() => HoverPointSource | undefined> = [];
  private readonly lineSources: Array<() => HoverLineSource | undefined> = [];
  private countryIndex: CountryIndex | undefined;
  private admin1Index: RegionIndex<Admin1Region> | undefined;
  private pointerDown = false;
  /** The point the keyboard is on, while the globe holds keyboard focus. */
  private aimed: { lat: number; lon: number } | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly earth: THREE.Mesh,
    private readonly tooltip: HTMLElement
  ) {
    this.raycaster.params.Points.threshold = POINT_THRESHOLD;
    this.raycaster.params.Line.threshold = LINE_THRESHOLD;
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerleave", () => this.hide());
    canvas.addEventListener("pointerdown", () => {
      this.pointerDown = true;
      this.hide();
    });
    window.addEventListener("pointerup", () => {
      this.pointerDown = false;
    });
  }

  setCountryIndex(index: CountryIndex): void {
    this.countryIndex = index;
  }

  setAdmin1Index(index: RegionIndex<Admin1Region>): void {
    this.admin1Index = index;
  }

  /**
   * Register overlay markers to name on hover. Sources load lazily, so this
   * takes a getter that may return undefined until the overlay has data.
   */
  addPointSource(source: () => HoverPointSource | undefined): void {
    this.sources.push(source);
  }

  /**
   * Register overlay linework to name on hover (e.g. plate boundaries). Point
   * markers take precedence: a marker names one specific feature, while a line
   * only names the boundary it belongs to.
   */
  addLineSource(source: () => HoverLineSource | undefined): void {
    this.lineSources.push(source);
  }

  private onMove(event: PointerEvent): void {
    if (this.pointerDown) return; // don't distract while rotating/zooming

    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const hit = this.raycaster.intersectObject(this.earth, false)[0];
    const marker = this.pickMarker(hit?.distance);
    if (marker) {
      this.show(marker, event.clientX, event.clientY);
      return;
    }
    if (!hit) {
      this.hide();
      return;
    }

    this.show(
      this.describe(vector3ToLatLng(hit.point)),
      event.clientX,
      event.clientY
    );
  }

  /**
   * Name a point of the globe: coordinates always, plus where they fall once
   * the lookup indexes are in. Prefer the province/state ("Ontario, Canada")
   * — first-level admin is how field sites and records are organized; fall
   * back to the country alone where admin-1 has no coverage (ocean, some
   * microstates), and to bare coordinates until the indexes lazy-load.
   *
   * Public because the pointer is not the only thing that aims at the globe:
   * `aimAt` names the point the keyboard is on, and it must read identically.
   */
  describe(point: { lat: number; lon: number }): string {
    let text = formatLatLng(point);
    const admin1 = this.admin1Index?.lookup(point.lat, point.lon);
    if (admin1) {
      text += ` · ${admin1.name}, ${admin1.country}`;
    } else {
      const country = this.countryIndex?.lookup(point.lat, point.lon);
      if (country) text += ` · ${country}`;
    }
    return text;
  }

  /** Text for the nearest visible overlay marker under the cursor, if any. */
  private pickMarker(earthDistance: number | undefined): string | undefined {
    let best: { distance: number; text: string } | undefined;
    for (const get of this.sources) {
      const source = get();
      if (!source || !isShown(source.points)) continue;
      // Intersections come back sorted nearest-first.
      for (const hit of this.raycaster.intersectObject(source.points, false)) {
        if (hit.index === undefined) continue;
        if (
          earthDistance !== undefined &&
          hit.distance > earthDistance + FAR_SIDE_SLACK
        ) {
          break; // this and everything after is behind the globe
        }
        if (best && hit.distance >= best.distance) break;
        const text = source.describe(hit.index);
        if (text) {
          best = { distance: hit.distance, text };
          break;
        }
      }
    }
    return best?.text ?? this.pickLine(earthDistance);
  }

  /** Text for the nearest visible overlay line under the cursor, if any. */
  private pickLine(earthDistance: number | undefined): string | undefined {
    let best: { distance: number; text: string } | undefined;
    for (const get of this.lineSources) {
      const source = get();
      if (!source || !isShown(source.lines)) continue;
      for (const hit of this.raycaster.intersectObject(source.lines, false)) {
        if (hit.index === undefined) continue;
        if (
          earthDistance !== undefined &&
          hit.distance > earthDistance + FAR_SIDE_SLACK
        ) {
          break; // this and everything after is behind the globe
        }
        if (best && hit.distance >= best.distance) break;
        // three.js reports the segment's FIRST vertex index; LineSegments
        // consumes two vertices per segment, so halving recovers the segment.
        const text = source.describe(hit.index / 2);
        if (text) {
          best = { distance: hit.distance, text };
          break;
        }
      }
    }
    return best?.text;
  }

  /**
   * Show the readout for the point the KEYBOARD is aiming at, anchored to the
   * middle of the canvas.
   *
   * The pointer carries its own aim: wherever the cursor is, that is the point,
   * and the readout follows it. A keyboard has no cursor — it turns the globe
   * under a fixed aim, the camera subpoint, which is exactly the middle of the
   * view and exactly what Enter charts. That point was never drawn or named, so
   * arrowing the globe reported nothing at all and the only way to find out
   * where you had arrived was to press Enter and read the probe that opened.
   * Anchoring here puts the same text the cursor gets on the point the keys are
   * actually on; `position()` then offsets it clear so the point stays visible.
   */
  aimAt(point: { lat: number; lon: number }): void {
    this.aimed = point;
    const rect = this.canvas.getBoundingClientRect();
    this.show(
      this.describe(point),
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  }

  /** Drop the keyboard aim — the globe has lost keyboard focus. */
  clearAim(): void {
    this.aimed = undefined;
    this.hide();
  }

  private show(text: string, x: number, y: number): void {
    this.tooltip.textContent = text;
    this.tooltip.classList.add("is-visible");
    this.tooltip.setAttribute("aria-hidden", "false");

    this.position(x, y);
  }

  /**
   * Place the readout near the cursor, preferring below-right and flipping to
   * the far side when that would run past an edge — then clamping, so a box
   * too wide to flip cleanly stays on screen. Flipping alone used to push the
   * left edge negative, cutting off the start of the text, which is where an
   * overlay record's name sits.
   *
   * Offsets go to `transform`, not `left`/`top`: the box is `position: fixed`
   * with `width: auto`, so writing an offset to `left` also shrinks the space
   * it may lay out in, and the width read back on the next move would be the
   * width at the PREVIOUS cursor position. Anchored at the origin, the
   * measurement below is always against the full viewport.
   */
  private position(x: number, y: number): void {
    const pad = 14;
    const width = this.tooltip.offsetWidth;
    const height = this.tooltip.offsetHeight;
    let left = x + pad;
    let top = y + pad;
    if (left + width > window.innerWidth) left = x - pad - width;
    if (top + height > window.innerHeight) top = y - pad - height;
    left = clamp(left, pad, window.innerWidth - width - pad);
    top = clamp(top, pad, window.innerHeight - height - pad);
    // Whole pixels — a fractional translate blurs the text.
    this.tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  /**
   * Take the readout down — unless the keyboard is still aiming, in which case
   * fall back to its point rather than blanking. Every pointer path that hides
   * (cursor off the globe, cursor pressed to drag) says nothing about the
   * keyboard, and a user who is arrowing with a hand resting on the mouse
   * should not lose the readout to a stray pointer event.
   */
  private hide(): void {
    if (this.aimed) {
      this.aimAt(this.aimed);
      return;
    }
    this.tooltip.classList.remove("is-visible");
    this.tooltip.setAttribute("aria-hidden", "true");
  }
}

/** Keep `v` within [lo, hi]; a box wider than its axis pins to `lo`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

/** Overlays toggle visibility on their group, so check the whole ancestry. */
function isShown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}
