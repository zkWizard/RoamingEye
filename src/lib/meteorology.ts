import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateMetricId,
  type MonthlyClimateObservation,
  type MonthlyClimateSummary,
} from "./climate";
import { SCALE_CONVERSIONS } from "./colormap";
import { classifyModality } from "./observationModality";
import { compareYm, type LayerId, type YearMonth } from "./timeline";
import {
  toConventionalClimateValue,
  type ConventionalClimateValue,
} from "./climateConventionalUnits";
import {
  airTemperaturePlausibility,
  formatAirTemperaturePlausibility,
  type AirTemperaturePlausibilityStatus,
} from "./airTemperaturePlausibility";
import {
  formatPrecipitationRatePlausibility,
  precipitationRatePlausibility,
  type PrecipitationRatePlausibilityStatus,
} from "./precipitationRatePlausibility";
import { precipitationAccumulation } from "./precipitationAccumulation";
import { describePrecipitationAccumulationChange } from "./precipitationAccumulationChange";
import { monthOverMonthCoverageSupport } from "./climateChangeSupport";
import type { GeometrySamplingStrategy } from "./geojson";
import type {
  PlaceObservationInput,
  PlaceObservationUnavailableReason,
} from "./placeObservationExport";

/**
 * Bridges sampled GIBS rendered imagery into the climate contracts.
 *
 * Some rendered colormaps are multiplied for display (GLDAS precipitation,
 * for example, is shown as mm/day). This adapter reverses that explicit
 * multiplier before constructing observations, so climate consumers always
 * receive the cited product's native units. It never fills a missing sample
 * or infers a value from a neighbouring month.
 */

const CLIMATE_METRIC_BY_LAYER: Partial<Record<LayerId, ClimateMetricId>> = {
  precip: "precipitation-rate",
  airtemp: "air-temperature-2m",
  soil: "soil-moisture",
};

const CLIMATE_LAYER_BY_METRIC: Record<
  ClimateMetricId,
  "precip" | "airtemp" | "soil"
> = {
  "precipitation-rate": "precip",
  "air-temperature-2m": "airtemp",
  "soil-moisture": "soil",
};

export interface RenderedClimateSampleInput {
  metricId: ClimateMetricId;
  months: readonly YearMonth[];
  /** Values decoded from rendered imagery, before conversion back to native units. */
  sampledValues: readonly (number | null)[];
  /**
   * Explicit multiplier used from native product units to sampled values.
   * A value of 86,400 means kg/mÂ²/s was sampled as mm/day; one means native.
   */
  nativeToSampledValueFactor: number;
  /** Area-weighted usable share for each corresponding month, if supplied. */
  validFractions?: readonly number[];
  /** Rendered source-image dimensions; provenance only, never resolution. */
  sourceImageDimensions?: { width: number; height: number };
  /**
   * Month-aligned rendered source-image dimensions. Null explicitly records
   * that dimensions were unavailable for that month. When supplied, this
   * takes precedence over the series-level fallback above.
   */
  sourceImageDimensionsByMonth?: readonly ({
    width: number;
    height: number;
  } | null)[];
  /** Spatial method used by the place sampler for every supplied month. */
  geometrySamplingStrategy?: GeometrySamplingStrategy;
}

export interface RenderedClimateSeries {
  kind: "rendered-monthly-climate-observations";
  /** Explicitly prevents callers from treating image samples as forecasts. */
  isForecast: false;
  metric: (typeof CLIMATE_METRICS)[ClimateMetricId];
  nativeToSampledValueFactor: number;
  observations: MonthlyClimateObservation[];
}

/** Map a RoamingEye layer to a climate metric, or null for non-climate layers. */
export function climateMetricForLayer(
  layerId: LayerId
): ClimateMetricId | null {
  return CLIMATE_METRIC_BY_LAYER[layerId] ?? null;
}

/**
 * Convert one rendered monthly series into native-unit climate observations.
 * Positional arrays are deliberately required to have matching lengths to
 * prevent accidentally attaching one month's coverage or value to another.
 */
export function observationsFromRenderedClimateSample(
  input: RenderedClimateSampleInput
): RenderedClimateSeries {
  const {
    months,
    sampledValues,
    validFractions,
    sourceImageDimensionsByMonth,
    nativeToSampledValueFactor,
  } = input;
  if (months.length !== sampledValues.length) {
    throw new Error(
      "RoamingEye: rendered climate months and sampled values must have matching lengths"
    );
  }
  if (validFractions && validFractions.length !== months.length) {
    throw new Error(
      "RoamingEye: rendered climate months and coverage must have matching lengths"
    );
  }
  if (
    sourceImageDimensionsByMonth &&
    sourceImageDimensionsByMonth.length !== months.length
  ) {
    throw new Error(
      "RoamingEye: rendered climate months and image provenance must have matching lengths"
    );
  }
  assertStrictlyIncreasingMonths(months);
  if (
    !Number.isFinite(nativeToSampledValueFactor) ||
    nativeToSampledValueFactor <= 0
  ) {
    throw new Error(
      "RoamingEye: native-to-sampled climate value factor must be positive"
    );
  }
  const layerId = CLIMATE_LAYER_BY_METRIC[input.metricId];
  const expectedFactor = SCALE_CONVERSIONS[layerId]?.factor ?? 1;
  if (nativeToSampledValueFactor !== expectedFactor) {
    throw new Error(
      `RoamingEye: ${input.metricId} rendered samples require native-to-sampled factor ${expectedFactor}`
    );
  }

  return {
    kind: "rendered-monthly-climate-observations",
    isForecast: false,
    metric: CLIMATE_METRICS[input.metricId],
    nativeToSampledValueFactor,
    observations: months.map((dataMonth, index) => {
      const monthDimensions = sourceImageDimensionsByMonth
        ? sourceImageDimensionsByMonth[index]
        : input.sourceImageDimensions;
      return {
        metricId: input.metricId,
        // Keep the sampled value bound to the month supplied at sampling time,
        // even when a caller later reuses or advances its timeline month object.
        dataMonth: { ...dataMonth },
        value:
          sampledValues[index] === null
            ? null
            : sampledValues[index] / nativeToSampledValueFactor,
        ...(validFractions ? { validFraction: validFractions[index] } : {}),
        ...(monthDimensions === undefined
          ? {}
          : {
              sourceImageDimensions: monthDimensions
                ? { ...monthDimensions }
                : null,
            }),
        ...(input.geometrySamplingStrategy
          ? { geometrySamplingStrategy: input.geometrySamplingStrategy }
          : {}),
      };
    }),
  };
}

function assertStrictlyIncreasingMonths(months: readonly YearMonth[]): void {
  let previousOrdinal: number | null = null;
  for (const month of months) {
    if (
      !Number.isInteger(month.year) ||
      !Number.isInteger(month.month) ||
      month.month < 1 ||
      month.month > 12
    ) {
      throw new Error(
        "RoamingEye: rendered climate series contains an invalid data month"
      );
    }

    const ordinal = month.year * 12 + month.month - 1;
    if (previousOrdinal !== null && ordinal <= previousOrdinal) {
      throw new Error(
        "RoamingEye: rendered climate data months must be unique and strictly increasing"
      );
    }
    previousOrdinal = ordinal;
  }
}

/** Summarize every supplied image-sampled month against one availability checkpoint. */
export function summarizeRenderedClimateSample(
  input: RenderedClimateSampleInput,
  availableThrough: YearMonth
): MonthlyClimateSummary[] {
  return observationsFromRenderedClimateSample(input).observations.map(
    (observation) => summarizeMonthlyClimate(observation, availableThrough)
  );
}

/**
 * Prepare rendered climate months for the place-observation export contract.
 *
 * Values remain in sampled/display units here because
 * `placeObservationProductFromSample` performs the cited native-unit
 * conversion exactly once. Unusable observations are withheld instead of
 * allowing a non-finite or physically impossible value to invalidate the
 * entire download — including a value the metric's cited gross-error band
 * rejects (see `implausibleValueReason`), which no longer reaches the export
 * as a measurement.
 */
export function exportObservationsFromRenderedClimateSample(
  input: RenderedClimateSampleInput,
  availableThrough: YearMonth
): PlaceObservationInput[] {
  const summaries = summarizeRenderedClimateSample(input, availableThrough);

  return summaries.map((summary, index) => {
    if (
      summary.publicationStatus === "published" &&
      summary.coverage.status === "available" &&
      summary.observedValue !== null &&
      implausibleValueReason(summary) === null
    ) {
      return {
        dataMonth: summary.dataMonth,
        value: input.sampledValues[index],
        ...(summary.coverage.validFraction !== null
          ? { validFraction: summary.coverage.validFraction }
          : {}),
      };
    }

    return {
      dataMonth: summary.dataMonth,
      value: null,
      unavailableReason: exportUnavailableReason(summary),
      ...(summary.coverage.validFraction !== null
        ? { validFraction: summary.coverage.validFraction }
        : {}),
    };
  });
}

export type ClimatePlausibilityStatus =
  "plausible" | "implausible" | "not-checked";

export interface ClimatePlausibilityVerdict {
  status: ClimatePlausibilityStatus;
  /**
   * The band verdict with its cited source, or why no band was applied.
   * Callers surface this verbatim rather than restating the bounds.
   */
  statement: string;
}

/**
 * Apply the metric-appropriate gross-error plausibility band to one rendered
 * monthly observation.
 *
 * Rendered-imagery sampling can fail in ways `climate.ts` cannot catch: it only
 * guards sign and finiteness, so an unconverted °C figure, a mm/day rate left
 * unscaled, or a colormap decode error still arrives as a "usable" native
 * value. The atmospheric bands are deliberately far wider than any real monthly
 * mean, so a genuine extreme is never flagged — only physically impossible
 * readings are.
 *
 * `not-checked` is returned for soil moisture, which has no band defined here,
 * and for observations with no usable value to check. It is never a pass:
 * a `plausible` result is a gross-error sanity pass, not a correctness claim.
 */
export function climateObservationPlausibility(
  summary: MonthlyClimateSummary
): ClimatePlausibilityVerdict {
  const airTemperature = airTemperaturePlausibility(summary);
  if (airTemperature) {
    return {
      status: bandStatus(airTemperature.status),
      statement: formatAirTemperaturePlausibility(airTemperature),
    };
  }

  const precipitation = precipitationRatePlausibility(summary);
  if (precipitation) {
    return {
      status: bandStatus(precipitation.status),
      statement: formatPrecipitationRatePlausibility(precipitation),
    };
  }

  return {
    status: "not-checked",
    statement: `No gross-error plausibility band is defined for ${summary.metric.label}`,
  };
}

/**
 * Collapse a metric-specific band verdict onto the shared status. Every
 * non-`plausible`, checkable verdict is treated as implausible, so a new
 * failure mode added to a band is withheld by default rather than displayed.
 */
function bandStatus(
  status: AirTemperaturePlausibilityStatus | PrecipitationRatePlausibilityStatus
): ClimatePlausibilityStatus {
  if (status === "not-usable") return "not-checked";
  return status === "plausible" ? "plausible" : "implausible";
}

export interface ClimateInsightText {
  value: string;
  detail: string;
}

/**
 * Format one current and optional previous native-unit monthly observation for
 * the place panel. This is a measurement readout only: no forecast, anomaly,
 * diagnosis, or risk interpretation is added.
 */
export function climateInsightText(
  previous: MonthlyClimateSummary | undefined,
  current: MonthlyClimateSummary
): ClimateInsightText {
  const source = `${current.metric.source.shortName} v${current.metric.source.version}`;
  const sourceVariable = `GIBS layer ${current.metric.sourceLayer}`;
  const month = formatMonth(current.dataMonth);
  const modality = climateModalityText(current);
  const provenance = imageProvenance(current.sourceImageDimensions);
  const coverage = coverageText(current.coverage.validFraction);
  const sampling = samplingText(current.geometrySamplingStrategy);
  const implausible = implausibleValueReason(current);
  if (
    current.publicationStatus !== "published" ||
    current.coverage.status !== "available" ||
    current.observedValue === null ||
    implausible !== null
  ) {
    return {
      value: "Unavailable",
      detail: `No usable ${month} ${modality.field} (${
        implausible ?? unavailableReason(current)
      }); ${sampling}; ${coverage}; ${provenance}; ${
        modality.limit
      }; ${sourceVariable}; source ${source}`,
    };
  }

  // A value outside the metric's gross-error band is a unit/decode failure,
  // not an observation, so it is withheld rather than shown as a measurement.
  const plausibility = climateObservationPlausibility(current);
  if (plausibility.status === "implausible") {
    return {
      value: "Unavailable",
      detail: `Withheld ${month} ${modality.field}: ${plausibility.statement}; ${sampling}; ${coverage}; ${provenance}; ${modality.limit}; ${sourceVariable}`,
    };
  }

  const conventional = toConventionalClimateValue(current);
  const value =
    conventional?.value !== null && conventional
      ? formatNativeValue(conventional.value, conventional.conventionalUnit)
      : formatNativeValue(current.observedValue, current.metric.nativeUnit);
  const previousUsable =
    previous?.publicationStatus === "published" &&
    previous.coverage.status === "available" &&
    previous.observedValue !== null;
  const comparisonIssue = previous
    ? climateComparisonIssue(previous, current)
    : null;
  const nativeDelta =
    previousUsable &&
    previous?.observedValue !== null &&
    comparisonIssue === null
      ? current.observedValue - previous.observedValue
      : null;
  // Each month's value aggregates only that month's usable pixels, so when the
  // two months' coverage differs part of the difference is a change in which
  // ground was aggregated. The pixel masks are gone by this point, so the
  // readout states the tightest bound the two coverage fractions permit rather
  // than letting a difference imply fixed common ground.
  const sharedSupport =
    nativeDelta !== null
      ? monthOverMonthCoverageSupport(previous!, current).statement
      : null;
  const comparison =
    nativeDelta !== null
      ? `; ${formatNativeDelta(
          conventional
            ? nativeDelta * conventional.conversion.scale
            : nativeDelta,
          conventional?.conventionalUnit ?? current.metric.nativeUnit
        )} vs ${formatMonth(previous!.dataMonth)}${
          sharedSupport ? ` (${sharedSupport})` : ""
        }`
      : comparisonIssue
        ? `; comparison unavailable (${comparisonIssue})`
        : "";
  const nativeProvenance = conventional
    ? `; native source value ${formatNativeValue(
        current.observedValue,
        current.metric.nativeUnit
      )} (${conventional.conversion.basis})`
    : "";
  // A mean rate says how hard it rained; the plainest hydrologic question about
  // a month is how much fell, and precipitation climatology is conventionally
  // reported as a monthly total. That total is the exact integration of the
  // reported mean rate over the month's own calendar length, so it is stated
  // alongside the rate — never in place of it — with the month length shown,
  // because month length is part of why two months' totals differ. Non-
  // precipitation metrics yield null here and gain no clause.
  const accumulated = precipitationAccumulation(current);
  const accumulation = accumulated
    ? `; ${accumulated.monthDays}-day total ${formatNumber(
        accumulated.totalMm
      )} mm water-equivalent (mean rate integrated over the calendar month)`
    : "";
  // The rate difference above answers "did it rain harder?"; on its own it
  // cannot answer "did more water fall?", because each month's total integrates
  // the rate over that month's own calendar length. The two questions can
  // disagree in sign — 31 days at 3 mm/day delivers more water than a following
  // 28 days at 3.2 mm/day — so the change in total depth is stated rather than
  // left for the reader to reconstruct from two differently-long months.
  const accumulationChange =
    nativeDelta !== null && previous
      ? accumulationChangeClause(previous, current)
      : "";
  // The coverage percentage alone cannot say whether the missing area was
  // unpublished or merely unrepresentable, and only the latter biases the mean.
  const rampShortfall = rampShortfallCaveat(current, conventional);
  return {
    value,
    detail: `${month} ${modality.field}${comparison}${accumulation}${accumulationChange}${nativeProvenance}; ${coverage}${rampShortfall}; ${provenance}; ${sampling}; ${modality.limit}; ${sourceVariable}; source ${source}`,
  };
}

/**
 * The open, unbounded end caps each climate layer's published GIBS colormap
 * carries beyond its finite ramp, in the metric's native unit.
 *
 * Read from the colormap documents these layers are sampled through
 * (`COLORMAP_DOCS`) on 2026-08-13. `parseColormapEntries` keeps only the finite
 * bins, so a cap has no entry to invert against, and the cap colours sit 71–77
 * Euclidean RGB units from the nearest finite ramp colour — well beyond
 * `NO_DATA_DISTANCE` (60). A pixel painted with a cap colour is therefore
 * *rejected as no-data*, not clipped to the ramp end: it never enters the
 * area-weighted regional mean, and its area lands in the coverage shortfall.
 *
 * That is what makes a shortfall on these layers ambiguous in a way the bare
 * percentage cannot show. It is the reason for the caveat below, and it is a
 * statement about the rendered colour ramp only — never a claim that any
 * particular place actually had out-of-range ground.
 *
 * Only caps a real observation can reach are listed. GLDAS publishes a
 * `[-INF, 0)` cap for both precipitation rate and soil moisture; neither is
 * reachable for a non-negative quantity, so recording them would invent a
 * shortfall explanation that cannot occur.
 */
const RAMP_END_CAPS: Record<
  ClimateMetricId,
  { belowNative: number | null; atOrAboveNative: number }
> = {
  // MERRA2_2m_Air_Temperature_Monthly: "[-INF,220)" and "≥ 310" (K). Both are
  // reachable by a real monthly mean — the East Antarctic plateau runs below
  // 220 K in winter, and the Sahara and Arabian Peninsula approach 310 K in
  // July — so this ramp is capped at both ends.
  "air-temperature-2m": { belowNative: 220, atOrAboveNative: 310 },
  // GLDAS_Surface_Total_Precipitation_Rate_Monthly: "[5.0e-04,+INF)" kg/m²/s,
  // i.e. 43.2 mm/day, which monsoon-core monthly means exceed.
  "precipitation-rate": { belowNative: null, atOrAboveNative: 5.0e-4 },
  // GLDAS_Underground_Soil_Moisture_Monthly: "[50.0,+INF)" kg/m².
  "soil-moisture": { belowNative: null, atOrAboveNative: 50 },
};

/**
 * Qualify a coverage shortfall that may not be absent data at all.
 *
 * The percentage beside a place reading says how much of the sampled area
 * yielded a value, and a reader reasonably takes the rest to be ground the
 * source never published — ocean fill, a missing granule, cloud. On these three
 * layers it can instead be ground whose true value the legend cannot represent
 * (see {@link RAMP_END_CAPS}), and that difference matters: dropped out-of-range
 * pixels are not a random sample of the place, they are its extreme tail, so the
 * mean of what remains is pulled toward the ramp's interior.
 *
 * The caveat therefore names the possibility and says what the reported value
 * is a mean *over*. It never estimates the dropped area, attributes the
 * shortfall to any cause, or corrects the value — the pixel masks are gone by
 * this point and the discarded colours carry no recoverable magnitude.
 *
 * Silent when coverage is complete (every sampled pixel inverted, so there is
 * no dropped area to attribute) or unsupplied (no shortfall to qualify).
 */
function rampShortfallCaveat(
  summary: MonthlyClimateSummary,
  conventional: ConventionalClimateValue | null
): string {
  const validFraction = summary.coverage.validFraction;
  if (validFraction === null || validFraction >= 1) return "";
  const caps = RAMP_END_CAPS[summary.metric.id];
  if (!caps) return "";

  // Express the caps in whatever unit the card actually shows, using the same
  // exact conversion the displayed value used, so a bound is never stated
  // against a scale the reader is not looking at.
  const unit = conventional?.conventionalUnit ?? summary.metric.nativeUnit;
  const shown = (native: number): string =>
    formatNativeValue(
      conventional
        ? native * conventional.conversion.scale +
            conventional.conversion.offset
        : native,
      unit
    );

  const where =
    caps.belowNative === null
      ? `at or above the legend's ${shown(caps.atOrAboveNative)} ceiling`
      : `outside the legend's ${shown(caps.belowNative)} to ${shown(
          caps.atOrAboveNative
        )} range`;
  return `; the shortfall can include ground ${where}, which GIBS renders in an open end cap this probe reads as no-data, so the value is a mean over representable ground only`;
}

/**
 * State how the month's total accumulated depth compares with the month before.
 *
 * The readout already carries a mean-rate difference and this month's total, but
 * a reader cannot combine them: the totals integrate over calendar months of
 * different lengths, so a rate that rose can still deliver less water, and a
 * rate that fell can deliver more. This clause reports that comparison directly,
 * in the same mm water-equivalent the total beside it is stated in, naming the
 * earlier month's own day count so both lengths are visible on the line.
 *
 * Delegates every admissibility rule to
 * {@link describePrecipitationAccumulationChange}, which withholds a difference
 * across non-consecutive months or mixed provenance rather than inventing one.
 * The caller additionally reaches this only when the rate comparison itself was
 * permitted, so a month the gross-error band rejected never gains a total here.
 *
 * Silent — never "no change" — whenever no difference can be stated, and for
 * every metric that is not a precipitation rate.
 */
function accumulationChangeClause(
  previous: MonthlyClimateSummary,
  current: MonthlyClimateSummary
): string {
  const change = describePrecipitationAccumulationChange(previous, current);
  if (
    change.status !== "available" ||
    change.changeMm === null ||
    change.earlier === null
  ) {
    return "";
  }

  const against = `${formatMonth(change.earlier.dataMonth)}'s ${
    change.earlier.monthDays
  }-day total`;
  // Both months' day counts are already on the line, so the caveat only has to
  // say that the difference is not attributable to rate alone.
  const lengthCaveat = "part of any difference is month length, not rate";
  if (change.trend === "little-change") {
    return `; within ${formatNumber(
      change.thresholdMm
    )} mm of ${against} (${lengthCaveat})`;
  }
  return `; ${formatNumber(Math.abs(change.changeMm))} mm ${
    change.trend === "wetter" ? "more" : "less"
  } than ${against} (${lengthCaveat})`;
}

function samplingText(strategy: GeometrySamplingStrategy | null): string {
  switch (strategy) {
    case "boundary-grid":
      return "approximate regional mean from a boundary grid";
    case "boundary-point":
      return "single in-boundary image sample, not a regional mean";
    default:
      return "sampling strategy not supplied";
  }
}

function climateModalityText(summary: MonthlyClimateSummary): {
  field: string;
  limit: string;
} {
  switch (classifyModality(summary.metric.source)) {
    case "land-surface-model":
      return {
        field: "land-surface-model field",
        limit: "model-derived, not a direct measurement",
      };
    case "atmospheric-reanalysis":
      return {
        field: "atmospheric reanalysis field",
        limit: "reanalysis-derived, not a direct measurement",
      };
    case "satellite-derived-index":
      return {
        field: "satellite-derived field",
        limit: "remotely sensed, not a direct in-situ measurement",
      };
    case "unclassified":
      return {
        field: "source field",
        limit: "production method not classified",
      };
  }
}

function climateComparisonIssue(
  previous: MonthlyClimateSummary,
  current: MonthlyClimateSummary
): string | null {
  if (
    previous.metric.id !== current.metric.id ||
    previous.metric.nativeUnit !== current.metric.nativeUnit
  ) {
    return "different climate metric or native unit";
  }
  if (
    previous.metric.source.shortName !== current.metric.source.shortName ||
    previous.metric.source.version !== current.metric.source.version
  ) {
    return "different source product";
  }
  if (compareYm(previous.dataMonth, current.dataMonth) >= 0) {
    return "comparison month is not earlier";
  }
  // A change computed against an impossible value would itself be impossible.
  if (climateObservationPlausibility(previous).status === "implausible") {
    return "comparison month failed the gross-error plausibility band";
  }
  return null;
}

function unavailableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  return summary.coverage.reason ?? "unspecified";
}

/**
 * Screen a usable atmosphere observation against the gross-error plausibility
 * band published with its metric, and describe the failure when it fails.
 *
 * `climate.ts` decides whether the *source* supplied a usable value: it checks
 * the sign the quantity must carry, and nothing about magnitude. So a value
 * whose units or decode went wrong — a °C figure never converted to kelvin, a
 * mm/day rate read as kg/m²/s — still arrives here as a published, fully
 * covered observation. This screen is where such a value stops being reported
 * as a measurement.
 *
 * Deliberate limits, because callers surface this:
 *  - The bands are gross-error bands, drawn wider than any recorded extreme.
 *    Passing is a sanity check, never a correctness claim, and a real extreme
 *    month is never flagged.
 *  - Only the two atmosphere metrics have a cited band in this repo. Soil
 *    moisture returns null here rather than being judged against an invented
 *    limit.
 *  - The screen never substitutes, clamps, or repairs a value. It withholds
 *    the reading and says why.
 *
 * Returns null when the value passes, or when there is no band to judge it by.
 */
function implausibleValueReason(summary: MonthlyClimateSummary): string | null {
  const verdict =
    airTemperaturePlausibility(summary) ??
    precipitationRatePlausibility(summary);
  if (!verdict || verdict.status === "plausible") return null;
  // "not-usable" means the summary carried no value to judge; the caller's own
  // unavailability reason already covers that and is more specific.
  if (verdict.status === "not-usable") return null;
  return `${verdict.status}; ${verdict.basis}`;
}

function exportUnavailableReason(
  summary: MonthlyClimateSummary
): PlaceObservationUnavailableReason {
  if (
    summary.publicationStatus !== "published" ||
    summary.coverage.status === "invalid" ||
    // A value the cited band rejects is a unit/decode failure of our own
    // sampling, not a gap in what the source published. Reporting it as
    // thin coverage would blame the source for our mistake.
    implausibleValueReason(summary) !== null
  ) {
    return "sampling-failed";
  }
  return (summary.coverage.validFraction ?? 0) > 0
    ? "insufficient-valid-coverage"
    : "source-no-data";
}

function coverageText(validFraction: number | null): string {
  return validFraction === null
    ? "sampled coverage not supplied"
    : `${formatNumber(validFraction * 100)}% sampled coverage`;
}

function imageProvenance(
  dimensions: MonthlyClimateSummary["sourceImageDimensions"]
): string {
  return dimensions
    ? `rendered source image ${dimensions.width} x ${dimensions.height} px`
    : "rendered source image dimensions not supplied";
}

function formatNativeValue(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit}`;
}

function formatNativeDelta(value: number, unit: string): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)} ${unit}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}

function formatMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}
