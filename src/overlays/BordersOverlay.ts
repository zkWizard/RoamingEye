import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { geometryToRings, type GeoGeometry } from "../lib/geojson";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type MapOverlay } from "./types";

interface FeatureCollection {
  features: { geometry: GeoGeometry }[];
}

/**
 * National borders from Natural Earth (admin-0, public domain). All rings are
 * flattened into a single LineSegments for one draw call.
 */
export class BordersOverlay implements MapOverlay {
  readonly id = "borders";
  readonly label = "Borders";
  readonly icon = ICONS.borders;
  readonly object = new THREE.Group();

  private loadPromise: Promise<void> | undefined;

  constructor(
    private readonly url = "/data/countries.geojson",
    private readonly radius = GLOBE_RADIUS * 1.0015
  ) {
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return (this.loadPromise ??= this.load());
  }

  private async load(): Promise<void> {
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(`borders: ${res.status}`);
    const data = (await res.json()) as FeatureCollection;

    const positions: number[] = [];
    for (const feature of data.features) {
      for (const ring of geometryToRings(feature.geometry)) {
        for (let i = 0; i + 1 < ring.length; i++) {
          const a = latLngToVector3(ring[i][1], ring[i][0], this.radius);
          const b = latLngToVector3(
            ring[i + 1][1],
            ring[i + 1][0],
            this.radius
          );
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.32,
    });
    this.object.add(new THREE.LineSegments(geometry, material));
  }
}
