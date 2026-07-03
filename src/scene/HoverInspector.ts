import * as THREE from "three";
import { vector3ToLatLng, formatLatLng } from "../lib/geo";
import type { CountryIndex } from "../lib/countryIndex";

/**
 * Shows a small readout near the cursor for whatever point of the globe is
 * under it — coordinates always, plus the country/territory once the lookup
 * index is available. Hidden while dragging (rotate/zoom) or off the globe.
 */
export class HoverInspector {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private countryIndex: CountryIndex | undefined;
  private pointerDown = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly earth: THREE.Mesh,
    private readonly tooltip: HTMLElement
  ) {
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

  private onMove(event: PointerEvent): void {
    if (this.pointerDown) return; // don't distract while rotating/zooming

    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const hit = this.raycaster.intersectObject(this.earth, false)[0];
    if (!hit) {
      this.hide();
      return;
    }

    const point = vector3ToLatLng(hit.point);
    let text = formatLatLng(point);
    const country = this.countryIndex?.lookup(point.lat, point.lon);
    if (country) text += ` · ${country}`;

    this.show(text, event.clientX, event.clientY);
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
