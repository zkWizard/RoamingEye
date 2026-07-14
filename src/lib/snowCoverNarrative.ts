import type { YearMonth } from "./timeline";
import {
  SNOW_COVER_LIMITATIONS,
  type SnowCoverSummary,
  type SnowSeasonChange,
  type SnowSeasonTrend,
} from "./snowCover";

/**
 * User-facing language for the source-backed snow-cover descriptors in
 * ./snowCover.ts (MOD10CM monthly-average fractional snow-covered area).
 *
 * `summarizeSnowCover` and `describeSnowSeasonChange` compute the numbers and
 * their provenance; those results are shaped for machines. This module turns
 * one of them into an honest sentence for the place panel while keeping the
 * cited product, data month, coverage, and limitations available to the caller.
 *
 * It adds no new inference. A snow-covered-area *percentage* is a fractional-
 * area descriptor, never a depth, snow-water-equivalent, melt/accumulation
 * rate, runoff, water volume, cause, or forecast — the copy says only what the
 * underlying descriptor already established, and reports an unpublished, no-data,
 * or invalid month plainly rather than inventing a value. Pure, render-free
 * logic (see snowCoverNarrative.test.ts).
 */

export interface SnowCoverNarrativeProvenance {
  dataMonth: string;
  availableThrough: string;
  publicationStatus: SnowCoverSummary["publicationStatus"];
  /** Whole calendar months the data month lags availability, when published. */
  publicationLagMonths: number | null;
  /** Usable share of the sampled area (0-1), or null when not supplied. */
  validFraction: number | null;
  nativeValue: "MOD10CM monthly-average snow-covered area (% of footprint)";
  sourceLabel: string;
  sourceUrl: string;
  sourceResolution: string;
}

export interface SnowCoverObservationNarrative {
  kind: "snow-cover-observation-narrative";
  /** Explicitly prevents consumers from treating this as interpretation. */
  isInterpretation: false;
  headline: string;
  detail: string;
  provenance: SnowCoverNarrativeProvenance;
  limitations: readonly string[];
}

/**
 * Convert a single-month snow-cover summary into honest UI copy. A published,
 * usable month reports its covered-area percentage and extent bin; every other
 * publication or coverage state is described plainly rather than shown as a
 * number.
 */
export function describeSnowCoverObservation(
  summary: SnowCoverSummary
): SnowCoverObservationNarrative {
  return {
    kind: "snow-cover-observation-narrative",
    isInterpretation: false,
    headline: snowHeadline(summary),
    detail: snowDetail(summary),
    provenance: provenanceFor(summary),
    limitations: summary.limitations,
  };
}

export interface SnowSeasonChangeNarrative {
  kind: "snow-season-change-narrative";
  /** Explicitly prevents consumers from treating this as interpretation. */
  isInterpretation: false;
  headline: string;
  detail: string;
  earlier: SnowCoverObservationNarrative;
  later: SnowCoverObservationNarrative;
  limitations: readonly string[];
}

/**
 * Convert a month-over-month snow-season change into honest UI copy. The
 * change is described as a movement in covered *area* (percentage points) only
 * when both endpoints are published, usable, and one calendar month apart; any
 * other status is reported plainly. Both endpoint months are carried as their
 * own narratives so a caller can show each alongside the change.
 */
export function describeSnowSeasonChangeNarrative(
  change: SnowSeasonChange
): SnowSeasonChangeNarrative {
  return {
    kind: "snow-season-change-narrative",
    isInterpretation: false,
    headline: changeHeadline(change),
    detail: changeDetail(change),
    earlier: describeSnowCoverObservation(change.earlier),
    later: describeSnowCoverObservation(change.later),
    limitations: change.limitations,
  };
}

function snowHeadline(summary: SnowCoverSummary): string {
  const month = formatMonth(summary.dataMonth);
  if (summary.publicationStatus !== "published") {
    return `Snow-cover record not published for ${month}`;
  }
  if (summary.coverage.status !== "available" || summary.extentLabel === null) {
    return `No usable snow-cover value for ${month}`;
  }
  return `${summary.extentLabel} in ${month}`;
}

function snowDetail(summary: SnowCoverSummary): string {
  const month = formatMonth(summary.dataMonth);
  if (summary.publicationStatus !== "published") {
    return `The requested monthly record is ${publicationText(summary)} against availability through ${formatMonth(summary.availableThrough)}.`;
  }
  if (
    summary.coverage.status !== "available" ||
    summary.snowCoveredPercent === null
  ) {
    return `No usable monthly-average value was supplied for ${month} (${coverageText(summary)}).`;
  }
  return (
    `Monthly-average snow-covered area was ${formatPercent(summary.snowCoveredPercent)} of the sampled footprint in ${month}, ` +
    `a fractional-area value binned as ${lowerFirst(summary.extentLabel ?? "unclassified")}. ` +
    `${coverageText(summary)}`
  );
}

function changeHeadline(change: SnowSeasonChange): string {
  if (change.status !== "available" || change.trend === null) {
    return "Month-over-month snow-cover change unavailable";
  }
  const window = `${formatMonth(change.earlier.dataMonth)} → ${formatMonth(change.later.dataMonth)}`;
  return `Snow cover ${trendText(change.trend)} (${window})`;
}

function changeDetail(change: SnowSeasonChange): string {
  if (
    change.status !== "available" ||
    change.changePercentPoints === null ||
    change.trend === null
  ) {
    return `No month-over-month snow-cover change can be stated (${changeReasonText(change)}).`;
  }
  const magnitude = formatPercentagePoints(
    Math.abs(change.changePercentPoints)
  );
  const direction =
    change.trend === "little-change"
      ? `changed by less than the ${formatPercentagePoints(change.thresholdPercentPoints)} reporting band (${signed(change.changePercentPoints)})`
      : `${trendText(change.trend)} by ${magnitude}`;
  return (
    `Between ${formatMonth(change.earlier.dataMonth)} and ${formatMonth(change.later.dataMonth)}, ` +
    `monthly-average snow-covered area ${direction}. ` +
    `This is a change in covered area only — not depth, melt or accumulation rate, water volume, cause, or the future.`
  );
}

function provenanceFor(
  summary: SnowCoverSummary
): SnowCoverNarrativeProvenance {
  const dataset = summary.dataset;
  return {
    dataMonth: formatMonth(summary.dataMonth),
    availableThrough: formatMonth(summary.availableThrough),
    publicationStatus: summary.publicationStatus,
    publicationLagMonths: summary.publicationLagMonths,
    validFraction: summary.coverage.validFraction,
    nativeValue: "MOD10CM monthly-average snow-covered area (% of footprint)",
    sourceLabel: `${dataset.shortName} v${dataset.version} — ${dataset.title}`,
    sourceUrl: `https://doi.org/${dataset.doi}`,
    sourceResolution: summary.sourceResolution,
  };
}

function publicationText(summary: SnowCoverSummary): string {
  switch (summary.publicationStatus) {
    case "not-yet-published":
      return "not yet published";
    case "invalid-reference-month":
      return "against an invalid reference month";
    case "published":
      return "published";
  }
}

function coverageText(summary: SnowCoverSummary): string {
  const fraction = summary.coverage.validFraction;
  const usable =
    fraction === null
      ? "Usable area coverage was not supplied"
      : `Usable area coverage was ${formatPercent(fraction * 100)}`;
  switch (summary.coverage.status) {
    case "available":
      return `${usable}.`;
    case "no-data":
      return `${usable}; no usable value was reported.`;
    case "invalid":
      return `${usable}; the supplied observation was rejected as invalid.`;
  }
}

function changeReasonText(change: SnowSeasonChange): string {
  switch (change.status) {
    case "non-adjacent-months":
      return "the two months are not exactly one calendar month apart";
    case "unavailable":
      return "at least one endpoint month was not a published, usable observation";
    case "available":
      return "no change value was computed";
  }
}

function trendText(trend: SnowSeasonTrend): string {
  switch (trend) {
    case "advancing":
      return "advanced";
    case "retreating":
      return "retreated";
    case "little-change":
      return "showed little change";
  }
}

function formatMonth(month: YearMonth): string {
  if (
    !Number.isInteger(month.year) ||
    !Number.isInteger(month.month) ||
    month.month < 1 ||
    month.month > 12
  ) {
    return "an invalid month";
  }
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function formatPercent(value: number): string {
  return `${roundTo(value, 1)}%`;
}

function formatPercentagePoints(value: number): string {
  const rounded = roundTo(value, 1);
  return `${rounded} percentage point${rounded === 1 ? "" : "s"}`;
}

function signed(value: number): string {
  const rounded = roundTo(value, 1);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded} pp`;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function lowerFirst(text: string): string {
  return text.length === 0 ? text : text[0].toLowerCase() + text.slice(1);
}

/** Re-exported so callers can show the shared caveats without a second import. */
export { SNOW_COVER_LIMITATIONS };
