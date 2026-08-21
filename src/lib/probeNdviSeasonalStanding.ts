import {
  describeNdviSeasonalPercentile,
  type NdviSeasonalPercentileResult,
} from "./phenologySeasonalPercentile";
import type { NdviMonthlyObservation } from "./phenology";
import { MONTH_NAMES, type LayerId, type YearMonth } from "./timeline";

/**
 * Bridge the probe's sampled monthly series into the same-calendar-month NDVI
 * percentile, so the multi-year record the probe already fetches answers *is
 * this month greener or less green than usual for here* — not just the
 * min/mean/max and a trend the panel already draws.
 *
 * The vegetation status line says when the greenest month of a year tends to
 * fall, but nothing about where the latest month's own value stands, while
 * `phenologySeasonalPercentile.ts` has derived exactly that rank, audited and
 * tested, with nothing ever calling it. A reader looking at an NDVI probe can
 * see that the latest month reads 0.62, and can see the record's mean, but
 * cannot tell whether 0.62 is ordinary for that calendar month at that place —
 * and NDVI carries a large seasonal cycle whose amplitude varies enormously by
 * land cover, so the whole-record mean the panel prints is not the comparison
 * that answers it.
 *
 * Scope is deliberately narrow, for four separate reasons:
 *
 *  - Only the `ndvi` layer. `phenologyBaseline.ts` stamps every summary with
 *    MOD13A3 NDVI provenance and the NDVI unit. EVI ships from the same MOD13A3
 *    product but is a different index, so routing EVI values through these
 *    helpers would label an EVI summary as NDVI, and the probe's remaining
 *    layers are not vegetation indices at all.
 *
 *  - Only a mode that measures a usable footprint share. The seasonal baseline
 *    screens both the target and every candidate on that share and rejects an
 *    observation carrying none at any threshold, so a point probe cannot be
 *    ranked through this helper — see `probeNdviSeasonalSeries` below.
 *
 *  - Rank only, never a category. The reported number is an empirical
 *    non-exceedance rank of one month within the prior same-calendar-month
 *    months this probe actually sampled. It is not a vegetation-condition
 *    index (no VCI, no VHI, no drought class), not a climatological normal,
 *    and not a probability of any future condition.
 *
 *  - Description, never diagnosis. A rank infers no green-up, senescence,
 *    phenophase, growing-season length, productivity, biomass, habitat quality,
 *    ecosystem health, cause, or forecast, and the clause wording below states
 *    its own limits rather than implying them.
 *
 * Unlike the peak-timing bridge this one does report a magnitude, so the
 * colormap inversion's own resolution has to bound it: a year's peak *month* is
 * an argmax and survives the ramp's absolute calibration error, whereas a
 * difference between two inverted values does not. The margin below is
 * therefore withheld unless it clears one LUT step of the probe's own scale.
 *
 * Pure, render-free logic (see probeNdviSeasonalStanding.test.ts).
 */

/** The probe layer whose sampled values are MOD13A3 NDVI. */
const NDVI_PROBE_LAYER = "ndvi";

/**
 * How finely the probe actually resolved the values a margin is differenced
 * from, supplied by the caller rather than read from `probe.ts` here.
 *
 * The numbers are `quantizationStep` and `csvDecimals` of the probed layer's
 * scale — the repository's single value-precision rule — but this module is
 * lazily imported, and pulling `probe.ts` into its chunk re-factors Rollup's
 * shared chunks and moves weight into the entry bundle. The caller already
 * holds the scale in the eager bundle, so it derives both there and passes them
 * as data. Mirrors `ProbeValuePrecision` in probeSoilMoistureStanding.ts.
 */
export interface NdviValuePrecision {
  /** One LUT step on the layer's scale: the finest difference it resolves. */
  resolution: number;
  /** Decimals the probe renders this layer's values with. */
  decimals: number;
  /** Unit those values are rendered in; empty for the dimensionless index. */
  unit: string;
}

/** Later of two months, used to track the series' own publication frontier. */
function isAfter(month: YearMonth, other: YearMonth): boolean {
  return (
    month.year > other.year ||
    (month.year === other.year && month.month > other.month)
  );
}

/**
 * Rank the probe series' most recent observed month against the same calendar
 * month in every other year the probe sampled, or null when the layer is not
 * NDVI, the mode measures no footprint share, or the series carries no observed
 * month.
 *
 * The TARGET is the latest month with a usable value rather than the latest
 * month requested: MOD13A3 publishes months whose compositing window can still
 * come back wholly cloud-blocked at a given place, and ranking a null would
 * report the record's standing against nothing. Every other sampled month
 * becomes a baseline candidate; `compareMonthlyNdviToSeasonalBaseline` (inside
 * the percentile) does all the calendar-month matching, deduplication, coverage
 * filtering, target-year exclusion, and the ten-sample floor, so months of the
 * wrong calendar month or the target's own year are dropped there rather than
 * here.
 *
 * `availableThrough` is the latest month the probe actually supplied. The probe
 * requests only months the layer publishes, so the series' own last month is a
 * safe publication frontier: it can never admit a month the product has not
 * released, and every earlier sampled month stays eligible.
 *
 * `latitude` reaches the baseline only as a hemisphere and a calendar-season
 * label; it gates nothing, and no season name is rendered by the clause below.
 */
export function probeNdviSeasonalStanding(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  validFractions: readonly (number | null)[] | null,
  latitude: number
): NdviSeasonalPercentileResult | null {
  const series = probeNdviSeasonalSeries(
    layerId,
    months,
    values,
    validFractions
  );
  if (!series) return null;
  return describeNdviSeasonalPercentile(
    series.target,
    series.priors,
    series.availableThrough,
    latitude
  );
}

/**
 * The target, the prior candidates and the publication frontier the percentile
 * is built from, or null when the layer is not NDVI, the mode measures no
 * footprint share, or the series carries no observed month.
 */
function probeNdviSeasonalSeries(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  validFractions: readonly (number | null)[] | null
): {
  target: NdviMonthlyObservation;
  priors: NdviMonthlyObservation[];
  availableThrough: YearMonth;
} | null {
  if (layerId !== NDVI_PROBE_LAYER) return null;
  // The baseline screens both the target and every candidate on its usable
  // footprint share, and rejects an observation that carries none at any
  // threshold. A mode that measures no share therefore cannot be ranked through
  // this helper at all, which is why the caller gates on it too.
  if (!validFractions) return null;

  const observations: NdviMonthlyObservation[] = [];
  let availableThrough: YearMonth | null = null;
  let targetIndex: number | null = null;
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (!month) continue;
    const ndvi = values[index] ?? null;
    const share = validFractions[index] ?? null;
    observations.push(
      share === null ? { month, ndvi } : { month, ndvi, validFraction: share }
    );
    if (availableThrough === null || isAfter(month, availableThrough)) {
      availableThrough = month;
    }
    // The series is not guaranteed to arrive in calendar order, so the latest
    // OBSERVED month is tracked by comparison rather than by position.
    if (
      ndvi !== null &&
      (targetIndex === null || isAfter(month, observations[targetIndex].month))
    ) {
      targetIndex = observations.length - 1;
    }
  }
  if (availableThrough === null || targetIndex === null) return null;

  return {
    target: observations[targetIndex],
    priors: observations.filter((_, index) => index !== targetIndex),
    availableThrough,
  };
}

/** English ordinal suffix for a whole percentile rank (1st, 2nd, 13th, 21st). */
function ordinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/**
 * "0.043 NDVI above Jul 2012" — how far a NEW same-month record beat the month
 * that held it, or "" when no margin can honestly be quoted.
 *
 * This is the one question the rank cannot answer. An empirical percentile
 * saturates: it can never leave the range it was sampled from, so a month that
 * tops or bottoms the record reads as "greenest of 24 prior same-month
 * observations" whether it beat the prior high by a hair or by half the
 * record's spread. The margin — and the month that actually held the record —
 * is the difference between those two readings, and it is recoverable from
 * nothing else the panel prints.
 *
 * Three separate conditions have to hold, and each drops the phrase in silence
 * rather than softening it:
 *
 *  - The standing is a STRICT new record: no prior same-month observation
 *    reached the target's value either. A tie breaches nothing, so there is no
 *    margin to state; the flat-record case ties both extremes at once and is
 *    already worded as the tie it is. Months strictly inside the range keep the
 *    rank alone — a margin to an extreme neither of them reached would be a
 *    second number on the ordinary case, which is most of them.
 *
 *  - The margin clears the probe's own value resolution. Each end of the
 *    difference is a colormap inversion carrying half a LUT step (±0.002 on
 *    NDVI's 0-1 scale), so a record won by less than one step is not something
 *    this method resolved — the record standing still holds, but its size does
 *    not, and quoting "0.000 NDVI above" from a ±0.002 measurement would claim
 *    a precision the probe does not have.
 *
 *  - The record's values are still the probe's own. The resolution floor is
 *    measured on the probe scale, and the baseline retains supplied NDVI
 *    unconverted, so the two are comparable only while the vegetation index
 *    needs no conversion (asserted in probeNdviSeasonalStanding.test.ts).
 *
 * The month named is the EARLIEST holder of the breached extreme, which is the
 * tie convention the seasonal helpers already use, and it is named as a
 * comparison against that month rather than as a claim about the record as a
 * whole.
 */
function recordMarginPhrase(
  standing: NdviSeasonalPercentileResult,
  precision: NdviValuePrecision | null
): string {
  if (!precision) return "";
  const target = standing.baseline.target.observedValue;
  if (target === null) return "";
  // A tie reaches the extreme without breaching it, so only a record held by
  // nothing else has a margin at all.
  if (standing.tiedRecordCount !== 0) return "";

  const samples = standing.baseline.samples;
  if (samples.length === 0) return "";

  let heldBy: YearMonth | null = null;
  let extreme: number;
  let direction: string;
  if (standing.isGreenestInRecord) {
    direction = "above";
    // Samples arrive sorted oldest to newest and the comparison is strict, so
    // the holder kept is the EARLIEST month at the extreme — the tie convention
    // the seasonal helpers already use.
    extreme = -Infinity;
    for (const sample of samples) {
      if (sample.ndvi > extreme) {
        extreme = sample.ndvi;
        heldBy = sample.month;
      }
    }
  } else if (standing.isLeastGreenInRecord) {
    direction = "below";
    extreme = Infinity;
    for (const sample of samples) {
      if (sample.ndvi < extreme) {
        extreme = sample.ndvi;
        heldBy = sample.month;
      }
    }
  } else {
    return "";
  }
  if (!heldBy) return "";
  const heldByName = MONTH_NAMES[heldBy.month - 1];
  if (!heldByName) return "";

  const margin = Math.abs(target - extreme);
  if (!Number.isFinite(margin) || margin < precision.resolution) return "";

  const size = margin.toFixed(precision.decimals);
  // NDVI is dimensionless, so the probe scale carries no unit suffix; the index
  // is named instead of leaving a bare number beside a month.
  const unit = precision.unit || "NDVI";
  return `${size} ${unit} ${direction} ${heldByName} ${heldBy.year}`;
}

/**
 * One-line probe clause for the vegetation-index record standing, or "" when no
 * rank can be stated.
 *
 * Silence is the default and covers every unavailable case at once: a layer
 * that is not NDVI, a mode that measures no footprint share, a record too short
 * for the ten-sample floor, a target the product has not published, and a
 * footprint whose coverage the baseline rejected all return a null percentile,
 * and none of them is worth a line of its own on a panel that already says when
 * a probe came back empty.
 *
 * The two saturating cases are worded as the record standing they are rather
 * than as "0th"/"100th percentile", which reads as a precision the rank does
 * not have — an empirical percentile cannot fall outside the sampled range, so
 * the extreme rank means only that no sampled year was greener (or less green),
 * which is what the words say. A record with no spread at all — every sampled
 * year equal to the target — saturates at BOTH ends, and is reported as the tie
 * it is rather than as a record in either direction.
 *
 * A new record additionally states how far it beat the month that held it, the
 * one fact the saturating rank above cannot carry. It is a FACT about the same
 * reading, not a further qualifier on it, so it joins the rank inside the
 * existing sentence and the reading keeps its single parenthetical.
 *
 * The single parenthetical carries the provenance and the scope limit together
 * rather than appending a second qualifier to the same reading.
 */
export function ndviSeasonalStandingClause(
  standing: NdviSeasonalPercentileResult | null,
  precision: NdviValuePrecision | null = null
): string {
  if (!standing || standing.percentileRank === null) return "";
  const { sampleCount, isGreenestInRecord, isLeastGreenInRecord } = standing;
  const dataMonth = standing.baseline.target.dataMonth;
  const monthName = MONTH_NAMES[dataMonth.month - 1];
  if (!monthName) return "";
  const label = `${monthName} ${dataMonth.year}`;
  // The repo's established phrasing for a same-calendar-month record (see
  // standardizedAnomalyNarrative.ts): it states the calendar-month restriction
  // that makes the rank meaningful, and avoids pluralising an abbreviated month
  // name, where "21 prior Mars" would name a planet.
  const priors = `${sampleCount} prior same-month observation${sampleCount === 1 ? "" : "s"}`;

  let standingText: string;
  if (isGreenestInRecord && isLeastGreenInRecord) {
    // No spread in the record: every sampled year equals the target.
    standingText = `matches all ${priors}`;
  } else if (isGreenestInRecord) {
    standingText = `greenest of ${priors}`;
  } else if (isLeastGreenInRecord) {
    standingText = `least green of ${priors}`;
  } else {
    // Strictly inside the sampled range, so the rank is strictly between 0 and
    // 100. The clamp is a guard rather than a case MOD13A3 can reach: rounding
    // an interior rank onto an endpoint would need over 200 prior same-month
    // observations, and the product record holds at most one per year.
    const rounded = Math.min(
      99,
      Math.max(1, Math.round(standing.percentileRank))
    );
    standingText = `at the ${ordinal(rounded)} percentile of ${priors}`;
  }

  // Only a strict record yields a phrase here, and the rank above already reads
  // as that record whenever one is set: `isGreenestInRecord` is "no sampled
  // month was greener", which a strict new high always satisfies. The two can
  // therefore never disagree about which record is being described.
  const margin = recordMarginPhrase(standing, precision);
  const reading = margin ? `${standingText}, ${margin}` : standingText;

  return `NDVI ${label} ${reading} (empirical rank in this record only, MOD13A3 vegetation index, not a measure of vegetation amount)`;
}
