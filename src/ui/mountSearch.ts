import type { GeoResult } from "../lib/geocoding";
import type { SearchHit } from "../lib/search/provider";
import { searchProviders } from "../lib/search/providers";
import { LAYERS, type LayerId } from "../lib/timeline";
import { SearchBox } from "./SearchBox";

/**
 * What the app does with a chosen hit. A new hit shape is a new branch here,
 * not a change to {@link SearchBox}.
 */
export interface SearchHandlers {
  onPlace: (result: GeoResult) => void;
  onLayer: (layerId: LayerId) => void;
  onMonth: (year: number, month: number) => void;
  onStory: (storyId: string) => void;
}

/** Mount the search field and return a way to focus it from a shortcut. */
export function mountSearch(
  container: HTMLElement,
  announce: (message: string) => void,
  handlers: SearchHandlers
): { focus(): void } {
  const box = new SearchBox(
    container,
    searchProviders(),
    (hit) => applyHit(hit, handlers),
    announce
  );
  return { focus: () => box.focus() };
}

function applyHit(hit: SearchHit, handlers: SearchHandlers): void {
  const data = hit.data;
  switch (data.type) {
    case "place":
      handlers.onPlace({
        name: data.name,
        displayName: data.subtitle,
        lat: data.lat,
        lon: data.lon,
        type: "",
        category: "",
        boundingBox: data.boundingBox,
        geometry: data.geometry,
      });
      return;
    case "layer":
      if (isLayerId(data.layerId)) handlers.onLayer(data.layerId);
      return;
    case "month":
      handlers.onMonth(data.year, data.month);
      return;
    case "story":
      handlers.onStory(data.storyId);
      return;
  }
}

function isLayerId(id: string): id is LayerId {
  return Object.prototype.hasOwnProperty.call(LAYERS, id);
}
