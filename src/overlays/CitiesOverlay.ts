import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { fetchJson } from "../lib/net";
import { parseCityList, cityHoverLabel } from "../lib/cities";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type HoverPointSource, type MapOverlay } from "./types";

/** Major populated places from Natural Earth (public domain), as glowing dots. */
export class CitiesOverlay implements MapOverlay {
  readonly id = "cities";
  readonly label = "Cities";
  readonly icon = ICONS.cities;
  readonly object = new THREE.Group();

  private loadPromise: Promise<void> | undefined;
  /** Set once loaded — lets the HoverInspector name the dot under the cursor. */
  hoverSource: HoverPointSource | undefined;

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
