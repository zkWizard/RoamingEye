import type { Object3D, PerspectiveCamera } from "three";
import { parseBorderLines } from "../lib/borderLines";
import { vector3ToLatLng } from "../lib/geo";
import { fetchJson } from "../lib/net";
import { viewingUnitedStates } from "../lib/usExtent";
import { GLOBE_RADIUS } from "./types";

/** A state fills the view; county lines stay readable and off the first load. */
const COUNTY_DISTANCE = 1.28;

interface Slot {
  mesh: Object3D | null;
  started: boolean;
}

const slots = new WeakMap<Object3D, Slot>();

/**
 * US county lines, fetched only while the camera is close and over the
 * United States. Owned by a dynamic chunk so the entry bundle stays put.
 */
export function syncUsCounties(
  group: Object3D,
  camera: PerspectiveCamera
): void {
  const slot = slots.get(group);
  if (camera.position.length() >= COUNTY_DISTANCE) {
    if (slot?.mesh) slot.mesh.visible = false;
    return;
  }
  const { lat, lon } = vector3ToLatLng(camera.position);
  if (!viewingUnitedStates(lat, lon)) {
    if (slot?.mesh) slot.mesh.visible = false;
    return;
  }
  const next = slot ?? { mesh: null, started: false };
  if (!slot) slots.set(group, next);
  if (next.mesh) {
    next.mesh.visible = true;
    return;
  }
  if (next.started) return;
  next.started = true;
  void load(group, next);
}

async function load(group: Object3D, slot: Slot): Promise<void> {
  try {
    const lines = parseBorderLines(
      await fetchJson<unknown>(
        `${import.meta.env.BASE_URL}data/us-counties.json`
      )
    );
    const { haloLineMesh } = await import("./haloLines");
    const mesh = haloLineMesh(lines, GLOBE_RADIUS * 1.0036, {
      widthPx: 2.2,
      core: 0xf6f3ec,
      halo: 0x12161e,
    });
    if (!mesh) return;
    slot.mesh = mesh;
    group.add(mesh);
  } catch {
    slot.started = false;
  }
}
