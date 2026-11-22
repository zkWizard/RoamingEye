import { Group, type PerspectiveCamera } from "three";
import { ICONS } from "../ui/icons";
import {
  once,
  type HoverLineSource,
  type HoverPointSource,
  type MapOverlay,
} from "./types";

type Hoverable = {
  hoverSource?: HoverPointSource | HoverLineSource;
};

/**
 * A toolbar overlay whose class loads the first time it is turned on.
 * The shell is what the scene and the menu hold, so the entry chunk does
 * not import the overlay module.
 */
export function lazyMapOverlay(
  meta: Pick<MapOverlay, "id" | "label" | "icon"> &
    Partial<Pick<MapOverlay, "detail" | "group">>,
  load: () => Promise<MapOverlay>
): MapOverlay & Hoverable {
  const object = new Group();
  object.visible = false;
  let impl: (MapOverlay & Hoverable) | undefined;

  const ensureLoaded = once(async () => {
    const next = (await load()) as MapOverlay & Hoverable;
    next.object.visible = true;
    object.add(next.object);
    impl = next;
  });

  return {
    ...meta,
    object,
    ensureLoaded,
    update(camera: PerspectiveCamera, viewportHeightPx: number): void {
      impl?.update?.(camera, viewportHeightPx);
    },
    get hoverSource() {
      return impl?.hoverSource;
    },
  };
}

/** Country borders. Off until the visitor turns the layer on. */
export function lazyBorders(): MapOverlay {
  return lazyMapOverlay(
    {
      id: "borders",
      label: "Borders",
      detail: "Countries, states, US counties up close",
      icon: ICONS.borders,
    },
    () => import("./BordersOverlay").then((mod) => new mod.BordersOverlay())
  );
}

/** Major cities. Off until the visitor turns the layer on. */
export function lazyCities(): MapOverlay & { hoverSource?: HoverPointSource } {
  return lazyMapOverlay(
    { id: "cities", label: "Cities", icon: ICONS.cities },
    () => import("./CitiesOverlay").then((mod) => new mod.CitiesOverlay())
  ) as MapOverlay & { hoverSource?: HoverPointSource };
}

/** Plate boundaries. Off until the visitor turns the layer on. */
export function lazyPlateBoundaries(): MapOverlay & {
  hoverSource?: HoverLineSource;
} {
  return lazyMapOverlay(
    { id: "plates", label: "Plates", icon: ICONS.plates },
    () =>
      import("./PlateBoundariesOverlay").then(
        (mod) => new mod.PlateBoundariesOverlay()
      )
  ) as MapOverlay & { hoverSource?: HoverLineSource };
}

/** Holocene volcanoes. Off until the visitor turns the layer on. */
export function lazyVolcanoes(): MapOverlay & {
  hoverSource?: HoverPointSource;
} {
  return lazyMapOverlay(
    { id: "volcanoes", label: "Volcanoes", icon: ICONS.volcanoes },
    () => import("./VolcanoesOverlay").then((mod) => new mod.VolcanoesOverlay())
  ) as MapOverlay & { hoverSource?: HoverPointSource };
}

/** Time-zone boundaries. Off until the visitor turns the layer on. */
export function lazyTimeZones(): MapOverlay & Hoverable {
  return lazyMapOverlay(
    {
      id: "timezones",
      label: "Time zones",
      detail: "UTC offset of each region",
      icon: ICONS.timezones,
    },
    () => import("./TimeZonesOverlay").then((mod) => new mod.TimeZonesOverlay())
  );
}
