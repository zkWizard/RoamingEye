import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Group,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  type PerspectiveCamera,
} from "three";
import { once, type MapOverlay } from "../../overlays/types";
import { ICONS } from "../../ui/icons";
import { satelliteCatalog, type SatSample } from "./catalog";
import { lerpLon, orbitCountLabel, writePointBuffer } from "./display";
import {
  drawStride,
  SATELLITE_GROUPS,
  satelliteOverlayId,
  type SatelliteGroup,
} from "./groups";

declare global {
  interface Window {
    __SATELLITE_POINTS__?: Record<string, number>;
  }
}

let disc: CanvasTexture | undefined;

function discTexture(): CanvasTexture {
  if (disc) return disc;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const half = size / 2;
    const gradient = context.createRadialGradient(
      half,
      half,
      0,
      half,
      half,
      half
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  disc = texture;
  return texture;
}

function finitePacked(values: Float32Array): number {
  let count = 0;
  for (let index = 0; index < values.length; index += 4) {
    if (Number.isFinite(values[index])) count += 1;
  }
  return count;
}

/**
 * One CelesTrak class: its own toggle, its own colour, one Points draw.
 * Positions are filled from the shared worker catalog each frame.
 */
export class SatelliteGroupOverlay implements MapOverlay {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly icon = ICONS.satellite;
  readonly group = "live" as const;
  readonly object = new Group();

  onCount: ((detail: string) => void) | null = null;

  private readonly loadOnce = once(() => this.load());
  private geometry: BufferGeometry | null = null;
  private positionAttr: BufferAttribute | null = null;
  private lat = new Float32Array(0);
  private lon = new Float32Array(0);
  private alt = new Float32Array(0);
  private countLabel = "";

  constructor(private readonly spec: SatelliteGroup) {
    this.id = satelliteOverlayId(spec.id);
    this.label = spec.label;
    this.detail = spec.blurb;
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return this.loadOnce();
  }

  update(camera: PerspectiveCamera): void {
    const catalog = satelliteCatalog();
    if (!this.object.visible || !this.geometry) {
      catalog.hide(this.spec.id);
      return;
    }
    const now = Date.now();
    catalog.noteVisible(this.spec.id, now);
    const pair = catalog.sample(this.spec.id);
    if (!pair) return;
    this.draw(pair.previous, pair.current, now, camera);
  }

  private async load(): Promise<void> {
    const records = await satelliteCatalog().ensureGroup(this.spec.id);
    this.allocate(records.length);
    const pair = satelliteCatalog().sample(this.spec.id);
    if (pair) this.draw(pair.previous, pair.current, Date.now(), null);
  }

  private allocate(count: number): void {
    this.lat = new Float32Array(count);
    this.lon = new Float32Array(count);
    this.alt = new Float32Array(count);
    const positions = new Float32Array(count * 3);
    const geometry = new BufferGeometry();
    const attr = new BufferAttribute(positions, 3);
    attr.setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", attr);
    geometry.setDrawRange(0, 0);
    const material = new PointsMaterial({
      color: this.spec.color,
      size: this.spec.size,
      sizeAttenuation: true,
      map: discTexture(),
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 2;
    this.object.add(points);
    this.geometry = geometry;
    this.positionAttr = attr;
  }

  private draw(
    previous: SatSample | null,
    current: SatSample,
    now: number,
    camera: PerspectiveCamera | null
  ): void {
    const count = current.values.length / 4;
    if (this.lat.length !== count || !this.positionAttr || !this.geometry)
      return;
    const span =
      previous && previous.timeMs < current.timeMs
        ? current.timeMs - previous.timeMs
        : 0;
    const t =
      span > 0 ? Math.min(1, Math.max(0, (now - previous!.timeMs) / span)) : 1;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      const lat1 = current.values[offset];
      const lon1 = current.values[offset + 1];
      const alt1 = current.values[offset + 2];
      if (
        !Number.isFinite(lat1) ||
        !Number.isFinite(lon1) ||
        !Number.isFinite(alt1)
      ) {
        this.lat[index] = Number.NaN;
        this.lon[index] = Number.NaN;
        this.alt[index] = Number.NaN;
        continue;
      }
      if (!previous || span === 0) {
        this.lat[index] = lat1;
        this.lon[index] = lon1;
        this.alt[index] = alt1;
        continue;
      }
      const lat0 = previous.values[offset];
      const lon0 = previous.values[offset + 1];
      const alt0 = previous.values[offset + 2];
      if (
        !Number.isFinite(lat0) ||
        !Number.isFinite(lon0) ||
        !Number.isFinite(alt0)
      ) {
        this.lat[index] = lat1;
        this.lon[index] = lon1;
        this.alt[index] = alt1;
        continue;
      }
      this.lat[index] = lat0 + (lat1 - lat0) * t;
      this.lon[index] = lerpLon(lon0, lon1, t);
      this.alt[index] = alt0 + (alt1 - alt0) * t;
    }
    const position = camera?.position;
    const written = writePointBuffer({
      lat: this.lat,
      lon: this.lon,
      altKm: this.alt,
      stride: drawStride(
        this.spec.id,
        position ? Math.hypot(position.x, position.y, position.z) : 3.2
      ),
      cameraX: position?.x ?? 0,
      cameraY: position?.y ?? 0,
      cameraZ: position?.z ?? 3.2,
      out: this.positionAttr.array as Float32Array,
    });
    this.positionAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, written);
    const bag = (window.__SATELLITE_POINTS__ ??= {});
    bag[this.id] = written;
    const label = orbitCountLabel(finitePacked(current.values));
    if (label !== this.countLabel) {
      this.countLabel = label;
      this.onCount?.(label);
    }
  }
}

export function createSatelliteOverlays(
  onCount: (id: string, detail: string) => void
): SatelliteGroupOverlay[] {
  return SATELLITE_GROUPS.map((spec) => {
    const overlay = new SatelliteGroupOverlay(spec);
    overlay.onCount = (detail) => onCount(overlay.id, detail);
    return overlay;
  });
}
