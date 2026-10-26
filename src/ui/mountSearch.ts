import type { GeoResult } from "../lib/geocoding";
import type { GeoGeometry } from "../lib/geojson";
import type { PlaceComparePick, ThenNowPick } from "../lib/openComparisons";
import { recentSearchProvider } from "../lib/search/recent";
import type { SearchHit } from "../lib/search/provider";
import { searchProviders } from "../lib/search/providers";
import type { RecentSearch } from "../lib/sessionState";
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
  onHotspot: (hotspot: {
    name: string;
    layerId: string;
    lat: number;
    lon: number;
  }) => void;
  onRemember: (hit: SearchHit) => void;
  recent: () => readonly RecentSearch[] | undefined;
  /**
   * One change line for a highlighted area. The app loads this through the
   * same held place-chunk import as the place panel, so a failed fetch is
   * not requested again. Omitted, the row keeps its ordinary subtitle.
   */
  previewChange?: (
    geometry: GeoGeometry,
    lat: number,
    lon: number,
    signal: AbortSignal
  ) => Promise<{ text: string; values: readonly number[] } | null>;
  onEvent: (eventId: string) => void;
  onThenNow: (pick: ThenNowPick) => void;
  onPlaceCompare: (pick: PlaceComparePick) => void;
}

/** Mount the search field and return a way to focus it from a shortcut. */
export function mountSearch(
  container: HTMLElement,
  announce: (message: string) => void,
  handlers: SearchHandlers
): { focus(): void } {
  let previewToken = 0;
  let previewAbort: AbortController | undefined;
  const box = new SearchBox(
    container,
    [recentSearchProvider(handlers.recent), ...searchProviders()],
    (hit) => {
      handlers.onRemember(hit);
      applyHit(hit, handlers);
    },
    announce,
    (hit) => {
      previewAbort?.abort();
      previewAbort = undefined;
      const token = ++previewToken;
      if (!hit || hit.data.type !== "place") return;
      const { geometry, lat, lon } = hit.data;
      // Points have no area to sample. Leave the subtitle; do not invent one.
      if (
        !geometry ||
        (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
      ) {
        return;
      }
      const abort = new AbortController();
      previewAbort = abort;
      const hitId = hit.id;
      // The sampler stays in the place chunk. The app owns that import so a
      // failed fetch is reused instead of requested again from here.
      void Promise.resolve(
        handlers.previewChange?.(geometry, lat, lon, abort.signal) ?? null
      )
        .then((preview) => {
          if (!preview || token !== previewToken || abort.signal.aborted)
            return;
          box.showChangePreview(hitId, preview);
        })
        .catch((error: unknown) => {
          if (token !== previewToken) return;
          console.warn("RoamingEye: change preview failed", error);
        });
    }
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
    case "hotspot":
      handlers.onHotspot(data);
      return;
    case "event":
      handlers.onEvent(data.eventId);
      return;
    case "then-now":
      handlers.onThenNow({
        place: data.place,
        layerId: data.layerId,
        earlierYear: data.earlierYear,
        earlierMonth: data.earlierMonth,
        laterYear: data.laterYear,
        laterMonth: data.laterMonth,
      });
      return;
    case "place-compare":
      handlers.onPlaceCompare({
        placeA: data.placeA,
        placeB: data.placeB,
        layerId: data.layerId,
        year: data.year,
        month: data.month,
        defaultMonth: data.defaultMonth,
      });
      return;
  }
}

function isLayerId(id: string): id is LayerId {
  return Object.prototype.hasOwnProperty.call(LAYERS, id);
}
