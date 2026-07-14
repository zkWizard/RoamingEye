import type { EnvironmentSignalBrief } from "./environmentBrief";
import { ymToIndex, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Provenance-first data-currency (recency) descriptor.
 *
 * The environment brief composes independent monthly products — vegetation,
 * rainfall, soil moisture, air temperature — that each publish on their own
 * schedule and lag "now" by different amounts. This module states, per dated
 * observation, how many whole months its data month sits behind a reference
 * month, and buckets that distance into a neutral, purely-temporal tier.
 *
 * It answers "how current is this observation?" and nothing more. The lag is a
 * distance in months, NOT a quality, fitness, risk, or reliability judgement:
 * monthly composites are lagged by design, so a larger lag reflects a product's
 * publication cadence, never that the data is worse. Every observation keeps its
 * source `DatasetRef`. This is deliberately distinct from — and composes with —
 * the brief's cross-signal temporal spread (are the signals synchronized?) and
 * its completeness tally (how many are present?); recency is about distance from
 * a reference month, not agreement among signals or presence.
 */

export type RecencyTier =
  /** Data month equals the reference month. */
  | "current-month"
  /** 1–3 whole months behind the reference month. */
  | "past-quarter"
  /** 4–6 whole months behind the reference month. */
  | "past-half-year"
  /** 7 or more whole months behind the reference month. */
  | "older"
  /** Data month is later than the reference month (unexpected ordering). */
  | "after-reference"
  /** Data month is not a valid year-month; lag cannot be computed. */
  | "invalid-date";

/** One dated source observation to place against a reference month. */
export interface DatedObservation {
  /** Stable identifier (e.g. an environment signal id). */
  id: string;
  /** Human-facing label carried into the statement. */
  label: string;
  /** The month the source observation represents. */
  dataMonth: YearMonth;
  /** Provenance for the observation; never dropped. */
  source: DatasetRef;
}

export interface ObservationRecency {
  id: string;
  label: string;
  dataMonth: YearMonth;
  /**
   * Whole months the data month lags the reference month
   * (`referenceMonth − dataMonth`). Negative when the data month is later than
   * the reference; null when the data month is not a valid year-month.
   */
  lagMonths: number | null;
  tier: RecencyTier;
  source: DatasetRef;
  /** Honest, source-carrying sentence; no fitness or quality claim. */
  statement: string;
}

export interface ObservationRecencySummary {
  /** The "as of" month every observation is measured against. */
  referenceMonth: YearMonth;
  observations: ObservationRecency[];
  /** Newest datable data month (smallest lag); null when none are datable. */
  mostRecentMonth: YearMonth | null;
  /** Oldest datable data month (largest lag); null when none are datable. */
  oldestMonth: YearMonth | null;
  /** Largest lag among datable observations; null when none are datable. */
  maxLagMonths: number | null;
  /** Honest summary sentence; recency is currency, not data fitness. */
  statement: string;
}

/** Bucket a whole-month lag into a neutral, purely-temporal tier. */
export function classifyRecency(lagMonths: number): RecencyTier {
  if (lagMonths < 0) return "after-reference";
  if (lagMonths === 0) return "current-month";
  if (lagMonths <= 3) return "past-quarter";
  if (lagMonths <= 6) return "past-half-year";
  return "older";
}

/**
 * Assess how current each dated observation is relative to `referenceMonth`.
 * Observations with an invalid data month are still listed (provenance is
 * preserved) but contribute no lag to the range statistics.
 */
export function summarizeObservationRecency(
  observations: DatedObservation[],
  referenceMonth: YearMonth
): ObservationRecencySummary {
  const refMonthText = formatYearMonth(referenceMonth);
  const referenceValid = isYearMonth(referenceMonth);

  const assessed = observations.map((observation) =>
    assessOne(observation, referenceMonth, referenceValid, refMonthText)
  );

  const datable = assessed.filter(
    (o): o is ObservationRecency & { lagMonths: number } => o.lagMonths !== null
  );

  if (datable.length === 0) {
    return {
      referenceMonth,
      observations: assessed,
      mostRecentMonth: null,
      oldestMonth: null,
      maxLagMonths: null,
      statement: referenceValid
        ? "No datable observations to assess for recency."
        : "Reference month is invalid; observation recency cannot be assessed.",
    };
  }

  const minLag = Math.min(...datable.map((o) => o.lagMonths));
  const maxLag = Math.max(...datable.map((o) => o.lagMonths));
  // Smallest lag ⇒ newest data month; largest lag ⇒ oldest data month.
  const mostRecentMonth = datable.reduce((a, b) =>
    a.lagMonths <= b.lagMonths ? a : b
  ).dataMonth;
  const oldestMonth = datable.reduce((a, b) =>
    a.lagMonths >= b.lagMonths ? a : b
  ).dataMonth;

  return {
    referenceMonth,
    observations: assessed,
    mostRecentMonth,
    oldestMonth,
    maxLagMonths: maxLag,
    statement: summaryStatement(datable.length, refMonthText, minLag, maxLag),
  };
}

function assessOne(
  observation: DatedObservation,
  referenceMonth: YearMonth,
  referenceValid: boolean,
  refMonthText: string
): ObservationRecency {
  const base = {
    id: observation.id,
    label: observation.label,
    dataMonth: observation.dataMonth,
    source: observation.source,
  };

  if (!referenceValid || !isYearMonth(observation.dataMonth)) {
    return {
      ...base,
      lagMonths: null,
      tier: "invalid-date",
      statement: `${observation.label}: data month is not a valid year-month; recency cannot be dated; source ${sourceLabel(observation.source)}.`,
    };
  }

  const lagMonths =
    ymToIndex(referenceMonth) - ymToIndex(observation.dataMonth);
  const tier = classifyRecency(lagMonths);
  return {
    ...base,
    lagMonths,
    tier,
    statement: observationStatement(observation, lagMonths, tier, refMonthText),
  };
}

function observationStatement(
  observation: DatedObservation,
  lagMonths: number,
  tier: RecencyTier,
  refMonthText: string
): string {
  const monthText = formatYearMonth(observation.dataMonth);
  const source = sourceLabel(observation.source);

  if (tier === "current-month") {
    return `${observation.label}: dated ${monthText}, current with the ${refMonthText} reference month; source ${source}.`;
  }
  if (tier === "after-reference") {
    return `${observation.label}: dated ${monthText}, ${monthWord(-lagMonths)} after the ${refMonthText} reference month; source ${source}.`;
  }
  return `${observation.label}: dated ${monthText}, ${monthWord(lagMonths)} behind the ${refMonthText} reference (${tier}); source ${source}.`;
}

function summaryStatement(
  count: number,
  refMonthText: string,
  minLag: number,
  maxLag: number
): string {
  const noun = count === 1 ? "dated observation" : "dated observations";
  const lagPhrase =
    minLag === maxLag
      ? `by ${monthWord(minLag)}`
      : `by ${minLag} to ${maxLag} months`;
  return `${count} ${noun} lag the ${refMonthText} reference ${lagPhrase}; recency reflects each product's publication schedule, not data fitness.`;
}

/**
 * Adapter: derive recency inputs from a composed environment brief's signals.
 * Only signals that carry a data month are datable — a data month is a
 * provenance fact independent of whether the value itself was usable, so
 * no-data and unpublished months are still assessed for currency, while
 * signals with no supplied observation (null data month) are dropped.
 */
export function recencyInputsFromSignals(
  signals: EnvironmentSignalBrief[]
): DatedObservation[] {
  const inputs: DatedObservation[] = [];
  for (const signal of signals) {
    if (signal.dataMonth === null) continue;
    inputs.push({
      id: signal.id,
      label: signal.label,
      dataMonth: signal.dataMonth,
      source: signal.source,
    });
  }
  return inputs;
}

function monthWord(months: number): string {
  return `${months} month${months === 1 ? "" : "s"}`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function formatYearMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
