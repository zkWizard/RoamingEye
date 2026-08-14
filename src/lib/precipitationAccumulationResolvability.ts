import { inversionUncertaintyForLayer } from "./briefValueUncertainty";
import type { DatasetRef } from "./timeline";

/**
 * Whether a month-over-month change in derived precipitation *accumulation*
 * survives the pipeline's own measured colormap-inversion error.
 *
 * `precipitationAccumulationChange` calls a pair of monthly totals wetter,
 * drier, or little-change at a 1 mm reporting threshold. Both totals are
 * integrations of a value RoamingEye never measured directly: it inverted a
 * rendered GIBS pixel colour through an approximate legend gradient, and that
 * inversion has a *measured* end-to-end RMSE for the precipitation layer
 * (METHODS §3, docs/validation.md; the CI-asserted figure lives in
 * `MEASURED_INVERSION` and is read here at runtime, never copied).
 *
 * The published figure is a *rate* error, in mm/day. Integrating a rate over a
 * calendar month multiplies its error by that month's day count along with the
 * rate itself, so a 0.27 mm/day inversion error becomes roughly ±8 mm on a
 * 30-day total — an order of magnitude above the 1 mm band the change
 * descriptor names little-change inside. Nothing previously related the two, so
 * a reader could take "3 mm less than last month" as a settled fall in water
 * delivered when the inversion error alone is enough to reverse it.
 *
 * The same calendar fact the accumulation clause already discloses — that two
 * months are different lengths — therefore acts twice: it biases the difference
 * *and* it sets how much inversion noise the difference carries. The floor here
 * is computed from both months' own day counts rather than from a nominal
 * month, so a February-to-March pair is held to a different bar than a
 * July-to-August one.
 *
 * This module reports provenance and a documented error figure only. It never
 * re-derives an error, re-bins a total, moves the reporting threshold, or infers
 * any anomaly, normal, drought signal, cause, or forecast.
 *
 * Two honesty rules are load-bearing:
 *  - `unresolved` says the comparison is *not distinguishable* from inversion
 *    error. It never asserts that the two months delivered the same water, and
 *    it never reverses the reported direction.
 *  - The floor treats the two months' inversion errors as independent, which is
 *    the conservative direction. Two months of similar rendered colour invert
 *    through the same legend and their errors largely cancel, so the true
 *    difference error is smaller and the floor over-rejects rather than
 *    over-claims.
 */

/**
 * The reported unit the published precipitation inversion RMSE is documented
 * in. Held as a literal rather than read from `SCALE_CONVERSIONS` so that a
 * change to the probe's reported unit makes this module withhold a floor
 * instead of silently scaling a rate error by a day count it no longer matches.
 */
export const PRECIP_INVERSION_REPORTED_UNIT = "mm/day";

/** Honest scope limits for the accumulation-difference floor. */
export const PRECIP_ACCUMULATION_RESOLVABILITY_LIMITATIONS = [
  "Resolvability is measured against the pipeline's end-to-end colormap-inversion RMSE (METHODS §3, docs/validation.md), not against the GLDAS land-surface model's own validation of precipitation.",
  "The RMSE is published as a rate error in mm/day, aggregated over the whole rendered ramp; it is not a per-value 1-sigma error bar and is not assumed Gaussian. Integrating it over a calendar month scales it by that month's day count.",
  "An unresolved difference does not assert that the two months delivered the same water, and it does not reverse the reported direction; it says only that this pipeline cannot separate the comparison from its own inversion error.",
  "The floor treats the two months' inversion errors as independent. Months of similar rendered rate invert through the same legend and their errors largely cancel, so the floor is conservative and rejects some real differences.",
  "The floor bounds inversion error alone. It is not added to the land-model product's own precipitation error, and it says nothing about month-length bias, which the accumulation comparison discloses separately.",
] as const;

/** Whether an accumulation comparison survives the measured inversion error. */
export type PrecipitationAccumulationResolution =
  /** The difference is larger than the conservative inversion-difference floor. */
  | "resolved"
  /** The difference is inside the floor; the comparison is inside the error. */
  | "unresolved"
  /** No measured inversion figure in the expected unit; never invented. */
  | "uncharacterized";

export interface PrecipitationAccumulationResolvability {
  kind: "precip-accumulation-change-resolvability";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  source: DatasetRef;
  /** Unit of every depth reported here. */
  unit: "mm";
  /** The supplied later-minus-earlier total-depth difference, unchanged. */
  changeMm: number;
  earlierMonthDays: number;
  laterMonthDays: number;
  /** Measured inversion RMSE as a rate, in mm/day; null when uncharacterized. */
  rateRmseMmPerDay: number | null;
  /** Inversion error on the earlier month's own total: rate RMSE x its days. */
  earlierTotalRmseMm: number | null;
  /** Inversion error on the later month's own total: rate RMSE x its days. */
  laterTotalRmseMm: number | null;
  /**
   * Conservative noise floor for a difference of two independently inverted
   * totals: `rateRmse x sqrt(earlierDays^2 + laterDays^2)`. Null when
   * uncharacterized.
   */
  differenceFloorMm: number | null;
  resolution: PrecipitationAccumulationResolution;
  /** Honest, source-carrying sentence; never asserts the months were equal. */
  statement: string;
  limitations: readonly string[];
}

/**
 * The measured precipitation inversion RMSE as a rate in mm/day, or null when
 * the layer carries no measured figure or the published figure is no longer
 * documented in mm/day.
 */
function precipRateInversionRmse(): number | null {
  const measured = inversionUncertaintyForLayer(
    "precip",
    PRECIP_INVERSION_REPORTED_UNIT
  );
  if (measured === null) return null;
  // The accumulation is the *reported* mm/day rate integrated over calendar
  // days, so the reported figure is the one that scales — never the native
  // kg/m²/s value, which would be wrong by the 86,400 conversion factor.
  if (measured.reportedUnit !== PRECIP_INVERSION_REPORTED_UNIT) return null;
  return measured.reportedRmse;
}

/**
 * Describe whether a month-over-month difference of two derived precipitation
 * accumulation totals is larger than the error the pipeline's own colormap
 * inversion introduces into a difference of two independently inverted totals.
 *
 * `changeMm` is a later-minus-earlier total-depth difference in mm (e.g. the
 * `changeMm` of a {@link
 * import("./precipitationAccumulationChange").PrecipitationAccumulationChange}).
 * Returns null when no finite difference was supplied, or when either month's
 * day count is not a usable calendar length, so no caller reads a verdict off a
 * missing or malformed comparison.
 */
export function describePrecipitationAccumulationResolvability(
  changeMm: number | null,
  earlierMonthDays: number,
  laterMonthDays: number,
  source: DatasetRef
): PrecipitationAccumulationResolvability | null {
  if (changeMm === null || !Number.isFinite(changeMm)) return null;
  if (!isCalendarMonthLength(earlierMonthDays)) return null;
  if (!isCalendarMonthLength(laterMonthDays)) return null;

  const rateRmse = precipRateInversionRmse();
  const base = {
    kind: "precip-accumulation-change-resolvability" as const,
    isForecast: false as const,
    source,
    unit: "mm" as const,
    changeMm,
    earlierMonthDays,
    laterMonthDays,
    limitations: PRECIP_ACCUMULATION_RESOLVABILITY_LIMITATIONS,
  };

  if (rateRmse === null) {
    return {
      ...base,
      rateRmseMmPerDay: null,
      earlierTotalRmseMm: null,
      laterTotalRmseMm: null,
      differenceFloorMm: null,
      resolution: "uncharacterized",
      statement: `Month-over-month accumulation change ${formatSignedNumber(changeMm)} mm; no measured end-to-end colormap-inversion figure is available for this layer in ${PRECIP_INVERSION_REPORTED_UNIT}, so the difference is not tested against a noise floor; source ${sourceLabel(source)}.`,
    };
  }

  const earlierTotalRmseMm = rateRmse * earlierMonthDays;
  const laterTotalRmseMm = rateRmse * laterMonthDays;
  // Independent errors add in quadrature. Unlike a same-length pair, whose
  // floor collapses to sqrt(2) x RMSE, the two months here carry different
  // integration lengths and therefore different error magnitudes.
  const differenceFloorMm = Math.hypot(earlierTotalRmseMm, laterTotalRmseMm);
  const resolution: PrecipitationAccumulationResolution =
    Math.abs(changeMm) > differenceFloorMm ? "resolved" : "unresolved";

  return {
    ...base,
    rateRmseMmPerDay: rateRmse,
    earlierTotalRmseMm,
    laterTotalRmseMm,
    differenceFloorMm,
    resolution,
    statement:
      resolution === "resolved"
        ? `Month-over-month accumulation change ${formatSignedNumber(changeMm)} mm exceeds the ${formatNumber(differenceFloorMm)} mm conservative inversion-difference floor for a ${earlierMonthDays}-day and ${laterMonthDays}-day pair, so it is distinguishable from colormap-inversion error; source ${sourceLabel(source)}.`
        : `Month-over-month accumulation change ${formatSignedNumber(changeMm)} mm is within the ${formatNumber(differenceFloorMm)} mm conservative inversion-difference floor for a ${earlierMonthDays}-day and ${laterMonthDays}-day pair, so this pipeline cannot separate it from colormap-inversion error; this does not assert that the two months delivered the same water; source ${sourceLabel(source)}.`,
  };
}

/** Calendar months run 28-31 days; anything else is not an integration length. */
function isCalendarMonthLength(days: number): boolean {
  return Number.isInteger(days) && days >= 28 && days <= 31;
}

/** Compact fixed-significant-figure format; keeps small depths readable. */
function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
