import { ymToIndex, type YearMonth } from "./timeline";

/**
 * What the place panel is allowed to say about the *time step* separating the
 * two months it differences, for every metric card.
 *
 * The panel takes the last two entries of a product's timeline
 * (`latestComparisonMonths`) and prints their difference under a
 * month-over-month label. Two facts about that step are not carried by the two
 * values themselves, and the panel disclosed them on the vegetation card only:
 *
 *  - **The pair is not guaranteed to be adjacent.** A layer's enumerated record
 *    has its declared distribution gaps removed (`published()` in
 *    `timeline.ts`), so the last two entries can straddle a skipped month.
 *    `placeVegetationChange` already refuses a comparison in that case rather
 *    than labelling a multi-month step "month over month"; the rainfall,
 *    soil-moisture, and air-temperature cards subtracted unconditionally, so a
 *    gap in any of those products would have been rendered as an ordinary
 *    one-month change.
 *  - **The difference is not deseasonalized.** Each card reports an absolute
 *    monthly observation in native units, and the panel attaches no
 *    climatological baseline. At most latitudes a one-month step in air
 *    temperature, precipitation, or soil moisture is dominated by the annual
 *    cycle — more so than the NDVI step the panel already qualifies — so a
 *    signed difference must not be read as a departure from normal. Only the
 *    vegetation card said so, which left the panel's most strongly seasonal
 *    quantities as its least qualified ones.
 *
 * This module states the step; it never touches a value. It computes no
 * anomaly, attaches no baseline or normal, and infers no condition, trend,
 * cause, or forecast.
 *
 * The quantities involved are the GLDAS-2.1 Noah land-surface fields the panel
 * cites (monthly-mean precipitation rate, root-zone soil moisture, 2 m air
 * temperature) and MODIS/Terra MOD13A3 NDVI; provenance is unchanged here.
 *
 * Reference for the seasonal cycle dominating a short-interval difference, and
 * for why a departure requires a stated baseline period:
 * World Meteorological Organization (2017). WMO Guidelines on the Calculation
 * of Climate Normals (WMO-No. 1203). Geneva: WMO.
 */

/** Honest scope limits for the step descriptor. */
export const PLACE_MONTH_STEP_LIMITATIONS = [
  "The descriptor reports the calendar interval between two sampled months and whether that interval is one month; it reads no value and changes none.",
  "A consecutive pair is a month-over-month step, not a deseasonalized one: the panel attaches no climatological baseline, so the difference is a plain difference of two absolute observations and cannot be read as above or below normal.",
  "A non-consecutive pair is refused rather than rescaled — the panel holds no intervening months, so a multi-month step cannot be converted into a per-month rate.",
  "The interval is calendar arithmetic on the two supplied months; it says nothing about the products' coverage, resolution, latency, or agreement.",
] as const;

export type PlaceMonthStepKind =
  /** The later month directly follows the earlier one. */
  | "consecutive-months"
  /** The two months are separated by a gap, or are unordered or identical. */
  | "not-consecutive-months"
  /** A supplied month is not a real calendar month; never guessed at. */
  | "unusable-months";

export interface PlaceMonthStep {
  kind: "place-month-step";
  step: PlaceMonthStepKind;
  /**
   * Whole calendar months from the earlier month to the later one. Null when
   * either month is unusable; negative when the pair is supplied out of order,
   * which is reported rather than silently sorted.
   */
  monthsApart: number | null;
  /** True only for a genuine one-month step the panel may label as such. */
  isMonthOverMonth: boolean;
  limitations: readonly string[];
}

/**
 * Classify the interval between the two months the place panel differences.
 *
 * Out-of-order and identical pairs are `not-consecutive-months` rather than
 * being reordered or treated as a zero-length step: the panel supplies these
 * months in timeline order, so anything else is a caller error the reader
 * should not see rendered as a change.
 */
export function placeMonthStep(months: [YearMonth, YearMonth]): PlaceMonthStep {
  const [earlier, later] = months;
  if (!isCalendarMonth(earlier) || !isCalendarMonth(later)) {
    return step("unusable-months", null);
  }
  const monthsApart = ymToIndex(later) - ymToIndex(earlier);
  return step(
    monthsApart === 1 ? "consecutive-months" : "not-consecutive-months",
    monthsApart
  );
}

/**
 * The clause a metric card appends when the pair *is* a one-month step, naming
 * what the difference still does not account for. Empty for any pair that is
 * not a month-over-month step, because such a pair reports no difference at all
 * (see `placeMonthStepRefusal`).
 */
export function placeMonthStepNote(stepInfo: PlaceMonthStep): string {
  return stepInfo.isMonthOverMonth ? " · annual cycle not removed" : "";
}

/**
 * Why no signed difference is reported, phrased for the panel's detail line.
 * Null whenever the pair is a usable month-over-month step and a difference may
 * therefore be shown.
 */
export function placeMonthStepRefusal(
  stepInfo: PlaceMonthStep,
  earlierMonthLabel: string
): string | null {
  if (stepInfo.isMonthOverMonth) return null;
  if (stepInfo.step === "unusable-months") {
    return "the earlier month is not a usable calendar month, so no month-over-month change is reported";
  }
  return `${earlierMonthLabel} is not the preceding month, so no month-over-month change is reported`;
}

function step(
  kind: PlaceMonthStepKind,
  monthsApart: number | null
): PlaceMonthStep {
  return {
    kind: "place-month-step",
    step: kind,
    monthsApart,
    isMonthOverMonth: kind === "consecutive-months",
    limitations: PLACE_MONTH_STEP_LIMITATIONS,
  };
}

function isCalendarMonth(month: YearMonth | undefined): month is YearMonth {
  return (
    month !== undefined &&
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}
