import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { fetchJson } from "../lib/net";
import {
  parseVolcanoList,
  eruptionClass,
  type EruptionClass,
  type Volcano,
} from "../lib/volcanoes";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type MapOverlay } from "./types";

/**
 * Holocene volcanoes from the Smithsonian Global Volcanism Program.
 *
 * Color encodes how recently each volcano erupted: the instrumental era
 * (since 1900) hot orange, the written record (1 CE–1899) amber, and
 * Holocene-evidence-only a muted violet — so active arcs pop while the full
 * Holocene population still traces the plate boundaries.
 */

const CLASS_COLORS: Record<EruptionClass, THREE.Color> = {
  recent: new THREE.Color("#ff6b35"),
  historic: new THREE.Color("#ffc46b"),
  holocene: new THREE.Color("#b49ae0"),
};

export class VolcanoesOverlay implements MapOverlay {
  readonly id = "volcanoes";
  readonly label = "Volcanoes";
  readonly icon = ICONS.volcanoes;
  readonly object = new THREE.Group();

  private loadPromise: Promise<void> | undefined;

  constructor(
    // BASE_URL-aware so the fetch works when the site is hosted on a subpath.
    private readonly url = `${import.meta.env.BASE_URL}data/volcanoes.json`,
    private readonly radius = GLOBE_RADIUS * 1.005
  ) {
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return (this.loadPromise ??= this.load());
  }

  private async load(): Promise<void> {
    const volcanoes = parseVolcanoList(await fetchJson<unknown>(this.url));
    this.object.add(this.buildPoints(volcanoes));
  }

  private buildPoints(volcanoes: Volcano[]): THREE.Points {
    const positions: number[] = [];
    const colors: number[] = [];
    for (const v of volcanoes) {
      const p = latLngToVector3(v.lat, v.lon, this.radius);
      positions.push(p.x, p.y, p.z);
      const c = CLASS_COLORS[eruptionClass(v.lastEruptionYear)];
      colors.push(c.r, c.g, c.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.024,
      vertexColors: true,
      sizeAttenuation: true,
      map: makeTriangleTexture(),
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Points(geometry, material);
  }
}

/** A soft upward triangle sprite — the map symbol for a volcano. */
function makeTriangleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.beginPath();
    ctx.moveTo(size / 2, size * 0.08);
    ctx.lineTo(size * 0.92, size * 0.88);
    ctx.lineTo(size * 0.08, size * 0.88);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
