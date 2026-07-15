import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  summarizeOceanConditions,
  type OceanConditionSummary,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import { neumaierSum } from "./numerics";
import type { UsableSstFootprint } from "./oceanSeasonalBaseline";
import type { YearMonth } from "./timeline";

/**
 * Source-aware calendar-month climatology of supplied MODIS/Aqua SST values.
 *
 * {@link summarizeOceanConditionSeries} deliberately refuses to average a
 * supplied set of months ("it is not a climatology"), because an unweighted mean
 * across an arbitrary mix of calendar months would confound the seasonal cycle
 * with interannual variability. This helper instead groups supplied observations
 * by calendar month, averages each calendar month across its supplied years at a
 * single surface footprint, and reports the resulting warmest and coldest
 * climatological months and their difference (the seasonal-cycle amplitude).
 *
 * Everything stays in the source unit and honest about its record: the monthly
 * means are an observed-record annual cycle, not a fitted harmonic and not an
 * official climate normal. Open-water and land-mixed coastal footprints are
 * never combined. Nothing here infers biological abundance, habitat quality,
 * ecosystem health, marine heat stress, causation, or future ocean conditions.
 */

/** Three distinct years is a conservative floor for a per-month climatology. */
export const MINIMUM_YEARS_PER_CLIMATOLOGICAL_MONTH = 3;

/** Two qualifying calendar months are needed for a warmest-vs-coldest range. */
export const MINIMUM_QUALIFIED_MONTHS_FOR_CYCLE = 2;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_SST_SEASONAL_CYCLE_VALID_FRACTION = 0.6;

export type SstSeasonalCycleStatus =
  | "available"
  | "no-usable-observations"
  | "insufficient-qualified-months"
  | "invalid";

export interface SstSeasonalCycleOptions {
  /**
   * Footprint to build the climatology for. Defaults to the footprint carrying
   * the most usable supplied observations (ties resolve to open water), so a
   * caller never has to know the split in advance.
   */
  footprint?: UsableSstFootprint;
  /** Minimum distinct years required for a calendar month to qualify. */
  minimumYearsPerMonth?: number;
  /** Minimum usable spatial fraction for a contributing observation. */
  minimumValidFraction?: number;
}

export interface SstClimatologicalMonth {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Mean of the per-year SST values for this calendar month, in the source unit. */
  mean: number;
  /** Distinct years contributing to the mean. */
  yearCount: number;
  /** Coldest single-year value behind the mean, for auditability. */
  min: number;
  /** Warmest single-year value behind the mean, for auditability. */
  max: number;
  /** Whether the month met the minimum-years threshold to be comparable. */
  qualified: boolean;
}

export interface SstSeasonalCycleExtreme {
  calendarMonth: number;
  /** Climatological mean SST for the month, in the source unit. */
  mean: number;
  /** Distinct years behind the mean. */
  yearCount: number;
}

export interface SstSeasonalCycleExclusions {
  /** Supplied observations without a usable calendar month. */
  invalidMonth: number;
  /** Land, missing, invalid, or a footprint other than the chosen one. */
  footprintMismatch: number;
  /** Right footprint but usable spatial fraction below the threshold. */
  insufficientCoverage: number;
  /** Same (calendar month, year) supplied more than once; only the first is kept. */
  duplicateYearMonth: number;
}

export interface SstSeasonalCycleSummary {
  kind: "observed-sst-seasonal-cycle";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  status: SstSeasonalCycleStatus;
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  /** Footprint the climatology was built for, or null when none was usable. */
  footprint: UsableSstFootprint | null;
  requiredYearsPerMonth: number;
  requiredValidFraction: number;
  requiredQualifiedMonths: number;
  /** Every calendar month with at least one contributing year, ordered 1-12. */
  months: SstClimatologicalMonth[];
  /** Distinct calendar months that met the minimum-years threshold. */
  qualifiedMonthCount: number;
  /** Warmest qualifying climatological month; null when unavailable. */
  warmestMonth: SstSeasonalCycleExtreme | null;
  /** Coldest qualifying climatological month; null when unavailable. */
  coldestMonth: SstSeasonalCycleExtreme | null;
  /**
   * Warmest-minus-coldest qualifying monthly mean (>= 0), in `amplitudeUnit`.
   * A range of climatological monthly means, not a variance, trend, or forecast.
   */
  seasonalAmplitude: number | null;
  amplitudeUnit: string;
  exclusions: SstSeasonalCycleExclusions;
  limitations: typeof SST_SEASONAL_CYCLE_LIMITATIONS;
  /** Short machine-readable reason when no amplitude is reported. */
  reason: string | null;
}

export const SST_SEASONAL_CYCLE_LIMITATIONS = [
  "Monthly means average the supplied years for each calendar month; they are an observed-record cycle, not a fitted harmonic or an official climate normal.",
  "Calendar months may rest on different numbers of years, so the warmest and coldest months need not share sampling depth.",
  "Open-water and land-mixed coastal footprints are never combined; the cycle describes one footprint only.",
  "Amplitude is the warmest-minus-coldest monthly-mean difference in the source unit; it is not a variance, trend, or forecast.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement.",
] as const;

/**
 * Build a same-footprint calendar-month SST climatology and reduce it to the
 * warmest and coldest climatological months and their difference. A calendar
 * month must gather at least `minimumYearsPerMonth` distinct years to qualify,
 * and at least two calendar months must qualify before an amplitude is reported,
 * so a sparse record yields an honest `insufficient-qualified-months` rather
 * than a one-month "cycle". Duplicate (calendar month, year) inputs keep only
 * the first so a re-supplied month cannot skew a monthly mean.
 */
export function summarizeSstSeasonalCycle(
  observations: readonly SeaSurfaceTemperatureObservation[],
  options: SstSeasonalCycleOptions = {}
): SstSeasonalCycleSummary {
  const requiredYearsPerMonth =
    options.minimumYearsPerMonth ?? MINIMUM_YEARS_PER_CLIMATOLOGICAL_MONTH;
  const requiredValidFraction =
    options.minimumValidFraction ?? MINIMUM_SST_SEASONAL_CYCLE_VALID_FRACTION;
  const validOptions =
    Number.isInteger(requiredYearsPerMonth) &&
    requiredYearsPerMonth > 0 &&
    Number.isFinite(requiredValidFraction) &&
    requiredValidFraction >= 0 &&
    requiredValidFraction <= 1 &&
    (options.footprint === undefined ||
      options.footprint === "water" ||
      options.footprint === "land-mixed-coastal");

  const exclusions = emptyExclusions();

  if (!validOptions) {
    return emptySummary(
      "invalid",
      null,
      requiredYearsPerMonth,
      requiredValidFraction,
      exclusions,
      "invalid-cycle-configuration"
    );
  }

  const summaries = observations.map((observation) => {
    const summary = summarizeOceanConditions(observation);
    return { summary, footprint: usableFootprint(summary) };
  });

  const footprint = options.footprint ?? dominantFootprint(summaries);
  if (footprint === null) {
    return emptySummary(
      "no-usable-observations",
      null,
      requiredYearsPerMonth,
      requiredValidFraction,
      exclusions,
      "no-usable-sst-observations"
    );
  }

  // calendarMonth -> (year -> value), deduplicating repeated year-months.
  const byMonth = new Map<number, Map<number, number>>();
  for (const { summary, footprint: obsFootprint } of summaries) {
    if (!isCalendarMonth(summary.dataMonth)) {
      exclusions.invalidMonth += 1;
      continue;
    }
    if (obsFootprint === null || obsFootprint !== footprint) {
      // Land, missing, invalid, or the other footprint: never mixed in.
      exclusions.footprintMismatch += 1;
      continue;
    }
    if (!meetsCoverage(summary, requiredValidFraction)) {
      exclusions.insufficientCoverage += 1;
      continue;
    }

    const calendarMonth = summary.dataMonth.month;
    const year = summary.dataMonth.year;
    let years = byMonth.get(calendarMonth);
    if (years === undefined) {
      years = new Map<number, number>();
      byMonth.set(calendarMonth, years);
    }
    if (years.has(year)) {
      exclusions.duplicateYearMonth += 1;
      continue;
    }
    years.set(year, summary.observedValue as number);
  }

  const months = buildClimatologicalMonths(byMonth, requiredYearsPerMonth);
  const qualified = months.filter((month) => month.qualified);

  const base = {
    footprint,
    requiredYearsPerMonth,
    requiredValidFraction,
    months,
    qualifiedMonthCount: qualified.length,
    exclusions,
  };

  if (qualified.length < MINIMUM_QUALIFIED_MONTHS_FOR_CYCLE) {
    return {
      ...cycleSummary(base),
      status: "insufficient-qualified-months",
      warmestMonth: null,
      coldestMonth: null,
      seasonalAmplitude: null,
      reason: "too-few-qualified-calendar-months",
    };
  }

  const warmest = pickExtreme(qualified, "warmest");
  const coldest = pickExtreme(qualified, "coldest");

  return {
    ...cycleSummary(base),
    status: "available",
    warmestMonth: warmest,
    coldestMonth: coldest,
    seasonalAmplitude: warmest.mean - coldest.mean,
    reason: null,
  };
}

/**
 * Choose the footprint (open water vs. land-mixed coastal) carrying the most
 * usable observations, so the caller need not know the split. Ties resolve to
 * open water; a set with no usable footprint returns null.
 */
function dominantFootprint(
  summaries: readonly { footprint: UsableSstFootprint | null }[]
): UsableSstFootprint | null {
  let water = 0;
  let coastal = 0;
  for (const { footprint } of summaries) {
    if (footprint === "water") water += 1;
    else if (footprint === "land-mixed-coastal") coastal += 1;
  }
  if (water === 0 && coastal === 0) return null;
  return coastal > water ? "land-mixed-coastal" : "water";
}

function buildClimatologicalMonths(
  byMonth: ReadonlyMap<number, ReadonlyMap<number, number>>,
  requiredYearsPerMonth: number
): SstClimatologicalMonth[] {
  const months: SstClimatologicalMonth[] = [];
  for (const [calendarMonth, years] of byMonth) {
    const values = [...years.values()];
    months.push({
      calendarMonth,
      mean: neumaierSum(values) / values.length,
      yearCount: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      qualified: values.length >= requiredYearsPerMonth,
    });
  }
  months.sort((a, b) => a.calendarMonth - b.calendarMonth);
  return months;
}

/**
 * Pick the warmest or coldest qualifying month, breaking value ties toward the
 * earliest calendar month so the result is deterministic and order-independent.
 */
function pickExtreme(
  qualified: readonly SstClimatologicalMonth[],
  which: "warmest" | "coldest"
): SstSeasonalCycleExtreme {
  let best = qualified[0];
  for (const month of qualified) {
    if (month.mean === best.mean) {
      if (month.calendarMonth < best.calendarMonth) best = month;
      continue;
    }
    const isMoreExtreme =
      which === "warmest" ? month.mean > best.mean : month.mean < best.mean;
    if (isMoreExtreme) best = month;
  }
  return {
    calendarMonth: best.calendarMonth,
    mean: best.mean,
    yearCount: best.yearCount,
  };
}

/**
 * The footprint whose coverage yields a usable SST value, or null when the
 * summary is land, missing, or invalid. Coastal and open-water SST are kept
 * distinct so a climatology never averages across them.
 */
function usableFootprint(
  summary: OceanConditionSummary
): UsableSstFootprint | null {
  if (summary.observedValue === null) return null;
  if (
    summary.coverage.status === "water" ||
    summary.coverage.status === "land-mixed-coastal"
  ) {
    return summary.coverage.status;
  }
  return null;
}

function meetsCoverage(
  summary: OceanConditionSummary,
  minimumValidFraction: number
): summary is OceanConditionSummary & { coverage: { validFraction: number } } {
  return (
    summary.coverage.validFraction !== null &&
    summary.coverage.validFraction >= minimumValidFraction
  );
}

function cycleSummary(base: {
  footprint: UsableSstFootprint;
  requiredYearsPerMonth: number;
  requiredValidFraction: number;
  months: SstClimatologicalMonth[];
  qualifiedMonthCount: number;
  exclusions: SstSeasonalCycleExclusions;
}): Omit<
  SstSeasonalCycleSummary,
  "status" | "warmestMonth" | "coldestMonth" | "seasonalAmplitude" | "reason"
> {
  return {
    kind: "observed-sst-seasonal-cycle",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    footprint: base.footprint,
    requiredYearsPerMonth: base.requiredYearsPerMonth,
    requiredValidFraction: base.requiredValidFraction,
    requiredQualifiedMonths: MINIMUM_QUALIFIED_MONTHS_FOR_CYCLE,
    months: base.months,
    qualifiedMonthCount: base.qualifiedMonthCount,
    amplitudeUnit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
    exclusions: base.exclusions,
    limitations: SST_SEASONAL_CYCLE_LIMITATIONS,
  };
}

function emptySummary(
  status: SstSeasonalCycleStatus,
  footprint: UsableSstFootprint | null,
  requiredYearsPerMonth: number,
  requiredValidFraction: number,
  exclusions: SstSeasonalCycleExclusions,
  reason: string
): SstSeasonalCycleSummary {
  return {
    kind: "observed-sst-seasonal-cycle",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    status,
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    footprint,
    requiredYearsPerMonth,
    requiredValidFraction,
    requiredQualifiedMonths: MINIMUM_QUALIFIED_MONTHS_FOR_CYCLE,
    months: [],
    qualifiedMonthCount: 0,
    warmestMonth: null,
    coldestMonth: null,
    seasonalAmplitude: null,
    amplitudeUnit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
    exclusions,
    limitations: SST_SEASONAL_CYCLE_LIMITATIONS,
    reason,
  };
}

function emptyExclusions(): SstSeasonalCycleExclusions {
  return {
    invalidMonth: 0,
    footprintMismatch: 0,
    insufficientCoverage: 0,
    duplicateYearMonth: 0,
  };
}

function isCalendarMonth(month: YearMonth): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}
