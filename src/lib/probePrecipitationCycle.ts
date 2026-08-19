import {
  describePrecipitationAnnualCycle,
  type PrecipitationAnnualCycle,
} from "./precipitationAnnualCycle";
import { SECONDS_PER_DAY } from "./precipitationAccumulation";
import {
  describePrecipitationSeasonalTimingSeries,
  type PrecipitationSeasonalTimingSeries,
} from "./precipitationSeasonalTimingSeries";
import {
  describePrecipitationCycleDrySpell,
  type PrecipitationCycleDrySpell,
} from "./precipitationCycleDrySpell";
import {
  summarizeMonthlyClimate,
  type MonthlyClimateObservation,
} from "./climate";
import { precipitationAnnualTotal } from "./precipitationAnnualTotal";
import { MONTH_NAMES, type LayerId, type YearMonth } from "./timeline";

/**
 * Bridge the probe's sampled monthly series into the mean annual precipitation
 * cycle, so the multi-year record the probe already fetches also answers *when
 * in the year the water arrives* — not just min/mean/max and a trend.
 *
 * The probe charts a decade or two of GLDAS months and reduces them to four
 * numbers, none of which is seasonal: a mean over the whole record says nothing
 * about whether the place takes its water in one monsoon or spreads it evenly,
 * and the trend is explicitly seasonally corrected, so it removes exactly the
 * signal this states. `precipitationAnnualCycle.ts` already derives that cycle,
 * audited and tested; nothing had ever called it.
 *
 * The cycle names the wettest and driest calendar months, which answers *which*
 * month is the peak but not *how much of the year's water that peak actually
 * carries*: a place with a 40 mm spread between a gentle wettest and driest
 * month reads the same shape as a monsoon that lands almost everything in one
 * season, and a place with two rainy seasons has a wettest month that hides the
 * second one entirely. `precipitationSeasonalTimingSeries.ts` closes that gap
 * with the Markham circular resultant length R, which is a whole-distribution
 * measure rather than a two-month difference, so it is stated beside the cycle
 * as part of the same reading.
 *
 * Scope is deliberately narrow, for three separate reasons:
 *
 *  - Only the `precip` layer. `precipitationAnnualCycle.ts` stamps every
 *    summary with GLDAS precipitation-rate provenance and integrates each value
 *    as a water depth, so routing any other layer's values through it would
 *    label them as rainfall. Soil moisture is a storage state, not a flux, and
 *    cannot be integrated over a month at all.
 *
 *  - Climatological means only, never an extreme. The reported wettest and
 *    driest months are means of that calendar month across the probed years.
 *    Neither is a record, a wettest month observed, or a return period, and the
 *    range between them is a difference of two means rather than an observed
 *    spread — the clause below says so in its own words.
 *
 *  - Description, never diagnosis. A mean annual cycle is not a wet-season
 *    onset date, monsoon index, drought signal, runoff, water-balance closure,
 *    anomaly against an external baseline, attribution, or forecast, and the
 *    wording infers none of them. R measures only how the observed water is
 *    distributed around the calendar; it classifies nothing.
 */

/** Calendar months a year must supply before it can carry an annual total. */
const MONTHS_IN_YEAR = 12;

/** Mean observed annual precipitation total behind a probe series. */
export interface ProbePrecipitationAnnualTotals {
  /** Complete calendar years that contributed a total. */
  yearsUsed: number;
  /** Mean of those years total depths, in mm water-equivalent. */
  meanTotalMm: number;
}

/** The probe layer whose sampled values are GLDAS precipitation. */
const PRECIP_PROBE_LAYER = "precip";

/**
 * Convert a probe series into published-frontier-tagged climate observations,
 * or null when the layer is not precipitation or the series carries no months.
 *
 * `values` are the probe's PHYSICAL series in mm/day — the units the panel and
 * the CSV report — while `MonthlyClimateObservation` is defined in the metric's
 * native `kg/m²/s`, so each value is divided back by {@link SECONDS_PER_DAY}
 * before it is handed over. Consumers then re-integrate it over each month's own
 * calendar length, which is why an mm/day rate can become a monthly depth
 * without the 28-vs-31-day error a fixed month length would introduce.
 *
 * `availableThrough` is the LATEST month the probe actually supplied. The probe
 * requests only months the layer publishes, so the series' own last month is a
 * safe publication frontier: it can never admit a month the product has not
 * released, and every earlier sampled month stays eligible.
 */
function probePrecipitationObservations(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[]
): {
  observations: MonthlyClimateObservation[];
  availableThrough: YearMonth;
} | null {
  if (layerId !== PRECIP_PROBE_LAYER) return null;

  const observations: MonthlyClimateObservation[] = [];
  let availableThrough: YearMonth | null = null;
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (!month) continue;
    const perDay = values[index] ?? null;
    observations.push({
      metricId: "precipitation-rate",
      dataMonth: month,
      value: perDay === null ? null : perDay / SECONDS_PER_DAY,
    });
    if (
      availableThrough === null ||
      month.year > availableThrough.year ||
      (month.year === availableThrough.year &&
        month.month > availableThrough.month)
    ) {
      availableThrough = month;
    }
  }
  if (availableThrough === null) return null;

  return { observations, availableThrough };
}

/**
 * Summarize the mean annual precipitation cycle from a probe series, or null
 * when the layer is not precipitation or the series carries no months.
 */
export function probePrecipitationCycle(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[]
): PrecipitationAnnualCycle | null {
  const prepared = probePrecipitationObservations(layerId, months, values);
  if (!prepared) return null;
  return describePrecipitationAnnualCycle(
    prepared.observations,
    prepared.availableThrough
  );
}

/**
 * Pool the Markham seasonal-timing vectors of every complete calendar year in a
 * probe series, or null when the layer is not precipitation, the series carries
 * no months, or too few whole years survive the aggregator's guards.
 */
export function probePrecipitationSeasonalTiming(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[]
): PrecipitationSeasonalTimingSeries | null {
  const prepared = probePrecipitationObservations(layerId, months, values);
  if (!prepared) return null;
  return describePrecipitationSeasonalTimingSeries(
    prepared.observations,
    prepared.availableThrough
  );
}

/**
 * One-line mean-annual-cycle clause for the probe panel status, or null when
 * there is nothing defensible to say.
 *
 * Silent in exactly the cases the descriptor withholds an amplitude — a record
 * that does not cover all twelve calendar months at the required years-per-month
 * floor — because a wettest or driest month picked from a partial cycle could be
 * beaten by a calendar month the probe never saw. So a short or gappy record
 * adds no status-line text rather than naming a peak it cannot defend.
 *
 * The years count is the SMALLEST per-month tally rather than the largest or a
 * mean, so `≥ N yr` is true of every month behind the cycle, including the two
 * the clause names. The record's own length would overstate it: a 26-year probe
 * whose Februaries mostly dropped out still prints 26 unless the weakest month
 * sets the number.
 *
 * "not a climate normal" is the descriptor's own limitation and is load-bearing
 * here rather than decorative: these are means over the years the probe happened
 * to sample, not the WMO 30-year normal a reader may assume a "mean annual
 * cycle" to be, and a short record shifts with the years it contains.
 *
 * `drySpell` extends it once more, and answers the question neither the cycle
 * nor R can: both of those are permutation-invariant, so a year with one dry
 * season and a year whose dry months are scattered read identically in each.
 * Run lengths separate them. It is stated only when the cycle itself is, so
 * the twelve gap-free calendar months the descriptor needs are already
 * guaranteed by the guard above.
 *
 * `timing` extends the same reading rather than opening a second one. It is
 * appended only when the pooled vector actually defines a centroid month; a
 * record whose water is spread evenly enough to leave the direction undefined
 * says nothing rather than naming a spurious month. R is printed immediately
 * BEFORE that month precisely so it qualifies it: no threshold is invented to
 * sort places into "seasonal" and "not", because the literature fixes no such
 * boundary — the number carries its own strength, and the complete-year count
 * states how much record stands behind it.
 */
export function precipitationCycleClause(
  cycle: PrecipitationAnnualCycle | null,
  timing: PrecipitationSeasonalTimingSeries | null = null,
  drySpell: PrecipitationCycleDrySpell | null = null,
  annualTotals: ProbePrecipitationAnnualTotals | null = null
): string | null {
  if (!cycle) return null;
  if (cycle.status !== "available") return null;

  const { wettestMonth, driestMonth, amplitudeMm } = cycle;
  if (!wettestMonth || !driestMonth || amplitudeMm === null) return null;

  const years = Math.min(
    ...cycle.monthlyClimatology.map((month) => month.yearsUsed)
  );
  if (!Number.isFinite(years) || years <= 0) return null;

  const wet = MONTH_NAMES[wettestMonth.calendarMonth - 1];
  const dry = MONTH_NAMES[driestMonth.calendarMonth - 1];
  return (
    `mean annual cycle${annualTotalSuffix(annualTotals)}: ` +
    `wettest ${wet} ${formatDepth(wettestMonth.meanMm)}, ` +
    `driest ${dry} ${formatDepth(driestMonth.meanMm)} ` +
    `(range ${formatDepth(amplitudeMm)}; ≥${years} yr per calendar month, ` +
    `means not a climate normal)` +
    seasonalTimingSuffix(timing) +
    drySpellSuffix(drySpell)
  );
}

/**
 * The whole-year total that qualifies the cycle, or "" when no complete
 * calendar year stands behind one.
 *
 * It reads as a parenthetical ON the words "mean annual cycle" rather than as
 * another comma-separated fact, because that is what it is: the cycle names
 * which months are the peak and the trough, and this says how much water the
 * year those months belong to actually brings. Without it the reading gives
 * two monthly means and the gap between them, from which the annual total
 * cannot be recovered at all — a place taking 40 mm every month and a place
 * taking it in two months share every number the clause printed.
 *
 * Its own year count is printed rather than borrowed from the cycle: the two
 * count different things (see probePrecipitationAnnualTotals) and a record can
 * satisfy the cycle in every calendar month while completing fewer whole
 * years, so reusing the cycle number would overstate the total.
 */
function annualTotalSuffix(
  totals: ProbePrecipitationAnnualTotals | null
): string {
  if (!totals) return "";
  return ` (${formatDepth(totals.meanTotalMm)}/yr over ${totals.yearsUsed} complete yr)`;
}

/**
 * The pooled-timing tail of the cycle clause, or "" when no centroid is defined.
 * Kept as a suffix of the one reading so the panel never grows a second
 * precipitation sentence.
 */
function seasonalTimingSuffix(
  timing: PrecipitationSeasonalTimingSeries | null
): string {
  if (!timing) return "";
  const month = timing.centroidMonthName;
  if (!month) return "";
  return (
    `, timing concentration R ${timing.concentration.toFixed(2)} of 1 ` +
    `centred on ${month} (Markham, ${timing.yearsUsed} complete yr)`
  );
}

/**
 * A monthly depth in mm, at a resolution the reading can carry. Three
 * significant figures keep a 4 mm desert month and a 900 mm monsoon month both
 * legible without implying the cycle resolves a tenth of a millimetre.
 */
function formatDepth(mm: number): string {
  return `${Number(mm.toPrecision(3))} mm`;
}

/** Calendar months in the mean annual cycle the dry-month suffix reads. */
const CALENDAR_MONTHS_IN_CYCLE = 12;

/**
 * The dry-month tail of the cycle clause, or "" when nothing can be said.
 *
 * Kept as a further suffix of the SAME reading rather than a second sentence:
 * it qualifies the cycle the clause has already named, so the panel still grows
 * one precipitation statement and not two.
 *
 * The wording is chosen so no invented threshold ever decides what the reader
 * is told. Every branch reports the observed count and lets the number carry
 * its own weight; the only classification in play is the Köppen–Geiger 60 mm
 * dry-month break, which is named in the text precisely because it is a
 * convention rather than something this app fixed. The branches differ only in
 * what is actually TRUE of the cycle, never in confidence:
 *
 *  - No dry month at all, and every month dry, are both real and interesting
 *    readings, and each would be mangled by the generic phrasing ("dry season
 *    0 mo", "dry season 12 mo" — a year with no season at all).
 *  - One contiguous spell is the Köppen dry-season case, so it is named as
 *    such; the descriptor's own docstring licenses that reading at, and only
 *    at, the twelve-month window this clause always uses.
 *  - Several spells is the case every other precipitation index on this line is
 *    blind to, so the spell count leads and the longest run follows it.
 */
function drySpellSuffix(drySpell: PrecipitationCycleDrySpell | null): string {
  if (!drySpell) return "";
  const { dryMonthCount, drySpellCount, longestDryRun } = drySpell;
  const threshold = `${Number(drySpell.dryMonthThresholdMm.toPrecision(3))} mm`;

  if (dryMonthCount === 0) return `, no calendar month below ${threshold}`;
  if (dryMonthCount === CALENDAR_MONTHS_IN_CYCLE) {
    return `, every calendar month below ${threshold}`;
  }
  if (drySpellCount === 1) {
    return `, dry season ${dryMonthCount} mo (Köppen, below ${threshold})`;
  }
  return (
    `, ${dryMonthCount} dry mo in ${drySpellCount} spells, ` +
    `longest ${longestDryRun} mo (Köppen, below ${threshold})`
  );
}

export { describePrecipitationCycleDrySpell };
export type { PrecipitationCycleDrySpell };

/**
 * The mean of every COMPLETE calendar year's precipitation total in a probe
 * series, or null when the layer is not precipitation, the series carries no
 * months, or no single calendar year is complete.
 *
 * This is deliberately NOT the sum of the mean annual cycle's twelve monthly
 * means. Those means may each stand on a different set of years — the cycle
 * requires only a floor per calendar month, not the same years in every one —
 * so adding them composes a year that was never observed. Summing whole
 * observed years instead and averaging those totals keeps every reported
 * number a mean of things that actually happened, and `precipitationAnnual
 * Total.ts` already enforces exactly that: a year missing, duplicating, or
 * failing to resolve any one of its twelve months yields no total at all and
 * is skipped here rather than counted as a short year.
 *
 * `yearsUsed` is therefore its own count and not the cycle's years-per-month
 * floor: a record whose Februaries are patchy can cover all twelve calendar
 * months at three years each while completing far fewer whole years, and the
 * reader is owed the number that actually stands behind the total.
 *
 * The mean is an average of observed annual totals over the years the probe
 * happened to sample — not a WMO 30-year normal, not a return period, and not
 * a water balance. Nothing here infers runoff, storage, or any future year.
 */
export function probePrecipitationAnnualTotals(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[]
): ProbePrecipitationAnnualTotals | null {
  const prepared = probePrecipitationObservations(layerId, months, values);
  if (!prepared) return null;

  const byYear = new Map<number, MonthlyClimateObservation[]>();
  for (const observation of prepared.observations) {
    const year = observation.dataMonth.year;
    const bucket = byYear.get(year);
    if (bucket) bucket.push(observation);
    else byYear.set(year, [observation]);
  }

  let totalOfTotalsMm = 0;
  let yearsUsed = 0;
  for (const [year, group] of byYear) {
    if (group.length !== MONTHS_IN_YEAR) continue;
    const annual = precipitationAnnualTotal(
      group.map((observation) =>
        summarizeMonthlyClimate(observation, prepared.availableThrough)
      ),
      year
    );
    if (!annual) continue;
    totalOfTotalsMm += annual.totalMm;
    yearsUsed++;
  }

  if (yearsUsed === 0) return null;
  return { yearsUsed, meanTotalMm: totalOfTotalsMm / yearsUsed };
}
