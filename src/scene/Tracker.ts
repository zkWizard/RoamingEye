import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  type PerspectiveCamera,
} from "three";
import { latLngToVector3 } from "../lib/geo";
import { latLonAltToXYZ } from "../live/satellites/display";
import type { MapOverlay, OverlaySelection } from "../overlays/types";
import { EntityCard } from "../ui/EntityCard";

const TRAIL_LIMIT = 90;

export interface TrackerHost {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  controls: { enabled: boolean };
  instant: boolean;
  overlays: () => readonly MapOverlay[];
  scene: { add(object: Group): void };
  onFollowChange?: (noradId: number | undefined) => void;
  /** Ask the selected layer for an orbit and a 90 minute ground track. */
  onPaths?: (noradId: number) => void;
}

/**
 * Click to select, then follow. Picking is delegated to each overlay's
 * `pick` (a spatial hash, not a raycast over the cloud). The highlight,
 * the fading trail, the orbit and the ground track live here so the next
 * live layer can reuse them.
 */
export class Tracker {
  readonly object = new Group();
  private readonly card: EntityCard;
  private readonly ring: LineLoop;
  private readonly trail: Line;
  private readonly orbit: Line;
  private readonly ground: Line;
  private readonly trailPositions: number[] = [];
  private selection: OverlaySelection | null = null;
  private following = false;
  private followNorad: number | undefined;
  private pointer: { x: number; y: number } | null = null;
  private moved = false;

  constructor(private readonly host: TrackerHost) {
    this.ring = makeLoop(0xfff4c2, 0.035);
    this.trail = makeLine(0xfff4c2, true);
    this.orbit = makeLine(0x9ad7ff, false);
    this.ground = makeLine(0xffb15a, false);
    this.object.add(this.ring, this.trail, this.orbit, this.ground);
    this.ring.visible = false;
    this.trail.visible = false;
    this.orbit.visible = false;
    this.ground.visible = false;
    host.scene.add(this.object);

    this.card = new EntityCard();
    this.card.onClose = () => this.clear();
    this.card.onFollow = () => this.toggleFollow();

    host.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.pointer = { x: event.clientX, y: event.clientY };
      this.moved = false;
    });
    host.canvas.addEventListener("pointermove", (event) => {
      if (!this.pointer) return;
      if (
        Math.hypot(
          event.clientX - this.pointer.x,
          event.clientY - this.pointer.y
        ) > 8
      ) {
        this.moved = true;
      }
    });
    host.canvas.addEventListener("pointerup", (event) => {
      const start = this.pointer;
      const dragged = this.moved;
      this.pointer = null;
      if (!start || dragged || event.button !== 0) return;
      this.pick(event.clientX, event.clientY);
    });
    // Capture runs before OrbitControls, so a drag takes the camera back
    // on the same press that ends follow.
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.following || event.target !== host.canvas) return;
        this.following = false;
        host.controls.enabled = true;
        if (this.selection) {
          this.card.show({
            title: this.selection.title,
            fields: this.selection.fields,
            following: false,
          });
        }
        this.host.onFollowChange?.(undefined);
      },
      true
    );
  }

  /** Turn a layer on is the caller's job. This selects and follows by NORAD. */
  followSelection(selection: OverlaySelection, noradId: number): void {
    this.selection = selection;
    this.followNorad = noradId;
    this.following = true;
    this.trailPositions.length = 0;
    this.card.show({
      title: selection.title,
      fields: selection.fields,
      note: selection.note,
      following: true,
    });
    this.host.onFollowChange?.(noradId);
    this.host.onPaths?.(noradId);
    this.placeRing(selection.x, selection.y, selection.z);
  }

  clear(): void {
    this.selection = null;
    this.following = false;
    this.followNorad = undefined;
    this.trailPositions.length = 0;
    this.ring.visible = false;
    this.trail.visible = false;
    this.orbit.visible = false;
    this.ground.visible = false;
    this.card.hide();
    this.host.controls.enabled = true;
    this.host.onFollowChange?.(undefined);
  }

  setNote(note: string): void {
    this.card.setNote(note);
  }

  setPaths(orbit: Float32Array | null, ground: Float32Array | null): void {
    writeLatLonAlt(this.orbit, orbit);
    writeLatLon(this.ground, ground);
  }

  update(): void {
    const selection = this.selection;
    if (!selection) return;
    const live = this.liveFix(selection.id);
    const fix = live ?? selection;
    this.placeRing(fix.x, fix.y, fix.z);
    this.pushTrail(fix.x, fix.y, fix.z);
    if (!this.following) return;
    const dest = latLngToVector3(fix.lat, fix.lon, 2.5);
    if (this.host.instant) this.host.camera.position.copy(dest);
    else this.host.camera.position.lerp(dest, 0.15);
    this.host.camera.lookAt(0, 0, 0);
    this.host.controls.enabled = false;
  }

  get selectedNorad(): number | undefined {
    return this.followNorad;
  }

  private toggleFollow(): void {
    if (!this.selection) return;
    this.following = !this.following;
    if (!this.following) this.host.controls.enabled = true;
    this.card.show({
      title: this.selection.title,
      fields: this.selection.fields,
      following: this.following,
    });
    const norad = this.following ? this.followNorad : undefined;
    this.host.onFollowChange?.(norad);
    if (this.following && this.followNorad !== undefined) {
      this.host.onPaths?.(this.followNorad);
    }
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.host.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: OverlaySelection | null = null;
    for (const overlay of this.host.overlays()) {
      if (!overlay.object.visible || !overlay.pick) continue;
      const hit = overlay.pick(x, y, this.host.camera, rect.width, rect.height);
      if (!hit) continue;
      if (!best || hit.screenDist < best.screenDist) best = hit;
    }
    if (!best) return;
    this.selection = best;
    this.following = false;
    this.followNorad = noradFromId(best.id);
    this.trailPositions.length = 0;
    this.orbit.visible = false;
    this.ground.visible = false;
    this.host.controls.enabled = true;
    this.card.show({
      title: best.title,
      fields: best.fields,
      note: best.note,
      following: false,
    });
    this.placeRing(best.x, best.y, best.z);
    this.host.onFollowChange?.(undefined);
  }

  private liveFix(
    id: string
  ): { lat: number; lon: number; x: number; y: number; z: number } | null {
    const norad = noradFromId(id);
    if (norad === undefined) return null;
    for (const overlay of this.host.overlays()) {
      if (!("fixAt" in overlay) || !("indexOfNorad" in overlay)) continue;
      const candidate = overlay as MapOverlay & {
        indexOfNorad(id: number): number;
        fixAt(index: number): {
          lat: number;
          lon: number;
          x: number;
          y: number;
          z: number;
        } | null;
      };
      const index = candidate.indexOfNorad(norad);
      if (index < 0) continue;
      return candidate.fixAt(index);
    }
    return null;
  }

  private placeRing(x: number, y: number, z: number): void {
    this.ring.visible = true;
    this.ring.position.set(x, y, z);
    this.ring.lookAt(0, 0, 0);
  }

  private pushTrail(x: number, y: number, z: number): void {
    const last = this.trailPositions.length;
    if (last >= 3) {
      const dx = x - this.trailPositions[last - 3];
      const dy = y - this.trailPositions[last - 2];
      const dz = z - this.trailPositions[last - 1];
      if (dx * dx + dy * dy + dz * dz < 1e-8) return;
    }
    this.trailPositions.push(x, y, z);
    const extra = this.trailPositions.length / 3 - TRAIL_LIMIT;
    if (extra > 0) this.trailPositions.splice(0, extra * 3);
    const geometry = this.trail.geometry as BufferGeometry;
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(this.trailPositions), 3)
    );
    const count = this.trailPositions.length / 3;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const fade = (index + 1) / count;
      colors[index * 3] = fade;
      colors[index * 3 + 1] = fade;
      colors[index * 3 + 2] = fade * 0.7;
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    this.trail.visible = count > 1;
  }
}

function noradFromId(id: string): number | undefined {
  const match = /:(\d+)$/.exec(id);
  if (!match) return undefined;
  const norad = Number(match[1]);
  return Number.isInteger(norad) ? norad : undefined;
}

function makeLoop(color: number, radius: number): LineLoop {
  const positions: number[] = [];
  const steps = 40;
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3)
  );
  const material = new LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const loop = new LineLoop(geometry, material);
  loop.renderOrder = 4;
  return loop;
}

function makeLine(color: number, vertexColors: boolean): Line {
  const geometry = new BufferGeometry();
  const material = new LineBasicMaterial({
    color,
    vertexColors,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
  });
  const line = new Line(geometry, material);
  line.renderOrder = 3;
  line.frustumCulled = false;
  return line;
}

function writeLatLonAlt(line: Line, packed: Float32Array | null): void {
  if (!packed || packed.length < 6) {
    line.visible = false;
    return;
  }
  const positions: number[] = [];
  for (let offset = 0; offset + 2 < packed.length; offset += 3) {
    const lat = packed[offset];
    const lon = packed[offset + 1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const alt = packed[offset + 2];
    const [x, y, z] = latLonAltToXYZ(lat, lon, Number.isFinite(alt) ? alt : 0);
    positions.push(x, y, z);
  }
  const geometry = line.geometry as BufferGeometry;
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3)
  );
  line.visible = positions.length > 3;
}

function writeLatLon(line: Line, packed: Float32Array | null): void {
  if (!packed || packed.length < 4) {
    line.visible = false;
    return;
  }
  const positions: number[] = [];
  for (let offset = 0; offset + 1 < packed.length; offset += 2) {
    const lat = packed[offset];
    const lon = packed[offset + 1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const point = latLngToVector3(lat, lon, 1.004);
    positions.push(point.x, point.y, point.z);
  }
  const geometry = line.geometry as BufferGeometry;
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3)
  );
  line.visible = positions.length > 3;
}
