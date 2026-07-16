import * as THREE from "three";
import { GLOBE_RADIUS, type MapOverlay } from "./types";
import { ICONS } from "../ui/icons";
import { latLngToVector3 } from "../lib/geo";
import { fetchJson } from "../lib/net";
import {
  parseEarthquakeFeedWithCoverage,
  depthClass,
  DEPTH_CLASS_COLORS,
  USGS_FEED_URL,
  type DepthClass,
  type Earthquake,
} from "../lib/earthquakes";

/**
 * Live seismicity: the last 30 days of M4.5+ earthquakes from the USGS feed.
 *
 * Marker size scales with magnitude (three buckets so we can keep cheap
 * PointsMaterials) and color encodes hypocenter depth using the seismological
 * convention: shallow = red, intermediate = amber, deep = blue. Together they
 * trace plate boundaries and subduction zones — the geology audience's map.
 * The hex values live in lib/earthquakes.ts, shared with the legend key.
 */

const DEPTH_COLORS = Object.fromEntries(
  Object.entries(DEPTH_CLASS_COLORS).map(([k, hex]) => [
    k,
    new THREE.Color(hex),
  ])
) as Record<DepthClass, THREE.Color>;

/** Magnitude buckets → point size (unit-sphere scene units), largest first. */
const SIZE_BUCKETS: { min: number; size: number }[] = [
  { min: 6.5, size: 0.055 },
  { min: 5.5, size: 0.035 },
  { min: 0, size: 0.02 },
];

function bucketFor(magnitude: number): (typeof SIZE_BUCKETS)[number] {
  return SIZE_BUCKETS.find((b) => magnitude >= b.min) ?? SIZE_BUCKETS[2];
}

export class EarthquakesOverlay implements MapOverlay {
  readonly id = "quakes";
  readonly label = "Quakes";
  readonly icon = ICONS.quakes;
  readonly object = new THREE.Group();

  private loadPromise: Promise<void> | undefined;

  constructor(
    private readonly url = USGS_FEED_URL,
    private readonly radius = GLOBE_RADIUS * 1.006
  ) {
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return (this.loadPromise ??= this.load());
  }

  private async load(): Promise<void> {
    const { earthquakes: quakes } = parseEarthquakeFeedWithCoverage(
      await fetchJson<unknown>(this.url)
    );

    for (const bucket of SIZE_BUCKETS) {
      const inBucket = quakes.filter((q) => bucketFor(q.magnitude) === bucket);
      if (inBucket.length === 0) continue;
      this.object.add(this.buildPoints(inBucket, bucket.size));
    }
  }

  private buildPoints(quakes: Earthquake[], size: number): THREE.Points {
    const positions: number[] = [];
    const colors: number[] = [];
    for (const q of quakes) {
      const v = latLngToVector3(q.lat, q.lon, this.radius);
      positions.push(v.x, v.y, v.z);
      const c = DEPTH_COLORS[depthClass(q.depthKm)];
      colors.push(c.r, c.g, c.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      sizeAttenuation: true,
      map: makeRingTexture(),
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Points(geometry, material);
  }
}

/** A soft ring sprite so overlapping epicenters read as clusters, not blobs. */
function makeRingTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.45, "rgba(255,255,255,0.65)");
    g.addColorStop(0.7, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
