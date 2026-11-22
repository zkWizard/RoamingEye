import type { Object3D } from "three";
import type { MapOverlay } from "../../overlays/types";
import type { Toolbar } from "../../ui/Toolbar";
import { createSatelliteOverlays } from "./overlay";

export interface SatelliteHost {
  scene: { add(object: Object3D): void };
  overlays: MapOverlay[];
  toolbar: Toolbar | null;
  onToggle: (overlay: MapOverlay, on: boolean) => void;
  isOn: (overlay: MapOverlay) => boolean;
  restore: (overlay: MapOverlay) => void;
}

/**
 * Register the six satellite classes in the Live menu. The worker and
 * satellite.js stay unloaded until a class is turned on.
 */
export function bootLiveSatellites(host: SatelliteHost): void {
  const overlays = createSatelliteOverlays((id, detail) => {
    host.toolbar?.setDetail(id, detail);
  });
  for (const overlay of overlays) {
    host.scene.add(overlay.object);
    host.overlays.push(overlay);
    host.toolbar?.addOverlay(overlay, host.onToggle, host.isOn);
    host.restore(overlay);
  }
}
