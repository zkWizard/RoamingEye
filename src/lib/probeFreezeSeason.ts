import { airTemperatureInversionRmseK } from "./airTemperatureChangeResolvability";
import { FREEZING_POINT_K } from "./airTemperatureFreeze";
import {
  describeAirTemperatureFreezeSeason,
  type AirTemperatureFreezeSeason,
} from "./airTemperatureFreezeSeason";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import type { ClimateMetricId, MonthlyClimateObservation } from "./climate";
import { MONTH_NAMES, type LayerId, type YearMonth } from "./timeline";

/**
 * Bridge the probe's sampled monthly series into the freeze-season descriptor,
 * so the multi-year record the probe already fetches also answers *how long the
 * cold season is and when it turns* — not just min/mean/max and a trend.
 *
 * The place panel cannot ask this question: it holds a two-month pair, and a
 * freeze season is a property of the whole mean annual cycle. The probe holds
 * the full series, so this is the one surface in the app where the descriptor
 * is well posed.
 *
 * Scope is deliberately narrow:
 *
 *  - Only the `airtemp` layer. `airTemperatureSeasonalCycle.ts` stamps every
 *    cycle with MERRA-2 2 m air-temperature provenance and the kelvin unit, so
 *    routing another layer's values through it would label them as something
 *    they are not. The land-surface-temperature layer is the trap worth naming:
 *    it is a clear-sky radiometric SKIN temperature from a mid-morning overpass,
 *    a different quantity from the 2 m air temperature the freezing-point
 *    partition is defined on, so it is excluded rather than merely unhandled.
 *
 *  - Categories only, never a new temperature. Everything reported here is a
 *    count of months, a calendar-month name, or the exact constant the partition
 *    is taken at; no recovered value is re-rendered.
 *
 *  - A monthly-mean partition is not a frost calendar. The wording below says
 *    "mean freeze season" and nothing about frost dates, growing-season length,
 *    hardiness, permafrost, or ice.
 *
 * The resolvability half exists because the partition is a CATEGORY read off a
 * MEASUREMENT. `probe.ts` recovers each month by inverting a rendered GIBS pixel
 * colour through an approximate legend gradient, and that inversion has a
 * measured end-to-end RMSE for this layer (METHODS §3, docs/validation.md), read
 * here through {@link airTemperatureInversionRmseK} and never re-derived. A
 * climatological mean within that error of 273.15 K is placed on its side of the
 * threshold by the inversion, not by MERRA-2 — and because the partition decides
 * the counts, the regime, and the onset/thaw boundaries, one unresolved month can
 * move all three.
 *
 * Two derivations are deliberate and worth keeping:
 *
 *  - The bound is the SINGLE-month RMSE, with no `sqrt(2)` quadrature term. That
 *    term exists for a month-over-month difference, which draws two independently
 *    inverted months; this comparison draws one inverted mean and sets it against
 *    an exact physical constant, which contributes no error of its own.
 *
 *  - Averaging years does NOT shrink it. A climatological monthly mean averages
 *    `yearsUsed` inverted values, and averaging independent noise would divide
 *    its spread by the square root of that count. But this error is a property of
 *    the legend, not of the draw: the same colour inverts to the same wrong value
 *    every year, so the bias survives the average. Treating it as independent
 *    per-draw noise would understate the bound by roughly the square root of the
 *    record length, so the single-month figure is carried through unreduced. This
 *    is conservative in the other direction only where a month's colour genuinely
 *    varies across years, and that is the safe way to be wrong.
 */

/** The probe layer whose sampled values are MERRA-2 2 m air temperature. */
const AIR_TEMPERATURE_PROBE_LAYER = "airtemp";

/** The climate metric the annual-cycle helper defines its cycle over. */
const AIR_TEMPERATURE_METRIC_ID: ClimateMetricId = "air-temperature-2m";

const CALENDAR_MONTHS_IN_YEAR = 12;

export interface ProbeFreezeSeason {
  /** The classified freeze season; only `status === "classified"` reaches here. */
  season: AirTemperatureFreezeSeason;
  /**
   * Measured single-month colormap-inversion RMSE in kelvin, or null when the
   * layer carries no measured figure in K. Null is never replaced by a guess.
   */
  monthRmseK: number | null;
  /**
   * Calendar months (1–12) whose climatological mean sits within `monthRmseK`
   * of the freezing point, so the pipeline cannot place them on either side.
   * Empty when the record is cleanly separated or the error is uncharacterized.
   */
  unresolvedCalendarMonths: number[];
  /** The reported freeze onset is bounded by an unresolved month. */
  onsetUnresolved: boolean;
  /** The reported thaw is bounded by an unresolved month. */
  thawUnresolved: boolean;
}

/**
 * Summarize the freeze season of a probe series, or null when the layer is not
 * 2 m air temperature, the record is empty, or the mean annual cycle is not
 * complete enough to classify. `values` are physical kelvin aligned
 * index-for-index with `months`; nulls are unsampled or no-data months and are
 * passed through as missing rather than interpolated.
 */
export function probeAirTemperatureFreezeSeason(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[]
): ProbeFreezeSeason | null {
  if (layerId !== AIR_TEMPERATURE_PROBE_LAYER) return null;
  if (months.length === 0) return null;

  const observations: MonthlyClimateObservation[] = months.map(
    (dataMonth, index) => ({
      metricId: AIR_TEMPERATURE_METRIC_ID,
      dataMonth,
      value: values[index] ?? null,
    })
  );
  // The cycle helper drops any month later than `availableThrough`, so the
  // latest sampled month is taken rather than the last array slot: a series
  // that is not in chronological order would otherwise censor its own record.
  const cycle = describeAirTemperatureAnnualCycle(
    observations,
    latestMonth(months)
  );
  const season = describeAirTemperatureFreezeSeason(cycle);
  if (season.status !== "classified") return null;

  const monthRmseK = airTemperatureInversionRmseK();
  const unresolvedCalendarMonths: number[] = [];
  if (monthRmseK !== null) {
    for (const entry of cycle.monthlyClimatology) {
      // Matches the single-month separation test in airTemperatureFreeze.ts:
      // strictly greater than the RMSE is separated, so at-or-within is not.
      if (Math.abs(entry.meanKelvin - FREEZING_POINT_K) <= monthRmseK) {
        unresolvedCalendarMonths.push(entry.calendarMonth);
      }
    }
    unresolvedCalendarMonths.sort((a, b) => a - b);
  }

  // A boundary sits BETWEEN two months that fell on opposite sides, so either
  // one being unresolved can move it. Checking only the named month would miss
  // the case where the month before it is the ambiguous one.
  const unresolved = new Set(unresolvedCalendarMonths);
  const boundaryUnresolved = (month: number | null): boolean =>
    month !== null &&
    (unresolved.has(month) || unresolved.has(previousCalendarMonth(month)));

  return {
    season,
    monthRmseK,
    unresolvedCalendarMonths,
    onsetUnresolved: boundaryUnresolved(season.freezeOnsetMonth),
    thawUnresolved: boundaryUnresolved(season.thawMonth),
  };
}

/**
 * The freeze-season clause for the probe status line, or "" when there is
 * nothing well posed to say. Reports counts and boundaries only, and states the
 * monthly-mean scope inline because the status line carries no other route to
 * the descriptor's limitations.
 */
export function freezeSeasonClause(result: ProbeFreezeSeason | null): string {
  if (result === null) return "";
  const { season } = result;
  const below = season.belowFreezingMonths;
  const threshold = `${FREEZING_POINT_K} K`;

  switch (season.regime) {
    case "frost-free":
      return `mean annual cycle stays at or above ${threshold} in all ${CALENDAR_MONTHS_IN_YEAR} months (frost-free monthly means — daily frost not ruled out)`;
    case "perennial-freeze":
      return `mean annual cycle is below ${threshold} in all ${CALENDAR_MONTHS_IN_YEAR} months (monthly means only — not a permafrost or ice diagnosis)`;
    case "seasonal-freeze":
      return `mean freeze season ${monthName(
        season.freezeOnsetMonth
      )} onset to ${monthName(season.thawMonth)} thaw, ${below} of ${
        CALENDAR_MONTHS_IN_YEAR
      } months below ${threshold} (monthly means, not station frost dates)`;
    case "intermittent-freeze":
      return `${below} of ${CALENDAR_MONTHS_IN_YEAR} months below ${threshold} in ${season.freezeRunCount} separate spells, so onset and thaw are withheld (monthly means only)`;
    default:
      return "";
  }
}

/**
 * The resolvability clause qualifying that partition against the layer's
 * measured colormap-inversion error.
 *
 * Silent for a cleanly separated record and for an uncharacterized layer, so an
 * ordinary readout pays nothing and no figure is ever invented — only a record
 * that actually straddles the threshold carries the qualification.
 */
export function freezeSeasonResolvabilityClause(
  result: ProbeFreezeSeason | null
): string {
  if (result === null || result.monthRmseK === null) return "";
  const count = result.unresolvedCalendarMonths.length;
  if (count === 0) return "";

  const months = result.unresolvedCalendarMonths.map(monthName).join(", ");
  const head = `${months} sit${
    count === 1 ? "s" : ""
  } within the ${formatNumber(
    result.monthRmseK
  )} K measured colormap-inversion error of ${FREEZING_POINT_K} K, so ${
    count === 1 ? "that month's" : `those ${count} months'`
  } side of the threshold is this pipeline's, not MERRA-2's`;

  // Only the boundaries the record actually reports can be qualified: an
  // all-frozen, frost-free, or split season has none, and saying one is
  // unresolved would assert a boundary the descriptor withheld.
  const boundaries: string[] = [];
  if (result.onsetUnresolved) boundaries.push("onset");
  if (result.thawUnresolved) boundaries.push("thaw");
  if (boundaries.length === 0) {
    return `${head}; the month count above may move`;
  }
  return `${head}; the ${boundaries.join(" and ")} boundar${
    boundaries.length === 1 ? "y is" : "ies are"
  } not resolved to a month`;
}

function latestMonth(months: readonly YearMonth[]): YearMonth {
  return months.reduce((latest, candidate) =>
    candidate.year > latest.year ||
    (candidate.year === latest.year && candidate.month > latest.month)
      ? candidate
      : latest
  );
}

function previousCalendarMonth(month: number): number {
  return month === 1 ? CALENDAR_MONTHS_IN_YEAR : month - 1;
}

function monthName(calendarMonth: number | null): string {
  return calendarMonth === null ? "" : MONTH_NAMES[calendarMonth - 1];
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(6)).toString();
}
