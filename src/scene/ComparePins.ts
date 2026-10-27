import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { GLOBE_RADIUS } from "../overlays/types";

export interface PinPlace {
  name: string;
  lat: number;
  lon: number;
}

interface PinLabel {
  el: HTMLElement;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  marker: THREE.Mesh;
}

const COLORS = [0x4ea1ff, 0xffb020] as const;
/** Hide a pin once it turns past the limb. */
const FRONT_FACING_DOT = 0.18;

/**
 * Two labelled pins for a place comparison. The card is the accessible
 * reading; these marks only show where the numbers sit on the globe.
 */
export class ComparePins {
  readonly object = new THREE.Group();
  private readonly layer: HTMLDivElement;
  private readonly labels: PinLabel[] = [];
  private readonly geometry = new THREE.SphereGeometry(1, 18, 18);
  private readonly projected = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.layer = document.createElement("div");
    this.layer.className = "compare-pins";
    this.layer.hidden = true;
    this.layer.setAttribute("aria-hidden", "true");
    parent.append(this.layer);
  }

  show(placeA: PinPlace, placeB: PinPlace): void {
    this.hide();
    this.layer.hidden = false;
    [placeA, placeB].forEach((place, index) => {
      const marker = new THREE.Mesh(
        this.geometry,
        new THREE.MeshBasicMaterial({
          color: COLORS[index],
          depthTest: false,
          depthWrite: false,
        })
      );
      marker.position.copy(
        latLngToVector3(place.lat, place.lon, GLOBE_RADIUS * 1.012)
      );
      marker.renderOrder = 30;
      marker.frustumCulled = false;
      this.object.add(marker);
      const el = document.createElement("span");
      el.className = `compare-pin compare-pin--${index === 0 ? "a" : "b"}`;
      el.textContent = place.name;
      this.layer.append(el);
      this.labels.push({
        el,
        marker,
        position: latLngToVector3(place.lat, place.lon, GLOBE_RADIUS * 1.02),
        normal: latLngToVector3(place.lat, place.lon, 1).normalize(),
      });
    });
  }

  hide(): void {
    for (const label of this.labels) {
      this.object.remove(label.marker);
      const material = label.marker.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
    this.labels.length = 0;
    this.layer.replaceChildren();
    this.layer.hidden = true;
  }

  /** Project labels and keep the pins a steady size. `camera` is the globe camera. */
  update(camera: object): void {
    if (!(camera instanceof THREE.Camera) || this.labels.length === 0) return;
    const distance = camera.position.length();
    const above = Math.max(0, distance - GLOBE_RADIUS);
    const scale = Math.max(0.008, above * 0.016);
    this.cameraDir.copy(camera.position).normalize();
    const width = window.innerWidth;
    const height = window.innerHeight;
    for (const label of this.labels) {
      const facing = label.normal.dot(this.cameraDir) > FRONT_FACING_DOT;
      label.marker.visible = facing;
      label.el.hidden = !facing;
      if (!facing) continue;
      label.marker.scale.setScalar(scale);
      this.projected.copy(label.position).project(camera);
      const x = ((this.projected.x + 1) / 2) * width;
      const y = ((1 - this.projected.y) / 2) * height;
      // The two cities sit close together at a regional zoom. One name
      // rides above its pin and the other below, so the words do not stack.
      const lift = label.el.classList.contains("compare-pin--b")
        ? "30%"
        : "-145%";
      label.el.style.transform = `translate(-50%, ${lift}) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
