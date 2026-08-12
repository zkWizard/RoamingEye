import * as THREE from "three";
import { fetchJson } from "../lib/net";
import { plateBoundarySegmentHoverLabel } from "../lib/plateBoundaryHover";
import { plateBoundaryRenderGeometry } from "../lib/plateBoundaryRendering";
import { parsePlateBoundaries } from "../lib/plates";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type HoverLineSource, type MapOverlay } from "./types";

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

  /**
   * Names the plate pair of a hovered boundary once the linework has loaded.
   * Undefined until then, matching the other overlays' lazy hover sources.
   */
  hoverSource: HoverLineSource | undefined;

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

    // The ownership index is what lets a hovered segment name its plate pair
    // again after every boundary is flattened into one draw call.
    const { positions, segmentBoundaries } = plateBoundaryRenderGeometry(
      boundaries,
      this.radius
    );

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
    const lines = new THREE.LineSegments(geometry, material);
    this.object.add(lines);
    this.hoverSource = {
      lines,
      describe: (segmentIndex) =>
        plateBoundarySegmentHoverLabel(
          boundaries,
          segmentBoundaries,
          segmentIndex
        ),
    };
  }
}
