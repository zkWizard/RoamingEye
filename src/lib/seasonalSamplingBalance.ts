import { MONTH_NAMES, type YearMonth } from "./timeline";
import { makeNeumaierAcc } from "./numerics";
import { csvDecimals, quantizationStep, type ProbeScale } from "./probe";

/**
 * How the calendar-month composition of a probed record biases its mean.
 *
 * The probe panel reports `mean` as an unweighted average of every month that
 * returned a usable value. For an atmospheric variable that is only an
 * unbiased estimate of the record's mean when the usable months are spread
 * evenly across the calendar. They frequently are not: rendered GIBS imagery
 * drops months (no-data, masked, unpublished), and those drops cluster
 * seasonally — a point that loses winter months reports a mean biased warm,
 * one that loses a monsoon reports a precipitation rate biased dry. The
 * seasonal cycle is the largest signal in most 2 m air-temperature and
 * precipitation records, so a handful of missing months moves the mean by
 * more than any trend in it.
 *
 * This module measures that bias rather than warning about it in the
 * abstract. It re-weights the record so each calendar month counts once —
 * the mean of the twelve calendar-month means — and reports the difference
 * from the plain mean the panel shows.
 *
 * The balanced mean is a DERIVED re-weighting of the supplied observations,
 * not a measurement and not a gap-fill: absent calendar months are never
 * estimated, and when any of the twelve carries no usable sample the balanced
 * mean is left null rather than computed from the months that survived. It
 * describes the sampling, not the atmosphere — an unbalanced record is not a
 * wrong one, only one whose mean answers a narrower question.
 */

export interface SeasonalSamplingBalance {
  kind: "seasonal-sampling-balance";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /**
   * Whether the requested record asked for all twelve calendar months at all.
   * A sub-annual request has no annual mean to be biased away from, so the
   * remaining fields describe only the months it did cover.
   */
  coversFullYear: boolean;
  /** Usable samples per calendar month; index 0 is January. */
  samplesByCalendarMonth: readonly number[];
  /** Requested calendar months (1-12) that returned no usable sample at all. */
  absentCalendarMonths: readonly number[];
  /** Unweighted mean of every usable value — the figure the panel reports. */
  recordMean: number | null;
  /**
   * Mean of the twelve calendar-month means, each calendar month weighted
   * equally. Null unless all twelve carry at least one usable sample.
   */
  calendarBalancedMean: number | null;
  /**
   * `calendarBalancedMean - recordMean`: how far the reported mean sits from
   * a seasonally balanced one. Null when the balanced mean is not computable.
   */
  seasonalSamplingBias: number | null;
}

/**
 * Measure the calendar-month balance of one probed monthly series.
 *
 * `months` and `values` are positional, exactly as the probe sampler streams
 * them; a null value is a month that returned no usable data.
 */
export function seasonalSamplingBalance(
  months: readonly YearMonth[],
  values: readonly (number | null)[]
): SeasonalSamplingBalance {
  const samples = new Array<number>(12).fill(0);
  const requested = new Array<boolean>(12).fill(false);
  // The balanced mean is differenced against the record mean, so both are
  // compensated: the two are near-equal by construction and the digits lost
  // to naive summation would surface amplified in the difference.
  const monthSums = Array.from({ length: 12 }, () => makeNeumaierAcc());
  const total = makeNeumaierAcc();
  let count = 0;
  for (let i = 0; i < months.length; i++) {
    const calendarMonth = months[i]?.month;
    if (
      !Number.isInteger(calendarMonth) ||
      calendarMonth < 1 ||
      calendarMonth > 12
    )
      continue;
    requested[calendarMonth - 1] = true;
    const value = values[i];
    if (value === null || value === undefined || !Number.isFinite(value))
      continue;
    samples[calendarMonth - 1]++;
    monthSums[calendarMonth - 1].add(value);
    total.add(value);
    count++;
  }

  const coversFullYear = requested.every(Boolean);
  const absentCalendarMonths: number[] = [];
  for (let m = 0; m < 12; m++) {
    if (requested[m] && samples[m] === 0) absentCalendarMonths.push(m + 1);
  }

  const recordMean = count > 0 ? total.sum() / count : null;
  // Only computable once every calendar month carries a sample; an absent one
  // is never gap-filled, and must not be silently averaged in as a zero.
  let calendarBalancedMean: number | null = null;
  if (coversFullYear && absentCalendarMonths.length === 0) {
    const climatology = makeNeumaierAcc();
    for (let m = 0; m < 12; m++)
      climatology.add(monthSums[m].sum() / samples[m]);
    calendarBalancedMean = climatology.sum() / 12;
  }

  return {
    kind: "seasonal-sampling-balance",
    isForecast: false,
    coversFullYear,
    samplesByCalendarMonth: samples,
    absentCalendarMonths,
    recordMean,
    calendarBalancedMean,
    seasonalSamplingBias:
      calendarBalancedMean === null || recordMean === null
        ? null
        : calendarBalancedMean - recordMean,
  };
}

/**
 * One status-line clause, or null when there is nothing honest to add.
 *
 * Silence is the common case and is deliberate: a record whose usable months
 * are spread across the calendar needs no caveat, and a bias smaller than one
 * colormap quantization step is below the resolution the inverted values
 * carry at all (see `quantizationStep`) — printing it would claim precision
 * the method does not have.
 */
export function seasonalSamplingClause(
  balance: SeasonalSamplingBalance,
  scale: ProbeScale
): string | null {
  if (!balance.coversFullYear || balance.recordMean === null) return null;
  if (balance.absentCalendarMonths.length > 0) {
    return `mean covers ${12 - balance.absentCalendarMonths.length} of 12 calendar months (no ${balance.absentCalendarMonths
      .map((m) => MONTH_NAMES[m - 1])
      .join(", ")}), so it is not an annual mean`;
  }
  const bias = balance.seasonalSamplingBias;
  if (bias === null || Math.abs(bias) < quantizationStep(scale)) return null;
  const digits = csvDecimals(scale);
  const unit = scale.unit ? ` ${scale.unit}` : "";
  return `uneven calendar-month sampling: balanced mean ${balance.calendarBalancedMean!.toFixed(
    digits
  )}${unit} (${bias >= 0 ? "+" : "-"}${Math.abs(bias).toFixed(digits)}${unit} vs mean shown)`;
}
