import type { GeoGeometry } from "../geojson";

/**
 * One row a provider can offer for a query.
 *
 * `data` is opaque to the search box. The app's select handler reads it.
 * A new provider (events, a plain-language query) adds a `data` shape and a
 * branch in the handler — it does not edit the box. See
 * `docs/search-providers.md`.
 */
export interface SearchHit {
  /** Stable within a provider. The box does not show it. */
  id: string;
  /** Group heading. Providers that share a group are merged. */
  group: string;
  title: string;
  subtitle?: string;
  /** Higher sorts first within a group. */
  score: number;
  data: SearchAction;
}

/**
 * What choosing a hit does. Extend this union for a new kind of result.
 * The search box never switches on it.
 */
export type SearchAction =
  | {
      type: "place";
      name: string;
      subtitle: string;
      lat: number;
      lon: number;
      /** [south, north, west, east]. west > east crosses the date line. */
      boundingBox: [number, number, number, number] | null;
      geometry: GeoGeometry | null;
    }
  | { type: "layer"; layerId: string }
  | { type: "month"; year: number; month: number }
  | { type: "story"; storyId: string }
  | {
      type: "hotspot";
      name: string;
      layerId: string;
      lat: number;
      lon: number;
    };

/**
 * A source of search rows.
 *
 * `instant` providers run on each query and must not touch the network.
 * `explicit` providers are not queried while typing: the box shows one row
 * (`label`) and calls `search` only when that row is chosen, or when Enter
 * is pressed and no instant hit exists. That is how Nominatim stays off the
 * autocomplete path.
 */
export interface SearchProvider {
  readonly id: string;
  readonly when: "instant" | "explicit";
  /** Row label for an explicit provider. Ignored for instant providers. */
  label?(query: string): string;
  search(query: string): readonly SearchHit[] | Promise<readonly SearchHit[]>;
  /**
   * Rows for an empty, focused field. Omitted providers add nothing.
   * Same rule as instant search: no network.
   */
  suggest?(): readonly SearchHit[] | Promise<readonly SearchHit[]>;
}
