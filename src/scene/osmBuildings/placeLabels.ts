import type { PerspectiveCamera } from "three";
import { Vector3 } from "three";
import { labelTiltBoost } from "../../lib/cities";
import { latLngToVector3 } from "../../lib/geo";
import { GLOBE_RADIUS } from "../../overlays/types";

const FRONT_DOT = 0.2;

export interface PlaceLabel {
  name: string;
  lat: number;
  lon: number;
  rank: number;
}

interface LabelDom {
  el: HTMLSpanElement;
  position: Vector3;
  normal: Vector3;
}

/**
 * Screen-space neighbourhood / town names from OSM place tiles. Separate from
 * the cities overlay so labels can appear only at street zoom with buildings.
 */
export class PlaceLabelLayer {
  private layer: HTMLDivElement | null = null;
  private labels: LabelDom[] = [];
  private readonly projected = new Vector3();
  private readonly cameraDir = new Vector3();
  private readonly radius = GLOBE_RADIUS * 1.006;

  setPlaces(places: PlaceLabel[]): void {
    this.clearDom();
    const layer = document.createElement("div");
    layer.className = "place-labels";
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    const sorted = [...places].sort((a, b) => a.rank - b.rank).slice(0, 24);
    for (const place of sorted) {
      const el = document.createElement("span");
      el.className = "place-label";
      el.textContent = place.name;
      el.hidden = true;
      layer.appendChild(el);
      const position = latLngToVector3(place.lat, place.lon, this.radius);
      this.labels.push({
        el,
        position,
        normal: position.clone().normalize(),
      });
    }
    (document.querySelector("#app") ?? document.body).appendChild(layer);
    this.layer = layer;
  }

  update(
    camera: PerspectiveCamera,
    viewportHeightPx: number,
    pitchDeg: number,
    active: boolean
  ): void {
    const layer = this.layer;
    if (!layer || this.labels.length === 0) return;
    if (!active) {
      layer.hidden = true;
      return;
    }
    layer.hidden = false;
    const boost = labelTiltBoost(pitchDeg);
    layer.style.opacity = (0.85 * boost).toFixed(2);
    layer.classList.toggle("place-labels--tilted", pitchDeg >= 5);
    const width = window.innerWidth;
    this.cameraDir.copy(camera.position).normalize();
    for (const label of this.labels) {
      const facing = label.normal.dot(this.cameraDir) > FRONT_DOT;
      label.el.hidden = !facing;
      if (!facing) continue;
      this.projected.copy(label.position).project(camera);
      const x = ((this.projected.x + 1) / 2) * width;
      const y = ((1 - this.projected.y) / 2) * viewportHeightPx;
      label.el.style.transform = `translate(-50%, -120%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  dispose(): void {
    this.clearDom();
  }

  private clearDom(): void {
    this.labels = [];
    this.layer?.remove();
    this.layer = null;
  }
}
