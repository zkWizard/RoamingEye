import type { YearMonth } from "./timeline";

/**
 * Separate the calendar-length share of a month-over-month rainfall step on the
 * place panel from the share that is actually weather.
 *
 * The panel reports rainfall as a monthly *total* depth: the GLDAS monthly-mean
 * precipitation rate integrated over the data month's own length (the same
 * integration `precipitationAccumulation.ts` performs for a probed point).
 * Differencing two such totals therefore mixes two unlike quantities — how hard
 * it rained, and how many days the calendar gave the month to rain in. February
 * to March adds three days at no change in rate at all; at 3 mm/day that is a
 * spurious +9 mm the panel would otherwise present as a wetter month.
 *
 * Writing d for a month's length in days and r for its implied mean daily rate
 * (total ÷ days), the step splits exactly — this is an identity, not an
 * approximation:
 *
 *     T_later − T_earlier = r_earlier · (d_later − d_earlier)   ← calendar term
 *                         + (r_later − r_earlier) · d_later     ← rate term
 *
 * The split is a reporting convention, not a physical partition: holding the
 * *later* month's rate fixed instead would attribute the same total to the two
 * terms differently. Holding the earlier rate fixed answers the question a
 * reader comparing two totals is implicitly asking — what would this month have
 * accumulated had it rained exactly as hard as last month?
 *
 * This helper only re-arranges two totals the panel already shows. It decodes
 * no pixel and adds no anomaly, normal, regime class, drought signal, water
 * balance, causation, or forecast.
 */

/** Honest scope limits for the calendar/rate split. */
export const RAINFALL_MONTH_LENGTH_LIMITATIONS = [
  "The split is exact arithmetic on two monthly total depths, each the GLDAS monthly-mean precipitation rate integrated over its own calendar month.",
  "Attributing the calendar term at the earlier month's rate is a reporting convention; holding the later month's rate fixed instead would divide the same total differently.",
  "The implied mean daily rate is a month total divided by that month's length, not an observation of any individual day, and says nothing about how the rain was distributed within the month.",
  "It inherits the land-model product's resolution and biases and infers no anomaly, normal, regime class, drought signal, runoff, cause, or any future value.",
] as const;

export interface RainfallMonthLengthSplit {
  kind: "place-rainfall-month-length-split";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Calendar length of each month, in days (28–31, leap Februaries included). */
  earlierDays: number;
  laterDays: number;
  /** Implied mean daily rate (mm/day): the month's total over its own length. */
  earlierRateMmPerDay: number;
  laterRateMmPerDay: number;
  /** Later total minus earlier total, in mm — the figure the panel reports. */
  changeMm: number;
  /** The share of `changeMm` the two months' differing lengths alone produce. */
  calendarMm: number;
  /** The share of `changeMm` the change in mean daily rate produces. */
  rateMm: number;
  /**
   * True when the total moved one way while the mean daily rate moved the
   * other — the case where reading the total as "wetter" or "drier" inverts
   * what the rain actually did.
   */
  signInverted: boolean;
  limitations: readonly string[];
}

/**
 * Decompose a month-over-month change in rainfall total into its calendar and
 * rate shares. Returns null when either month or total is unusable, so a caller
 * never renders a split derived from a value it could not verify.
 */
export function placeRainfallMonthLengthSplit(
  months: [YearMonth, YearMonth],
  totalsMm: [number, number]
): RainfallMonthLengthSplit | null {
  const [earlierMonth, laterMonth] = months;
  const [earlierTotal, laterTotal] = totalsMm;
  if (!Number.isFinite(earlierTotal) || !Number.isFinite(laterTotal)) {
    return null;
  }
  const earlierDays = daysInMonth(earlierMonth);
  const laterDays = daysInMonth(laterMonth);
  if (earlierDays === null || laterDays === null) return null;

  const earlierRate = earlierTotal / earlierDays;
  const laterRate = laterTotal / laterDays;
  return {
    kind: "place-rainfall-month-length-split",
    isForecast: false,
    earlierDays,
    laterDays,
    earlierRateMmPerDay: earlierRate,
    laterRateMmPerDay: laterRate,
    changeMm: laterTotal - earlierTotal,
    calendarMm: earlierRate * (laterDays - earlierDays),
    rateMm: (laterRate - earlierRate) * laterDays,
    signInverted:
      Math.sign(laterTotal - earlierTotal) *
        Math.sign(laterRate - earlierRate) <
      0,
    limitations: RAINFALL_MONTH_LENGTH_LIMITATIONS,
  };
}

/**
 * A compact clause disclosing the calendar share, for the place panel's detail
 * line. Returns an empty string when there is nothing to disclose — equal-length
 * months admit no artifact, and a share that rounds away at the panel's own
 * whole-millimetre precision is not worth a reader's attention.
 */
export function rainfallMonthLengthNote(
  split: RainfallMonthLengthSplit | null
): string {
  if (!split || split.earlierDays === split.laterDays) return "";
  const calendar = Math.round(split.calendarMm);
  if (calendar === 0) return "";
  const sign = calendar > 0 ? "+" : "";
  const note = `; ${sign}${calendar} mm of that is ${split.earlierDays} d → ${split.laterDays} d month length`;
  if (!split.signInverted) return note;
  return `${note}, and the daily rate moved the other way (${split.earlierRateMmPerDay.toFixed(
    1
  )} → ${split.laterRateMmPerDay.toFixed(1)} mm/day)`;
}

/**
 * Calendar length of a data month, or null when the month is not a real one.
 * Day 0 of the following month is the last day of this one.
 */
function daysInMonth(month: YearMonth): number | null {
  if (!Number.isInteger(month.year)) return null;
  if (!Number.isInteger(month.month) || month.month < 1 || month.month > 12) {
    return null;
  }
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}
