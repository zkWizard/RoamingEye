import type { MonthlyClimateSummary } from "./climate";
import { precipitationAccumulation } from "./precipitationAccumulation";
import { type DatasetRef, type YearMonth } from "./timeline";

/**
 * Produce a calendar-year precipitation total only from a complete set of
 * usable GLDAS monthly observations. A year with an unavailable, duplicate,
 * or out-of-year month has no statable annual total; it is never silently
 * treated as a partial year or filled with an estimate.
 */
export const PRECIPITATION_ANNUAL_TOTAL_LIMITATIONS =
  "Annual precipitation total is the sum of all twelve usable monthly GLDAS " +
  "precipitation accumulations in one calendar year. Each monthly value is " +
  "the published monthly-mean rate integrated over that month's actual length. " +
  "Missing, unpublished, invalid, duplicate, mixed-source, or partial-coverage " +
  "months yield no annual total. This is not a rain-gauge total, climatological " +
  "normal, anomaly, diagnosis, or forecast.";

export interface AnnualPrecipitationMonthCoverage {
  dataMonth: YearMonth;
  /** Spatial coverage reported by the supplied monthly observation. */
  validFraction: number | null;
  /** Rendered-image provenance; not a ground-resolution claim. */
  sourceImageDimensions: { width: number; height: number } | null;
}

export interface PrecipitationAnnualTotal {
  kind: "derived-annual-precipitation-total";
  isForecast: false;
  /** Calendar year covered by exactly January through December. */
  dataYear: number;
  /** Total annual depth in mm water-equivalent. */
  totalMm: number;
  /** Number of calendar days represented (365 or 366). */
  yearDays: number;
  /** Original source unit before rate-to-depth conversion. */
  inputNativeUnit: "kg/m²/s";
  /** Per-month sampling coverage and image provenance, oldest first. */
  monthlyCoverage: readonly AnnualPrecipitationMonthCoverage[];
  /** One cited product shared by every included monthly observation. */
  source: DatasetRef;
}

/**
 * Sum one complete calendar year's monthly precipitation observations.
 *
 * The input can be unordered. `null` means an annual value cannot be stated,
 * not that annual precipitation was zero.
 */
export function precipitationAnnualTotal(
  summaries: readonly MonthlyClimateSummary[],
  dataYear: number
): PrecipitationAnnualTotal | null {
  if (!Number.isInteger(dataYear) || summaries.length !== 12) return null;

  const byMonth = new Map<number, MonthlyClimateSummary>();
  for (const summary of summaries) {
    if (
      summary.metric.id !== "precipitation-rate" ||
      summary.dataMonth.year !== dataYear ||
      byMonth.has(summary.dataMonth.month)
    ) {
      return null;
    }
    byMonth.set(summary.dataMonth.month, summary);
  }

  let totalMm = 0;
  let yearDays = 0;
  let source: DatasetRef | null = null;
  const monthlyCoverage: AnnualPrecipitationMonthCoverage[] = [];

  for (let month = 1; month <= 12; month++) {
    const summary = byMonth.get(month);
    if (!summary) return null;

    const accumulation = precipitationAccumulation(summary);
    if (!accumulation) return null;
    if (source && !sameDataset(source, accumulation.source)) return null;

    source = accumulation.source;
    totalMm += accumulation.totalMm;
    yearDays += accumulation.monthDays;
    monthlyCoverage.push({
      dataMonth: summary.dataMonth,
      validFraction: summary.coverage.validFraction,
      sourceImageDimensions: summary.sourceImageDimensions,
    });
  }

  if (!source || !Number.isFinite(totalMm)) return null;
  return {
    kind: "derived-annual-precipitation-total",
    isForecast: false,
    dataYear,
    totalMm,
    yearDays,
    inputNativeUnit: "kg/m²/s",
    monthlyCoverage,
    source,
  };
}

function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
