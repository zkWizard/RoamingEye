import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { fetchJson } from "../lib/net";
import {
  parseCityList,
  cityHoverLabel,
  labelOpacity,
  LABEL_COUNT,
} from "../lib/cities";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type HoverPointSource, type MapOverlay } from "./types";

/** A label must face the camera at least this much to show (hides the limb). */
const FRONT_FACING_DOT = 0.25;

interface CityLabel {
  el: HTMLSpanElement;
  position: THREE.Vector3;
  /** Unit surface normal at the city — for the far-side test. */
  normal: THREE.Vector3;
}

/**
 * Major populated places from Natural Earth (public domain), as glowing dots.
 * At close zoom the biggest cities get DOM name labels, projected to screen
 * space each frame and hidden on the globe's far side.
 */
export class CitiesOverlay implements MapOverlay {
  readonly id = "cities";
  readonly label = "Cities";
  readonly icon = ICONS.cities;
  readonly object = new THREE.Group();

  private loadPromise: Promise<void> | undefined;
  /** Set once loaded — lets the HoverInspector name the dot under the cursor. */
  hoverSource: HoverPointSource | undefined;

  private labelLayer: HTMLDivElement | undefined;
  private labels: CityLabel[] = [];
  private readonly projected = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();

  constructor(
    // BASE_URL-aware so the fetch works when the site is hosted on a subpath.
    private readonly url = `${import.meta.env.BASE_URL}data/cities.json`,
    private readonly radius = GLOBE_RADIUS * 1.004
  ) {
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return (this.loadPromise ??= this.load());
  }

  /** Project the label positions for the current view (render-loop hook). */
  update(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    const layer = this.labelLayer;
    if (!layer) return;
    const opacity = this.object.visible
      ? labelOpacity(camera.position.length())
      : 0;
    if (opacity === 0) {
      layer.hidden = true;
      return;
    }
    layer.hidden = false;
    layer.style.opacity = opacity.toFixed(2);

    const width = window.innerWidth;
    this.cameraDir.copy(camera.position).normalize();
    for (const label of this.labels) {
      const facing = label.normal.dot(this.cameraDir) > FRONT_FACING_DOT;
      label.el.hidden = !facing;
      if (!facing) continue;
      this.projected.copy(label.position).project(camera);
      const x = ((this.projected.x + 1) / 2) * width;
      const y = ((1 - this.projected.y) / 2) * viewportHeightPx;
      label.el.style.transform = `translate(-50%, -130%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  private async load(): Promise<void> {
    const cities = parseCityList(await fetchJson<unknown>(this.url));

    const positions: number[] = [];
    for (const c of cities) {
      const v = latLngToVector3(c.lat, c.lon, this.radius);
      positions.push(v.x, v.y, v.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const material = new THREE.PointsMaterial({
      color: 0x9fe8ff,
      size: 0.022,
      sizeAttenuation: true,
      map: makeDotTexture(),
      transparent: true,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    this.object.add(points);
    this.hoverSource = {
      points,
      describe: (index) =>
        cities[index] ? cityHoverLabel(cities[index]) : undefined,
    };

    // Name labels for the biggest cities (the file is sorted by population).
    const layer = document.createElement("div");
    layer.className = "city-labels";
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    for (const city of cities.slice(0, LABEL_COUNT)) {
      const el = document.createElement("span");
      el.className = city.capital
        ? "city-label city-label--capital"
        : "city-label";
      el.textContent = city.name;
      el.hidden = true;
      layer.appendChild(el);
      const position = latLngToVector3(city.lat, city.lon, this.radius);
      this.labels.push({
        el,
        position,
        normal: position.clone().normalize(),
      });
    }
    (document.querySelector("#app") ?? document.body).appendChild(layer);
    this.labelLayer = layer;
  }
}

function makeDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
