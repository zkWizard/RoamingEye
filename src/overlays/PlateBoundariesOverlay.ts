import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { fetchJson } from "../lib/net";
import { parsePlateBoundaries } from "../lib/plates";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type MapOverlay } from "./types";

/**
 * Tectonic plate boundaries (Bird 2003). Together with the earthquakes and
 * volcanoes overlays this is the intro-geology picture: seismicity and
 * volcanism lining up along the plate edges.
 *
 * All boundaries are flattened into a single LineSegments for one draw call
 * (same approach as BordersOverlay).
 */
export class PlateBoundariesOverlay implements MapOverlay {
  readonly id = "plates";
  readonly label = "Plates";
  readonly icon = ICONS.plates;
  readonly object = new THREE.Group();

  private loadPromise: Promise<void> | undefined;

  constructor(
    // BASE_URL-aware so the fetch works when the site is hosted on a subpath.
    private readonly url = `${import.meta.env.BASE_URL}data/plate-boundaries.geojson`,
    private readonly radius = GLOBE_RADIUS * 1.003
  ) {
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return (this.loadPromise ??= this.load());
  }

  private async load(): Promise<void> {
    const boundaries = parsePlateBoundaries(await fetchJson<unknown>(this.url));

    const positions: number[] = [];
    for (const boundary of boundaries) {
      for (let i = 0; i + 1 < boundary.points.length; i++) {
        const a = latLngToVector3(
          boundary.points[i][1],
          boundary.points[i][0],
          this.radius
        );
        const b = latLngToVector3(
          boundary.points[i + 1][1],
          boundary.points[i + 1][0],
          this.radius
        );
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const material = new THREE.LineBasicMaterial({
      color: 0xff9d4d, // warm orange: reads as "geology" against any layer
      transparent: true,
      opacity: 0.7,
    });
    this.object.add(new THREE.LineSegments(geometry, material));
  }
}
