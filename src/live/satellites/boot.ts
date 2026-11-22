import type { Object3D } from "three";
import type { MapOverlay } from "../../overlays/types";
import { mountLiveMenu, setLiveDetail, setLivePressed } from "./menu";
import { createSatelliteOverlays } from "./overlay";

export interface SatelliteHost {
  scene: { add(object: Object3D): void };
  overlays: MapOverlay[];
  toolbar: HTMLElement | null;
  onToggle: (overlay: MapOverlay, on: boolean) => void;
  isOn: (overlay: MapOverlay) => boolean;
  restore: (overlay: MapOverlay) => void;
}

/**
 * Register the six satellite classes in the Live menu. The worker and
 * satellite.js stay unloaded until a class is turned on. This module itself
 * loads only when the map menu is first touched, or a track= link is opened.
 */
export function bootLiveSatellites(host: SatelliteHost): void {
  const overlays = createSatelliteOverlays((id, detail) =>
    setLiveDetail(id, detail)
  );
  for (const overlay of overlays) {
    host.scene.add(overlay.object);
    host.overlays.push(overlay);
  }
  if (host.toolbar) {
    mountLiveMenu(host.toolbar, overlays, host.onToggle, host.isOn);
  }
  for (const overlay of overlays) {
    if (!host.isOn(overlay)) continue;
    setLivePressed(overlay.id, true);
    host.restore(overlay);
    void overlay.ensureLoaded().catch(() => setLivePressed(overlay.id, false));
  }
}
