import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import { compareYm, type YearMonth } from "./timeline";

/**
 * Provenance-first co-observation grouping for a multi-signal environment
 * brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature
 * as independent monthly products on different composite calendars and
 * publication lags, so the usable observations rarely all resolve to one month.
 * `summarizeTemporalAlignment` already reports the *span* of those months and a
 * single "all aligned?" boolean — but when the span is nonzero it cannot tell a
 * reader *which* signals are actually contemporaneous. Reading rainfall
 * (2026-03) next to soil moisture (2026-03) is fair; reading either against an
 * air-temperature value from 2025-08 is not, and the span alone does not say so.
 *
 * This helper partitions the usable observations into co-observation cohorts —
 * the groups that share one data month — so only same-cohort signals are ever
 * read together in time. It is purely a data-month descriptor over provenance:
 * it never combines the signal values, weights them, compares magnitudes, or
 * infers any condition, change, trend, causation, or forecast.
 */

/** A group of usable signals sharing exactly one data month. */
export interface CoObservationCohort {
  /** The data month shared by every signal in the cohort. */
  month: YearMonth;
  /** Signals observed for this month, in signal order. */
  signalIds: EnvironmentSignalId[];
  /** Human labels for those signals, in signal order. */
  signalLabels: string[];
}

export interface CoObservationSummary {
  kind: "brief-co-observation";
  /** Usable signals (available, with a valid data month), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Cohorts sharing a data month, in chronological (oldest-first) order. */
  cohorts: CoObservationCohort[];
  /** Number of distinct data months among the usable signals. */
  cohortCount: number;
  /**
   * The cohort holding the most signals; on a tie the chronologically-earliest
   * such cohort. Null when no signal is usable.
   */
  largestCohort: CoObservationCohort | null;
  /** Size of `largestCohort`; 0 when no signal is usable. */
  maxCohortSize: number;
  /**
   * True when there are at least two usable signals and every one of them
   * shares a single data month (one cohort). False for a single usable signal,
   * where co-observation between signals is not a meaningful concept.
   */
  fullyCoObserved: boolean;
  /** Honest one-line grouping statement; carries no value or condition claim. */
  statement: string;
}

/**
 * Partition a composed brief's usable signals into co-observation cohorts by
 * shared data month. Only signals carrying a usable observation and a valid
 * data month participate — no-data, invalid, and unpublished signals have no
 * month to group. Signals in different cohorts were observed in different
 * months and must not be read as contemporaneous.
 */
export function summarizeCoObservation(
  signals: readonly EnvironmentSignalBrief[]
): CoObservationSummary {
  const usable = signals.filter(
    (signal): signal is EnvironmentSignalBrief & { dataMonth: YearMonth } =>
      signal.status === "available" && signal.dataMonth !== null
  );

  const cohortsByMonth = new Map<string, CoObservationCohort>();
  for (const signal of usable) {
    const key = monthKey(signal.dataMonth);
    const existing = cohortsByMonth.get(key);
    if (existing) {
      existing.signalIds.push(signal.id);
      existing.signalLabels.push(signal.label);
    } else {
      cohortsByMonth.set(key, {
        month: signal.dataMonth,
        signalIds: [signal.id],
        signalLabels: [signal.label],
      });
    }
  }

  const cohorts = [...cohortsByMonth.values()].sort((a, b) =>
    compareYm(a.month, b.month)
  );
  const consideredSignalIds = usable.map((signal) => signal.id);

  // Chronological order already breaks size ties toward the earliest month:
  // the first cohort to reach the running maximum wins.
  let largestCohort: CoObservationCohort | null = null;
  for (const cohort of cohorts) {
    if (
      largestCohort === null ||
      cohort.signalIds.length > largestCohort.signalIds.length
    ) {
      largestCohort = cohort;
    }
  }
  const maxCohortSize = largestCohort?.signalIds.length ?? 0;

  return {
    kind: "brief-co-observation",
    consideredSignalIds,
    cohorts,
    cohortCount: cohorts.length,
    largestCohort,
    maxCohortSize,
    fullyCoObserved: usable.length >= 2 && cohorts.length === 1,
    statement: coObservationStatement(consideredSignalIds.length, cohorts),
  };
}

function coObservationStatement(
  consideredCount: number,
  cohorts: readonly CoObservationCohort[]
): string {
  if (consideredCount === 0) {
    return "No usable observations to group by data month.";
  }
  const obs = `${consideredCount} usable observation${plural(consideredCount)}`;
  if (consideredCount === 1) {
    return `${obs}, dated ${formatYearMonth(cohorts[0].month)}; co-observation is not applicable to a single signal.`;
  }
  if (cohorts.length === 1) {
    return `${obs} all dated ${formatYearMonth(cohorts[0].month)}; fully co-observed.`;
  }
  const clauses = cohorts.map((cohort) => cohortClause(cohort)).join("; ");
  return `${obs} form ${cohorts.length} co-observation cohorts: ${clauses} — only signals sharing a data month are contemporaneous.`;
}

function cohortClause(cohort: CoObservationCohort): string {
  const month = formatYearMonth(cohort.month);
  if (cohort.signalIds.length === 1) {
    return `${cohort.signalIds[0]} at ${month}`;
  }
  return `${cohort.signalIds.join(", ")} share ${month}`;
}

function monthKey(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function formatYearMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
