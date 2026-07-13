import {
  LAYERS,
  MONTH_NAMES,
  monthRangeForLayer,
  type LayerId,
  type YearMonth,
} from "./timeline";
import { PROBE_SCALES, scaleValue } from "./probe";
import {
  COLORMAP_DOCS,
  SCALE_CONVERSIONS,
  colormapUrl,
  parseColormapEntries,
  type CalibratedLayerId,
  type ColormapEntry,
} from "./colormap";
import { fetchWithRetry } from "./net";

export type PlaceMetricId = "vegetation" | "rainfall" | "soil" | "air";

export interface PlaceMetric {
  id: PlaceMetricId;
  layerId: LayerId;
  label: string;
}

export const PLACE_METRICS: readonly PlaceMetric[] = [
  { id: "vegetation", layerId: "ndvi", label: "Vegetation" },
  { id: "rainfall", layerId: "precip", label: "Rainfall" },
  { id: "soil", layerId: "soil", label: "Soil moisture" },
  { id: "air", layerId: "airtemp", label: "Air temperature" },
];

export interface PlaceInsightReading {
  id: PlaceMetricId;
  value: string;
  detail: string;
}

export interface PlaceColormap {
  entries: ColormapEntry[];
  /** Converts colormap values to the unit shown to users, when needed. */
  factor: number;
}

const placeColormapCache = new Map<CalibratedLayerId, Promise<PlaceColormap>>();

/**
 * Retrieve and cache NASA GIBS's own RGB-to-value ramp for an insight metric.
 * The display legend is intentionally concise; this data source is the
 * authoritative mapping used to turn rendered regional pixels into physical
 * rainfall, soil-moisture, and temperature values.
 */
export function loadPlaceColormap(
  layerId: LayerId
): Promise<PlaceColormap | null> {
  if (!(layerId in COLORMAP_DOCS)) return Promise.resolve(null);
  const calibrated = layerId as CalibratedLayerId;
  let pending = placeColormapCache.get(calibrated);
  if (!pending) {
    pending = fetchWithRetry(colormapUrl(COLORMAP_DOCS[calibrated]))
      .then((response) => response.text())
      .then((xml) => {
        const entries = parseColormapEntries(xml);
        if (entries.length === 0) {
          throw new Error(
            `RoamingEye: GIBS colormap for "${calibrated}" has no usable entries`
          );
        }
        return {
          entries,
          factor: SCALE_CONVERSIONS[calibrated]?.factor ?? 1,
        };
      })
      .catch((error: unknown) => {
        placeColormapCache.delete(calibrated);
        throw error;
      });
    placeColormapCache.set(calibrated, pending);
  }
  return pending;
}

/** The latest pair available for a product, accounting for publication lag. */
export function latestComparisonMonths(
  layerId: LayerId
): [YearMonth, YearMonth] | null {
  const months = monthRangeForLayer(LAYERS[layerId]);
  if (months.length < 2) return null;
  return [months[months.length - 2], months[months.length - 1]];
}

/** Turn two raw colormap positions into a user-facing month-over-month reading. */
export function placeInsightReading(
  metric: PlaceMetric,
  months: [YearMonth, YearMonth],
  values: (number | null)[]
): PlaceInsightReading {
  return makePlaceInsightReading(metric, months, values, placeValue);
}

/** Render values decoded through GIBS's authoritative physical colormap. */
export function placeInsightPhysicalReading(
  metric: PlaceMetric,
  months: [YearMonth, YearMonth],
  values: (number | null)[]
): PlaceInsightReading {
  return makePlaceInsightReading(metric, months, values, physicalPlaceValue);
}

function makePlaceInsightReading(
  metric: PlaceMetric,
  months: [YearMonth, YearMonth],
  values: (number | null)[],
  toPlaceValue: (
    id: PlaceMetricId,
    value: number | null,
    month: YearMonth
  ) => number | null
): PlaceInsightReading {
  const [previousMonth, currentMonth] = months;
  const previous = toPlaceValue(metric.id, values[0] ?? null, previousMonth);
  const current = toPlaceValue(metric.id, values[1] ?? null, currentMonth);
  const currentLabel = formatMonth(currentMonth);
  const previousLabel = formatMonth(previousMonth);
  if (current === null) {
    return {
      id: metric.id,
      value: "Unavailable",
      detail: `No usable ${currentLabel} coverage`,
    };
  }
  if (previous === null) {
    return {
      id: metric.id,
      value: formatPlaceValue(metric.id, current),
      detail: `${currentLabel} regional mean`,
    };
  }
  const delta = current - previous;
  return {
    id: metric.id,
    value: formatPlaceValue(metric.id, current),
    detail: `${formatDelta(metric.id, delta)} vs ${previousLabel} · ${currentLabel}`,
  };
}

function placeValue(
  metricId: PlaceMetricId,
  value: number | null,
  month: YearMonth
): number | null {
  if (value === null) return null;
  switch (metricId) {
    case "vegetation":
      return scaleValue(value, PROBE_SCALES.ndvi);
    case "rainfall":
      return scaleValue(value, PROBE_SCALES.precip) * daysInMonth(month);
    case "soil":
      return scaleValue(value, PROBE_SCALES.soil);
    case "air":
      return scaleValue(value, PROBE_SCALES.airtemp) - 273.15;
  }
}

function physicalPlaceValue(
  metricId: PlaceMetricId,
  value: number | null,
  month: YearMonth
): number | null {
  if (value === null) return null;
  switch (metricId) {
    case "vegetation":
      return value;
    case "rainfall":
      return value * daysInMonth(month);
    case "soil":
      return value;
    case "air":
      return value - 273.15;
  }
}

function formatPlaceValue(metricId: PlaceMetricId, value: number): string {
  switch (metricId) {
    case "vegetation":
      return value.toFixed(2);
    case "rainfall":
      return `${Math.round(value)} mm`;
    case "soil":
      return `${Math.round(value)} kg/m2`;
    case "air":
      return `${value.toFixed(1)} C`;
  }
}

function formatDelta(metricId: PlaceMetricId, value: number): string {
  const sign = value >= 0 ? "+" : "";
  switch (metricId) {
    case "vegetation":
      return `${sign}${value.toFixed(2)}`;
    case "rainfall":
      return `${sign}${Math.round(value)} mm`;
    case "soil":
      return `${sign}${Math.round(value)} kg/m2`;
    case "air":
      return `${sign}${value.toFixed(1)} C`;
  }
}

function formatMonth(month: YearMonth): string {
  return `${MONTH_NAMES[month.month - 1]} ${month.year}`;
}

function daysInMonth(month: YearMonth): number {
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}
