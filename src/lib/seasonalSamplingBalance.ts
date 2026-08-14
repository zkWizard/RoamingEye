import { MONTH_NAMES, type YearMonth } from "./timeline";
import { makeNeumaierAcc } from "./numerics";
import {
  csvDecimals,
  csvHeaderText,
  quantizationStep,
  type ProbeScale,
} from "./probe";

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
 *
 * When whole calendar months are missing the clause also disclaims the
 * extremes, not only the mean. `min` and `max` sit on the same status line,
 * are reduced from the very same usable months, and are equally not annual —
 * a record that lost every January reports its coldest month from the eleven
 * that remain. Naming only the mean reads as a claim that the numbers beside
 * it survived the gap, which is the reverse of the truth: the mean can at
 * least be re-weighted towards balance, while an extremum drawn from months
 * that were never sampled cannot be recovered at all. The disclaimer is
 * deliberately symmetric — which of the two is understated depends on where
 * the absent months sit in the local seasonal cycle, and this module holds no
 * climatology with which to say, so it states the shared limit and stops.
 *
 * `meanBoundPrefix` is the inequality the caller has already decided the plain
 * mean must carry — "≤ ", "≥ ", or "" — and it applies unchanged to the
 * balanced mean. The balanced mean is a positive-weight average of the very
 * same usable values, so a colormap cap that pushes every affected month one
 * way pushes this re-weighting the same way: on a layer whose ramp ends in an
 * open bin (see `probeSstExtremeCensoring` and `probeAerosolCeilingCensoring`)
 * it is a bound, not an estimate. Rendering it bare beside a `≤`-marked mean
 * would present the derived statistic as the two-sided one on the line.
 *
 * The offset takes no inequality, and that asymmetry is deliberate. Both means
 * are bounds over the same censored months, each wrong by an unknown amount in
 * the same direction, so the difference of those two errors has no claimable
 * sign — the offset is stated as a bound on neither side rather than inheriting
 * a direction the caps destroyed. Nothing here estimates a value behind a cap.
 * The default keeps every uncensored record, and every layer whose ramp closes
 * at both ends, byte-identical.
 */
export function seasonalSamplingClause(
  balance: SeasonalSamplingBalance,
  scale: ProbeScale,
  meanBoundPrefix = ""
): string | null {
  if (!balance.coversFullYear || balance.recordMean === null) return null;
  if (balance.absentCalendarMonths.length > 0) {
    return (
      `mean covers ${12 - balance.absentCalendarMonths.length} of 12 calendar months (no ${balance.absentCalendarMonths
        .map((m) => MONTH_NAMES[m - 1])
        .join(", ")}), so it is not an annual mean` +
      `; min and max share those months and are not annual extremes`
    );
  }
  const bias = balance.seasonalSamplingBias;
  if (bias === null || Math.abs(bias) < quantizationStep(scale)) return null;
  const digits = csvDecimals(scale);
  const unit = scale.unit ? ` ${scale.unit}` : "";
  const offsetScope = meanBoundPrefix
    ? "; each is a one-sided bound over the same censored months, so their offset is not itself bounded"
    : "";
  return `uneven calendar-month sampling: balanced mean ${meanBoundPrefix}${balance.calendarBalancedMean!.toFixed(
    digits
  )}${unit} (${bias >= 0 ? "+" : "-"}${Math.abs(bias).toFixed(digits)}${unit} vs mean shown${offsetScope})`;
}

/**
 * The same correction as `seasonalSamplingClause`, written for the export.
 *
 * The status line qualifies a mean the panel has already computed; the CSV
 * computes none, so the caveat has to name the statistic the reader will
 * derive. That is not a hypothetical: a monthly `value` column exists to be
 * averaged, and the file outlives the session that explained it — the same
 * reasoning that carried the record-gap and censoring corrections into the
 * download while the status line already stated them.
 *
 * Silent in exactly the cases the status line is silent: a sub-annual request
 * has no annual mean to be biased away from, a record with no usable value has
 * no statistic to qualify, and a bias under one colormap quantization step is
 * finer than the inverted values resolve.
 *
 * Comma-free by the header contract documented on `csvHeaderText` in probe.ts,
 * so each line stays one untorn field for naive parsers: calendar months are
 * space-separated and the interpolated unit is scrubbed.
 *
 * `meanBoundPrefix` is the inequality the caller has already decided the plain
 * mean must carry — "≤ ", "≥ ", or "" — exactly as passed to
 * `seasonalSamplingClause`, and it applies to both figures this header quotes.
 * The reason it matters more here than on the status line is that the panel
 * prints its own `mean` a few fields earlier already marked as a bound, so the
 * reader sees the inequality whatever this clause does; the CSV states no mean
 * anywhere else, which makes these two the only means in the exported file and
 * leaves nothing to correct them. Both are averages of the very same usable
 * values, so a colormap cap that pushed some months one way pushed each of
 * them the same way (see `probeSstExtremeCensoring` and
 * `probeAerosolCeilingCensoring`) — writing them as plain decimals hands a
 * reader who has outlived the session two point estimates for quantities that
 * are bounds. Rendered as prose rather than the panel's glyph, matching the
 * censoring headers this line sits beside.
 *
 * The offset keeps no inequality and gains a line saying so. Both means are
 * bounds over the same censored months, each wrong by an unknown amount in the
 * same direction, so the sign of the difference between those two errors is
 * precisely what the caps destroyed (Helsel 2e §11) — it is stated as bounded
 * on neither side rather than inheriting a direction the data cannot support.
 * The default keeps every uncensored record, and every layer whose ramp closes
 * at both ends, byte-identical.
 */
export function seasonalSamplingCsvHeaders(
  balance: SeasonalSamplingBalance,
  scale: ProbeScale,
  meanBoundPrefix = ""
): string[] {
  if (!balance.coversFullYear || balance.recordMean === null) return [];
  const digits = csvDecimals(scale);
  const unit = scale.unit ? ` ${csvHeaderText(scale.unit)}` : "";

  if (balance.absentCalendarMonths.length > 0) {
    const absent = balance.absentCalendarMonths.length;
    const named = balance.absentCalendarMonths
      .map((m) => MONTH_NAMES[m - 1])
      .join(" ");
    const one = absent === 1;
    return [
      `# seasonal_sampling: ${absent} of 12 calendar months ${one ? "returns" : "return"} no usable value anywhere in this record (${named}) — a mean of the value column below is not an annual mean and its lowest and highest rows are not annual extremes`,
      // Placed with the clause it qualifies rather than left implicit: the
      // count above says which months are missing, not what their absence
      // does, and a reader correcting for it will ask the direction first.
      `# seasonal_sampling_scope: the absent months are never estimated or gap-filled; which way each statistic moves depends on where those months sit in the local seasonal cycle — a climatology this file does not carry`,
    ];
  }

  const bias = balance.seasonalSamplingBias;
  if (bias === null || Math.abs(bias) < quantizationStep(scale)) return [];
  const sign = bias >= 0 ? "+" : "-";
  // The panel's glyph would be the only one in the file; its neighbours state
  // every bound in words, so this one does too. An unrecognized prefix is
  // treated as no bound rather than guessed at — a wrong direction is worse
  // than the bare decimal this replaces.
  const bound =
    meanBoundPrefix === "≤ "
      ? "at most "
      : meanBoundPrefix === "≥ "
        ? "at least "
        : "";
  return [
    `# seasonal_sampling_bias: the value column averages ${bound}${balance.recordMean.toFixed(digits)}${unit}; weighting each of the 12 calendar months equally gives ${bound}${balance.calendarBalancedMean!.toFixed(digits)}${unit} (${sign}${Math.abs(bias).toFixed(digits)}${unit}) — this record samples the calendar unevenly`,
    `# seasonal_sampling_bias_scope: a re-weighting of the rows below and not a measurement — it estimates no month and changes no exported value`,
    ...(bound
      ? [
          `# seasonal_sampling_bias_censoring: both figures above are one-sided bounds and not measurements — the published colormap collapsed some of this record's months into an open end cap so each mean inherits that cap's direction; the offset between them is a difference of two same-direction errors of unknown size and carries no claimable sign of its own`,
        ]
      : []),
  ];
}
