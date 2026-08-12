import type { YearMonth } from "./timeline";

/**
 * How much record actually backs each calendar month of the probe anomaly.
 *
 * The probe's anomaly is a *within-record* departure: each month minus the
 * mean of every same-calendar-month value in the very series being exported.
 * That is not a departure from an independent climatological normal, and its
 * strength is uneven across the calendar. Where a calendar month contributes a
 * single usable year, the mean it is measured against is that year's own
 * value, so the anomaly is exactly zero by construction — it says nothing
 * about how unusual the month was, yet it exports identically to a measured
 * "exactly average".
 *
 * These helpers measure that depth so an export can state it. They estimate
 * nothing, fill no gap, and change no reported value.
 */

/**
 * Two same-calendar-month years is the floor for a departure that carries any
 * information. The staged annual-cycle descriptors set a stricter floor for
 * their own use (see MINIMUM_ANNUAL_CYCLE_YEARS_PER_MONTH); this is only the
 * point below which the arithmetic is degenerate rather than merely thin.
 */
export const MINIMUM_ANOMALY_BASELINE_YEARS = 2;

const CALENDAR_MONTHS_IN_YEAR = 12;

export interface AnomalyBaselineDepth {
  /** Distinct years holding a usable value, by calendar month (index 0 = Jan). */
  yearsByCalendarMonth: number[];
  /** Calendar months (1-12) whose baseline rests on a single year. */
  selfReferentialCalendarMonths: number[];
  /** Series entries whose exported anomaly is zero purely by construction. */
  selfReferentialEntryCount: number;
  /** Depth across calendar months that carry any usable year; null if none do. */
  minYears: number | null;
  maxYears: number | null;
  /** How many of the twelve calendar months carry at least one usable year. */
  calendarMonthsCovered: number;
}

/**
 * Count the distinct years backing each calendar month of a probe series.
 *
 * Years are counted rather than samples: a caller that supplies the same month
 * twice must not be credited with a deeper baseline than the record holds.
 * Non-finite and missing values are excluded exactly as the climatology
 * excludes them, so the counts describe the mean that was actually subtracted.
 */
export function anomalyBaselineDepth(
  months: readonly YearMonth[],
  values: readonly (number | null | undefined)[]
): AnomalyBaselineDepth {
  const yearsSeen = Array.from(
    { length: CALENDAR_MONTHS_IN_YEAR },
    () => new Set<number>()
  );
  const usableEntries = new Array<number>(CALENDAR_MONTHS_IN_YEAR).fill(0);
  for (let i = 0; i < months.length; i++) {
    const value = values[i];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      continue;
    }
    const month = months[i];
    if (
      !month ||
      !Number.isInteger(month.month) ||
      month.month < 1 ||
      month.month > CALENDAR_MONTHS_IN_YEAR
    ) {
      continue;
    }
    yearsSeen[month.month - 1].add(month.year);
    usableEntries[month.month - 1]++;
  }

  const yearsByCalendarMonth = yearsSeen.map((years) => years.size);
  const covered = yearsByCalendarMonth.filter((years) => years > 0);
  const selfReferentialCalendarMonths: number[] = [];
  let selfReferentialEntryCount = 0;
  yearsByCalendarMonth.forEach((years, index) => {
    if (years > 0 && years < MINIMUM_ANOMALY_BASELINE_YEARS) {
      selfReferentialCalendarMonths.push(index + 1);
      // Every entry in such a month sits on the same degenerate mean, so a
      // repeated month contributes every one of its rows, not just one.
      selfReferentialEntryCount += usableEntries[index];
    }
  });

  return {
    yearsByCalendarMonth,
    selfReferentialCalendarMonths,
    selfReferentialEntryCount,
    minYears: covered.length > 0 ? Math.min(...covered) : null,
    maxYears: covered.length > 0 ? Math.max(...covered) : null,
    calendarMonthsCovered: covered.length,
  };
}

/**
 * Provenance headers for the CSV anomaly column. Kept comma-free so a header
 * line stays a single field for naive parsers, matching the other `#` lines.
 */
export function anomalyBaselineCsvHeaders(
  depth: AnomalyBaselineDepth
): string[] {
  if (depth.minYears === null || depth.maxYears === null) {
    return ["# anomaly_baseline_years: no usable observations in this record"];
  }
  const range =
    depth.minYears === depth.maxYears
      ? `${depth.minYears}`
      : `${depth.minYears}-${depth.maxYears}`;
  const lines = [
    `# anomaly_baseline_years: ${range} per calendar month over ${depth.calendarMonthsCovered} of 12 calendar months`,
  ];
  if (depth.selfReferentialCalendarMonths.length > 0) {
    const list = depth.selfReferentialCalendarMonths
      .map((month) => String(month).padStart(2, "0"))
      .join(" ");
    const rows =
      depth.selfReferentialEntryCount === 1
        ? "1 row"
        : `${depth.selfReferentialEntryCount} rows`;
    lines.push(
      `# anomaly_zero_by_construction: calendar month(s) ${list} hold one year each so ${rows} report an anomaly of exactly zero by construction — not a measured departure`
    );
  }
  return lines;
}
