import {
  describePrecipitationAnnualCycle,
  type PrecipitationAnnualCycle,
} from "./precipitationAnnualCycle";
import { SECONDS_PER_DAY } from "./precipitationAccumulation";
import {
  describePrecipitationSeasonalTimingSeries,
  type PrecipitationSeasonalTimingSeries,
} from "./precipitationSeasonalTimingSeries";
import type { MonthlyClimateObservation } from "./climate";
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
  timing: PrecipitationSeasonalTimingSeries | null = null
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
    `mean annual cycle: wettest ${wet} ${formatDepth(wettestMonth.meanMm)}, ` +
    `driest ${dry} ${formatDepth(driestMonth.meanMm)} ` +
    `(range ${formatDepth(amplitudeMm)}; ≥${years} yr per calendar month, ` +
    `means not a climate normal)` +
    seasonalTimingSuffix(timing)
  );
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
