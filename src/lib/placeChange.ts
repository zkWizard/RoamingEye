import { greatCircleDistance } from "./geo";
import { geometryContains, type GeoGeometry } from "./geojson";
import { SOIL_MOISTURE_DEPTH_LABEL } from "./soilMoistureDepth";
import { LAYERS, monthRangeForLayer, type LayerId } from "./timeline";

/**
 * How a searched place changed between two years: the numbers behind the place
 * panel. Each metric is an annual mean of monthly values sampled inside the
 * boundary, compared between the first and last year of the chosen range. Pure,
 * so every figure the panel prints is unit-tested here.
 */

export type PlaceChangeLayerId =
  "ndvi" | "precip" | "soil" | "airtemp" | "lst" | "aerosol" | "snow" | "sst";

/** Colour family for a direction of change (see `--tone-*` in style.css). */
export type PlaceChangeTone = "warm" | "cool" | "green";

export interface PlaceChangeMetric {
  layerId: PlaceChangeLayerId;
  label: string;
  unit: string;
  /** Decimals the values carry; also the precision below which change is flat. */
  decimals: number;
  /** Lead with a percentage of the start value, or an absolute difference. */
  headline: "percent" | "absolute";
  /** Unit after an absolute headline ("°C", "pts"). */
  deltaUnit?: string;
  rise: PlaceChangeTone;
  fall: PlaceChangeTone;
  /** Hide the card when both endpoints sit below this value (e.g. no snow). */
  shownFrom?: number;
  /** Hide the card, rather than report no data, where the place has none. */
  optional?: true;
  /** Product and statistic, for the card's tooltip. */
  source: string;
}

/** Card order: always-relevant metrics first, place-dependent ones last. */
export const PLACE_CHANGE_METRICS: readonly PlaceChangeMetric[] = [
  {
    layerId: "ndvi",
    label: "Vegetation",
    unit: "NDVI",
    decimals: 2,
    headline: "percent",
    rise: "green",
    fall: "warm",
    source: "MODIS Terra NDVI (MOD13A3), annual mean",
  },
  {
    layerId: "precip",
    label: "Precipitation",
    unit: "mm/yr",
    decimals: 0,
    headline: "percent",
    rise: "cool",
    fall: "warm",
    source: "GLDAS Noah land model, annual total",
  },
  {
    layerId: "soil",
    label: "Soil moisture",
    unit: "kg/m²",
    decimals: 1,
    headline: "percent",
    rise: "cool",
    fall: "warm",
    source: `GLDAS Noah land model, ${SOIL_MOISTURE_DEPTH_LABEL} layer, annual mean`,
  },
  {
    layerId: "airtemp",
    label: "Air temperature",
    unit: "°C",
    decimals: 1,
    headline: "absolute",
    deltaUnit: "°C",
    rise: "warm",
    fall: "cool",
    source: "MERRA-2 reanalysis, 2 m, annual mean",
  },
  {
    layerId: "lst",
    label: "Surface temp",
    unit: "°C",
    decimals: 1,
    headline: "absolute",
    deltaUnit: "°C",
    rise: "warm",
    fall: "cool",
    source: "MODIS Terra land surface temperature, clear-sky day, annual mean",
  },
  {
    layerId: "aerosol",
    label: "Aerosols",
    unit: "AOD",
    decimals: 2,
    headline: "percent",
    rise: "warm",
    fall: "cool",
    source: "MERRA-2 aerosol optical depth at 550 nm, annual mean",
  },
  {
    layerId: "snow",
    label: "Snow cover",
    unit: "%",
    decimals: 1,
    headline: "absolute",
    deltaUnit: "pts",
    rise: "cool",
    fall: "warm",
    shownFrom: 0.5,
    optional: true,
    source: "MODIS Terra snow cover (MOD10CM), share of the area, annual mean",
  },
  {
    layerId: "sst",
    label: "Sea surface temp",
    unit: "°C",
    decimals: 1,
    headline: "absolute",
    deltaUnit: "°C",
    rise: "warm",
    fall: "cool",
    optional: true,
    source: "MODIS Terra sea surface temperature, annual mean over water",
  },
];

/** A year's mean needs most of its seasonal cycle, or it describes a season. */
export const MIN_MONTHS_PER_YEAR = 9;
/** A year enters the range only once its source has published this much of it. */
const MIN_PUBLISHED_MONTHS = 11;
const DAYS_PER_YEAR = 365.25;
const KELVIN_OFFSET = -273.15;
const MINUS = "−";

/**
 * One month's value in the unit the card shows, from the sampler's output
 * (after the colormap factor). Snow arrives as the percent of the drawn cells,
 * and GIBS draws no colour at 0%, so the drawn share scales it to a share of the
 * whole area; an empty month is snow-free rather than missing.
 */
export function monthlyDisplayValue(
  layerId: PlaceChangeLayerId,
  sampled: number | null,
  validFraction: number
): number | null {
  if (layerId === "snow") return (sampled ?? 0) * validFraction;
  if (sampled === null || !Number.isFinite(sampled)) return null;
  if (layerId === "airtemp" || layerId === "lst")
    return sampled + KELVIN_OFFSET;
  return sampled;
}

/**
 * A month enters the mean only when its drawn share is at least this fraction
 * of the year's best-covered month. Coverage is judged against the place's own
 * best, not the whole boundary: a boundary that is mostly sea never draws a
 * land layer over more than its land, and that is no reason to drop it.
 */
export const RELATIVE_MONTH_COVERAGE = 0.25;

export interface MonthlySample {
  value: number | null;
  validFraction: number;
}

/** Mean of a year's monthly values, or null when too few months carry one. */
export function annualValue(
  layerId: PlaceChangeLayerId,
  monthly: readonly MonthlySample[]
): number | null {
  let best = 0;
  for (const { value, validFraction } of monthly) {
    if (value !== null) best = Math.max(best, validFraction);
  }
  let sum = 0;
  let count = 0;
  for (const { value, validFraction } of monthly) {
    if (value === null || !Number.isFinite(value)) continue;
    // Snow's value is already a share of the whole area, zero-filled.
    if (layerId !== "snow" && validFraction < RELATIVE_MONTH_COVERAGE * best) {
      continue;
    }
    sum += value;
    count++;
  }
  if (count < MIN_MONTHS_PER_YEAR) return null;
  const mean = sum / count;
  // Precipitation is a rate (mm/day); a year of it reads as a total.
  return layerId === "precip" ? mean * DAYS_PER_YEAR : mean;
}

/** Years the layer has (nearly) fully published, oldest first. */
export function usableYears(layerId: LayerId): number[] {
  const perYear = new Map<number, number>();
  for (const { year } of monthRangeForLayer(LAYERS[layerId])) {
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
  }
  return [...perYear]
    .filter(([, months]) => months >= MIN_PUBLISHED_MONTHS)
    .map(([year]) => year)
    .sort((a, b) => a - b);
}

export interface YearRange {
  from: number;
  to: number;
}

/** The requested range, narrowed to the years this layer can answer for. */
export function effectiveYears(
  years: readonly number[],
  range: YearRange
): YearRange | null {
  const from = years.find((year) => year >= range.from);
  const to = [...years].reverse().find((year) => year <= range.to);
  if (from === undefined || to === undefined || from >= to) return null;
  return { from, to };
}

export type PlaceRangePreset = "5y" | "10y" | "20y" | "all";

export const PLACE_RANGE_PRESETS: readonly {
  id: PlaceRangePreset;
  label: string;
  years: number | null;
}[] = [
  { id: "5y", label: "5Y", years: 5 },
  { id: "10y", label: "10Y", years: 10 },
  { id: "20y", label: "20Y", years: 20 },
  { id: "all", label: "All", years: null },
];

/** The earliest and latest year any metric can answer for. */
export function yearBounds(
  yearsByLayer: readonly (readonly number[])[]
): YearRange {
  const firsts = yearsByLayer.filter((y) => y.length).map((y) => y[0]);
  const lasts = yearsByLayer
    .filter((y) => y.length)
    .map((y) => y[y.length - 1]);
  return { from: Math.min(...firsts), to: Math.max(...lasts) };
}

export function presetRange(
  preset: PlaceRangePreset,
  bounds: YearRange
): YearRange {
  const years = PLACE_RANGE_PRESETS.find((p) => p.id === preset)?.years;
  return {
    from:
      years == null ? bounds.from : Math.max(bounds.from, bounds.to - years),
    to: bounds.to,
  };
}

/** The preset a range corresponds to, so its chip can show as selected. */
export function matchingPreset(
  range: YearRange,
  bounds: YearRange
): PlaceRangePreset | null {
  const match = PLACE_RANGE_PRESETS.find((p) => {
    const r = presetRange(p.id, bounds);
    return r.from === range.from && r.to === range.to;
  });
  return match?.id ?? null;
}

export interface PlaceChange {
  from: number;
  to: number;
  delta: number;
  /** Change as a share of the start value; null for absolute headlines. */
  percent: number | null;
  direction: "up" | "down" | "flat";
  tone: PlaceChangeTone | "flat";
}

export function placeChange(
  metric: PlaceChangeMetric,
  from: number,
  to: number
): PlaceChange {
  const delta = to - from;
  const percent =
    metric.headline === "percent" && Math.abs(from) > 1e-9
      ? (delta / Math.abs(from)) * 100
      : null;
  // Flat when the two values print identically, or the percentage rounds to 0.
  const flat =
    Math.abs(delta) < 0.5 * 10 ** -metric.decimals ||
    (percent !== null && Math.abs(percent) < 0.5);
  const direction = flat ? "flat" : delta > 0 ? "up" : "down";
  return {
    from,
    to,
    delta,
    percent,
    direction,
    tone:
      direction === "flat"
        ? "flat"
        : direction === "up"
          ? metric.rise
          : metric.fall,
  };
}

function signed(value: number, decimals: number): string {
  const text = Math.abs(value).toFixed(decimals);
  if (Number(text) === 0) return text;
  return `${value > 0 ? "+" : MINUS}${text}`;
}

export function formatPlaceValue(
  metric: PlaceChangeMetric,
  value: number
): string {
  return value
    .toLocaleString("en-US", {
      minimumFractionDigits: metric.decimals,
      maximumFractionDigits: metric.decimals,
    })
    .replace("-", MINUS);
}

/** The card's big number: "+7%", "−1.2 °C", "0%". */
export function formatHeadline(
  metric: PlaceChangeMetric,
  change: PlaceChange
): string {
  if (change.percent !== null) {
    if (change.direction === "flat") return "0%";
    const abs = Math.abs(change.percent);
    return `${signed(change.percent, abs >= 10 ? 0 : 1)}%`;
  }
  const delta = change.direction === "flat" ? 0 : change.delta;
  return `${signed(delta, metric.decimals)} ${metric.deltaUnit ?? ""}`.trim();
}

/** The card's second line: "0.41 → 0.44 NDVI". */
export function formatSpan(
  metric: PlaceChangeMetric,
  change: PlaceChange
): string {
  return `${formatPlaceValue(metric, change.from)} → ${formatPlaceValue(metric, change.to)} ${metric.unit}`;
}

/** Hide a card whose quantity is absent here in both years (no snow). */
export function placeMetricShown(
  metric: PlaceChangeMetric,
  change: PlaceChange
): boolean {
  if (metric.shownFrom === undefined) return true;
  return change.from >= metric.shownFrom || change.to >= metric.shownFrom;
}

// --- Hazards -----------------------------------------------------------------

export interface QuakeTally {
  count: number;
  /** The query hit its row limit, so the count is a floor. */
  capped: boolean;
  maxMagnitude: number | null;
}

export const QUAKE_MIN_MAGNITUDE = 4.5;
/** USGS's own ceiling per request. */
export const QUAKE_QUERY_LIMIT = 20000;

/**
 * USGS event search over the boundary's extent for the whole year range. Text,
 * not GeoJSON: an active country's 20 years run to thousands of events, and the
 * pipe-separated rows are a seventh of the size.
 */
export function quakeQueryUrl(
  bounds: { south: number; north: number; west: number; east: number },
  range: YearRange
): string {
  const params = new URLSearchParams({
    format: "text",
    eventtype: "earthquake",
    starttime: `${range.from}-01-01`,
    endtime: `${range.to + 1}-01-01`,
    minmagnitude: String(QUAKE_MIN_MAGNITUDE),
    minlatitude: bounds.south.toFixed(4),
    maxlatitude: bounds.north.toFixed(4),
    minlongitude: bounds.west.toFixed(4),
    maxlongitude: bounds.east.toFixed(4),
    orderby: "magnitude",
    limit: String(QUAKE_QUERY_LIMIT),
  });
  return `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`;
}

/**
 * Count the returned events that fall inside the boundary itself. Rows are
 * FDSN text: `EventID|Time|Latitude|Longitude|Depth|…|MagType|Magnitude|…`.
 */
export function tallyQuakes(text: string, geometry: GeoGeometry): QuakeTally {
  let rows = 0;
  let count = 0;
  let maxMagnitude: number | null = null;
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    rows++;
    const cols = line.split("|");
    const lat = Number(cols[2]);
    const lon = Number(cols[3]);
    const mag = Number(cols[10]);
    if (![lat, lon, mag].every(Number.isFinite)) continue;
    if (!geometryContains(geometry, lat, lon)) continue;
    count++;
    if (maxMagnitude === null || mag > maxMagnitude) maxMagnitude = mag;
  }
  return { count, capped: rows >= QUAKE_QUERY_LIMIT, maxMagnitude };
}

export interface VolcanoTally {
  inside: number;
  latestEruption: number | null;
  /** Distance to the nearest volcano when none is inside, in km. */
  nearestKm: number | null;
}

export function tallyVolcanoes(
  volcanoes: readonly {
    lat: number;
    lon: number;
    lastEruptionYear: number | null;
  }[],
  geometry: GeoGeometry,
  centre: { lat: number; lon: number }
): VolcanoTally {
  let inside = 0;
  let latestEruption: number | null = null;
  let nearest = Infinity;
  for (const v of volcanoes) {
    if (geometryContains(geometry, v.lat, v.lon)) {
      inside++;
      if (
        v.lastEruptionYear !== null &&
        (latestEruption === null || v.lastEruptionYear > latestEruption)
      ) {
        latestEruption = v.lastEruptionYear;
      }
    } else {
      nearest = Math.min(
        nearest,
        greatCircleDistance(centre.lat, centre.lon, v.lat, v.lon)
      );
    }
  }
  return {
    inside,
    latestEruption,
    nearestKm: inside === 0 && Number.isFinite(nearest) ? nearest / 1000 : null,
  };
}

/** Whether a plate boundary runs through the place. */
export function plateBoundaryCrosses(
  boundaries: readonly { points: readonly [number, number][] }[],
  geometry: GeoGeometry
): boolean {
  return boundaries.some((b) =>
    b.points.some(([lon, lat]) => geometryContains(geometry, lat, lon))
  );
}
