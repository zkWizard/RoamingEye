import { FREEZING_POINT_K } from "./airTemperatureFreeze";
import type {
  AirTemperatureAnnualCycle,
  MonthlyClimatology,
} from "./airTemperatureSeasonalCycle";
import type { ClimateMetric } from "./climate";
import type { DatasetRef } from "./timeline";

/**
 * Freeze-season shape of the mean annual 2 m air-temperature cycle.
 *
 * `airTemperatureFreeze` answers "is THIS ONE month's mean above or below the
 * freezing point"; `airTemperatureSeasonalCycle` answers "how wide is the mean
 * cycle from its warmest to its coldest month". This module answers a third,
 * agroclimatically central question about a probed point: across the mean annual
 * cycle, how many months sit below freezing, and — when the cold season is a
 * single contiguous window — when does it begin (freeze onset) and end (thaw)?
 *
 * The count of frost-free months (mean at or above 273.15 K) is the classical
 * proxy for the thermal growing season, and the below-freezing count separates
 * frost-free, seasonally-frozen, and perennially-frozen climates. This helper
 * derives that partition from an already-validated mean annual cycle and nothing
 * more — it invents no thresholds and reads only the monthly means the cycle
 * already reports.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - A month is classified from its multi-year MEAN. A below-freezing mean does
 *    not imply every day froze, and an above-freezing mean does not rule out
 *    frost days; daily highs and lows cannot be recovered from a monthly mean.
 *  - Onset and thaw are month-resolution boundaries read off a short-record mean
 *    cycle, not a 30-year normal. A different set of years can move them a month.
 *  - Onset and thaw are reported ONLY when the below-freezing months form a
 *    single contiguous run on the circular calendar. An all-frozen year, a
 *    frost-free year, or a split (intermittent) cold season yields the counts
 *    but no onset/thaw, so a boundary is never guessed where none is well posed.
 *  - Values inherit the MERRA-2 reanalysis product's resolution and biases and
 *    are area means, not station frost dates. Nothing here is a forecast, trend,
 *    growing-degree-day total, or attribution.
 */

export type FreezeSeasonRegime =
  "frost-free" | "seasonal-freeze" | "perennial-freeze" | "intermittent-freeze";

export type FreezeSeasonStatus = "classified" | "insufficient-cycle";

/** Honest scope limits shared by the freeze-season descriptor. */
export const AIR_TEMPERATURE_FREEZE_SEASON_LIMITATIONS = [
  "Each month is classified from its multi-year mean against the 273.15 K freezing point; a month counts as frozen only when that mean is below freezing.",
  "A below-freezing monthly mean does not imply every day froze, and an above-freezing mean does not rule out frost days; daily extremes cannot be recovered from a monthly mean.",
  "Onset and thaw are month-resolution boundaries read off a short-record mean cycle, not a 30-year normal; a different set of years can shift them by a month.",
  "Onset and thaw are reported only when the below-freezing months form a single contiguous run on the circular calendar; an all-frozen, frost-free, or split cold season yields the counts but no boundaries.",
  "Values are area-mean MERRA-2 reanalysis at the sampled footprint and inherit its resolution and biases; nothing here is a forecast, trend, station frost date, or growing-degree-day total.",
] as const;

export interface AirTemperatureFreezeSeason {
  kind: "air-temperature-freeze-season";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: FreezeSeasonStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of every temperature referenced here. */
  nativeUnit: string;
  /** Freezing-point threshold used, in kelvin (exact, standard pressure). */
  freezingPointKelvin: number;
  /** How many of the twelve climatological months have a mean below freezing. */
  belowFreezingMonths: number;
  /** 12 − belowFreezingMonths; the frost-free (mean ≥ freezing) month count. */
  frostFreeMonths: number;
  /** Calendar months (1–12, Jan→Dec) whose climatological mean is below freezing. */
  belowFreezingCalendarMonths: number[];
  /** Coarse climate class implied by the freeze count; null when not classified. */
  regime: FreezeSeasonRegime | null;
  /** Contiguous below-freezing runs on the circular calendar; 0 when frost-free. */
  freezeRunCount: number;
  /** First below-freezing month of a single contiguous freeze season; else null. */
  freezeOnsetMonth: number | null;
  /** First month the mean returns to/above freezing after that season; else null. */
  thawMonth: number | null;
  limitations: readonly string[];
  /** Short machine-readable reason when no classification is made; else null. */
  reason: string | null;
  /** Honest, provenance-tagged descriptor of the mean cycle only. */
  statement: string;
}

const CALENDAR_MONTHS_IN_YEAR = 12;

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Classify the freeze season of a mean annual 2 m air-temperature cycle. Accepts
 * the output of {@link describeAirTemperatureAnnualCycle} so it reuses the same
 * validated, per-calendar-month climatology rather than re-deriving means. A
 * classification is only produced from a full twelve-month cycle
 * (`status === "available"`); any partial cycle returns `insufficient-cycle`
 * with the cited provenance still attached, because a below-freezing count over
 * missing months would be meaningless.
 */
export function describeAirTemperatureFreezeSeason(
  cycle: AirTemperatureAnnualCycle
): AirTemperatureFreezeSeason {
  const base = {
    kind: "air-temperature-freeze-season" as const,
    isForecast: false as const,
    metric: cycle.metric,
    source: cycle.source,
    nativeUnit: cycle.nativeUnit,
    freezingPointKelvin: FREEZING_POINT_K,
    limitations: AIR_TEMPERATURE_FREEZE_SEASON_LIMITATIONS,
  };

  if (
    cycle.status !== "available" ||
    cycle.monthlyClimatology.length !== CALENDAR_MONTHS_IN_YEAR
  ) {
    return {
      ...base,
      status: "insufficient-cycle",
      belowFreezingMonths: 0,
      frostFreeMonths: 0,
      belowFreezingCalendarMonths: [],
      regime: null,
      freezeRunCount: 0,
      freezeOnsetMonth: null,
      thawMonth: null,
      reason: "cycle-not-full",
      statement: `No freeze-season classification (mean annual cycle incomplete: ${cycle.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${sourceLabel(
        cycle.source
      )}.`,
    };
  }

  // Index the mean of each calendar month (1..12). A month is "frozen" when its
  // multi-year mean is strictly below the freezing point; a mean exactly at
  // freezing is treated as not-frozen so onset/thaw runs stay well defined.
  const meanByMonth = meanByCalendarMonth(cycle.monthlyClimatology);
  const isFrozen: boolean[] = new Array(CALENDAR_MONTHS_IN_YEAR + 1).fill(
    false
  );
  const belowFreezingCalendarMonths: number[] = [];
  for (let month = 1; month <= CALENDAR_MONTHS_IN_YEAR; month++) {
    if (meanByMonth[month] < FREEZING_POINT_K) {
      isFrozen[month] = true;
      belowFreezingCalendarMonths.push(month);
    }
  }

  const belowFreezingMonths = belowFreezingCalendarMonths.length;
  const frostFreeMonths = CALENDAR_MONTHS_IN_YEAR - belowFreezingMonths;

  if (belowFreezingMonths === 0) {
    return {
      ...base,
      status: "classified",
      belowFreezingMonths,
      frostFreeMonths,
      belowFreezingCalendarMonths,
      regime: "frost-free",
      freezeRunCount: 0,
      freezeOnsetMonth: null,
      thawMonth: null,
      reason: null,
      statement: `Mean annual 2 m air-temperature cycle stays at or above the ${FREEZING_POINT_K} K freezing point in all 12 months (frost-free); monthly means only — daily frost days are not ruled out; source ${sourceLabel(
        cycle.source
      )}.`,
    };
  }

  if (belowFreezingMonths === CALENDAR_MONTHS_IN_YEAR) {
    return {
      ...base,
      status: "classified",
      belowFreezingMonths,
      frostFreeMonths,
      belowFreezingCalendarMonths,
      regime: "perennial-freeze",
      // One run spanning the whole circle, but with no above-freezing month
      // there is no onset or thaw boundary to report.
      freezeRunCount: 1,
      freezeOnsetMonth: null,
      thawMonth: null,
      reason: null,
      statement: `Mean annual 2 m air-temperature cycle is below the ${FREEZING_POINT_K} K freezing point in all 12 months (perennially frozen mean); monthly means only — this is not a permafrost or ice diagnosis; source ${sourceLabel(
        cycle.source
      )}.`,
    };
  }

  // A mixed year: locate contiguous below-freezing runs on the circular
  // calendar. An onset is a frozen month whose predecessor is unfrozen; a thaw
  // is an unfrozen month whose predecessor is frozen. The two counts are equal
  // and give the number of distinct cold seasons.
  const onsets: number[] = [];
  const thaws: number[] = [];
  for (let month = 1; month <= CALENDAR_MONTHS_IN_YEAR; month++) {
    const previous = month === 1 ? CALENDAR_MONTHS_IN_YEAR : month - 1;
    if (isFrozen[month] && !isFrozen[previous]) onsets.push(month);
    if (!isFrozen[month] && isFrozen[previous]) thaws.push(month);
  }
  const freezeRunCount = onsets.length;

  if (freezeRunCount === 1) {
    const freezeOnsetMonth = onsets[0];
    const thawMonth = thaws[0];
    return {
      ...base,
      status: "classified",
      belowFreezingMonths,
      frostFreeMonths,
      belowFreezingCalendarMonths,
      regime: "seasonal-freeze",
      freezeRunCount,
      freezeOnsetMonth,
      thawMonth,
      reason: null,
      statement: `Mean annual 2 m air-temperature cycle is below the ${FREEZING_POINT_K} K freezing point for ${belowFreezingMonths} of 12 months (${frostFreeMonths} frost-free); the mean freeze season runs from ${monthName(
        freezeOnsetMonth
      )} onset to ${monthName(
        thawMonth
      )} thaw; monthly means only, not station frost dates; source ${sourceLabel(
        cycle.source
      )}.`,
    };
  }

  // Two or more disjoint below-freezing spells: report the counts but withhold a
  // single onset/thaw, which would misrepresent a split cold season.
  return {
    ...base,
    status: "classified",
    belowFreezingMonths,
    frostFreeMonths,
    belowFreezingCalendarMonths,
    regime: "intermittent-freeze",
    freezeRunCount,
    freezeOnsetMonth: null,
    thawMonth: null,
    reason: null,
    statement: `Mean annual 2 m air-temperature cycle is below the ${FREEZING_POINT_K} K freezing point for ${belowFreezingMonths} of 12 months, split across ${freezeRunCount} separate spells; onset and thaw withheld (not a single contiguous freeze season); source ${sourceLabel(
      cycle.source
    )}.`,
  };
}

function meanByCalendarMonth(
  monthlyClimatology: readonly MonthlyClimatology[]
): number[] {
  const meanByMonth = new Array(CALENDAR_MONTHS_IN_YEAR + 1).fill(NaN);
  for (const entry of monthlyClimatology) {
    meanByMonth[entry.calendarMonth] = entry.meanKelvin;
  }
  return meanByMonth;
}

function monthName(calendarMonth: number): string {
  return MONTH_ABBREVIATIONS[calendarMonth - 1];
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
