import { resolvePinnedMonth } from "./compare";
import { LAYERS, type LayerId, type YearMonth } from "./timeline";

/**
 * Plain-language comparisons. Pattern matching only — no model is consulted.
 *
 * Two shapes:
 *
 * - One place and one or two years ("Amazon 2005 vs 2020", "California fires
 *   2020"). The earlier month is pinned on the left of the month swipe and
 *   the later month stays live. A query with no phenomenon word opens
 *   vegetation, August of each year.
 * - Two places ("Houston vs Austin rainfall 2026", "compare Houston and
 *   Austin", "Houston versus Austin"). Both are shown on one layer and one
 *   month. No date means the latest month that layer can actually show.
 *   With no phenomenon word, the layer already on the globe is used when
 *   that layer can be compared.
 *
 * A year between the place names is a month comparison, not a second place:
 * "Amazon 2005 vs 2020" stays a vegetation swipe.
 */

/** A geocoder hit, reduced to what the comparison uses to pick among them. */
export interface CompareHit {
  category: string;
  boundingBox: readonly [number, number, number, number] | null;
}

const LOCAL_CATEGORY = new Set([
  "building",
  "shop",
  "amenity",
  "office",
  "tourism",
  "craft",
  "highway",
  "man_made",
]);

function hitSpan(hit: CompareHit): number {
  if (!hit.boundingBox) return 0;
  const [south, north, west, east] = hit.boundingBox;
  return Math.max(Math.abs(north - south), Math.abs(east - west));
}

/**
 * Prefer a region over a business that shares the name. "Amazon" geocodes to
 * fulfillment centers first; the river is a natural feature. A state-sized
 * hit (California) is already the place, and a second request is skipped.
 */
/** True when the top hit is a business, so the natural-feature search is worth a request. */
export function needsNaturalFeature(hit: CompareHit | undefined): boolean {
  return !!hit && LOCAL_CATEGORY.has(hit.category);
}

export function chooseCompareHit<T extends CompareHit>(
  primary: readonly T[],
  natural: readonly T[]
): T | undefined {
  const first = primary[0];
  if (first && !LOCAL_CATEGORY.has(first.category) && hitSpan(first) >= 0.5) {
    return first;
  }
  return natural[0] ?? first;
}

export interface ThenNowQuery {
  /** What is left for the geocoder once dates and the layer word are gone. */
  place: string;
  layer: LayerId;
  /** Pinned on the left of the comparison. */
  earlier: YearMonth;
  /**
   * The right-hand month. `year` is null when the query named one year: the
   * app fills in the latest published year of `layer` that has `month`.
   */
  later: { year: number | null; month: number };
}

const MONTH_BY_NAME: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_LABEL = [
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

/** Default when the query names a place and years but no phenomenon. */
const DEFAULT_LAYER: LayerId = "ndvi";
const DEFAULT_MONTH = 8;

interface Keyword {
  /** Source only; a fresh RegExp is built per call so /g state cannot leak. */
  source: string;
  layer: LayerId;
  /** Season the comparison uses when the query names no month. */
  month: number;
}

const KEYWORDS: readonly Keyword[] = [
  {
    source: String.raw`\b(?:wildfires?|fires?|smoke)\b`,
    layer: "aerosol",
    month: 9,
  },
  {
    source: String.raw`\b(?:hurricanes?|typhoons?|cyclones?|storms?|precipitation|precip|rainfall|rains?|floods?|flooding)\b`,
    layer: "precip",
    month: 9,
  },
  {
    source: String.raw`\bsnow(?:fall|snowpack|pack)?\b`,
    layer: "snow",
    month: 1,
  },
  { source: String.raw`\bdroughts?\b`, layer: "ndvi", month: 8 },
  { source: String.raw`\b(?:soil(?:\s+moisture)?)\b`, layer: "soil", month: 8 },
  { source: String.raw`\b(?:dust|haze)\b`, layer: "aerosol", month: 6 },
  {
    source: String.raw`\b(?:ndvi|vegetation|greenness|forests?)\b`,
    layer: "ndvi",
    month: 8,
  },
  {
    source: String.raw`\bair\s+temp(?:erature)?\b`,
    layer: "airtemp",
    month: 7,
  },
  {
    source: String.raw`\b(?:temperature|temperatures|heatwave|heat)\b`,
    layer: "lst",
    month: 7,
  },
  { source: String.raw`\b(?:sst|sea\s+surface)\b`, layer: "sst", month: 8 },
];

const YEAR = String.raw`(?:19|20)\d{2}`;
const RANGE_SOURCE = String.raw`\b(${YEAR})\s*(?:-|–|—|\bto\b)\s*(${YEAR})\b`;
const YEAR_SOURCE = String.raw`\b${YEAR}\b`;
const VS_SOURCE = String.raw`\b(?:vs\.?|versus|compared\s+to|compared\s+with)\b`;
const MONTH_SOURCE = String.raw`\b(${Object.keys(MONTH_BY_NAME)
  .sort((a, b) => b.length - a.length)
  .join("|")})\b`;
const STOP_SOURCE = String.raw`\b(?:and|in|the|of|over|across|during|around|near|from|to|with)\b`;
/** "compare X and Y" / "compare X with Y". Without the lead-in, "and" stays a stop word. */
const PLACE_SPLIT_LEAD = /^\s*compare\s+/i;
const PLACE_SPLIT = /\s+(?:vs\.?|versus)\s+/i;
const PLACE_SPLIT_COMPARE = /\s+(?:vs\.?|versus|and|with)\s+/i;

function collapse(value: string): string {
  return value
    .replace(/[,.;:!?()[\]"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function yearsIn(raw: string): number[] {
  return [...raw.matchAll(new RegExp(YEAR_SOURCE, "g"))].map((match) =>
    Number(match[0])
  );
}

function namedMonthIn(raw: string): number | undefined {
  const monthName = new RegExp(MONTH_SOURCE, "i").exec(raw);
  return monthName ? MONTH_BY_NAME[monthName[1].toLowerCase()] : undefined;
}

/** The phenomenon word that occurs first. "Air temperature" beats "temperature". */
export function phenomenonIn(
  raw: string
): { layer: LayerId; month: number } | undefined {
  let keyword: Keyword | undefined;
  let keywordAt = Number.POSITIVE_INFINITY;
  for (const candidate of KEYWORDS) {
    const found = new RegExp(candidate.source, "i").exec(raw);
    if (found && found.index < keywordAt) {
      keyword = candidate;
      keywordAt = found.index;
    }
  }
  return keyword ? { layer: keyword.layer, month: keyword.month } : undefined;
}

/** Place text with dates, layer words, and filler removed. */
function cleanPlace(value: string): string {
  let place = value;
  place = place.replace(new RegExp(RANGE_SOURCE, "gi"), " ");
  place = place.replace(new RegExp(YEAR_SOURCE, "g"), " ");
  place = place.replace(new RegExp(VS_SOURCE, "gi"), " ");
  place = place.replace(new RegExp(MONTH_SOURCE, "gi"), " ");
  place = place.replace(/\bcompare\b/gi, " ");
  for (const candidate of KEYWORDS) {
    place = place.replace(new RegExp(candidate.source, "gi"), " ");
  }
  place = collapse(place).replace(new RegExp(STOP_SOURCE, "gi"), " ");
  return collapse(place);
}

/**
 * Two leftover place names around vs/versus, or around and/with when the
 * query starts with "compare". Empty once dates and layer words are gone
 * means it was not a place (the right-hand side of "2005 vs 2020").
 */
function splitPlaceNames(
  raw: string
): { placeA: string; placeB: string } | null {
  const lead = PLACE_SPLIT_LEAD.test(raw);
  const body = raw.replace(PLACE_SPLIT_LEAD, "");
  const parts = body.split(lead ? PLACE_SPLIT_COMPARE : PLACE_SPLIT);
  if (parts.length !== 2) return null;
  const placeA = cleanPlace(parts[0]);
  const placeB = cleanPlace(parts[1]);
  if (placeA.length < 2 || placeB.length < 2) return null;
  if (placeA.toLowerCase() === placeB.toLowerCase()) return null;
  return { placeA, placeB };
}

/**
 * A place against another place, on one layer and one date.
 * "Houston vs Austin rainfall 2026", "compare Houston and Austin",
 * "Houston versus Austin". A second year keeps this from running: that
 * query is a month swipe, or too ambiguous to guess.
 */
export interface PlaceCompareQuery {
  placeA: string;
  placeB: string;
  layer: LayerId;
  /**
   * Month used when the query names a year but no month ("rainfall 2026"
   * → September, the rain keyword's season). Ignored when a month is named
   * or when no date is named at all.
   */
  defaultMonth: number;
  requested: { year: number | null; month: number | null };
}

export function parsePlaceCompare(
  input: string,
  activeLayer?: LayerId
): PlaceCompareQuery | null {
  const raw = collapse(input);
  if (raw.length < 5) return null;
  const years = [...new Set(yearsIn(raw))];
  if (years.length > 1) return null;
  const names = splitPlaceNames(raw);
  if (!names) return null;
  const phenomenon = phenomenonIn(raw);
  return {
    ...names,
    layer: phenomenon?.layer ?? comparableLayer(activeLayer) ?? DEFAULT_LAYER,
    defaultMonth: phenomenon?.month ?? DEFAULT_MONTH,
    requested: { year: years[0] ?? null, month: namedMonthIn(raw) ?? null },
  };
}

/** Terrain and land cover have nothing month-to-month to put on the card. */
function comparableLayer(id: LayerId | undefined): LayerId | undefined {
  if (!id) return undefined;
  const layer = LAYERS[id];
  if (layer.static || layer.categorical) return undefined;
  return id;
}

/**
 * Parse a month comparison, or return null when it is not one (no year, no
 * place, two places, or more than two years). Null is what keeps an ordinary
 * place search — "Quito", "Qui" — and a place-vs-place query on the other path.
 */
export function parseThenNow(input: string): ThenNowQuery | null {
  const raw = collapse(input);
  if (raw.length < 2) return null;
  if (splitPlaceNames(raw)) return null;

  const yearHits = yearsIn(raw);
  if (yearHits.length < 1 || yearHits.length > 2) return null;
  const years = [...new Set(yearHits)].sort((a, b) => a - b);
  if (years.length !== yearHits.length) return null;
  const earlierYear = years[0];
  const laterYear = years.length === 2 ? years[1] : null;

  const namedMonth = namedMonthIn(raw);
  const phenomenon = phenomenonIn(raw);
  const place = cleanPlace(raw);
  if (place.length < 2) return null;

  const month = namedMonth ?? phenomenon?.month ?? DEFAULT_MONTH;
  return {
    place,
    layer: phenomenon?.layer ?? DEFAULT_LAYER,
    earlier: { year: earlierYear, month },
    later: { year: laterYear, month },
  };
}

/** The row the search box shows for a parsed query. */
export function describeThenNow(query: ThenNowQuery): {
  label: string;
  detail: string;
} {
  const earlier = `${MONTH_LABEL[query.earlier.month - 1]} ${query.earlier.year}`;
  const later =
    query.later.year === null
      ? `the latest ${MONTH_LABEL[query.later.month - 1]}`
      : `${MONTH_LABEL[query.later.month - 1]} ${query.later.year}`;
  return {
    label: `${query.place}, ${earlier} vs ${later}`,
    detail: LAYERS[query.layer].label,
  };
}

/**
 * Snap both sides onto months the layer actually publishes. A one-year query
 * takes the latest published slot of that calendar month. Undefined when
 * either side is outside the record, or when the two sides are the same slot.
 */
export function resolveCompareMonths(
  months: readonly YearMonth[],
  query: ThenNowQuery
): { earlier: YearMonth; later: YearMonth } | undefined {
  const earlier = resolvePinnedMonth([...months], query.earlier);
  if (!earlier) return undefined;
  let later: YearMonth | undefined;
  if (query.later.year === null) {
    for (let i = months.length - 1; i >= 0; i--) {
      if (months[i].month === query.later.month) {
        later = months[i];
        break;
      }
    }
  } else {
    later = resolvePinnedMonth([...months], {
      year: query.later.year,
      month: query.later.month,
    });
  }
  if (!later) return undefined;
  if (earlier.year === later.year && earlier.month === later.month) {
    return undefined;
  }
  return { earlier, later };
}
