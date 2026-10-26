import {
  cachedEvent,
  eventDetail,
  loadEventIndex,
  searchEvents,
  type EarthEvent,
} from "./events";
import type { SearchHit, SearchProvider } from "./search/provider";

/**
 * Named events as an instant provider. The index is already in memory after
 * the first query, and the box groups the rows under "Events".
 */
export function eventSearchProvider(): SearchProvider {
  return {
    id: "events",
    when: "instant",
    async search(query) {
      const events = await loadEventIndex();
      return searchEvents(events, query).map(toHit);
    },
  };
}

function toHit(event: EarthEvent, index: number): SearchHit {
  return {
    id: event.id,
    group: "Events",
    title: event.name,
    subtitle: eventDetail(event),
    // searchEvents already ordered these. A flat score would let the box
    // reshuffle a tie.
    score: 600 - index,
    data: { type: "event", eventId: event.id },
  };
}

/** An event from the index the provider just searched. */
export function eventFromId(id: string): EarthEvent | undefined {
  return cachedEvent(id);
}
