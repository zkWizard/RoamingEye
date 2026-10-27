import { isPointClimateLayer, pointClimateSuggestion } from "./compareClimate";
import { formatProbeValue, PROBE_SCALES, quantizationStep } from "./probe";
import {
  formatTimelineLabel,
  gibsWmsUrl,
  LAYERS,
  monthRangeForLayer,
  utcYearMonth,
  ymToIndex,
  type LayerConfig,
  type LayerId,
  type YearMonth,
} from "./timeline";
import type { PlaceCompareQuery } from "./thenNow";

/**
 * One month for a place-vs-place query, and the sentence that says when the
 * requested date is not in the layer's record.
 *
 * No date → the latest published month, with nothing to apologize for.
 * A year without a month uses the layer word's season ("rainfall 2026" asks
 * for September). A month the product has not published — September 2026
 * rainfall, while precipitation still ends in March — falls back to the
 * latest month and says so. The fallback is the latest month, not the
 * nearest one: snapping to a neighbor would present a different month as
 * the one the query named.
 */
export function resolvePlaceCompareMonth(
  months: readonly YearMonth[],
  query: PlaceCompareQuery
): { month: YearMonth; note: string | null } | undefined {
  if (months.length === 0) return undefined;
  const latest = months[months.length - 1];
  const { year, month } = query.requested;
  if (year === null && month === null) return { month: latest, note: null };

  const wanted: YearMonth =
    year !== null && month !== null
      ? { year, month }
      : year !== null
        ? { year, month: query.defaultMonth }
        : (latestMonthNamed(months, month as number) ?? {
            year: latest.year,
            month: month as number,
          });

  if (month !== null && year === null) {
    const named = latestMonthNamed(months, month);
    if (named) return { month: named, note: null };
  } else if (hasExactMonth(months, wanted)) {
    return { month: wanted, note: null };
  }

  return {
    month: latest,
    note: unavailableNote(LAYERS[query.layer], wanted, latest),
  };
}

function hasExactMonth(
  months: readonly YearMonth[],
  wanted: YearMonth
): boolean {
  return months.some(
    (month) => month.year === wanted.year && month.month === wanted.month
  );
}

function latestMonthNamed(
  months: readonly YearMonth[],
  month: number
): YearMonth | undefined {
  for (let i = months.length - 1; i >= 0; i--) {
    if (months[i].month === month) return months[i];
  }
  return undefined;
}

function unavailableNote(
  layer: LayerConfig,
  wanted: YearMonth,
  latest: YearMonth
): string {
  const asked = formatTimelineLabel(layer, wanted);
  const shown = formatTimelineLabel(layer, latest);
  const future = ymToIndex(wanted) > ymToIndex(latest);
  const why = future
    ? `${asked} isn't published yet`
    : `${asked} isn't in this layer's record`;
  return `${why}. Showing ${shown}, the latest available month.`;
}

/** The suggestion row: both places, the layer, and the month that will open. */
export function describePlaceCompare(
  query: PlaceCompareQuery,
  today: YearMonth = utcYearMonth()
): {
  title: string;
  subtitle: string;
} {
  const title = `${query.placeA} vs ${query.placeB}`;
  if (isPointClimateLayer(query.layer)) {
    return {
      title,
      subtitle: pointClimateSuggestion(
        {
          layer: query.layer,
          requested: query.requested,
          defaultMonth: query.defaultMonth,
        },
        today
      ),
    };
  }
  const layer = LAYERS[query.layer];
  const resolved = resolvePlaceCompareMonth(monthRangeForLayer(layer), query);
  if (!resolved) return { title, subtitle: layer.label };
  // The compiled record can lag the timeline freshness has already extended,
  // so a suggestion must not name "Mar" when the globe will open June. A
  // missing date says "latest"; a date the compiled record lacks says why,
  // and the panel names the month the live timeline actually has.
  if (resolved.note) {
    const why = resolved.note.split(". ")[0];
    return {
      title,
      subtitle: `${layer.label}. ${why}. Opens the latest available month.`,
    };
  }
  if (query.requested.year === null && query.requested.month === null) {
    return { title, subtitle: `${layer.label} · latest available month` };
  }
  return {
    title,
    subtitle: `${layer.label} · ${formatTimelineLabel(layer, resolved.month)}`,
  };
}

interface Speech {
  /** "Houston's rainfall is 3.2 mm/day". */
  noun: string;
  more: string;
  less: string;
}

const SPEECH: Record<LayerId, Speech> = {
  precip: { noun: "rainfall", more: "wetter", less: "drier" },
  lst: { noun: "land surface temperature", more: "warmer", less: "cooler" },
  airtemp: { noun: "air temperature", more: "warmer", less: "cooler" },
  sst: { noun: "sea surface temperature", more: "warmer", less: "cooler" },
  ndvi: { noun: "greenness", more: "greener", less: "less green" },
  evi: { noun: "greenness", more: "greener", less: "less green" },
  snow: { noun: "snow cover", more: "snowier", less: "less snowy" },
  aerosol: {
    noun: "aerosol optical depth",
    more: "hazier",
    less: "clearer",
  },
  soil: { noun: "soil moisture", more: "wetter", less: "drier" },
  landcover: { noun: "land cover", more: "higher", less: "lower" },
  terrain: { noun: "terrain", more: "higher", less: "lower" },
};

export interface PlaceReading {
  placeA: string;
  placeB: string;
  layer: LayerId;
  monthLabel: string;
  valueA: number | null;
  valueB: number | null;
  /** The date-fallback sentence, or null when the requested month exists. */
  note: string | null;
}

/**
 * Plain-language difference for two readings of the same layer and month.
 * A gap smaller than one colormap step is "about the same" — the pictures
 * cannot support a finer claim. Missing pixels (ocean on a land layer, a
 * failed image) are named instead of treated as zero.
 */
export function describePlaceDifference(reading: PlaceReading): string {
  const speech = SPEECH[reading.layer];
  const scale = PROBE_SCALES[reading.layer];
  const lead = reading.note ? `${reading.note} ` : "";
  const when = `In ${reading.monthLabel}`;

  if (!scale.calibrated) {
    return `${lead}${when}, both places are shown on ${LAYERS[reading.layer].label}.`;
  }

  const { valueA, valueB, placeA, placeB } = reading;
  if (valueA === null && valueB === null) {
    return `${lead}${when}, ${placeA} and ${placeB} have no ${speech.noun} reading.`;
  }
  if (valueA === null || valueB === null) {
    const known = valueA === null ? placeB : placeA;
    const missing = valueA === null ? placeA : placeB;
    const value = valueA === null ? valueB : valueA;
    return `${lead}${when}, ${known}'s ${speech.noun} is ${formatProbeValue(value as number, scale)}. ${missing} has no reading for that month.`;
  }

  const delta = valueA - valueB;
  if (Math.abs(delta) <= quantizationStep(scale)) {
    return `${lead}${when}, ${placeA} and ${placeB} have about the same ${speech.noun} (${formatProbeValue(valueA, scale)}).`;
  }
  const winner = delta > 0 ? placeA : placeB;
  const how = delta > 0 ? speech.more : speech.less;
  return `${lead}${when}, ${placeA}'s ${speech.noun} is ${formatProbeValue(valueA, scale)} and ${placeB}'s is ${formatProbeValue(valueB, scale)}. ${winner} is ${how} by ${formatProbeValue(Math.abs(delta), scale)}.`;
}

/** Pad a place's box so the snapshot shows some surrounding land. */
export function previewBounds(
  box: readonly [number, number, number, number] | null,
  lat: number,
  lon: number
): [number, number, number, number] {
  const aroundPoint = (): [number, number, number, number] => [
    clampLat(lat - 0.45),
    clampLat(lat + 0.45),
    clampLon(lon - 0.55),
    clampLon(lon + 0.55),
  ];
  if (!box) return aroundPoint();
  const [south, north, west, east] = box;
  if (
    ![south, north, west, east].every((n) => Number.isFinite(n)) ||
    north <= south ||
    east <= west
  ) {
    return aroundPoint();
  }
  const latPad = Math.max(0.12, (north - south) * 0.2);
  const lonPad = Math.max(0.12, (east - west) * 0.2);
  return [
    clampLat(south - latPad),
    clampLat(north + latPad),
    clampLon(west - lonPad),
    clampLon(east + lonPad),
  ];
}

function clampLat(value: number): number {
  return Math.min(80, Math.max(-80, value));
}

function clampLon(value: number): number {
  return Math.min(180, Math.max(-180, value));
}

/** WMS snapshot of one place. Same layer and month as the other column. */
export function placePreviewUrl(
  layer: LayerConfig,
  ym: YearMonth,
  box: readonly [number, number, number, number]
): string {
  const [south, north, west, east] = box;
  const url = new URL(gibsWmsUrl(layer, ym, { width: 480, height: 320 }));
  // WMS 1.3 / EPSG:4326 axis order is latitude, then longitude.
  url.searchParams.set("BBOX", `${south},${west},${north},${east}`);
  url.searchParams.set("FORMAT", "image/jpeg");
  return url.toString();
}

export interface PlaceFix {
  lat: number;
  lon: number;
  boundingBox: readonly [number, number, number, number] | null;
}

/** Camera target that puts both places in one view. */
export function pairFocus(
  a: PlaceFix,
  b: PlaceFix
): { lat: number; lon: number } {
  const lat = (a.lat + b.lat) / 2;
  let delta = b.lon - a.lon;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  let lon = a.lon + delta / 2;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/**
 * One box around both places, or null when a box is missing or the pair
 * crosses the date line (a single west/east span would wrap the world).
 */
export function unionBounds(
  a: PlaceFix,
  b: PlaceFix
): [number, number, number, number] | null {
  const left = a.boundingBox;
  const right = b.boundingBox;
  if (!left || !right) return null;
  if (left[2] > left[3] || right[2] > right[3]) return null;
  const south = Math.min(left[0], right[0]);
  const north = Math.max(left[1], right[1]);
  const west = Math.min(left[2], right[2]);
  const east = Math.max(left[3], right[3]);
  if (east - west > 160 || north - south > 80) return null;
  return [south, north, west, east];
}
