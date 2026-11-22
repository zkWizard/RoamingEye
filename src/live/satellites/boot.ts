import type { Object3D, PerspectiveCamera } from "three";
import { Tracker } from "../../scene/Tracker";
import type { MapOverlay } from "../../overlays/types";
import { satelliteCatalog } from "./catalog";
import { mountLiveMenu, setLiveDetail, setLivePressed } from "./menu";
import { createSatelliteOverlays, type SatelliteGroupOverlay } from "./overlay";
import { trackFromHash, writeTrackHash } from "./trackHash";

export interface SatelliteHost {
  scene: { add(object: Object3D): void };
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  /** Orbit controls. Follow turns these off while it owns the camera. */
  controls: { enabled: boolean };
  overlays: MapOverlay[];
  toolbar: HTMLElement | null;
  onToggle: (overlay: MapOverlay, on: boolean) => void;
  isOn: (overlay: MapOverlay) => boolean;
  restore: (overlay: MapOverlay) => void;
  /** prefers-reduced-motion: snap the camera instead of easing. */
  instant: boolean;
  /** Called each frame from the render loop, before the orbit controls run. */
  setFrame: (hook: () => void) => void;
}

const GROUP_ORDER = [
  "stations",
  "starlink",
  "gps-ops",
  "weather",
  "resource",
  "visual",
];

/**
 * Register the six satellite classes and the click-to-follow tracker.
 * satellite.js stays in the worker. Nothing is fetched until a class is on,
 * except a `track=` link, which loads classes until that catalog number appears.
 */
export function bootLiveSatellites(
  scene: SatelliteHost["scene"],
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  controls: SatelliteHost["controls"],
  overlays: MapOverlay[],
  toolbar: HTMLElement | null,
  onToggle: SatelliteHost["onToggle"],
  isOn: SatelliteHost["isOn"],
  restore: SatelliteHost["restore"],
  instant: boolean,
  setFrame: SatelliteHost["setFrame"]
): {
  followNorad(noradId: number): Promise<void>;
} {
  const host: SatelliteHost = {
    scene,
    canvas,
    camera,
    controls,
    overlays,
    toolbar,
    onToggle,
    isOn,
    restore,
    instant,
    setFrame,
  };
  const made = createSatelliteOverlays((id, detail) =>
    setLiveDetail(id, detail)
  );
  const byGroup = new Map<string, SatelliteGroupOverlay>();
  for (const overlay of made) {
    byGroup.set(overlay.groupId, overlay);
    host.scene.add(overlay.object);
    host.overlays.push(overlay);
  }
  if (host.toolbar) {
    mountLiveMenu(host.toolbar, made, host.onToggle, host.isOn);
  }
  for (const overlay of made) {
    if (!host.isOn(overlay)) continue;
    setLivePressed(overlay.id, true);
    host.restore(overlay);
    void overlay.ensureLoaded().catch(() => setLivePressed(overlay.id, false));
  }

  let followed: number | undefined;
  const tracker = new Tracker({
    canvas: host.canvas,
    camera: host.camera,
    controls: host.controls,
    instant: host.instant,
    overlays: () => host.overlays,
    scene: host.scene,
    onFollowChange: (noradId) => {
      followed = noradId;
      writeTrackHash(noradId);
    },
    onPaths: (noradId) => {
      void showPaths(byGroup, tracker, noradId);
    },
  });

  host.setFrame(() => {
    tracker.update();
    writeTrackHash(followed);
  });

  async function followNorad(noradId: number): Promise<void> {
    const found = await findNorad(byGroup, host, noradId);
    if (!found) return;
    const selection = found.overlay.selectionAt(found.index);
    if (!selection) return;
    tracker.followSelection(selection, noradId);
    void showPaths(byGroup, tracker, noradId);
    void showPass(found.overlay.groupId, found.index, tracker);
  }

  const linked = trackFromHash(location.hash);
  if (linked) void followNorad(linked);

  return { followNorad };
}

async function findNorad(
  byGroup: Map<string, SatelliteGroupOverlay>,
  host: SatelliteHost,
  noradId: number
): Promise<{ overlay: SatelliteGroupOverlay; index: number } | null> {
  for (const groupId of GROUP_ORDER) {
    const overlay = byGroup.get(groupId);
    if (!overlay) continue;
    const wasOn = host.isOn(overlay);
    setLivePressed(overlay.id, true);
    if (!wasOn) host.onToggle(overlay, true);
    try {
      await overlay.ensureLoaded();
    } catch {
      setLivePressed(overlay.id, false);
      continue;
    }
    const index = overlay.indexOfNorad(noradId);
    if (index >= 0) return { overlay, index };
    if (!wasOn) {
      setLivePressed(overlay.id, false);
      host.onToggle(overlay, false);
    }
  }
  return null;
}

async function showPaths(
  byGroup: Map<string, SatelliteGroupOverlay>,
  tracker: Tracker,
  noradId: number
): Promise<void> {
  for (const overlay of byGroup.values()) {
    const index = overlay.indexOfNorad(noradId);
    if (index < 0) continue;
    const paths = await satelliteCatalog().paths(
      overlay.groupId,
      index,
      Date.now()
    );
    tracker.setPaths(paths?.orbit ?? null, paths?.ground ?? null);
    return;
  }
}

async function showPass(
  groupId: string,
  index: number,
  tracker: Tracker
): Promise<void> {
  const place = await grantedLocation();
  if (!place) return;
  const pass = await satelliteCatalog().nextPass(
    groupId,
    index,
    Date.now(),
    place.lat,
    place.lon
  );
  if (!pass) {
    tracker.setNote("No pass above 10 degrees in the next day.");
    return;
  }
  const clock = new Date(pass.startMs).toISOString().slice(11, 16);
  tracker.setNote(
    `Next pass ${clock} UTC, ${Math.round(pass.durationMin)} min, ${Math.round(pass.peakElevationDeg)} deg up.`
  );
}

function grantedLocation(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  const permissions = navigator.permissions;
  if (!permissions?.query) return Promise.resolve(null);
  return permissions
    .query({ name: "geolocation" })
    .then(
      (status) =>
        new Promise<{ lat: number; lon: number } | null>((resolve) => {
          if (status.state !== "granted") {
            resolve(null);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
              }),
            () => resolve(null),
            { maximumAge: 60_000, timeout: 4_000 }
          );
        })
    )
    .catch(() => null);
}
