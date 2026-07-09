import * as THREE from "three";
import { vector3ToLatLng, formatLatLng } from "../lib/geo";
import type {
  Admin1Region,
  CountryIndex,
  RegionIndex,
} from "../lib/countryIndex";
import type { HoverPointSource } from "../overlays/types";

// Hit radius around a point marker, in world units — a little wider than the
// markers themselves (~0.022) feel, so they don't demand pixel-perfect aim.
const POINT_THRESHOLD = 0.012;

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
  private countryIndex: CountryIndex | undefined;
  private admin1Index: RegionIndex<Admin1Region> | undefined;
  private pointerDown = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly earth: THREE.Mesh,
    private readonly tooltip: HTMLElement
  ) {
    this.raycaster.params.Points.threshold = POINT_THRESHOLD;
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

    const point = vector3ToLatLng(hit.point);
    let text = formatLatLng(point);
    // Prefer the province/state ("Ontario, Canada") — first-level admin is
    // how field sites and records are organized; fall back to the country
    // alone where admin-1 has no coverage (ocean, some microstates), and to
    // bare coordinates until the indexes lazy-load.
    const admin1 = this.admin1Index?.lookup(point.lat, point.lon);
    if (admin1) {
      text += ` · ${admin1.name}, ${admin1.country}`;
    } else {
      const country = this.countryIndex?.lookup(point.lat, point.lon);
      if (country) text += ` · ${country}`;
    }

    this.show(text, event.clientX, event.clientY);
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
    return best?.text;
  }

  private show(text: string, x: number, y: number): void {
    this.tooltip.textContent = text;
    this.tooltip.classList.add("is-visible");
    this.tooltip.setAttribute("aria-hidden", "false");

    const pad = 14;
    const width = this.tooltip.offsetWidth;
    const height = this.tooltip.offsetHeight;
    let left = x + pad;
    let top = y + pad;
    if (left + width > window.innerWidth) left = x - pad - width;
    if (top + height > window.innerHeight) top = y - pad - height;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  private hide(): void {
    this.tooltip.classList.remove("is-visible");
    this.tooltip.setAttribute("aria-hidden", "true");
  }
}

/** Overlays toggle visibility on their group, so check the whole ancestry. */
function isShown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}
