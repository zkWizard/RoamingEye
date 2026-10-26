# Search providers

The search field is a list of providers. It groups their rows, moves a highlight, and tells the app which row was chosen. It does not know what a row means.

Adding a source of results — an events index, a plain-language query — means adding a provider and a branch in the select handler (`src/ui/mountSearch.ts`). `SearchBox` stays as it is.

## The interface

```ts
interface SearchProvider {
  id: string;
  /** "instant" runs on each query and must not touch the network.
      "explicit" is one row while typing; search() runs only when that
      row is chosen, or when Enter is pressed and nothing instant matched. */
  when: "instant" | "explicit";
  /** Label of an explicit provider's row. Ignored for instant providers. */
  label?(query: string): string;
  search(query: string): readonly SearchHit[] | Promise<readonly SearchHit[]>;
}

interface SearchHit {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  score: number;
  data: SearchAction;
}
```

`data` is opaque to the box. `SearchAction` today is a place, a layer, a month, or a story (`src/lib/search/provider.ts`). Extend that union for a new kind of result, and handle it in `applyHit`.

Instant providers are queried together on each change of the field (two characters or more). Their hits are grouped by `group`, in the order the providers returned them, and sorted by `score` inside a group. Higher scores sort first. An explicit provider is not queried while typing: the box shows `label(query)` as a row under the instant hits. Nominatim is that row ("Search all places"), which is how autocomplete stays off the public geocoder.

Enter takes the highlighted row. With nothing highlighted, it takes the first instant hit. It runs the explicit provider only when the query has no instant hit, or when that provider's own row is highlighted.

## Registering a provider

`searchProviders()` in `src/lib/search/providers.ts` is the list the app mounts. Append to it, or pass a different list into `SearchBox` if a test or a second field needs one. Either way the box is unchanged.

The built-in list, in order: coordinates, dates, cities, countries, states, volcanoes, stories, layers, then Nominatim (explicit).

## Example: an events provider

An events index that already lives in memory is an instant provider. The box will group it under "Events" without any other change, once `applyHit` knows what to do with `data`.

```ts
import type { SearchHit, SearchProvider } from "./provider";

export function eventProvider(
  events: { id: string; title: string }[]
): SearchProvider {
  return {
    id: "events",
    when: "instant",
    search(query): SearchHit[] {
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      return events
        .filter((event) => event.title.toLowerCase().includes(q))
        .map((event) => ({
          id: event.id,
          group: "Events",
          title: event.title,
          score: 500,
          data: { type: "event", eventId: event.id },
        }));
    },
  };
}
```

`SearchAction` gains `| { type: "event"; eventId: string }`. `applyHit` gains a `case "event"` that flies to that event. `SearchBox` is not edited.

## Example: a plain-language provider

A provider that has to think about the whole sentence, or call a service, should be explicit so it does not run on each keystroke. While the user types, the box shows one row. Choosing it, or pressing Enter when no instant hit matched, calls `search`.

```ts
export function plainLanguageProvider(): SearchProvider {
  return {
    id: "plain-language",
    when: "explicit",
    label: () => "Ask about this period",
    async search(query) {
      const parsed = interpret(query); // the other agent's parser
      if (!parsed) return [];
      return [
        {
          id: `nl:${parsed.place}`,
          group: "Question",
          title: parsed.place,
          subtitle: parsed.summary,
          score: 1,
          data: parsed.action,
        },
      ];
    },
  };
}
```

If the sentence also contains a place the instant index knows ("Sahel in August 2023"), Enter takes that instant hit and does not call this provider. The row is still there: highlighting "Ask about this period" and pressing Enter runs it. A parser that must win over the instant hits should be `when: "instant"` and return a higher score instead. Instant providers still must not touch the network.

## What the box will not do

- It does not import Nominatim, the place files, or the stories. Those are providers.
- It does not switch layers, move the timeline, or fly the camera. `mountSearch` does, from `data`.
- It does not rank across groups. Score only orders rows that share a group.
