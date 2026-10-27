import { describePlaceCompare } from "./placeCompare";
import type { SearchHit, SearchProvider } from "./search/provider";
import type { LayerId } from "./timeline";
import { describeThenNow, parsePlaceCompare, parseThenNow } from "./thenNow";

/**
 * Plain-language comparisons as an instant provider. Parsing is local, so
 * the row appears while the query is still being typed and a keystroke never
 * spends a Nominatim request. Geocoding happens when the row is picked.
 */
export function comparisonSearchProvider(
  activeLayer?: () => LayerId
): SearchProvider {
  return {
    id: "comparisons",
    when: "instant",
    search(query) {
      const places = parsePlaceCompare(query, activeLayer?.());
      if (places) {
        const described = describePlaceCompare(places);
        return [
          {
            id: `places:${query.trim()}`,
            group: "Compare",
            title: described.title,
            subtitle: described.subtitle,
            score: 1000,
            data: {
              type: "place-compare",
              placeA: places.placeA,
              placeB: places.placeB,
              layerId: places.layer,
              year: places.requested.year,
              month: places.requested.month,
              defaultMonth: places.defaultMonth,
            },
          },
        ];
      }
      const parsed = parseThenNow(query);
      if (!parsed) return [];
      const described = describeThenNow(parsed);
      return [
        {
          id: `then:${query.trim()}`,
          group: "Compare",
          title: described.label,
          subtitle: described.detail,
          score: 1000,
          data: {
            type: "then-now",
            place: parsed.place,
            layerId: parsed.layer,
            earlierYear: parsed.earlier.year,
            earlierMonth: parsed.earlier.month,
            laterYear: parsed.later.year,
            laterMonth: parsed.later.month,
          },
        } satisfies SearchHit,
      ];
    },
  };
}
