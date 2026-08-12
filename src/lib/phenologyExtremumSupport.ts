import {
  NDVI_SOURCE,
  NDVI_UNIT,
  type Hemisphere,
  type NdviAnnualPhenology,
} from "./phenology";
import { type DatasetRef, type YearMonth } from "./timeline";

/**
 * Whether a year's observed NDVI extremum is *supported* by the months around
 * it — i.e. whether the supplied record can stand behind calling it the year's
 * peak or trough at all.
 *
 * {@link summarizeAnnualNdviPhenology} reduces a year to its highest and lowest
 * supplied monthly MOD13A3 NDVI observation. That reduction is honest about
 * *how many* months it had (`coverage.validMonthCount`, `isSparse`) but not
 * about *which* ones: six usable months are enough to emit a peak whether they
 * are January–June or scattered across the year. A run of consecutive missing
 * months is exactly where an unobserved higher (or lower) value would sit, so
 * the same month count can support a peak firmly or barely at all. The
 * mean-annual-cycle descriptor already names this in prose — "a data gap can
 * hide its true trough" — but nothing computed it.
 *
 * This matters for MOD13A3 specifically because its gaps are not random.
 * Monthly compositing drops months to persistent cloud, snow, and low sun, and
 * the colormap leaves sub-ramp pixels undrawn, so absences cluster in the cold,
 * dark, and wet part of the year — the same part that holds the annual trough
 * at mid and high latitudes.
 *
 * Method. For a year's extremum in calendar month `m`, the two adjacent
 * calendar months `m - 1` and `m + 1` are checked against the year's usable
 * months:
 *  - `bracketed` — both adjacent months fall inside the calendar year and both
 *    carry a usable observation. The extremum is flanked by real data.
 *  - `flank-gap` — an adjacent month inside the year carries no usable
 *    observation. The unobserved neighbour could hold a more extreme value.
 *  - `window-edge` — the extremum sits in January or December, so one adjacent
 *    month falls in the neighbouring calendar year and this window cannot see
 *    it at all. A calendar year is an arbitrary cut through a continuous annual
 *    cycle; in the southern hemisphere the growing-season peak legitimately
 *    lands on that cut nearly every year.
 *
 * `window-edge` outranks `flank-gap` because an out-of-window neighbour is
 * unobservable from this summary rather than merely missing from it. Both
 * detail fields stay populated either way, so a caller never has to infer one
 * condition from the other.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - This is a statement about the *sampling*, not about the vegetation. A
 *    `flank-gap` peak is not a wrong measurement; the month reported was
 *    genuinely the greenest one observed. It is only not established as the
 *    year's greenest month.
 *  - `bracketed` does not prove the extremum is the year's true extremum. It
 *    means the two nearest months were observed and were not more extreme. A
 *    monthly composite cannot resolve anything shorter than a month, and months
 *    further away are not consulted.
 *  - Nothing here interprets NDVI. It is not a green-up or senescence date, a
 *    phenophase, growing-season length, productivity, biomass, canopy cover, a
 *    land-cover or ecosystem-condition claim, a trend, a cause, or a forecast.
 *  - The tallies count years, not vegetation. A low bracketed share describes a
 *    cloudy, dark, or snowy record, never a degraded or unhealthy one.
 */

/** Calendar months in a year; the window this descriptor is bounded by. */
export const CALENDAR_MONTHS_IN_YEAR = 12;

/** Honest scope limits shared by the extremum-support descriptor. */
export const NDVI_EXTREMUM_SUPPORT_LIMITATIONS = [
  "This describes the sampling around an observed extremum, not the vegetation; a flank-gap peak is still the greenest month observed, it is simply not established as the year's greenest month.",
  "A bracketed extremum is not proof of the year's true extremum: only the two adjacent months are consulted, and a monthly composite resolves nothing shorter than a month.",
  "MOD13A3 gaps cluster in persistently cloudy, snowy, and low-sun months, so unsupported extrema are more common where the annual trough falls in that part of the year.",
  "A calendar year is an arbitrary window through a continuous annual cycle; a January or December extremum is unbounded on one side by construction, which is the normal southern-hemisphere case rather than a data fault.",
  "NDVI is a unitless vegetation index; nothing here is a green-up or senescence date, phenophase, growing-season length, productivity, biomass, land-cover, or ecosystem-condition claim, a trend, a cause, or a forecast.",
] as const;

/** Support for a single observed extremum, weakest-to-strongest: edge < gap < bracketed. */
export type NdviExtremumSupportStatus =
  "bracketed" | "flank-gap" | "window-edge";

export type NdviExtremumSupportSummaryStatus = "available" | "no-usable-years";

export interface NdviExtremumSupport {
  /** Calendar month of the observed extremum, carried through unchanged. */
  month: YearMonth;
  status: NdviExtremumSupportStatus;
  /**
   * Adjacent months inside this calendar year holding no usable observation.
   * Populated even when `status` is "window-edge", so both conditions stay
   * visible to a caller.
   */
  unobservedFlankMonths: YearMonth[];
  /**
   * True when an adjacent month falls in the previous or next calendar year and
   * so lies outside what this annual summary can observe.
   */
  isAtYearWindowEdge: boolean;
}

export interface NdviExtremumSupportYear {
  year: number;
  peak: NdviExtremumSupport;
  trough: NdviExtremumSupport;
  /** True only when both extrema are bracketed by usable adjacent months. */
  isFullySupported: boolean;
}

export interface NdviExtremumSupportCoverage {
  /** Annual summaries supplied by the caller. */
  suppliedYearCount: number;
  /** Years carrying both an observed peak and trough. */
  usableYearCount: number;
  /** Supplied years with no observed extrema (sparse or no-data). */
  unusableYearCount: number;
  /** Records rejected because the annual summary did not name a whole year. */
  invalidYearCount: number;
  /** Repeated calendar years rejected so one year cannot be weighted twice. */
  duplicateYearCount: number;
  /** Records rejected for different hemisphere, unit, or dataset provenance. */
  incompatibleContextCount: number;
}

/** Year counts by support status; the three counts sum to `usableYearCount`. */
export interface NdviExtremumSupportTally {
  bracketed: number;
  flankGap: number;
  windowEdge: number;
}

export interface NdviExtremumSupportSummary {
  kind: "observed-ndvi-extremum-support";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  hemisphere: Hemisphere;
  status: NdviExtremumSupportSummaryStatus;
  coverage: NdviExtremumSupportCoverage;
  /** Per-year support, oldest to newest. */
  years: NdviExtremumSupportYear[];
  peakTally: NdviExtremumSupportTally;
  troughTally: NdviExtremumSupportTally;
  /** Years where the peak and the trough are both bracketed. */
  fullySupportedYearCount: number;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  /** Short machine-readable reason when no year could be assessed. */
  reason: string | null;
}

/**
 * Assess how well the supplied months support each year's observed NDVI extrema.
 *
 * Reuses the already-validated per-year extrema, usable months, hemisphere, and
 * NASA provenance from {@link summarizeAnnualNdviPhenology}; it re-parses
 * nothing and drops no dataset reference. Only years carrying both an observed
 * peak and trough are assessed, so a sparse year is never counted as a
 * supported one.
 */
export function summarizeNdviExtremumSupport(
  annuals: readonly NdviAnnualPhenology[]
): NdviExtremumSupportSummary {
  const hemisphere: Hemisphere = annuals[0]?.hemisphere ?? "unknown";
  const source = annuals[0]?.source ?? NDVI_SOURCE;

  const years: NdviExtremumSupportYear[] = [];
  const seenYears = new Set<number>();
  let unusableYearCount = 0;
  let invalidYearCount = 0;
  let duplicateYearCount = 0;
  let incompatibleContextCount = 0;
  for (const annual of annuals) {
    if (!Number.isInteger(annual.year)) {
      invalidYearCount += 1;
      continue;
    }
    if (
      annual.hemisphere !== hemisphere ||
      annual.unit !== NDVI_UNIT ||
      !sameDataset(annual.source, source)
    ) {
      incompatibleContextCount += 1;
      continue;
    }
    if (seenYears.has(annual.year)) {
      duplicateYearCount += 1;
      continue;
    }
    seenYears.add(annual.year);
    if (annual.peak === null || annual.trough === null) {
      unusableYearCount += 1;
      continue;
    }

    const observedMonths = usableMonthNumbers(annual);
    const peak = supportFor(annual.peak.month, observedMonths);
    const trough = supportFor(annual.trough.month, observedMonths);
    years.push({
      year: annual.year,
      peak,
      trough,
      isFullySupported:
        peak.status === "bracketed" && trough.status === "bracketed",
    });
  }
  years.sort((a, b) => a.year - b.year);

  const coverage: NdviExtremumSupportCoverage = {
    suppliedYearCount: annuals.length,
    usableYearCount: years.length,
    unusableYearCount,
    invalidYearCount,
    duplicateYearCount,
    incompatibleContextCount,
  };

  return {
    kind: "observed-ndvi-extremum-support",
    isForecast: false,
    hemisphere,
    status: years.length === 0 ? "no-usable-years" : "available",
    coverage,
    years,
    peakTally: tally(years.map(({ peak }) => peak.status)),
    troughTally: tally(years.map(({ trough }) => trough.status)),
    fullySupportedYearCount: years.filter(
      ({ isFullySupported }) => isFullySupported
    ).length,
    source,
    unit: NDVI_UNIT,
    reason: years.length === 0 ? "no-usable-years" : null,
  };
}

/**
 * Calendar-month numbers the year retained as usable observations. Entries are
 * filtered to the summary's own year so a stray record from a neighbouring year
 * cannot be counted as an observed flank.
 */
function usableMonthNumbers(annual: NdviAnnualPhenology): Set<number> {
  const months = new Set<number>();
  for (const month of annual.coverage.validMonths) {
    if (month.year === annual.year) months.add(month.month);
  }
  return months;
}

function supportFor(
  month: YearMonth,
  observedMonths: ReadonlySet<number>
): NdviExtremumSupport {
  const unobservedFlankMonths: YearMonth[] = [];
  let isAtYearWindowEdge = false;
  for (const adjacent of [month.month - 1, month.month + 1]) {
    if (adjacent < 1 || adjacent > CALENDAR_MONTHS_IN_YEAR) {
      isAtYearWindowEdge = true;
      continue;
    }
    if (!observedMonths.has(adjacent)) {
      unobservedFlankMonths.push({ year: month.year, month: adjacent });
    }
  }

  return {
    month,
    status: isAtYearWindowEdge
      ? "window-edge"
      : unobservedFlankMonths.length > 0
        ? "flank-gap"
        : "bracketed",
    unobservedFlankMonths,
    isAtYearWindowEdge,
  };
}

function tally(
  statuses: readonly NdviExtremumSupportStatus[]
): NdviExtremumSupportTally {
  return {
    bracketed: statuses.filter((status) => status === "bracketed").length,
    flankGap: statuses.filter((status) => status === "flank-gap").length,
    windowEdge: statuses.filter((status) => status === "window-edge").length,
  };
}

function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName &&
    a.version === b.version &&
    a.doi === b.doi &&
    a.title === b.title
  );
}

/**
 * A compact, honest readout of how well the record supports its own annual
 * extrema. Emphasizes that an unsupported extremum is a sampling statement, not
 * a claim that the reported month was measured wrongly.
 */
export function formatNdviExtremumSupport(
  summary: NdviExtremumSupportSummary
): string {
  const source = `${summary.source.shortName} v${summary.source.version}`;
  if (summary.status !== "available") {
    return `No NDVI extremum support assessed (${summary.reason ?? "unavailable"}; ${summary.coverage.suppliedYearCount} year(s) supplied); source ${source}`;
  }
  const total = summary.coverage.usableYearCount;
  return `NDVI annual extrema bracketed by observed neighbouring months in ${summary.fullySupportedYearCount}/${total} year(s) (peaks ${summary.peakTally.bracketed} bracketed, ${summary.peakTally.flankGap} beside a data gap, ${summary.peakTally.windowEdge} on the calendar-year edge; troughs ${summary.troughTally.bracketed}/${summary.troughTally.flankGap}/${summary.troughTally.windowEdge}); a gap-flanked extremum is the most extreme month observed, not an established annual extremum; source ${source}`;
}
