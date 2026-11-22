import type { Group, PerspectiveCamera, WebGLRenderer } from "three";
import type { MapOverlay } from "../overlays/types";
import { ICONS } from "../ui/icons";

/**
 * Toolbar entry for live weather. The wind simulation, its shaders, and the
 * field decoder load only after the visitor turns Weather now on.
 */
export function createLiveWeatherOverlay(
  object: Group,
  renderer: WebGLRenderer
): MapOverlay {
  let impl: MapOverlay | null = null;
  let loading: Promise<void> | null = null;
  return {
    id: "weather",
    label: "Weather now",
    detail: "Animated wind, coloured by speed",
    group: "live",
    icon: ICONS.wind,
    object,
    ensureLoaded() {
      loading ??= import("./wind/WindOverlay").then(({ mountWindOverlay }) =>
        mountWindOverlay(object, renderer).then((overlay) => {
          impl = overlay;
        })
      );
      return loading;
    },
    update(camera: PerspectiveCamera, viewportHeightPx: number) {
      impl?.update?.(camera, viewportHeightPx);
    },
  };
}
