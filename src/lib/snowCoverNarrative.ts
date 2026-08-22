import { doiResolverUrl } from "./doiLink";
import type { YearMonth } from "./timeline";
import {
  SNOW_COVER_DATASET,
  SNOW_COVER_LIMITATIONS,
  SNOW_COVER_SOURCE_RESOLUTION,
  SNOW_SEASON_CHANGE_THRESHOLD_PP,
  describeSnowSeasonChange,
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
  if (summary.publicationStatus === "not-distributed") {
    return `Snow-cover imagery not distributed for ${month}`;
  }
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
  if (summary.publicationStatus === "not-distributed") {
    return (
      `The imagery service does not distribute ${month} for this product, so no monthly-average value exists to describe. ` +
      `This is a gap in the record, not an observation that the sampled area was snow-free.`
    );
  }
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
    sourceUrl: doiResolverUrl(dataset.doi),
    sourceResolution: summary.sourceResolution,
  };
}

function publicationText(summary: SnowCoverSummary): string {
  switch (summary.publicationStatus) {
    case "not-distributed":
      return "not distributed by the imagery service";
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
      : `Usable area coverage was ${formatCoverageShare(fraction)}`;
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

/**
 * Render a sampled-coverage share without rounding a partly usable footprint
 * into a whole one, or a partly usable footprint into none at all.
 *
 * A share is a ratio this app computes exactly, not a quantity it measures, so
 * a printed `100%` asserts *all of the footprint* as flatly as a printed `0%`
 * asserts *none of it* — and both ends of that carry weight here.
 *
 * The floor is the one with a rule already written against it. `coverageFor`
 * (snowCover.ts) separates a `zero-coverage` month, where the source drew
 * nothing over the place, from a `missing-value` one, where it drew something
 * and this app's admission threshold declined to average it; the export
 * contract turns the same distinction into `source-no-data` against
 * `insufficient-valid-coverage`, on the stated grounds that reporting the
 * second as the first "blames the source for our own admission rule"
 * (placeObservationExport.ts). Rounding a small positive share to `0%` prints
 * the accusation that rule exists to avoid, next to a sentence — "no usable
 * value was reported" — that a reader will attach it to.
 *
 * The ceiling matters for this layer in particular: the card's own caveat says
 * the value is a mean over the *drawn* part of the place and that the undrawn
 * share is reported as coverage instead. A rounded `100%` tells the reader
 * there is no undrawn share, contradicting the sentence beside it.
 *
 * Both ends are ordinary rather than rare because the share is cos(latitude)
 * area-weighted over a grid of up to 784 cells (MAX_GEOMETRY_SAMPLE_POINTS),
 * not a count of them: at the high latitudes where snow cover is the layer
 * worth reading, a poleward sliver carries well under 0.05% of a place's
 * weight, which is all it takes.
 *
 * Deliberately NOT applied to the snow-covered-area value itself. That is a
 * measurement, decoded from a discrete NDSI ramp at 0.62 pp RMSE
 * (snowCoverRamp.ts), so 100% is a real and reportable state and distinguishing
 * 99.96 from 100.0 would claim a precision the product does not have. The
 * guard belongs to the ratio, not to the reading.
 */
function formatCoverageShare(fraction: number): string {
  const shown = roundTo(fraction * 100, 1);
  if (shown === 0 && fraction > 0) return "<0.1%";
  if (shown === 100 && fraction < 1) return ">99.9%";
  return `${shown}%`;
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

/** A place-panel card's two rendered strings. */
export interface SnowCoverInsightText {
  value: string;
  detail: string;
}

/** Sampling context the place panel already carries for every other card. */
export interface SnowCoverInsightProvenance {
  validFractions?: readonly (number | null)[];
  sourceImageDimensions?: { width: number; height: number };
}

/**
 * Why the place panel's snow value is a mean over the *drawn* part of a
 * boundary rather than over the boundary.
 *
 * GIBS renders percent 0 transparent (see snowCoverRamp.ts), so snow-free
 * ground is not drawn at all and never enters the sampled mean. A rendered
 * tile therefore cannot separate "no snow" from "not observed": both are
 * absent pixels. The consequence is directional and must be stated, because
 * the number reads like a share of the place and is not one — it is the
 * average cover *where cover was drawn*, which is biased high exactly where
 * snow is patchy. The undrawn share is reported as sampled coverage instead.
 */
const DRAWN_FRACTION_CAVEAT =
  "GIBS draws no colour for 0% snow, so snow-free and unobserved ground are " +
  "indistinguishable and excluded; this is the mean where snow was drawn, " +
  "not the snow-covered share of the place";

/**
 * Turn the place panel's two-month sample into a snow-cover card.
 *
 * The panel samples a month pair, which is exactly the window
 * `describeSnowSeasonChange` is defined over — no multi-year baseline is
 * implied or required. Values arrive already scaled to whole percent
 * (PROBE_SCALES.snow, 0–100); this function adds no inference beyond the
 * descriptors those modules already established, and withholds a number
 * whenever the later month is unpublished, unusable, or out of range.
 */
export function placeSnowCoverInsight(
  months: [YearMonth, YearMonth],
  snowCoveredPercents: readonly (number | null)[],
  availableThrough: YearMonth,
  provenance: SnowCoverInsightProvenance = {}
): SnowCoverInsightText {
  const [earlierMonth, laterMonth] = months;
  const change = describeSnowSeasonChange(
    {
      dataMonth: earlierMonth,
      snowCoveredPercent: plausiblePercent(snowCoveredPercents[0] ?? null),
      ...fractionFor(provenance, 0),
    },
    {
      dataMonth: laterMonth,
      snowCoveredPercent: plausiblePercent(snowCoveredPercents[1] ?? null),
      ...fractionFor(provenance, 1),
    },
    availableThrough
  );
  const narrative = describeSnowSeasonChangeNarrative(change);
  const later = change.later;
  const source = `${SNOW_COVER_DATASET.shortName} v${SNOW_COVER_DATASET.version}`;
  const context = [
    DRAWN_FRACTION_CAVEAT,
    imageProvenance(provenance.sourceImageDimensions),
    `${SNOW_COVER_SOURCE_RESOLUTION} source grid`,
    `source ${source}`,
  ].join("; ");

  if (
    later.publicationStatus !== "published" ||
    later.coverage.status !== "available" ||
    later.snowCoveredPercent === null
  ) {
    // The unusable-month detail already reports coverage itself.
    return {
      value: "Unavailable",
      detail: `${narrative.later.detail} ${context}`,
    };
  }
  // The change sentence describes only the movement between two months, so the
  // usable share of the footprint has to be added here. Every other place card
  // states its sampled coverage, and for this layer that share is also what the
  // caveat above is quantifying.
  return {
    value: formatPercent(later.snowCoveredPercent),
    detail: `${narrative.detail} ${coverageComparisonSentence(change)} ${context}`,
  };
}

/**
 * Percentage-point gap between the two months' drawn footprints at or above
 * which the change sentence is qualified. Reuses the change-reporting band: a
 * footprint difference smaller than the movement this module already refuses
 * to call a change is not worth disclosing either, and no second convention
 * has to be defended.
 */
const FOOTPRINT_MISMATCH_THRESHOLD_PP = SNOW_SEASON_CHANGE_THRESHOLD_PP;

/**
 * State the sampled coverage, qualifying the change when the two months were
 * drawn over materially different areas.
 *
 * Percent 0 is transparent (see DRAWN_FRACTION_CAVEAT), so each month's value
 * is a mean over whatever was drawn *that* month and the two denominators need
 * not match. Subtracting them is then not a like-for-like comparison of the
 * same ground: a month whose drawn area collapsed can report a higher mean over
 * the little that remains, which renders as snow advancing. The panel showed
 * only the later month's coverage, so the mismatch was not visible at all.
 *
 * Silent by default — the qualifier is added only when a change was actually
 * stated and both footprints are known, and only once the gap reaches the band
 * above. Matched footprints keep the original single-coverage sentence.
 */
function coverageComparisonSentence(change: SnowSeasonChange): string {
  const earlierFraction = change.earlier.coverage.validFraction;
  const laterFraction = change.later.coverage.validFraction;
  const plain = coverageSentence(laterFraction);
  if (
    change.status !== "available" ||
    earlierFraction === null ||
    laterFraction === null
  ) {
    return plain;
  }
  // Compared at the precision the panel actually renders, so a gap too small to
  // be visible in the two numbers cannot trip the disclosure.
  const earlierShown = roundTo(earlierFraction * 100, 1);
  const laterShown = roundTo(laterFraction * 100, 1);
  if (Math.abs(laterShown - earlierShown) < FOOTPRINT_MISMATCH_THRESHOLD_PP) {
    return plain;
  }
  return (
    `Usable area coverage was ${formatCoverageShare(laterFraction)} in ${formatMonth(change.later.dataMonth)} ` +
    `against ${formatCoverageShare(earlierFraction)} in ${formatMonth(change.earlier.dataMonth)}, ` +
    `so each month's mean covers a different drawn area and the change above is not a ` +
    `like-for-like comparison of the same ground.`
  );
}

function coverageSentence(validFraction: number | null): string {
  return validFraction === null
    ? "Usable area coverage was not supplied."
    : `Usable area coverage was ${formatCoverageShare(validFraction)}.`;
}

/**
 * A snow-covered *area* percentage is bounded by its own definition. Anything
 * outside 0–100 is a decode or scaling failure, not a wider snowpack, so it is
 * rejected as no data rather than shown or clamped into a plausible-looking
 * reading.
 */
function plausiblePercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value < 0 || value > 100 ? null : value;
}

function fractionFor(
  provenance: SnowCoverInsightProvenance,
  index: number
): { validFraction?: number } {
  const fraction = provenance.validFractions?.[index];
  return fraction !== null &&
    fraction !== undefined &&
    Number.isFinite(fraction) &&
    fraction >= 0 &&
    fraction <= 1
    ? { validFraction: fraction }
    : {};
}

function imageProvenance(dimensions?: {
  width: number;
  height: number;
}): string {
  return dimensions &&
    Number.isInteger(dimensions.width) &&
    Number.isInteger(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
    ? `rendered source image ${dimensions.width} x ${dimensions.height} px`
    : "rendered source image dimensions not supplied";
}
