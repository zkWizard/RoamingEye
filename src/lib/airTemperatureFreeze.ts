import { airTemperatureInversionRmseK } from "./airTemperatureChangeResolvability";
import type { MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Freeze-threshold context for a monthly-mean 2 m air-temperature observation.
 *
 * Water's freezing point is a hard, exact physical threshold (273.15 K at
 * standard pressure), so classifying a usable monthly-mean 2 m air temperature
 * as at, above, or below it is a factual categorical descriptor of that mean —
 * not an estimate, anomaly, forecast, or diagnosis. The classification derives
 * from the value the source product already reports; it invents nothing.
 *
 * The honesty limits are explicit and never dropped:
 * - It describes the MONTHLY MEAN only. A mean above freezing does not rule out
 *   sub-freezing days, and a mean below freezing does not rule out thaw days;
 *   daily highs and lows cannot be recovered from a monthly mean.
 * - The value is an area-mean of a reanalysis product (MERRA-2), not a station
 *   measurement, so the cited provenance travels with the classification.
 * - Only the 2 m air-temperature metric is classified. Other metrics return
 *   null so no caller mistakes an absent classification for a claim about them.
 */

/** Freezing point of water at standard sea-level pressure, in kelvin (exact). */
export const FREEZING_POINT_K = 273.15;

export type FreezeThresholdCategory =
  "below-freezing" | "at-freezing" | "above-freezing";

export type FreezeThresholdStatus = "classified" | "unavailable";

export interface AirTemperatureFreezeContext {
  kind: "air-temperature-freeze-threshold";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  dataMonth: YearMonth;
  source: DatasetRef;
  status: FreezeThresholdStatus;
  /** Usable monthly-mean value in kelvin, unchanged; null when unavailable. */
  observedKelvin: number | null;
  /**
   * Signed distance from {@link FREEZING_POINT_K} in kelvin (positive above
   * freezing). This equals the temperature in degrees Celsius, since °C is an
   * exact −273.15 offset from kelvin. Null when unavailable.
   */
  marginKelvin: number | null;
  category: FreezeThresholdCategory | null;
  /** Why a classification could not be made; null when classified. */
  reason: string | null;
  /** Honest, provenance-tagged descriptor of the monthly mean only. */
  statement: string;
}

/**
 * Classify one monthly-mean 2 m air-temperature summary against the freezing
 * point. Returns null for any non-air-temperature metric (out of scope). For
 * the air-temperature metric it always returns a context object: `classified`
 * when the summary carries a usable published observation, otherwise
 * `unavailable` with the cited provenance still attached.
 */
export function describeAirTemperatureFreezeThreshold(
  summary: MonthlyClimateSummary
): AirTemperatureFreezeContext | null {
  if (summary.metric.id !== "air-temperature-2m") {
    return null;
  }

  const source = summary.metric.source;
  const usable =
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    summary.observedValue !== null;

  if (!usable || summary.observedValue === null) {
    const reason = unavailableReason(summary);
    return {
      kind: "air-temperature-freeze-threshold",
      isForecast: false,
      dataMonth: summary.dataMonth,
      source,
      status: "unavailable",
      observedKelvin: null,
      marginKelvin: null,
      category: null,
      reason,
      statement: `No usable 2 m air-temperature observation for ${formatMonth(
        summary.dataMonth
      )} (${reason}); freeze-threshold classification withheld; source ${sourceLabel(
        source
      )}.`,
    };
  }

  const observedKelvin = summary.observedValue;
  const marginKelvin = observedKelvin - FREEZING_POINT_K;
  const category = categoryFor(marginKelvin);

  return {
    kind: "air-temperature-freeze-threshold",
    isForecast: false,
    dataMonth: summary.dataMonth,
    source,
    status: "classified",
    observedKelvin,
    marginKelvin,
    category,
    reason: null,
    statement: classifiedStatement(
      summary.dataMonth,
      observedKelvin,
      marginKelvin,
      category,
      source
    ),
  };
}

/**
 * Whether a monthly mean stands clear of the freezing point by more than the
 * pipeline's own measured colormap-inversion error.
 *
 * The classification above is exact arithmetic on the value the source product
 * reports. But the place readout does not receive a source value: it receives a
 * rendered GIBS pixel colour inverted through an approximate legend gradient,
 * and that inversion has a *measured* end-to-end RMSE for the air-temperature
 * layer (METHODS §3, docs/validation.md), read here through
 * {@link airTemperatureInversionRmseK} and never re-derived. A mean two tenths
 * of a kelvin either side of freezing is therefore inside the error of the step
 * that produced it, and the sign that decides the category is not the source's
 * — it is the inversion's.
 *
 * The floor is the single-month RMSE, not the `sqrt(2) x RMSE` used for a
 * month-over-month difference. That quadrature term exists because a difference
 * draws two independently inverted months; this comparison draws one inverted
 * month and sets it against an exact physical constant, which contributes no
 * error of its own. Quoting the difference floor here would overstate the bound
 * by about 41% — a separate claim needs its own derivation.
 *
 * `within-inversion-error` says the pipeline cannot place the mean on a side of
 * the threshold. It never asserts the mean *was* at the freezing point, never
 * overrides the reported category, and — like every statement in this module —
 * describes the monthly mean alone, so it makes no claim about whether water
 * froze at that place in that month.
 */
export type FreezeThresholdSeparation =
  /** The mean stands clear of freezing by more than the measured error. */
  | "separated"
  /** The mean is inside the measured inversion error of the threshold. */
  | "within-inversion-error"
  /** No measured inversion figure in the expected unit; never invented. */
  | "uncharacterized";

/** Honest scope limits for the freeze-threshold separation test. */
export const FREEZE_THRESHOLD_SEPARATION_LIMITATIONS = [
  "Separation is measured against the pipeline's end-to-end colormap-inversion RMSE (METHODS §3, docs/validation.md), not against MERRA-2's own validation of 2 m air temperature.",
  "The RMSE is a single figure aggregated over the whole rendered ramp, not a per-value 1-sigma error bar; the true error near the freezing point may be larger or smaller, and it is not assumed Gaussian.",
  "An unseparated mean does not assert that the month averaged exactly the freezing point, and it does not remove or reverse the reported category; it says only that this pipeline cannot place the mean on either side of the threshold.",
  "The test bounds inversion error alone. It is not added to the reanalysis product's own air-temperature error, and it says nothing about the coverage or sampling differences the readout discloses separately.",
  "Separation concerns the monthly mean only. A mean cleanly above freezing does not rule out sub-freezing days, and a mean cleanly below it does not rule out thaw days.",
] as const;

export interface AirTemperatureFreezeSeparation {
  kind: "air-temperature-freeze-separation";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  source: DatasetRef;
  /**
   * Unit of every figure reported here. The margin in K and the readout's
   * Celsius value are the same number, because the conversion is an exact
   * offset; the kelvin label is kept because that is the unit the published
   * inversion error is documented in.
   */
  unit: "K";
  /** Signed distance from the freezing point, unchanged from the context. */
  marginKelvin: number;
  /** Measured inversion RMSE on a single month, in K; null when uncharacterized. */
  monthRmseK: number | null;
  separation: FreezeThresholdSeparation;
  category: FreezeThresholdCategory;
  /** Honest, source-carrying sentence; never asserts the mean was at freezing. */
  statement: string;
  limitations: readonly string[];
}

/**
 * Test one monthly-mean 2 m air-temperature summary's freeze classification
 * against the measured colormap-inversion error.
 *
 * Returns null for any non-air-temperature metric and for any summary the
 * classifier could not classify, so no caller reads a verdict off a mean that
 * was never published.
 */
export function describeAirTemperatureFreezeSeparation(
  summary: MonthlyClimateSummary
): AirTemperatureFreezeSeparation | null {
  const context = describeAirTemperatureFreezeThreshold(summary);
  if (
    context === null ||
    context.status !== "classified" ||
    context.marginKelvin === null ||
    context.category === null
  ) {
    return null;
  }

  const marginKelvin = context.marginKelvin;
  const monthRmseK = airTemperatureInversionRmseK();
  const base = {
    kind: "air-temperature-freeze-separation" as const,
    isForecast: false as const,
    source: context.source,
    unit: "K" as const,
    marginKelvin,
    category: context.category,
    limitations: FREEZE_THRESHOLD_SEPARATION_LIMITATIONS,
  };

  if (monthRmseK === null) {
    return {
      ...base,
      monthRmseK: null,
      separation: "uncharacterized",
      statement: `Monthly mean stands ${formatNumber(
        Math.abs(marginKelvin)
      )} K from the ${FREEZING_POINT_K} K freezing point; no measured end-to-end colormap-inversion figure is available for this layer in K, so the separation is not tested against a noise floor; source ${sourceLabel(
        context.source
      )}.`,
    };
  }

  // One inverted month against an exact constant: the constant contributes no
  // error, so the bound is the single-month RMSE with no quadrature term.
  const separation: FreezeThresholdSeparation =
    Math.abs(marginKelvin) > monthRmseK
      ? "separated"
      : "within-inversion-error";

  return {
    ...base,
    monthRmseK,
    separation,
    statement:
      separation === "separated"
        ? `Monthly mean stands ${formatNumber(
            Math.abs(marginKelvin)
          )} K from the ${FREEZING_POINT_K} K freezing point, clear of the ${formatNumber(
            monthRmseK
          )} K measured colormap-inversion error, so the ${
            context.category
          } classification is distinguishable from inversion error; monthly mean only; source ${sourceLabel(
            context.source
          )}.`
        : `Monthly mean stands ${formatNumber(
            Math.abs(marginKelvin)
          )} K from the ${FREEZING_POINT_K} K freezing point, within the ${formatNumber(
            monthRmseK
          )} K measured colormap-inversion error, so this pipeline cannot place the mean above or below the threshold; this does not assert the month averaged exactly the freezing point; source ${sourceLabel(
            context.source
          )}.`,
  };
}

function categoryFor(marginKelvin: number): FreezeThresholdCategory {
  if (marginKelvin > 0) return "above-freezing";
  if (marginKelvin < 0) return "below-freezing";
  return "at-freezing";
}

function classifiedStatement(
  dataMonth: YearMonth,
  observedKelvin: number,
  marginKelvin: number,
  category: FreezeThresholdCategory,
  source: DatasetRef
): string {
  const month = formatMonth(dataMonth);
  const value = formatNumber(observedKelvin);
  const relation =
    category === "at-freezing"
      ? `at the ${FREEZING_POINT_K} K freezing point`
      : `${category === "above-freezing" ? "above" : "below"} the ${
          FREEZING_POINT_K
        } K freezing point by ${formatNumber(Math.abs(marginKelvin))} K`;
  return `Monthly-mean 2 m air temperature ${value} K is ${relation} for ${month}; monthly mean only — does not describe daily highs or lows; source ${sourceLabel(
    source
  )}.`;
}

function unavailableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  return summary.coverage.reason ?? "unspecified";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(6)).toString();
}

function formatMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}
