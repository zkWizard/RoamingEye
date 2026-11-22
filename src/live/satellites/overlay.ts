import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Group,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
  type PerspectiveCamera,
} from "three";
import {
  once,
  type MapOverlay,
  type OverlaySelection,
} from "../../overlays/types";
import { satelliteCatalog, type SatSample } from "./catalog";
import {
  latLonAltToXYZ,
  lerpLon,
  orbitCountLabel,
  writePointBuffer,
} from "./display";
import { pickNearest } from "./pick";
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

const SATELLITE_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<rect x="9" y="9" width="6" height="6" rx="1"/>` +
  `<path d="M9 10.5H4.5M15 10.5h4.5M9 13.5H4.5M15 13.5h4.5"/>` +
  `<path d="M4.5 9.2v5.6M19.5 9.2v5.6"/></svg>`;

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
  readonly icon = SATELLITE_ICON;
  readonly group = "live" as const;
  readonly object = new Group();

  onCount: ((detail: string) => void) | null = null;

  private readonly loadOnce = once(() => this.load());
  private geometry: BufferGeometry | null = null;
  private positionAttr: BufferAttribute | null = null;
  private lat = new Float32Array(0);
  private lon = new Float32Array(0);
  private alt = new Float32Array(0);
  private names: string[] = [];
  private ids: number[] = [];
  private speeds = new Float32Array(0);
  private countLabel = "";
  private readonly scratch = new Vector3();

  constructor(private readonly spec: SatelliteGroup) {
    this.id = satelliteOverlayId(spec.id);
    this.label = spec.label;
    this.detail = spec.blurb;
    this.object.visible = false;
  }

  ensureLoaded(): Promise<void> {
    return this.loadOnce();
  }

  get groupId(): string {
    return this.spec.id;
  }

  indexOfNorad(noradId: number): number {
    return this.ids.indexOf(noradId);
  }

  selectionAt(index: number): OverlaySelection | null {
    const fix = this.fixAt(index);
    if (!fix) return null;
    return {
      id: `${this.id}:${this.ids[index] ?? index}`,
      title: this.names[index] ?? this.label,
      lat: fix.lat,
      lon: fix.lon,
      x: fix.x,
      y: fix.y,
      z: fix.z,
      screenDist: 0,
      fields: this.fields(index),
    };
  }

  /** Latest fix for a loaded satellite, in world space. */
  fixAt(
    index: number
  ): { lat: number; lon: number; x: number; y: number; z: number } | null {
    const lat = this.lat[index];
    const lon = this.lon[index];
    const alt = this.alt[index];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt))
      return null;
    const [x, y, z] = latLonAltToXYZ(lat, lon, alt);
    return { lat, lon, x, y, z };
  }

  pick(
    clientX: number,
    clientY: number,
    camera: PerspectiveCamera,
    viewportWidth: number,
    viewportHeight: number
  ): OverlaySelection | null {
    if (!this.object.visible || this.lat.length === 0) return null;
    const rect = { width: viewportWidth, height: viewportHeight };
    const screen: { x: number; y: number }[] = new Array(this.lat.length);
    for (let index = 0; index < this.lat.length; index += 1) {
      const fix = this.fixAt(index);
      if (!fix) {
        screen[index] = { x: Number.NaN, y: Number.NaN };
        continue;
      }
      this.scratch.set(fix.x, fix.y, fix.z).project(camera);
      screen[index] = {
        x: (this.scratch.x * 0.5 + 0.5) * rect.width,
        y: (-this.scratch.y * 0.5 + 0.5) * rect.height,
      };
    }
    const found = pickNearest(screen, clientX, clientY);
    if (found === null) return null;
    const fix = this.fixAt(found);
    const point = screen[found];
    if (!fix || !point) return null;
    return {
      id: `${this.id}:${this.ids[found] ?? found}`,
      title: this.names[found] ?? this.label,
      lat: fix.lat,
      lon: fix.lon,
      x: fix.x,
      y: fix.y,
      z: fix.z,
      screenDist: Math.hypot(point.x - clientX, point.y - clientY),
      fields: this.fields(found),
    };
  }

  private fields(index: number): { label: string; value: string }[] {
    const alt = this.alt[index];
    const speed = this.speeds[index];
    const rows = [
      { label: "NORAD", value: String(this.ids[index] ?? "") },
      {
        label: "Altitude",
        value: Number.isFinite(alt) ? `${Math.round(alt)} km` : "unknown",
      },
      {
        label: "Speed",
        value: Number.isFinite(speed) ? `${speed.toFixed(2)} km/s` : "unknown",
      },
      { label: "Type", value: this.spec.label },
    ];
    return rows;
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
    this.names = records.map((record) => record.OBJECT_NAME);
    this.ids = records.map((record) => record.NORAD_CAT_ID);
    this.allocate(records.length);
    const pair = satelliteCatalog().sample(this.spec.id);
    if (pair) this.draw(pair.previous, pair.current, Date.now(), null);
  }

  private allocate(count: number): void {
    this.lat = new Float32Array(count);
    this.lon = new Float32Array(count);
    this.alt = new Float32Array(count);
    this.speeds = new Float32Array(count);
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
      const speed1 = current.values[offset + 3];
      if (
        !Number.isFinite(lat1) ||
        !Number.isFinite(lon1) ||
        !Number.isFinite(alt1)
      ) {
        this.lat[index] = Number.NaN;
        this.lon[index] = Number.NaN;
        this.alt[index] = Number.NaN;
        this.speeds[index] = Number.NaN;
        continue;
      }
      if (!previous || span === 0) {
        this.lat[index] = lat1;
        this.lon[index] = lon1;
        this.alt[index] = alt1;
        this.speeds[index] = speed1;
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
        this.speeds[index] = speed1;
        continue;
      }
      this.lat[index] = lat0 + (lat1 - lat0) * t;
      this.lon[index] = lerpLon(lon0, lon1, t);
      this.alt[index] = alt0 + (alt1 - alt0) * t;
      this.speeds[index] = speed1;
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
