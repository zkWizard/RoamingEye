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
import type { GeometrySamplingStrategy } from "./geojson";
import { vegetationDrawnCoverageCaveat } from "./vegetationDrawnCoverage";
import {
  isPlausibleNdvi,
  placeVegetationComparison,
  type PlaceVegetationComparison,
} from "./placeVegetationChange";
import {
  placeRainfallMonthLengthSplit,
  rainfallMonthLengthNote,
} from "./placeRainfallMonthLength";
import {
  placeMonthStep,
  placeMonthStepNote,
  placeMonthStepRefusal,
} from "./placeMonthStep";

export type PlaceMetricId = "vegetation" | "rainfall" | "soil" | "air" | "snow";
export type PlaceMetricLayerId =
  "ndvi" | "precip" | "soil" | "airtemp" | "snow";

export interface PlaceMetric {
  id: PlaceMetricId;
  layerId: PlaceMetricLayerId;
  label: string;
}

export const PLACE_METRICS: readonly PlaceMetric[] = [
  { id: "vegetation", layerId: "ndvi", label: "Vegetation" },
  // The card reads GLDAS_Surface_Total_Precipitation_Rate_Monthly, whose GIBS
  // ows:Title is "Total Precipitation Rate (Monthly, Surface, Noah LSM,
  // GLDAS)" — a phase-summed total that includes snowfall. The metric id stays
  // "rainfall" (a structural key), but the rendered label must not claim a
  // liquid-only quantity the layer does not serve.
  { id: "rainfall", layerId: "precip", label: "Precipitation" },
  { id: "soil", layerId: "soil", label: "Soil moisture" },
  { id: "air", layerId: "airtemp", label: "Air temperature" },
  // The cryosphere layer GIBS renders (MOD10CM monthly-average percent) had no
  // place-panel card, so the only calibrated cryosphere reading in the app was
  // reachable by probing a pixel. Its card is written by lib/snowCoverNarrative
  // rather than the shared formatters below, because percent 0 is drawn
  // transparent and the resulting drawn-fraction bias has to be stated with the
  // number, not inferred from sampled coverage alone.
  { id: "snow", layerId: "snow", label: "Snow cover" },
];

export interface PlaceInsightReading {
  id: PlaceMetricId;
  value: string;
  detail: string;
}

/**
 * Sampling context for a boundary-level mean. Rendered-image dimensions are
 * provenance, not a ground-resolution measurement or precision claim.
 */
export interface PlaceSamplingProvenance {
  validFractions?: readonly number[];
  sourceImageDimensions?: { width: number; height: number };
  /** A bounded boundary grid normally represents the place. A single search
   * coordinate is retained only when it falls inside the boundary and must not
   * be presented as a regional mean. */
  geometrySamplingStrategy?: GeometrySamplingStrategy;
}

export interface PlaceColormap {
  entries: ColormapEntry[];
  /** Converts colormap values to the unit shown to users, when needed. */
  factor: number;
}

/**
 * Place insights decode NDVI as well as the globally calibrated probe layers.
 * MODIS_L3_NDVI is the GIBS colormap linked to the monthly MOD13A3 imagery;
 * using it recovers native NDVI values instead of treating a display-gradient
 * position as the observation.
 *
 * It does not recover the whole index. GIBS marks the fill band and both
 * negative bands transparent and omits them from the continuous legend this
 * parses (see vegetationIndexRenderedRange.ts), so the recoverable range starts
 * just above zero. Negative NDVI — what open water, snow, ice, and cloud
 * produce — is undrawn rather than decodable, which means a vegetation reading
 * here is a mean over the drawn part of the boundary and the undrawn share
 * lands in `validFractions`, not in the value.
 */
export const PLACE_COLORMAP_DOCS = {
  ...COLORMAP_DOCS,
  ndvi: "MODIS_L3_NDVI",
} as const;

type PlaceCalibratedLayerId = keyof typeof PLACE_COLORMAP_DOCS;

const placeColormapCache = new Map<
  PlaceCalibratedLayerId,
  Promise<PlaceColormap>
>();

/**
 * Retrieve and cache NASA GIBS's own RGB-to-value ramp for an insight metric.
 * The display legend is intentionally concise; this data source is the
 * authoritative mapping used to turn rendered regional pixels into physical
 * NDVI, rainfall, soil-moisture, and temperature values.
 */
export function loadPlaceColormap(
  layerId: LayerId
): Promise<PlaceColormap | null> {
  if (!(layerId in PLACE_COLORMAP_DOCS)) return Promise.resolve(null);
  const calibrated = layerId as PlaceCalibratedLayerId;
  let pending = placeColormapCache.get(calibrated);
  if (!pending) {
    pending = fetchWithRetry(colormapUrl(PLACE_COLORMAP_DOCS[calibrated]))
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
          factor:
            SCALE_CONVERSIONS[calibrated as CalibratedLayerId]?.factor ?? 1,
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
  values: (number | null)[],
  provenance?: PlaceSamplingProvenance
): PlaceInsightReading {
  return makePlaceInsightReading(
    metric,
    months,
    values,
    placeValue,
    provenance
  );
}

/** Render values decoded through GIBS's authoritative physical colormap. */
export function placeInsightPhysicalReading(
  metric: PlaceMetric,
  months: [YearMonth, YearMonth],
  values: (number | null)[],
  provenance?: PlaceSamplingProvenance
): PlaceInsightReading {
  return makePlaceInsightReading(
    metric,
    months,
    values,
    physicalPlaceValue,
    provenance
  );
}

/**
 * Admit only values decoded through an authoritative physical colormap to the
 * native-value export path.
 *
 * A display-ramp position is not a native product value even when both happen
 * to share the same numeric range. Preserve month and coverage elsewhere, but
 * withhold display-ramp positions from a contract that promises native units.
 */
export function nativePlaceSampleValues(
  values: readonly (number | null)[],
  valueSource: "authoritative-colormap" | "display-ramp"
): (number | null)[] {
  if (valueSource === "display-ramp") return values.map(() => null);
  return [...values];
}

function makePlaceInsightReading(
  metric: PlaceMetric,
  months: [YearMonth, YearMonth],
  values: (number | null)[],
  toPlaceValue: (
    id: PlaceMetricId,
    value: number | null,
    month: YearMonth
  ) => number | null,
  provenance?: PlaceSamplingProvenance
): PlaceInsightReading {
  const [previousMonth, currentMonth] = months;
  const previous = toPlaceValue(metric.id, values[0] ?? null, previousMonth);
  const current = toPlaceValue(metric.id, values[1] ?? null, currentMonth);
  const currentLabel = formatMonth(currentMonth);
  const previousLabel = `${formatMonth(previousMonth)}${samplingSuffix(
    provenance,
    currentLabel,
    1
  )}`;
  // NDVI is bounded by its own definition. An out-of-range value is a decode or
  // scaling error, so it is withheld rather than shown as a greenness reading.
  if (
    metric.id === "vegetation" &&
    current !== null &&
    !isPlausibleNdvi(current)
  ) {
    return {
      id: metric.id,
      value: "Unavailable",
      detail: withSamplingProvenance(
        `${currentLabel} value is outside the valid -1 to 1 NDVI range`,
        provenance,
        1
      ),
    };
  }
  if (current === null) {
    return {
      id: metric.id,
      value: "Unavailable",
      detail: withSamplingProvenance(
        `No usable ${currentLabel} coverage`,
        provenance,
        1
      ),
    };
  }
  if (previous === null) {
    return {
      id: metric.id,
      value: formatPlaceValue(metric.id, current),
      detail: withDrawnCoverageCaveat(
        withSamplingProvenance(`${currentLabel} regional mean`, provenance, 1),
        metric,
        provenance
      ),
    };
  }
  if (metric.id === "vegetation") {
    return {
      id: metric.id,
      value: formatPlaceValue(metric.id, current),
      detail: withDrawnCoverageCaveat(
        vegetationDetail(
          placeVegetationComparison(
            [previousMonth, currentMonth],
            [previous, current]
          ),
          {
            currentLabel,
            previousMonthLabel: formatMonth(previousMonth),
            suffix: samplingSuffix(provenance, currentLabel, 1),
          }
        ),
        metric,
        provenance
      ),
    };
  }
  // "Month over month" is only true for an adjacent pair, and these products'
  // enumerated records have their declared gaps removed, so the last two
  // entries are not guaranteed to be one. The vegetation card has always
  // refused a non-adjacent pair; the other three subtracted regardless.
  const step = placeMonthStep([previousMonth, currentMonth]);
  const refusal = placeMonthStepRefusal(step, formatMonth(previousMonth));
  if (refusal !== null) {
    return {
      id: metric.id,
      value: formatPlaceValue(metric.id, current),
      detail: `${currentLabel} regional mean${samplingSuffix(
        provenance,
        currentLabel,
        1
      )}; ${refusal}`,
    };
  }
  const delta = current - previous;
  // A rainfall total is a rate integrated over the month's own length, so part
  // of any month-over-month step is calendar rather than weather. Disclose that
  // share instead of letting a longer month read as a wetter one.
  const monthLength =
    metric.id === "rainfall"
      ? rainfallMonthLengthNote(
          placeRainfallMonthLengthSplit(
            [previousMonth, currentMonth],
            [previous, current]
          )
        )
      : "";
  // The panel attaches no climatological baseline, so this is a plain
  // difference of two absolute observations. Air temperature, precipitation and
  // soil moisture are more strongly seasonal at most latitudes than the NDVI
  // step the vegetation card already qualifies — say so on every card.
  return {
    id: metric.id,
    value: formatPlaceValue(metric.id, current),
    detail: `${formatDelta(metric.id, delta)} vs ${previousLabel} · ${currentLabel}${monthLength}${placeMonthStepNote(
      step
    )}`,
  };
}

/**
 * Phrase the vegetation card's month-over-month statement from the verdict in
 * `placeVegetationChange`. A direction word describes the NDVI index only, and
 * every comparison carries the reminder that the difference is not
 * deseasonalized — at most latitudes a one-month step is the annual cycle, not
 * an anomaly. Where no comparison is allowed, the reason is stated instead of a
 * signed difference being shown under a "month over month" label.
 */
function vegetationDetail(
  comparison: PlaceVegetationComparison,
  labels: { currentLabel: string; previousMonthLabel: string; suffix: string }
): string {
  if (comparison.kind === "not-comparable") {
    const reason =
      comparison.reason === "ndvi-out-of-range"
        ? `${labels.previousMonthLabel} is outside the valid -1 to 1 NDVI range and was not compared`
        : `${labels.previousMonthLabel} is not the preceding month, so no month-over-month change is reported`;
    return `${labels.currentLabel} regional mean${labels.suffix}; ${reason}`;
  }
  const delta = formatDelta("vegetation", comparison.delta);
  const statement =
    comparison.direction === "little-change"
      ? `Little change (${delta} NDVI, within the ${comparison.stabilityThreshold} stability band)`
      : `${comparison.direction === "greening" ? "Greening" : "Browning"} ${delta} NDVI`;
  return `${statement} vs ${labels.previousMonthLabel}${labels.suffix} · ${labels.currentLabel} · annual cycle not removed`;
}

/**
 * Append the vegetation drawn-coverage caveat to a card that reports a number.
 *
 * Vegetation only: NDVI is the sole place metric whose ramp leaves its lowest
 * band undrawn, so its coverage shortfall is a signed bias on the value rather
 * than incidental missingness (see vegetationDrawnCoverage.ts). The other
 * metrics' shortfalls are already described by their own copy.
 *
 * A card with no sampling provenance at all makes no coverage claim to qualify
 * — `samplingSuffix` stays silent there too — so this does as well, rather than
 * attaching a caveat about a sampled fraction the caller never reported.
 */
function withDrawnCoverageCaveat(
  detail: string,
  metric: PlaceMetric,
  provenance: PlaceSamplingProvenance | undefined
): string {
  if (metric.id !== "vegetation" || !provenance) return detail;
  const caveat = vegetationDrawnCoverageCaveat(
    provenance?.validFractions?.[1],
    {
      isRegionalMean: provenance?.geometrySamplingStrategy !== "boundary-point",
    }
  );
  return caveat === null ? detail : `${detail}; ${caveat}`;
}

function withSamplingProvenance(
  detail: string,
  provenance: PlaceSamplingProvenance | undefined,
  currentIndex: number
): string {
  return `${detail}${samplingSuffix(provenance, "", currentIndex)}`;
}

function samplingSuffix(
  provenance: PlaceSamplingProvenance | undefined,
  label: string,
  currentIndex: number
): string {
  if (!provenance) return "";
  const fraction = provenance.validFractions?.[currentIndex];
  const pointEstimate =
    provenance.geometrySamplingStrategy === "boundary-point";
  const coverage =
    fraction !== undefined &&
    Number.isFinite(fraction) &&
    fraction >= 0 &&
    fraction <= 1
      ? pointEstimate
        ? `${label ? `; ${label}: ` : "; "}single in-boundary image sample ${
            fraction === 1 ? "has data" : "has no data"
          }`
        : `${label ? `; ${label}: ` : "; "}${formatCoveragePercent(fraction)}% sampled coverage`
      : `${label ? `; ${label}: ` : "; "}${
          pointEstimate
            ? "single in-boundary image sample status not supplied"
            : "sampled coverage not supplied"
        }`;
  const dimensions = provenance.sourceImageDimensions;
  const image =
    dimensions &&
    Number.isInteger(dimensions.width) &&
    Number.isInteger(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
      ? `; rendered source image ${dimensions.width} x ${dimensions.height} px`
      : "; rendered source image dimensions not supplied";
  return `${coverage}${image}; ${
    pointEstimate
      ? "single boundary point estimate, not a regional mean"
      : "approximate regional mean"
  }`;
}

/**
 * Render a sampled-coverage fraction as a percentage without rounding a
 * partial sample to "0%" or to "100%".
 *
 * A drawn boundary is sampled on a grid up to 28x28 (`regionGridSize`), so a
 * handful of excluded pixels among ~780 is ordinary rather than rare — at
 * whole-percent rounding one excluded pixel reads as "100% sampled coverage",
 * which the vegetation card's own drawn-coverage caveat then contradicts by
 * saying pixels were left out. The other direction is worse: a large boundary
 * with a small usable sliver reports a regional mean beside "0% sampled
 * coverage", the same text the card prints when there was genuinely nothing to
 * sample.
 *
 * Five significant figures, matching how the climate cards in this same panel
 * format the identical "N% sampled coverage" phrase (`meteorology.ts`
 * `coverageText`), so two cards describing one boundary and month never round
 * the same quantity differently. It also clears the float noise that makes
 * `0.6 * 100` land at 60.000000000000006.
 */
function formatCoveragePercent(fraction: number): string {
  return Number((fraction * 100).toPrecision(5)).toString();
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
    case "snow":
      return scaleValue(value, PROBE_SCALES.snow);
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
    case "snow":
      return value;
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
    case "snow":
      return `${Math.round(value)}%`;
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
    // Percentage points, not percent: the difference of two area percentages
    // is not a relative change in cover.
    case "snow":
      return `${sign}${Math.round(value)} pp`;
  }
}

function formatMonth(month: YearMonth): string {
  return `${MONTH_NAMES[month.month - 1]} ${month.year}`;
}

function daysInMonth(month: YearMonth): number {
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}
