import {
  describeSoilMoisturePercentile,
  type SoilMoisturePercentileResult,
} from "./soilMoisturePercentile";
import type { SoilMoistureObservation } from "./soilMoistureChange";
import { MONTH_NAMES, type LayerId, type YearMonth } from "./timeline";

/**
 * Bridge the probe's sampled monthly series into the same-calendar-month
 * soil-moisture percentile, so the record the probe already fetches answers
 * *how this month's ground compares with the same month in other years here* —
 * not just the min/mean/max and a trend the panel already draws.
 *
 * The soil status line is the emptiest of the probed layers: it carries an
 * absence note and a spatial-support note and nothing about the values at all,
 * while `soilMoisturePercentile.ts` has derived exactly this rank, audited and
 * tested, with nothing ever calling it. A reader looking at a soil probe can
 * see that the latest month reads 22 kg/m², and can see the record's mean, but
 * cannot tell whether 22 is ordinary for that calendar month at that place —
 * and column soil water carries a large seasonal cycle, so the whole-record
 * mean the panel prints is not the comparison that answers it.
 *
 * Scope is deliberately narrow, for three separate reasons:
 *
 *  - Only the `soil` layer. `soilMoisturePercentile.ts` forces every candidate
 *    onto the soil-moisture metric, so routing another layer's values through
 *    it would label them as GLDAS column water content.
 *
 *  - Rank only, never a category. The reported number is an empirical
 *    non-exceedance rank of one month within the prior same-calendar-month
 *    months this probe actually sampled. It is not an operational drought
 *    percentile (no D0-D4, no SPI, no soil-moisture percentile product), not a
 *    climatological normal, and not a probability of any future condition.
 *
 *  - Description, never diagnosis. A rank infers no recharge, runoff,
 *    evapotranspiration, water-balance closure, cause, or forecast, and the
 *    clause below wording states its own limits rather than implying them.
 *
 * Unlike the precipitation bridge no unit conversion is needed: the soil scale
 * the probe reports through is already the metric's native kg/m² (a 0-50 column
 * water content), so the physical series is handed over as-is. The assertion
 * that keeps this true lives in probeSoilMoistureStanding.test.ts.
 *
 * Pure, render-free logic (see probeSoilMoistureStanding.test.ts).
 */

/** The probe layer whose sampled values are GLDAS column soil water. */
const SOIL_PROBE_LAYER = "soil";

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
 * soil moisture or the series carries no observed month.
 *
 * The TARGET is the latest month with a usable value rather than the latest
 * month requested: GLDAS publishes months whose footprint can still be wholly
 * unusable at a given place, and ranking a null would report the record's
 * standing against nothing. Every other sampled month becomes a baseline
 * candidate; `compareMonthlyClimateToSeasonalBaseline` (inside the percentile)
 * does all the calendar-month matching, deduplication, coverage filtering,
 * target-year exclusion, and the ten-sample floor, so months of the wrong
 * calendar month or the target's own year are dropped there rather than here.
 *
 * `availableThrough` is the latest month the probe actually supplied. The probe
 * requests only months the layer publishes, so the series' own last month is a
 * safe publication frontier: it can never admit a month the product has not
 * released, and every earlier sampled month stays eligible.
 */
export function probeSoilMoistureStanding(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  validFractions: readonly (number | null)[] | null
): SoilMoisturePercentileResult | null {
  if (layerId !== SOIL_PROBE_LAYER) return null;
  // The baseline screens both the target and every candidate on its usable
  // footprint share, and rejects an observation that carries none at any
  // threshold. A mode that measures no share therefore cannot be ranked
  // through this helper at all, which is why the caller gates on it too.
  if (!validFractions) return null;

  const observations: SoilMoistureObservation[] = [];
  let availableThrough: YearMonth | null = null;
  let targetIndex: number | null = null;
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (!month) continue;
    const value = values[index] ?? null;
    const share = validFractions[index] ?? null;
    observations.push(
      share === null
        ? { dataMonth: month, value }
        : { dataMonth: month, value, validFraction: share }
    );
    if (availableThrough === null || isAfter(month, availableThrough)) {
      availableThrough = month;
    }
    // The series is not guaranteed to arrive in calendar order, so the latest
    // OBSERVED month is tracked by comparison rather than by position.
    if (
      value !== null &&
      (targetIndex === null ||
        isAfter(month, observations[targetIndex].dataMonth))
    ) {
      targetIndex = observations.length - 1;
    }
  }
  if (availableThrough === null || targetIndex === null) return null;

  const target = observations[targetIndex];
  const priors = observations.filter((_, index) => index !== targetIndex);
  return describeSoilMoisturePercentile(target, priors, availableThrough);
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
 * One-line probe clause for the soil-moisture record standing, or "" when no
 * rank can be stated.
 *
 * Silence is the default and covers every unavailable case at once: a layer
 * that is not soil, a record too short for the ten-sample floor, a target the
 * product has not published, and a footprint whose coverage the baseline
 * rejected all return a null percentile, and none of them is worth a line of
 * its own on a panel that already says when a probe came back empty.
 *
 * The two saturating cases are worded as the record standing they are rather
 * than as "0th"/"100th percentile", which reads as a precision the rank does
 * not have — an empirical percentile cannot fall outside the sampled range, so
 * the extreme rank means only that no sampled year was drier (or wetter), which
 * is what the words say. A record with no spread at all — every sampled year
 * equal to the target — saturates at BOTH ends, and is reported as the tie it
 * is rather than as a record in either direction.
 *
 * The single parenthetical carries the provenance and the scope limit together
 * rather than appending a second qualifier to the same reading.
 */
export function soilMoistureStandingClause(
  standing: SoilMoisturePercentileResult | null
): string {
  if (!standing || standing.percentileRank === null) return "";
  const { baseline, sampleCount, isDriestInRecord, isWettestInRecord } =
    standing;
  const dataMonth = baseline.target.dataMonth;
  const monthName = MONTH_NAMES[dataMonth.month - 1];
  if (!monthName) return "";
  const label = `${monthName} ${dataMonth.year}`;
  // The repo's established phrasing for a same-calendar-month record (see
  // standardizedAnomalyNarrative.ts): it states the calendar-month restriction
  // that makes the rank meaningful, and avoids pluralising an abbreviated month
  // name, where "21 prior Mars" would name a planet.
  const priors = `${sampleCount} prior same-month observation${sampleCount === 1 ? "" : "s"}`;

  let standingText: string;
  if (isDriestInRecord && isWettestInRecord) {
    // No spread in the record: every sampled year equals the target.
    standingText = `matches all ${priors}`;
  } else if (isDriestInRecord) {
    standingText = `driest of ${priors}`;
  } else if (isWettestInRecord) {
    standingText = `wettest of ${priors}`;
  } else {
    // Strictly inside the sampled range, so the rank is strictly between 0 and
    // 100; a long record can still round to an endpoint, which would read as
    // the record standing this month does not hold.
    const rounded = Math.min(
      99,
      Math.max(1, Math.round(standing.percentileRank))
    );
    standingText = `at the ${ordinal(rounded)} percentile of ${priors}`;
  }

  return `soil moisture ${label} ${standingText} (empirical rank in this record only, GLDAS-Noah modeled column water, not a drought index)`;
}
