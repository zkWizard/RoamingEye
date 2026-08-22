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
import {
  precipitationAccumulation,
  type PrecipitationAccumulation,
} from "./precipitationAccumulation";
import {
  describePrecipitationAccumulationChange,
  type PrecipitationAccumulationChange,
} from "./precipitationAccumulationChange";
import {
  describePrecipitationAccumulationResolvability,
  precipitationInversionRmseMmPerDay,
  precipitationTotalInversionRmseMm,
  PRECIP_INVERSION_REPORTED_UNIT,
  PRECIPITATION_RATE_METRIC_ID,
} from "./precipitationAccumulationResolvability";
import {
  AIR_TEMPERATURE_METRIC_ID,
  airTemperatureInversionRmseK,
  describeAirTemperatureChangeResolvability,
} from "./airTemperatureChangeResolvability";
import {
  describeAirTemperatureFreezeSeparation,
  FREEZING_POINT_K,
} from "./airTemperatureFreeze";
import { justifiedRoundingPlace, roundToPlace } from "./briefValuePrecision";
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
 *
 * `transportFailureByMonth` marks the months whose source imagery never
 * arrived (see `lib/probeRetrievalFailure.ts`). Without it such a month
 * reaches this builder indistinguishable from one the source left blank — no
 * value, zero coverage, published range intact — and leaves the download
 * carrying `source-no-data` against MERRA-2 or GLDAS by name, a
 * machine-readable assertion that NASA published nothing for the place on the
 * strength of a request that never completed. It is month-aligned and
 * optional: a caller that cannot tell the two apart keeps the previous
 * reading of the coverage share rather than guessing.
 *
 * @param transportFailureByMonth month-aligned, from `SampleResult`
 */
export function exportObservationsFromRenderedClimateSample(
  input: RenderedClimateSampleInput,
  availableThrough: YearMonth,
  transportFailureByMonth: readonly boolean[] = []
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
      unavailableReason: exportUnavailableReason(
        summary,
        transportFailureByMonth[index] === true
      ),
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
  // The total is rendered by the same five-figure helper as the rate it was
  // integrated from, but its error is that rate's error integrated too — a
  // third justified place on this one line — so it carries its own caveat.
  const accumulated = precipitationAccumulation(current);
  const accumulation = accumulated
    ? `; ${accumulated.monthDays}-day total ${formatNumber(
        accumulated.totalMm
      )} mm water-equivalent (mean rate integrated over the calendar month)${precipitationTotalPrecisionCaveat(
        accumulated
      )}`
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
  // The precipitation difference above is qualified against its own inversion
  // floor inside the accumulation clause. The air-temperature difference had no
  // such qualification, yet it is rendered to five significant figures — and its
  // floor is easy to miss precisely because kelvin-to-Celsius is offset-only, so
  // the published kelvin error and the printed Celsius difference are already
  // the same scale with no conversion step to prompt the comparison.
  const changeFloor =
    nativeDelta !== null ? airTemperatureFloorCaveat(current, nativeDelta) : "";
  // The floor above qualifies the difference. The absolute value the card leads
  // with is rendered by the same five-figure helper and, unlike the difference,
  // is shown for a single month with no comparison at all — so it carries the
  // same false precision with nothing on the line to qualify it.
  const valuePrecision = valuePrecisionCaveat(current, conventional);
  // The coverage percentage alone cannot say whether the missing area was
  // unpublished or merely unrepresentable, and only the latter biases the mean.
  const rampShortfall = rampShortfallCaveat(current, conventional);
  // The caveat above qualifies this month's mean. A difference is taken against
  // an earlier mean that was censored to its own, different degree.
  const comparisonShortfall =
    nativeDelta !== null && previous ? comparisonShortfallCaveat(previous) : "";
  return {
    value,
    detail: `${month} ${modality.field}${comparison}${accumulation}${accumulationChange}${changeFloor}${valuePrecision}${nativeProvenance}; ${coverage}${rampShortfall}${comparisonShortfall}; ${provenance}; ${sampling}; ${modality.limit}; ${sourceVariable}; source ${source}`,
  };
}

/**
 * Which step of a place-metric card's sampling failed.
 *
 * The shared terrestrial path resolves the layer's published GIBS colormap
 * document before it touches the searched boundary, so a thrown failure belongs
 * to exactly one of these two steps.
 */
export type PlaceMetricUnavailableReason =
  "source-colormap-unavailable" | "boundary-sampling-failed";

/**
 * Detail line for a place-metric card whose value could not be sampled.
 *
 * Attribute the failure to the step that actually failed, never to a cause the
 * caught error does not establish. Everything after the colormap resolves is
 * this app's own sampling of the boundary, not the cited document — so a
 * stalled GIBS tile request must not read as a fault in the published source,
 * and a colormap that could not be read must not read as a fault in the place
 * the reader searched.
 *
 * The sampling-step wording is deliberately broad: that step covers a boundary
 * with no representable interior cells, an unavailable decode canvas, and a
 * failed tile request alike (`ProbeSampler`), and the shared catch cannot tell
 * them apart. Naming any single one of them would state a cause that has not
 * been established. Neither branch reports a measurement.
 *
 * The wording matches the land-surface-temperature, aerosol, and marine cards,
 * which sample through the same colormap-then-boundary sequence and fail
 * together in one upstream stall — one event must not draw two different
 * explanations from one panel.
 */
export function placeMetricUnavailableDetail(
  reason: PlaceMetricUnavailableReason
): string {
  return reason === "source-colormap-unavailable"
    ? "Metric could not be sampled from the published source colormap"
    : "Metric could not be sampled for the searched boundary";
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
 * Qualify a month-over-month difference taken between two differently censored
 * means.
 *
 * {@link rampShortfallCaveat} qualifies the *displayed* month's own shortfall,
 * but the card also reports a difference against an earlier month, and that
 * month carries a shortfall of its own. Dropped end-capped pixels are the
 * place's extreme tail rather than a random sample of it, so each month's mean
 * is pulled toward the ramp's interior by however much of its own area the
 * legend could not represent — and a difference between two such means carries
 * the change in that pull as well as any change in the field.
 *
 * The gap this closes is an asymmetry, and it is widest in the case that reads
 * most confidently: when the displayed month is fully covered,
 * `rampShortfallCaveat` is silent, so the reader sees a bare difference against
 * an earlier mean that quietly omitted its own extreme tail, with nothing on
 * the card to suggest it. `monthOverMonthCoverageSupport` does not cover this —
 * it bounds *how much ground* the two months share and says so explicitly for
 * spatial sampling only, never that the unshared ground is the tail rather than
 * an arbitrary part of the place.
 *
 * This states the possibility and stops. It never estimates the omitted area on
 * either side, signs the resulting bias — air temperature's ramp is capped at
 * both ends, so its pull can go either way — or corrects the difference.
 *
 * Silent when no difference is reported, when the earlier month's coverage is
 * complete (nothing was dropped) or unsupplied (no shortfall to qualify), and
 * when the metric's legend has no reachable cap (see {@link RAMP_END_CAPS}).
 */
function comparisonShortfallCaveat(previous: MonthlyClimateSummary): string {
  const validFraction = previous.coverage.validFraction;
  if (validFraction === null || validFraction >= 1) return "";
  if (!RAMP_END_CAPS[previous.metric.id]) return "";
  return `; the ${formatMonth(
    previous.dataMonth
  )} mean it is differenced against is itself a mean over representable ground only, so part of the difference can be a change in what the legend could represent rather than in the field`;
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
    change.earlier === null ||
    change.later === null ||
    change.source === null
  ) {
    return "";
  }

  const against = `${formatMonth(change.earlier.dataMonth)}'s ${
    change.earlier.monthDays
  }-day total`;
  // Both months' day counts are already on the line, so the caveat only has to
  // say that the difference is not attributable to rate alone.
  const lengthCaveat = "part of any difference is month length, not rate";
  const caveats = `${lengthCaveat}${inversionFloorCaveat(change)}`;
  if (change.trend === "little-change") {
    return `; within ${formatNumber(
      change.thresholdMm
    )} mm of ${against} (${caveats})`;
  }
  return `; ${formatNumber(Math.abs(change.changeMm))} mm ${
    change.trend === "wetter" ? "more" : "less"
  } than ${against} (${caveats})`;
}

/**
 * Say when the two totals are closer together than the pipeline's own measured
 * colormap inversion can separate.
 *
 * The clause above names a direction, or calls the pair little-change inside a
 * 1 mm reporting band. Neither total was measured: each is a rendered pixel
 * colour inverted through an approximate legend gradient and then *integrated
 * over a calendar month*, which multiplies the layer's measured rate error by
 * that month's day count. At the currently measured figure the resulting floor
 * on a difference of two months is around 11 mm — an order of magnitude above
 * the 1 mm band, and above many differences the clause happily calls wetter or
 * drier. See {@link describePrecipitationAccumulationResolvability}, which
 * derives the floor from both months' own lengths and never re-derives the
 * published error.
 *
 * The statement is deliberately about the two totals, not about the direction
 * word: it never asserts the months delivered the same water, and it never
 * reverses the reported direction.
 *
 * Silent when the difference clears the floor, and when the layer carries no
 * measured inversion figure in the unit the published error is documented in —
 * an unmeasured error is not a passed test.
 */
function inversionFloorCaveat(change: PrecipitationAccumulationChange): string {
  if (change.earlier === null || change.later === null) return "";
  if (change.source === null) return "";
  const resolvability = describePrecipitationAccumulationResolvability(
    change.changeMm,
    change.earlier.monthDays,
    change.later.monthDays,
    change.source
  );
  if (
    resolvability === null ||
    resolvability.resolution !== "unresolved" ||
    resolvability.differenceFloorMm === null
  ) {
    return "";
  }
  return `; the two totals differ by less than the ${formatNumber(
    resolvability.differenceFloorMm
  )} mm colormap-inversion difference floor for these month lengths, so this pipeline cannot separate them`;
}

/**
 * Say when two monthly air-temperature means are closer together than the
 * pipeline's own measured colormap inversion can separate.
 *
 * The readout prints the difference to five significant figures with no
 * indication of how well it is known. Neither month was measured: each is a
 * rendered pixel colour inverted through an approximate legend gradient, and
 * differencing two independently inverted months puts a floor of
 * `sqrt(2) x RMSE` — about 0.69 K at the currently measured figure — under any
 * difference the line reports. See
 * {@link describeAirTemperatureChangeResolvability}, which never re-derives the
 * published error.
 *
 * Scoped to air temperature deliberately. Precipitation carries its own
 * accumulation-aware floor in {@link inversionFloorCaveat}, whose error scales
 * with each month's length; soil moisture lies outside the atmospheric domain
 * this module owns and gains no clause here.
 *
 * The statement is about the pair of means, not about the printed difference:
 * it never asserts the months were equally warm, and it never removes or
 * reverses the difference shown beside it.
 *
 * Silent when the difference clears the floor, and when the layer carries no
 * measured inversion figure in the unit the published error is documented in —
 * an unmeasured error is not a passed test.
 */
function airTemperatureFloorCaveat(
  current: MonthlyClimateSummary,
  nativeDelta: number
): string {
  if (current.metric.id !== AIR_TEMPERATURE_METRIC_ID) return "";
  const resolvability = describeAirTemperatureChangeResolvability(
    nativeDelta,
    current.metric.source
  );
  if (
    resolvability === null ||
    resolvability.resolution !== "unresolved" ||
    resolvability.differenceFloorK === null
  ) {
    return "";
  }
  // The floor is quoted in K because that is the unit the published error is
  // documented in; the printed difference is in °C and is the same number,
  // which the clause says outright rather than leaving to the reader.
  return `; the two monthly means differ by less than the ${formatNumber(
    resolvability.differenceFloorK
  )} K colormap-inversion difference floor — the same figure in °C, an offset-only conversion — so this pipeline cannot separate them`;
}

/**
 * Say how coarsely the measured inversion error lets this month's air
 * temperature be written at all.
 *
 * The caveat above qualifies the *difference* between two months. This one
 * qualifies the single absolute value the card leads with, which is rendered by
 * the same five-significant-figure helper and carries no qualification today: a
 * 287.385 K sample is shown as "14.235 °C", four digits past what a ±0.485 K
 * inversion error can fix. The convention applied is the standard
 * significant-figure / GUM practice already implemented in
 * `briefValuePrecision`: the least-significant digit of a reported value sits at
 * the order of magnitude of its standard uncertainty.
 *
 * Only the *rounding place* is taken from that module, never its
 * significant-figure count, and the reason is the same offset that makes the
 * difference floor unit-invariant. Under an offset-only conversion the absolute
 * uncertainty is unchanged, so the justified rounding place is identical in K
 * and in °C — but the figure *count* is not, because the conversion moves the
 * value across decades: 287.385 K and 14.235 °C are one measurement rounded to
 * one place, yet that is four justified figures in K and three in °C. (A scaled
 * conversion is the exact mirror: it preserves the figure count and shifts the
 * place, as kg/m²/s → mm/day does for precipitation.) A count copied across the
 * conversion would therefore be wrong in a way a place is not, so the clause
 * states the place and the rounded value and claims nothing about figures.
 *
 * Silent when the rendered value already sits at the justified place, and when
 * the layer carries no measured figure in the unit the published error is
 * documented in — an unmeasured error is not a passed test. It bounds how the
 * number should be written; it makes no anomaly, trend, cause, or forecast
 * claim, and it never restates or replaces the reported value.
 */
function airTemperatureValuePrecisionCaveat(
  current: MonthlyClimateSummary,
  conventional: ConventionalClimateValue | null
): string {
  if (current.metric.id !== AIR_TEMPERATURE_METRIC_ID) return "";
  if (current.observedValue === null) return "";
  // Null unless the published figure is still documented in K and the
  // kelvin-to-Celsius conversion is still offset-only — the one condition that
  // lets a kelvin error fix the rounding of a Celsius number.
  const rmseK = airTemperatureInversionRmseK();
  if (rmseK === null) return "";
  const place = justifiedRoundingPlace(rmseK);
  if (place === null) return "";

  // The displayed number: the conventional °C value where one exists, else the
  // native kelvin value. The offset-only guard above means both share the place.
  const shown =
    conventional && conventional.value !== null
      ? { value: conventional.value, unit: conventional.conventionalUnit }
      : { value: current.observedValue, unit: current.metric.nativeUnit };

  const rounded = roundToPlace(shown.value, place);
  // Compare what the card prints against what it would print rounded, rather
  // than counting digits: the rendering collapses trailing zeros, so only the
  // rendered strings can say whether any unjustified digit is actually shown.
  if (formatNumber(shown.value) === formatNumber(rounded)) return "";

  return `; the ${formatNumber(rmseK)} K measured colormap-inversion error justifies reporting this mean only to the nearest ${formatNumber(
    10 ** place
  )} ${shown.unit} (${formatNumber(rounded)} ${shown.unit})`;
}

/**
 * Say how coarsely the measured inversion error lets this month's precipitation
 * rate be written at all.
 *
 * The air-temperature clause above makes the same statement for the other
 * five-significant-figure value this formatter leads with. The two cannot share
 * one derivation, because the conversion standing between the published error
 * and the printed number is a different kind in each case, and the difference
 * decides which fact about the number survives it:
 *
 * | conversion | justified rounding place | significant-figure count |
 * | --- | --- | --- |
 * | offset-only (K → °C) | invariant | changes |
 * | scaled (kg/m²/s → mm/day) | shifts | invariant |
 *
 * Precipitation is the scaled case. The published figure — 0.27 mm/day at the
 * currently measured value — is documented in mm/day, the same 86,400× scaling
 * the card applies to reach the rate it prints, so it fixes the place of *that*
 * number and of no other on the line. The identical error expressed natively is
 * 3.125e-6 kg/m²/s, whose justified place is 10^-6 rather than 10^-1: five
 * decimal places away from the one quoted here, even though both express one
 * error on one measurement. What the scaling does leave intact is the figure
 * *count* — two, in either unit — which is exactly the half the offset case
 * loses. So this clause names the place only after pinning the unit, and the
 * air-temperature clause names the place because an offset cannot move it.
 *
 * The consequence for the guard is concrete rather than theoretical: the same
 * detail line prints `native source value 0.0001 kg/m²/s` a few clauses later.
 * Quoting a mm/day-derived place against that number would be wrong by five
 * decimal places, so the clause withholds unless the value it is qualifying is
 * itself displayed in the unit the error is published in, rather than assuming
 * the conventional conversion is the only one the card could ever apply.
 *
 * Silent when the rendered rate already sits at the justified place, and when
 * the layer carries no measured figure in that unit — an unmeasured error is
 * not a passed test. It bounds how the number should be written; it makes no
 * anomaly, trend, cause, or forecast claim, it says nothing about the monthly
 * total on the same line (whose error is this rate error integrated over the
 * month, a third place again), and it never restates or replaces the reported
 * value.
 */
function precipitationValuePrecisionCaveat(
  current: MonthlyClimateSummary,
  conventional: ConventionalClimateValue | null
): string {
  if (current.metric.id !== PRECIPITATION_RATE_METRIC_ID) return "";
  if (current.observedValue === null) return "";
  // Null unless the published figure is still documented in mm/day.
  const rateRmse = precipitationInversionRmseMmPerDay();
  if (rateRmse === null) return "";
  const place = justifiedRoundingPlace(rateRmse);
  if (place === null) return "";

  // Under a scaled conversion the place belongs to one unit, so the clause is
  // withheld unless the card is actually leading with the mm/day rate the
  // published figure describes.
  if (conventional === null || conventional.value === null) return "";
  if (conventional.conventionalUnit !== PRECIP_INVERSION_REPORTED_UNIT) {
    return "";
  }

  const rounded = roundToPlace(conventional.value, place);
  // Compare what the card prints against what it would print rounded, rather
  // than counting digits: the rendering collapses trailing zeros, so only the
  // rendered strings can say whether any unjustified digit is actually shown.
  if (formatNumber(conventional.value) === formatNumber(rounded)) return "";

  if (roundsAwayToZero(conventional.value, rounded)) {
    return `; this rate is smaller than the ${formatNumber(
      rateRmse
    )} ${PRECIP_INVERSION_REPORTED_UNIT} measured colormap-inversion error, so no digit of it is justified and it is not resolved from zero — which is not a report that no rain fell`;
  }

  return `; the ${formatNumber(rateRmse)} ${PRECIP_INVERSION_REPORTED_UNIT} measured colormap-inversion error justifies reporting this rate only to the nearest ${formatNumber(
    10 ** place
  )} ${PRECIP_INVERSION_REPORTED_UNIT} (${formatNumber(
    rounded
  )} ${PRECIP_INVERSION_REPORTED_UNIT})`;
}

/**
 * Whether rounding a positive precipitation amount to its justified place has
 * collapsed it to a bare zero.
 *
 * `roundToPlace` returns 0 for anything below half its place, so a real but
 * small amount — a 0.0107 mm/day arid-month rate, a sub-millimetre total —
 * reaches the parenthetical as "(0 mm/day)". On a ratio scale that is not a
 * coarser way of writing the same reading: zero means *none fell*, and offering
 * it as the justified report of a nonzero observation states an absence the
 * observation does not contain. The honest statement is the one this predicate
 * routes to — that the amount is under the pipeline's own error and no digit of
 * it survives — which withholds the number without ever claiming a dry month.
 *
 * Deliberately not applied to the air-temperature clause. Celsius is an
 * interval scale whose zero is a chosen origin, not an absence: 0.0 °C is an
 * ordinary reading, and rounding 0.04 °C to it reports a measurement rather
 * than erasing one. The collapse is a defect only where zero means nothing at
 * all, so it is scoped to the two precipitation amounts on this line.
 */
function roundsAwayToZero(value: number, rounded: number): boolean {
  return rounded === 0 && value > 0;
}

/**
 * Say how coarsely the measured inversion error lets this month's accumulated
 * total be written.
 *
 * This line now renders one measurement three times — the native kg/m²/s value,
 * the mm/day rate, and this total — and the single published error justifies a
 * *different* rounding place for each, because two different scalings stand
 * between them. The 0.27 mm/day figure fixes the rate at 10^-1 mm/day; the same
 * error natively is 3.125e-6 kg/m²/s, place 10^-6; and integrated over a
 * calendar month it is around 7.6–8.4 mm, place 10^0. Five decimal places
 * separate the first two and one more separates the last, yet all three
 * describe one inversion of one pixel colour. A reader given five figures on
 * every one of them cannot see that: a 241.92 mm total shows two digits the
 * error cannot fix, one more than the rate beside it does.
 *
 * The error used here is the *single-month* integration from {@link
 * precipitationTotalInversionRmseMm}, never the two-month difference floor the
 * accumulation-change clause quotes. That floor combines two independently
 * inverted months in quadrature; one month is one inversion scaled by one day
 * count, so quoting the pair floor here would overstate the error on a claim
 * that involves a single total.
 *
 * No display-unit guard is needed, unlike the rate clause beside it: the total
 * is not a conversion of the printed value but a quantity this module derives
 * in mm itself, as the reported mm/day rate times the month's own days. The
 * condition that has to hold instead is that the published error is a *rate*
 * documented in mm/day, which is what makes multiplying it by a day count
 * legitimate at all — and that is exactly what the helper fails closed on.
 *
 * Silent when the rendered total already sits at the justified place, when the
 * month length is not a calendar length, and when the layer carries no measured
 * figure in the published unit — an unmeasured error is not a passed test. It
 * bounds how the number should be written: it makes no anomaly, trend, cause,
 * or forecast claim, and it never restates or replaces the reported total.
 */
function precipitationTotalPrecisionCaveat(
  accumulated: PrecipitationAccumulation
): string {
  const rateRmse = precipitationInversionRmseMmPerDay();
  if (rateRmse === null) return "";
  const totalRmseMm = precipitationTotalInversionRmseMm(accumulated.monthDays);
  if (totalRmseMm === null) return "";
  const place = justifiedRoundingPlace(totalRmseMm);
  if (place === null) return "";

  const rounded = roundToPlace(accumulated.totalMm, place);
  if (formatNumber(accumulated.totalMm) === formatNumber(rounded)) return "";

  if (roundsAwayToZero(accumulated.totalMm, rounded)) {
    return `; this total is smaller than the ${formatNumber(
      totalRmseMm
    )} mm the ${formatNumber(
      rateRmse
    )} ${PRECIP_INVERSION_REPORTED_UNIT} measured colormap-inversion error becomes over ${
      accumulated.monthDays
    } days, so no digit of it is justified and it is not resolved from zero — which is not a report that no rain fell`;
  }

  return `; the ${formatNumber(
    rateRmse
  )} ${PRECIP_INVERSION_REPORTED_UNIT} measured colormap-inversion error integrated over the same ${
    accumulated.monthDays
  } days is ${formatNumber(
    totalRmseMm
  )} mm, which justifies reporting this total only to the nearest ${formatNumber(
    10 ** place
  )} mm (${formatNumber(rounded)} mm)`;
}

/**
 * Say when a monthly air-temperature mean is nearer the freezing point than the
 * pipeline's own measured colormap inversion can resolve.
 *
 * The clauses above bound how *finely* the value may be written. This one bounds
 * a different thing: which side of a physical threshold it may be read as
 * falling on. The two are not the same claim, and the gap between them is
 * exactly where this readout misleads today. Rounding qualifies digits; a phase
 * boundary qualifies a category, and a reader who sees "-0.31 °C" concludes the
 * month averaged below freezing — a conclusion the pipeline cannot support at a
 * 0.485 K inversion error, whatever place the value is written to.
 *
 * That the two clauses can fire together is the point, not a redundancy. Where
 * the precision clause rounds a near-zero Celsius mean and prints "(0 °C)", this
 * clause is what stops that rounded zero being read as a phase claim.
 *
 * Celsius is an interval scale, so its zero is normally a chosen origin and a
 * reading of 0.0 °C is ordinary — which is why the near-zero collapse that is a
 * defect for precipitation is not one here. Air temperature is the exception
 * that the rule needs stated: the Celsius origin *coincides* with a real phase
 * boundary, so on this one metric the sign of the value carries a physical claim
 * that the arbitrary-origin argument does not license.
 *
 * Silent when the mean stands clear of freezing, when the layer carries no
 * measured inversion figure, and for every other metric. It never restates the
 * value, never asserts the month averaged exactly the freezing point, and makes
 * no claim about daily highs, lows, or whether water actually froze — the
 * statement is about a monthly mean and nothing else. See
 * {@link describeAirTemperatureFreezeSeparation}, which never re-derives the
 * published error and never quotes the month-over-month difference floor: one
 * inverted month against an exact constant carries no quadrature term.
 */
function airTemperatureFreezeThresholdCaveat(
  current: MonthlyClimateSummary
): string {
  const separation = describeAirTemperatureFreezeSeparation(current);
  if (
    separation === null ||
    separation.separation !== "within-inversion-error" ||
    separation.monthRmseK === null
  ) {
    return "";
  }
  // The error is quoted in K because that is the unit it is documented in; the
  // margin it bounds is the printed °C value itself, kelvin-to-Celsius being an
  // exact offset, so the clause needs no conversion step to be commensurate.
  return `; this mean sits within the ${formatNumber(
    separation.monthRmseK
  )} K measured colormap-inversion error of the ${FREEZING_POINT_K} K freezing point, so this pipeline cannot place the monthly mean above or below it`;
}

/**
 * Qualify the single absolute value the card leads with against the layer's own
 * measured inversion error, for whichever atmospheric layer supplied it.
 *
 * The two precision clauses reach the same statement by different licences — see
 * each clause — and a summary carries exactly one metric, so at most one can
 * speak. Soil moisture lies outside the atmospheric domain this module owns and
 * gains no clause here.
 *
 * The freeze-threshold clause is appended rather than alternated: it qualifies
 * the value's *side of a physical boundary* rather than its digits, so it is a
 * second, independent statement about the same number and both may apply.
 */
function valuePrecisionCaveat(
  current: MonthlyClimateSummary,
  conventional: ConventionalClimateValue | null
): string {
  return (
    (airTemperatureValuePrecisionCaveat(current, conventional) ||
      precipitationValuePrecisionCaveat(current, conventional)) +
    airTemperatureFreezeThresholdCaveat(current)
  );
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
    case "satellite-radiometric-retrieval":
      return {
        field: "satellite radiometric retrieval",
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

/**
 * Whether the sampler found usable ground for this month at all.
 *
 * Shared by the card and the export so the two surfaces cannot drift apart on
 * the one question that separates "the source published nothing here" from
 * "this probe declined to average what it got".
 */
function hasPartialCoverage(summary: MonthlyClimateSummary): boolean {
  return (summary.coverage.validFraction ?? 0) > 0;
}

/**
 * Why no usable value can be reported for this month.
 *
 * `climate.ts` labels an absent value `missing-value` whichever way it went
 * absent, because that contract sees only that the caller supplied null. On the
 * place-sampling path the two ways are not the same claim: `weightedMeanValid`
 * withholds the region mean when the usable share falls under its admission
 * threshold, so a boundary the source *did* publish over — thinly — arrives
 * here as a null value beside a positive coverage share. GLDAS and MERRA-2 land
 * fields make that ordinary rather than rare: a small island or a mostly-marine
 * coastal boundary routinely clears zero coverage without clearing the
 * threshold.
 *
 * Reporting that as `missing-value` tells the reader the source had nothing for
 * the place, when in fact it had part of it and this probe declined to average
 * it — blaming the source for our own admission rule, the exact mistake
 * {@link exportUnavailableReason} already documents avoiding in the other
 * direction. The card therefore names the shortfall with the same term the
 * download contract uses for the same month, so the two never disagree about
 * why a month is blank.
 *
 * Only the positive-coverage case is re-labelled. A zero or unsupplied share
 * carries no evidence either way and keeps the contract's own wording rather
 * than gaining a sharper reason than the summary can support.
 */
function unavailableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  if (
    summary.coverage.reason === "missing-value" &&
    hasPartialCoverage(summary)
  ) {
    return "insufficient-valid-coverage";
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
  summary: MonthlyClimateSummary,
  transportFailed = false
): PlaceObservationUnavailableReason {
  if (
    // An image that never arrived records the same empty summary a month the
    // source left blank does, and the coverage share below cannot tell them
    // apart: both report zero. Only the first is a sampling step that did not
    // complete, and `sampling-failed` is the reason this contract already
    // carries for one.
    transportFailed ||
    summary.publicationStatus !== "published" ||
    summary.coverage.status === "invalid" ||
    // A value the cited band rejects is a unit/decode failure of our own
    // sampling, not a gap in what the source published. Reporting it as
    // thin coverage would blame the source for our mistake.
    implausibleValueReason(summary) !== null
  ) {
    return "sampling-failed";
  }
  return hasPartialCoverage(summary)
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
