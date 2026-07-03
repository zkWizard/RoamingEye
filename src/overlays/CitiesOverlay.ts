import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { fetchJson } from "../lib/net";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type MapOverlay } from "./types";

interface City {
  name: string;
  lat: number;
  lon: number;
  country: string | null;
  pop: number | null;
  capital: boolean;
}

/** Major populated places from Natural Earth (public domain), as glowing dots. */
export class CitiesOverlay implements MapOverlay {
  readonly id = "cities";
  readonly label = "Cities";
  readonly icon = ICONS.cities;
  readonly object = new THREE.Group();

  private loadPromise: Promise<void> | undefined;

  constructor(
    private readonly url = "/data/cities.json",
    private readonly radius = GLOBE_RADIUS * 1.004
  ) {
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return (this.loadPromise ??= this.load());
  }

  private async load(): Promise<void> {
    const cities = await fetchJson<City[]>(this.url);

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
    this.object.add(new THREE.Points(geometry, material));
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
