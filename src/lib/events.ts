import { fetchJson } from "./net";
import { LAYERS, type LayerId, type YearMonth } from "./timeline";

/**
 * Named events a person can search for: a hurricane, a fire season, an
 * eruption, a large earthquake. The index is built by
 * scripts/build-events-index.mjs and served as a static file, so picking one
 * needs no key and no backend. This module is the pure half — parsing,
 * category→layer, and matching — plus the one fetch that loads the file.
 */

export type EventCategory =
  | "wildfire"
  | "storm"
  | "drought"
  | "snow"
  | "volcano"
  | "earthquake"
  | "dust"
  | "monsoon";

/**
 * The layer that shows the event. Wildfire smoke and volcanic ash are
 * aerosols, a storm is the precipitation field, drought is the vegetation
 * response, snow is snow cover. An earthquake has no monthly field; shaded
 * relief is the layer that still shows the place.
 */
export const EVENT_LAYER: Record<EventCategory, LayerId> = {
  wildfire: "aerosol",
  storm: "precip",
  drought: "ndvi",
  snow: "snow",
  volcano: "aerosol",
  earthquake: "terrain",
  dust: "aerosol",
  monsoon: "ndvi",
};

const CATEGORY_LABEL: Record<EventCategory, string> = {
  wildfire: "Wildfire",
  storm: "Storm",
  drought: "Drought",
  snow: "Snow",
  volcano: "Volcano",
  earthquake: "Earthquake",
  dust: "Dust",
  monsoon: "Monsoon",
};

export interface EarthEvent {
  id: string;
  name: string;
  aliases: readonly string[];
  category: EventCategory;
  lat: number;
  lon: number;
  /** [south, north, west, east]. Absent for a single point. */
  bbox?: readonly [number, number, number, number];
  from: YearMonth;
  to: YearMonth;
  /** The month the view opens on. */
  month: YearMonth;
  layer: LayerId;
  /** When set, picking the event plays this story instead of seeking once. */
  storyId?: string;
}

const CATEGORIES = new Set<string>(Object.keys(EVENT_LAYER));

function isYearMonth(value: unknown): value is YearMonth {
  if (!value || typeof value !== "object") return false;
  const month = value as YearMonth;
  return (
    Number.isInteger(month.year) &&
    month.year >= 1900 &&
    month.year <= 2200 &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function isCoord(value: unknown, limit: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
  );
}

export function layerForEventCategory(category: string): LayerId | undefined {
  if (!CATEGORIES.has(category)) return undefined;
  return EVENT_LAYER[category as EventCategory];
}

function isEarthEvent(value: unknown): value is EarthEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as EarthEvent;
  if (typeof event.id !== "string" || event.id.length === 0) return false;
  if (typeof event.name !== "string" || event.name.length === 0) return false;
  if (
    !Array.isArray(event.aliases) ||
    event.aliases.some((a) => typeof a !== "string")
  ) {
    return false;
  }
  if (typeof event.category !== "string") return false;
  const layer = layerForEventCategory(event.category);
  if (!layer || event.layer !== layer || !Object.hasOwn(LAYERS, event.layer)) {
    return false;
  }
  if (!isCoord(event.lat, 90) || !isCoord(event.lon, 180)) return false;
  if (
    !isYearMonth(event.from) ||
    !isYearMonth(event.to) ||
    !isYearMonth(event.month)
  ) {
    return false;
  }
  if (event.bbox !== undefined) {
    if (
      !Array.isArray(event.bbox) ||
      event.bbox.length !== 4 ||
      !event.bbox.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return false;
    }
  }
  if (event.storyId !== undefined && typeof event.storyId !== "string")
    return false;
  return true;
}

/** Drop anything the file should not have been able to produce. */
export function parseEventIndex(file: unknown): EarthEvent[] {
  if (!file || typeof file !== "object") return [];
  const events = (file as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];
  return events.filter(isEarthEvent);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatMonth(ym: YearMonth): string {
  return `${MONTHS[ym.month - 1]} ${ym.year}`;
}

/** The secondary line of a search row. */
export function eventDetail(event: EarthEvent): string {
  const label = CATEGORY_LABEL[event.category];
  const when =
    event.from.year === event.to.year && event.from.month === event.to.month
      ? formatMonth(event.month)
      : `${formatMonth(event.from)} – ${formatMonth(event.to)}`;
  return `${label} · ${when}`;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A short token has to be its own word, so "ian" does not match "australian". */
function tokenIn(hay: string, token: string): boolean {
  if (token.length > 3) return hay.includes(token);
  return new RegExp(`(?:^| )${token}(?: |$)`).test(hay);
}

/**
 * Events whose name or aliases contain every word of `query`. Stronger
 * matches (the whole query is the name) come first. At most `limit` rows.
 */
export function searchEvents(
  events: readonly EarthEvent[],
  query: string,
  limit = 5
): EarthEvent[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const tokens = q.split(" ").filter((token) => token.length >= 2);
  if (tokens.length === 0) return [];

  const scored: { event: EarthEvent; score: number }[] = [];
  for (const event of events) {
    const names = [event.name, ...event.aliases].map(normalize);
    const hay = names.join(" | ");
    if (!tokens.every((token) => tokenIn(hay, token))) continue;
    let score = 0;
    if (names.some((name) => name === q)) score += 100;
    else if (names.some((name) => name.startsWith(q))) score += 40;
    score += Math.max(0, 12 - names[0].length / 8);
    scored.push({ event, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.event.month.year - a.event.month.year ||
      b.event.month.month - a.event.month.month ||
      a.event.name.localeCompare(b.event.name)
  );
  return scored.slice(0, limit).map((row) => row.event);
}

let cached: readonly EarthEvent[] | undefined;
let inflight: Promise<readonly EarthEvent[]> | undefined;

/** The bundled index. One fetch, then memory. A bad file yields no events. */
export function loadEventIndex(
  url = `${import.meta.env.BASE_URL}data/events.json`
): Promise<readonly EarthEvent[]> {
  if (cached) return Promise.resolve(cached);
  inflight ??= fetchJson<unknown>(url)
    .then((file) => {
      cached = parseEventIndex(file);
      return cached;
    })
    .catch((err) => {
      inflight = undefined;
      throw err;
    });
  return inflight;
}

/** An event from the index last loaded by {@link loadEventIndex}. */
export function cachedEvent(id: string): EarthEvent | undefined {
  return cached?.find((event) => event.id === id);
}

/** Test hook: the loader memoizes, and a test wants a known file. */
export function resetEventIndexCache(): void {
  cached = undefined;
  inflight = undefined;
}
