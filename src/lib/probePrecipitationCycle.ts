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
import {
  describePrecipitationRecordMargin,
  type PrecipitationRecordMargin,
} from "./precipitationRecordMargin";
// Type only, so nothing of the soil bridge reaches this chunk: the interface is
// the probe's own value-precision contract (see probeSoilMoistureStanding.ts),
// and both bridges need the caller to derive it in the eager bundle rather than
// importing `probe.ts` into a lazy chunk.
import type { ProbeValuePrecision } from "./probeSoilMoistureStanding";
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
 * Every reading above is climatology, and none of them says anything about the
 * month the reader actually probed. `precipitationRecordMargin.ts` answers that
 * one question — whether the probed month topped or bottomed its own calendar
 * month's record here, and by how much — and had never been called. It is
 * bridged below and stated only when a strict record was set, so the ordinary
 * probe gains nothing and the extraordinary one stops hiding behind a mean.
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

// --- Same-calendar-month record standing ------------------------------------

/**
 * Place the probe series' most recent observed month against the prior
 * same-calendar-month extreme at the same place, or null when the layer is not
 * precipitation, the mode measures no footprint share, or the series carries no
 * observed month.
 *
 * This is the one question every reading above is blind to. The cycle, the
 * annual total, R and the dry-month run are all CLIMATOLOGY — means and shapes
 * over the whole record — so none of them says anything about the month the
 * reader actually probed. The panel's own `max` is the record's high across
 * every calendar month at once, which in a seasonal place is simply the wettest
 * month of the wet season and can never be beaten by a probed dry-season month
 * however extreme that month was for the time of year.
 *
 * The TARGET is the latest month with a usable value rather than the latest
 * month requested: GLDAS publishes months whose footprint can still be wholly
 * unusable at a given place, and ranking a null would report a standing against
 * nothing. Every other sampled month becomes a candidate;
 * `compareMonthlyClimateToSeasonalBaseline` (inside the descriptor) does all the
 * calendar-month matching, deduplication, coverage filtering, target-year
 * exclusion and the ten-sample floor, so months of the wrong calendar month or
 * of the target's own year are dropped there rather than here.
 *
 * `values` are the probe's PHYSICAL series in mm/day, so each is divided back by
 * {@link SECONDS_PER_DAY} into the metric's native kg/m²/s exactly as the cycle
 * bridge above does. Every value the descriptor returns — the margin included —
 * is therefore native, which is why the clause below converts it back before
 * printing or comparing it to anything measured on the probe's own scale.
 */
export function probePrecipitationRecordMargin(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  validFractions: readonly (number | null)[] | null
): PrecipitationRecordMargin | null {
  if (layerId !== PRECIP_PROBE_LAYER) return null;
  // The baseline screens both the target and every candidate on its usable
  // footprint share and rejects an observation carrying none at any threshold,
  // so a mode that measures no share cannot be ranked through this helper.
  if (!validFractions) return null;

  const observations: MonthlyClimateObservation[] = [];
  let availableThrough: YearMonth | null = null;
  let targetIndex: number | null = null;
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (!month) continue;
    const perDay = values[index] ?? null;
    const share = validFractions[index] ?? null;
    const value = perDay === null ? null : perDay / SECONDS_PER_DAY;
    observations.push({
      metricId: "precipitation-rate",
      dataMonth: month,
      value,
      ...(share === null ? {} : { validFraction: share }),
    });
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

  const { metricId: _targetMetric, ...target } = observations[targetIndex];
  return describePrecipitationRecordMargin(
    target,
    observations
      .filter((_, index) => index !== targetIndex)
      .map(({ metricId: _priorMetric, ...prior }) => prior),
    availableThrough
  );
}

/** Later of two months, used to track the series' own publication frontier. */
function isAfter(month: YearMonth, other: YearMonth): boolean {
  return (
    month.year > other.year ||
    (month.year === other.year && month.month > other.month)
  );
}

/**
 * "precipitation Mar 2012 wettest of 24 prior same-month observations, 0.4 mm/day
 * wetter than Mar 2003 (this record only, GLDAS-Noah modeled rate)" — or "" when
 * no record standing can honestly be quoted.
 *
 * SILENT BY DEFAULT, and deliberately so: it appears only when the probed month
 * strictly beat every prior same-calendar-month observation the probe sampled,
 * which is the minority of probes. A month inside the range keeps the reading
 * the panel already prints — a margin to an extreme it never reached would put a
 * second number on the ordinary case, and the standing itself would be no news.
 * Ties breach nothing, so there is no margin to state and nothing is said.
 *
 * The margin clears the probe's own value resolution before it is quoted. Each
 * end of the difference is an independent colormap inversion carrying half a LUT
 * step (±0.08 mm/day on precipitation's 0–43.2 scale), so a record won by less
 * than one step is not something this method resolved: the record STANDING still
 * holds — it is an ordering, and an ordering survives a shared offset — but its
 * SIZE does not, and quoting "0.1 mm/day wetter" from a ±0.08 measurement would
 * claim a precision the probe does not have. In that case the standing is stated
 * without the margin rather than softened.
 *
 * THE UNIT IS THE TRAP HERE, and it is why this does not simply reuse the soil
 * bridge's phrase. The descriptor works in the metric's native kg/m²/s while the
 * resolution floor and the reader's number are both mm/day, so the margin is
 * converted BEFORE it is compared to the floor. Comparing a native margin
 * (~1e-6) against an mm/day floor (~0.17) would pass every value through and
 * make the gate meaningless. The native unit is asserted rather than assumed, so
 * a metric redefinition drops the phrase instead of silently mis-scaling it.
 *
 * The month named is the EARLIEST holder of the breached extreme — the tie
 * convention the seasonal helpers already use — and it is named as a comparison
 * against that month rather than as a claim about the record as a whole. The
 * parenthetical carries the scope limit and the provenance together, so the
 * reading takes one qualifier and not two.
 */
export function precipitationRecordClause(
  margin: PrecipitationRecordMargin | null,
  precision: ProbeValuePrecision | null
): string {
  if (!margin || !precision) return "";
  const { standing, recordExceedanceMargin, sampleCount } = margin;

  let direction: string;
  let heldBy: YearMonth | null;
  if (standing === "wettest-in-record") {
    direction = "wetter";
    heldBy = margin.priorWettestMonth;
  } else if (standing === "driest-in-record") {
    direction = "drier";
    heldBy = margin.priorDriestMonth;
  } else {
    return "";
  }

  const dataMonth = margin.dataMonth;
  const monthName = MONTH_NAMES[dataMonth.month - 1];
  if (!monthName) return "";
  // The repo's established phrasing for a same-calendar-month record (see
  // standardizedAnomalyNarrative.ts): it states the calendar-month restriction
  // that makes the standing meaningful, and avoids pluralising an abbreviated
  // month name, where "24 prior Mars" would name a planet.
  const priors = `${sampleCount} prior same-month observation${sampleCount === 1 ? "" : "s"}`;
  const standingText = `${direction === "wetter" ? "wettest" : "driest"} of ${priors}`;

  const reading = `${marginPhrase(margin, precision, recordExceedanceMargin, direction, heldBy)}`;
  return (
    `precipitation ${monthName} ${dataMonth.year} ${standingText}${reading} ` +
    `(this record only, GLDAS-Noah modeled rate)`
  );
}

/**
 * ", 0.4 mm/day wetter than Mar 2003" — the size of a resolved record margin, or
 * "" when the probe did not resolve it (see `precipitationRecordClause`).
 */
function marginPhrase(
  margin: PrecipitationRecordMargin,
  precision: ProbeValuePrecision,
  recordExceedanceMargin: number | null,
  direction: string,
  heldBy: YearMonth | null
): string {
  if (recordExceedanceMargin === null || !heldBy) return "";
  // The descriptor reports in the metric's native unit; the floor and the
  // printed number are on the probe's scale. Convert, never compare across.
  if (margin.unit !== PRECIPITATION_NATIVE_UNIT) return "";
  if (precision.unit !== PROBE_PRECIPITATION_UNIT) return "";
  const marginPerDay = recordExceedanceMargin * SECONDS_PER_DAY;
  if (marginPerDay < precision.resolution) return "";

  const heldByName = MONTH_NAMES[heldBy.month - 1];
  if (!heldByName) return "";
  const size = marginPerDay.toFixed(precision.decimals);
  return `, ${size} ${precision.unit} ${direction} than ${heldByName} ${heldBy.year}`;
}

/** Native unit every descriptor value arrives in; asserted, never assumed. */
const PRECIPITATION_NATIVE_UNIT = "kg/m²/s";

/** Unit the probe renders precipitation in, and the resolution floor's own. */
const PROBE_PRECIPITATION_UNIT = "mm/day";
