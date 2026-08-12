import { NDVI_SOURCE, NDVI_UNIT, type NdviAnnualPhenology } from "./phenology";
import { LAYERS, compareYm, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Separate "MOD13A3 never published this month" from "the sampler supplied
 * nothing" in an annual NDVI summary.
 *
 * `summarizeAnnualNdviPhenology` reports `omittedCalendarMonths` as the twelve
 * calendar months minus the ones supplied. That single field conflates two
 * different facts. MOD13A3 begins in March 2000 and lags the current month, so
 * the first and last years of the record are *structurally* short: their
 * missing months were never observable. Every other absent month is a genuine
 * sampling gap. Reported together they read alike, and a structurally short
 * year looks like dropped coverage.
 *
 * The distinction matters for phenology specifically. An annual peak or trough
 * is the extremum *of the months present*, so it is only comparable across
 * years that span the same calendar coverage. A year missing its winter months
 * cannot report the same trough a complete year would.
 *
 * These helpers classify absent months and state that limit. They never impute
 * a value for an absent month, never estimate what an extremum "would have
 * been", and never infer plant phenology, productivity, biomass, habitat,
 * ecosystem condition, causes, or future conditions.
 */

/** Existing NASA MOD13A3 v061 provenance, retained in every window summary. */
export const NDVI_RECORD_WINDOW_SOURCE: DatasetRef = NDVI_SOURCE;

/** First month MOD13A3 publishes, from the layer's own cited configuration. */
export const NDVI_RECORD_START: YearMonth = LAYERS.ndvi.start;

/** Machine-readable limits retained with every reported window summary. */
export const NDVI_RECORD_WINDOW_LIMITATIONS = [
  "An unpublished month is absent from the product, not a low or missing vegetation observation.",
  "Absent months are never imputed, and no extremum is estimated for them.",
  "Annual extrema are computed over the months present, so partial calendar years are not comparable with complete ones.",
  "This describes record coverage only; it does not infer phenology, productivity, biomass, habitat, ecosystem condition, causes, or forecasts.",
] as const;

/** Whether MOD13A3 publishes a given month at all. */
export type NdviMonthAvailability =
  "published" | "before-record-start" | "not-yet-published";

/** Why a published month contributed nothing to the year's extremum search. */
export type NdviAbsenceReason = "not-supplied" | "no-usable-observation";

export interface NdviAbsentMonth {
  /** Calendar month, 1-12. */
  month: number;
  availability: NdviMonthAvailability;
  /**
   * Null for unpublished months: nothing could have been supplied, so
   * attributing the absence to the sampler would be wrong.
   */
  reason: NdviAbsenceReason | null;
}

export type NdviExtremaBasis =
  "complete-calendar-year" | "partial-calendar-year";

export type NdviRecordWindowStatus = "available" | "unavailable";

export interface NdviRecordWindowCoverage {
  kind: "ndvi-annual-record-window";
  status: NdviRecordWindowStatus;
  /** Populated only when an input was unusable; null otherwise. */
  reason: string | null;
  year: number;
  /** First month the product publishes (MOD13A3 begins 2000-03). */
  recordStart: YearMonth;
  /** Caller-confirmed latest published NDVI month. */
  availableThrough: YearMonth;
  /** Calendar months of this year inside the published record. */
  publishedCalendarMonths: number[];
  /** Calendar months that contributed a usable observation. */
  observedCalendarMonths: number[];
  /** Every calendar month absent from the year's extremum search. */
  absentMonths: NdviAbsentMonth[];
  /** Absent because the product does not publish them. Never observable. */
  unpublishedCalendarMonths: number[];
  /** Published, yet no usable observation reached the summary: a real gap. */
  unobservedPublishedCalendarMonths: number[];
  /** True when the product itself does not cover all twelve months. */
  isPartialRecordYear: boolean;
  /** True only when all twelve calendar months contributed an observation. */
  isCompleteCalendarYear: boolean;
  extremaBasis: NdviExtremaBasis;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  limitations: typeof NDVI_RECORD_WINDOW_LIMITATIONS;
}

/**
 * Classify the calendar months an annual NDVI summary could not draw on.
 *
 * `availableThrough` is supplied by the caller rather than read from the
 * runtime `DATA_LATEST`, matching `phenologyBaseline.ts`: the latest published
 * month is a boot-verified fact, and a summary should not silently change
 * meaning when that global moves.
 */
export function describeNdviRecordWindow(
  summary: NdviAnnualPhenology,
  availableThrough: YearMonth
): NdviRecordWindowCoverage {
  const invalid = firstInvalidInput(summary, availableThrough);
  if (invalid) return unavailableWindow(summary, availableThrough, invalid);

  const { year } = summary;
  const supplied = new Set(summary.coverage.suppliedCalendarMonths);
  const observed = new Set(
    summary.coverage.validMonths.map(({ month }) => month)
  );

  const publishedCalendarMonths: number[] = [];
  const absentMonths: NdviAbsentMonth[] = [];
  const unpublishedCalendarMonths: number[] = [];
  const unobservedPublishedCalendarMonths: number[] = [];

  for (let month = 1; month <= 12; month++) {
    const availability = availabilityFor({ year, month }, availableThrough);
    if (availability === "published") publishedCalendarMonths.push(month);
    if (observed.has(month)) continue;

    // A published month absent from the record is a sampling gap; distinguish
    // one that arrived unusable from one that never arrived at all.
    const reason: NdviAbsenceReason | null =
      availability === "published"
        ? supplied.has(month)
          ? "no-usable-observation"
          : "not-supplied"
        : null;
    absentMonths.push({ month, availability, reason });
    if (availability === "published") {
      unobservedPublishedCalendarMonths.push(month);
    } else {
      unpublishedCalendarMonths.push(month);
    }
  }

  const observedCalendarMonths = [...observed].sort((a, b) => a - b);
  const isCompleteCalendarYear = observedCalendarMonths.length === 12;
  return {
    kind: "ndvi-annual-record-window",
    status: "available",
    reason: null,
    year,
    recordStart: NDVI_RECORD_START,
    availableThrough,
    publishedCalendarMonths,
    observedCalendarMonths,
    absentMonths,
    unpublishedCalendarMonths,
    unobservedPublishedCalendarMonths,
    isPartialRecordYear: publishedCalendarMonths.length < 12,
    isCompleteCalendarYear,
    extremaBasis: isCompleteCalendarYear
      ? "complete-calendar-year"
      : "partial-calendar-year",
    source: NDVI_RECORD_WINDOW_SOURCE,
    unit: NDVI_UNIT,
    limitations: NDVI_RECORD_WINDOW_LIMITATIONS,
  };
}

/**
 * A one-line provenance sentence for a window summary.
 *
 * Deliberately states only what was and was not published or supplied. It does
 * not describe greenness, and it does not say what an absent month held.
 */
export function ndviRecordWindowText(window: NdviRecordWindowCoverage): string {
  if (window.status === "unavailable") {
    return `${window.year} NDVI record coverage unavailable: ${window.reason}`;
  }
  const parts = [
    `${window.observedCalendarMonths.length} of 12 calendar months observed`,
  ];
  if (window.unpublishedCalendarMonths.length > 0) {
    parts.push(
      `${window.unpublishedCalendarMonths.length} not published by ${NDVI_RECORD_WINDOW_SOURCE.shortName}`
    );
  }
  if (window.unobservedPublishedCalendarMonths.length > 0) {
    parts.push(
      `${window.unobservedPublishedCalendarMonths.length} published but not observed`
    );
  }
  const comparability = window.isCompleteCalendarYear
    ? "full calendar year"
    : "partial calendar year; extrema not comparable with complete years";
  return `${window.year}: ${parts.join("; ")} · ${comparability}`;
}

/**
 * The product-definition bound is checked before the publication bound, so a
 * pre-2000-03 month reads `before-record-start` even when the caller supplies
 * an `availableThrough` earlier than the record itself.
 */
function availabilityFor(
  ym: YearMonth,
  availableThrough: YearMonth
): NdviMonthAvailability {
  if (compareYm(ym, NDVI_RECORD_START) < 0) return "before-record-start";
  if (compareYm(ym, availableThrough) > 0) return "not-yet-published";
  return "published";
}

function firstInvalidInput(
  summary: NdviAnnualPhenology,
  availableThrough: YearMonth
): string | null {
  if (!Number.isInteger(summary?.year)) {
    return "annual summary has no valid year";
  }
  if (!isCalendarMonth(availableThrough)) {
    return "latest published month is not a calendar month";
  }
  return null;
}

function isCalendarMonth(ym: YearMonth | undefined): boolean {
  return (
    !!ym &&
    Number.isInteger(ym.year) &&
    Number.isInteger(ym.month) &&
    ym.month >= 1 &&
    ym.month <= 12
  );
}

/**
 * An unusable input yields no month classification at all. Empty lists here
 * mean "not determined", never "no months absent".
 */
function unavailableWindow(
  summary: NdviAnnualPhenology,
  availableThrough: YearMonth,
  reason: string
): NdviRecordWindowCoverage {
  return {
    kind: "ndvi-annual-record-window",
    status: "unavailable",
    reason,
    year: summary?.year,
    recordStart: NDVI_RECORD_START,
    availableThrough,
    publishedCalendarMonths: [],
    observedCalendarMonths: [],
    absentMonths: [],
    unpublishedCalendarMonths: [],
    unobservedPublishedCalendarMonths: [],
    isPartialRecordYear: false,
    isCompleteCalendarYear: false,
    extremaBasis: "partial-calendar-year",
    source: NDVI_RECORD_WINDOW_SOURCE,
    unit: NDVI_UNIT,
    limitations: NDVI_RECORD_WINDOW_LIMITATIONS,
  };
}
