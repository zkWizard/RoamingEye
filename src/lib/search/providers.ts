import { geocode } from "../geocoding";
import { LAYER_ORDER, LAYERS, type LayerId } from "../timeline";
import { STORIES } from "../stories";
import { parseCoordinateQuery } from "./coordinates";
import { parseDateQuery } from "./dates";
import { loadPlaceCatalog, matchPlaces } from "./catalog";
import { pointBox } from "./outline";
import { matchScore } from "./rank";
import type { SearchHit, SearchProvider } from "./provider";

const PLACE_GROUPS = [
  ["cities", "Cities"],
  ["countries", "Countries"],
  ["states", "States"],
  ["volcanoes", "Volcanoes"],
] as const;

function placeProviders(): SearchProvider[] {
  return PLACE_GROUPS.map(([key, group]) => ({
    id: key,
    when: "instant" as const,
    search(query: string) {
      return loadPlaceCatalog().then((catalog) =>
        matchPlaces(catalog[key], query, group)
      );
    },
  }));
}

function storyProvider(): SearchProvider {
  return {
    id: "stories",
    when: "instant",
    search(query) {
      const hits: SearchHit[] = [];
      for (const story of STORIES) {
        const title = matchScore(query, story.title);
        const blurb = matchScore(query, story.blurb);
        const score = Math.max(title ?? 0, blurb === null ? 0 : blurb - 80);
        if (score <= 0) continue;
        hits.push({
          id: story.id,
          group: "Stories",
          title: story.title,
          subtitle: story.blurb,
          score,
          data: { type: "story", storyId: story.id },
        });
      }
      return hits.sort((a, b) => b.score - a.score).slice(0, 4);
    },
  };
}

function layerProvider(): SearchProvider {
  return {
    id: "layers",
    when: "instant",
    search(query) {
      const hits: SearchHit[] = [];
      for (const id of LAYER_ORDER) {
        const layer = LAYERS[id];
        const label = matchScore(query, layer.label);
        const byId = matchScore(query, id);
        const score = Math.max(label ?? 0, byId === null ? 0 : byId + 20);
        if (score <= 0) continue;
        hits.push({
          id,
          group: "Layers",
          title: layer.label,
          subtitle: layer.category,
          score,
          data: { type: "layer", layerId: id satisfies LayerId },
        });
      }
      return hits.sort((a, b) => b.score - a.score).slice(0, 4);
    },
  };
}

function dateProvider(): SearchProvider {
  return {
    id: "dates",
    when: "instant",
    search(query) {
      const parsed = parseDateQuery(query);
      if (!parsed) return [];
      return [
        {
          id: `date:${parsed.year}-${parsed.month}`,
          group: "Dates",
          title: parsed.label,
          subtitle: "Show this month",
          score: 900,
          data: { type: "month", year: parsed.year, month: parsed.month },
        },
      ];
    },
  };
}

function coordinateProvider(): SearchProvider {
  return {
    id: "coordinates",
    when: "instant",
    search(query) {
      const parsed = parseCoordinateQuery(query);
      if (!parsed) return [];
      return [
        {
          id: `coord:${parsed.lat},${parsed.lon}`,
          group: "Coordinates",
          title: `${parsed.lat.toFixed(2)}°, ${parsed.lon.toFixed(2)}°`,
          subtitle: "Go to these coordinates",
          score: 950,
          data: {
            type: "place",
            name: `${parsed.lat.toFixed(2)}°, ${parsed.lon.toFixed(2)}°`,
            subtitle: "Coordinates",
            lat: parsed.lat,
            lon: parsed.lon,
            boundingBox: pointBox(parsed.lat, parsed.lon),
            geometry: null,
          },
        },
      ];
    },
  };
}

let nominatimAbort: AbortController | undefined;

function nominatimProvider(): SearchProvider {
  return {
    id: "nominatim",
    when: "explicit",
    label: () => "Search all places",
    async search(query) {
      nominatimAbort?.abort();
      const controller = new AbortController();
      nominatimAbort = controller;
      const results = await geocode(query, controller.signal);
      return results.map((result, index) => ({
        id: `nominatim:${index}:${result.lat},${result.lon}`,
        group: "All places",
        title: result.name,
        subtitle: result.displayName,
        score: 100 - index,
        data: {
          type: "place" as const,
          name: result.name,
          subtitle: result.displayName,
          lat: result.lat,
          lon: result.lon,
          boundingBox: result.boundingBox,
          geometry: result.geometry,
        },
      }));
    },
  };
}

/**
 * Instant local providers first, then the explicit Nominatim provider.
 *
 * The place lists start loading here, so the first keystroke is not also the
 * first fetch. Another agent appends a provider to this list — or passes its
 * own list into the search box — without editing the box. See
 * `docs/search-providers.md`.
 */
export function searchProviders(): SearchProvider[] {
  void loadPlaceCatalog();
  return [
    coordinateProvider(),
    dateProvider(),
    ...placeProviders(),
    storyProvider(),
    layerProvider(),
    nominatimProvider(),
  ];
}
