import {
  SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
  summarizeMarineCoverage,
  type MarineCoverageSummary,
  type MarineCoverageGeography,
  type SourceImageDimensions,
} from "./marineCoverage";
import {
  describeMarineBoundarySstSupport,
  summarizeMarineBoundarySstSupport,
  type MarineBoundarySstSupportSummary,
} from "./marineBoundarySstSupport";
import { PROBE_SCALES } from "./probe";
import {
  summarizeSstRampCensoring,
  type SstRampCensoringSummary,
} from "./sstRampCensoring";
import { formatYm, type YearMonth } from "./timeline";

/**
 * A single, source-aware SST reading for the exact boundary returned by place
 * search. It is intentionally separate from the terrestrial place metrics:
 * an SST observation says nothing about marine organisms or ecological state.
 */
export const MARINE_PLACE_METRIC = {
  id: "sst",
  label: "Sea surface temperature",
} as const;

export type MarineBoundarySstUnavailableReason =
  "source-colormap-unavailable" | "boundary-sampling-failed";

export interface MarineBoundarySstInput {
  /** Searched area label supplied by geocoding; never inferred from SST. */
  geographyLabel: string;
  /** The actual monthly product time represented by the sample. */
  dataMonth: YearMonth;
  /** Physical SST in the source product's native unit, or null when unusable. */
  observedValue: number | null;
  /** Share of the searched boundary yielding usable SST pixels. */
  validFraction: number;
  /** Dimensions of the rendered source image sampled for that boundary. */
  sourceImageDimensions: SourceImageDimensions;
  /** Searched boundary identity supplied by the place-search workflow. */
  geography?: MarineCoverageGeography;
  /** Same calendar month, one year earlier, for the same searched boundary. */
  priorYear?: MarineBoundarySstPriorYearInput;
}

/**
 * A separately sampled SST observation for the same searched boundary, offered
 * for a same-calendar-month comparison. It must be supplied by the caller; it
 * is never derived, interpolated, or borrowed from a neighbouring month.
 */
export interface MarineBoundarySstPriorYearInput {
  dataMonth: YearMonth;
  observedValue: number | null;
  validFraction: number;
}

export type MarineBoundarySstYearComparisonStatus =
  | "available"
  | "not-supplied"
  | "not-same-calendar-month-one-year-earlier"
  | "target-not-usable"
  | "prior-year-not-usable";

export type MarineBoundarySstDifferenceDirection =
  "warmer" | "cooler" | "unchanged";

/**
 * The arithmetic difference between two supplied boundary-mean SST samples for
 * the same searched boundary and the same calendar month, one year apart.
 *
 * Two observations are a difference, never a trend, rate, climatology, marine
 * heat-wave status, cause, risk, or forecast — and never a marine-biology
 * claim. Both samples are boundary means over whichever pixels the renderer
 * left usable, so the two months can cover different parts of the same
 * boundary; `validFractionDelta` exposes exactly that, because a difference
 * between unequally covered means may reflect which water was sampled rather
 * than how warm it was.
 */
export interface MarineBoundarySstYearComparison {
  kind: "same-calendar-month-boundary-sst-difference";
  isForecast: false;
  isTrend: false;
  claimScope: "descriptive-difference-between-two-observations-only";
  marineBiologyObservation: false;
  status: MarineBoundarySstYearComparisonStatus;
  priorDataMonth: YearMonth | null;
  priorObservedValue: number | null;
  priorValidFraction: number | null;
  /** Target SST minus prior-year SST, in `source.sourceUnit`. */
  difference: number | null;
  differenceUnit: string;
  direction: MarineBoundarySstDifferenceDirection | null;
  /** Weakest sampled coverage across the two months; never the mean of them. */
  minValidFraction: number | null;
  /** Absolute gap between the two sampled coverages; 0 means like-for-like. */
  validFractionDelta: number | null;
  /** Short machine-readable reason when no difference is reported. */
  reason: string | null;
}

export interface MarinePlaceInsightReading {
  id: typeof MARINE_PLACE_METRIC.id;
  value: string;
  detail: string;
  kind: "observed-boundary-sea-surface-temperature";
  availability: "available" | "no-usable-sst" | "sampling-unavailable";
  marineBiologyObservation: false;
  isForecast: false;
  dataMonth: YearMonth;
  sampledGeography: {
    kind: "searched-area-boundary";
    label: string;
  };
  observedValue: number | null;
  /** Exact sampler coverage; null only when sampling did not complete. */
  validFraction: number | null;
  /** Rendered image provenance; null only when sampling did not complete. */
  sourceImageDimensions: SourceImageDimensions | null;
  source: typeof SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE;
  /** Searched geography retained even when SST sampling is unavailable. */
  geography: MarineCoverageGeography;
  /** Structured sampler state for UI/export consumers; null when sampling failed. */
  coverage: MarineCoverageSummary | null;
  /** Same-calendar-month year-over-year difference; always a stated status. */
  yearOverYear: MarineBoundarySstYearComparison;
  /**
   * Whether the decoded value sits in a terminal bin of NASA's published SST
   * colormap, where the ramp collapses colder or warmer water into one colour.
   * Null when there is no usable value to judge.
   */
  rampCensoring: SstRampCensoringSummary | null;
  /**
   * How much of the searched boundary actually carried SST, and what the
   * reported mean therefore averages over. SST is undefined over land, so a
   * searched place is usually mostly outside the product's domain.
   */
  spatialSupport: MarineBoundarySstSupportSummary;
  observationStatus:
    | "observed"
    | "no-sst-coverage"
    | "invalid-sample"
    | "source-unavailable"
    | "sampling-failed";
  /** Exact unavailable state for UI/export consumers; null for usable SST. */
  unavailableReason:
    | "zero-sst-coverage"
    | "invalid-month"
    | "invalid-coverage"
    | "invalid-source-image-dimensions"
    | "invalid-sst-value"
    | MarineBoundarySstUnavailableReason
    | null;
}

/**
 * Format a boundary SST observation without turning partial coverage into a
 * coastal, biological, ecological, causal, or forecast claim.
 */
export function marineBoundarySstReading(
  input: MarineBoundarySstInput
): MarinePlaceInsightReading {
  const geographyLabel = normalizedGeographyLabel(input.geographyLabel);
  const geography: MarineCoverageGeography = input.geography ?? {
    kind: "boundary",
    label: geographyLabel,
  };
  const coverage = summarizeMarineCoverage({
    dataMonth: input.dataMonth,
    // A boundary can span water, land, coast, clouds, or gaps. The sampler's
    // valid fraction cannot identify which, so retain an explicit unknown
    // surface context instead of inferring a coastal footprint from SST.
    footprint: "unknown",
    validFraction: input.validFraction,
    sourceImageDimensions: input.sourceImageDimensions,
    geography,
  });
  const unavailableReason = marineBoundaryUnavailableReason(
    input.observedValue,
    coverage
  );
  const usable =
    unavailableReason === null && isSstSourceValue(input.observedValue);
  const month = formatYm(input.dataMonth);
  const image = coverage.sourceImageDimensions
    ? `rendered source image ${coverage.sourceImageDimensions.width} x ${coverage.sourceImageDimensions.height} px`
    : unavailableReason === "invalid-source-image-dimensions"
      ? "rendered source image dimensions invalid"
      : "rendered source image dimensions not supplied";
  const source = `${coverage.source.source.shortName} v${coverage.source.source.version}`;
  const yearOverYear = compareMarineBoundarySstToPriorYear(
    {
      dataMonth: input.dataMonth,
      observedValue: usable ? input.observedValue : null,
      validFraction: coverage.coverage.validFraction,
    },
    input.priorYear
  );

  // A boundary mean that lands in a terminal ramp bin cannot be separated from
  // an observation the colormap censored, and a censored pixel always decodes
  // on the inner side of its cap — so the mean is reported as a bound in that
  // direction rather than as a point estimate.
  const rampCensoring = usable
    ? summarizeSstRampCensoring(input.observedValue)
    : null;

  // Grade the share as the sampler supplied it, not as `summarizeMarineCoverage`
  // nulls it out on rejection: an invalid fraction was still supplied, and
  // reporting it as "not supplied" would hide which of the two happened.
  const spatialSupport = summarizeMarineBoundarySstSupport(input.validFraction);

  return {
    id: MARINE_PLACE_METRIC.id,
    value:
      input.observedValue !== null && usable
        ? (rampCensoring?.valueText ??
          `${input.observedValue.toFixed(1)} ${coverage.source.sourceUnit}`)
        : "No usable SST observation",
    detail: `${month} approximate mean SST observation sampled within ${geographyLabel}; ${describeMarineBoundarySstSupport(spatialSupport)}; ${image}; source ${source}${describeYearOverYear(yearOverYear)}${rampCensoring?.qualifier ? `; ${rampCensoring.qualifier}` : ""}; not a marine-biology observation`,
    kind: "observed-boundary-sea-surface-temperature",
    availability: usable ? "available" : "no-usable-sst",
    marineBiologyObservation: false,
    isForecast: false,
    dataMonth: input.dataMonth,
    sampledGeography: {
      kind: "searched-area-boundary",
      label: geographyLabel,
    },
    observedValue: usable ? input.observedValue : null,
    validFraction: coverage.coverage.validFraction,
    sourceImageDimensions: coverage.sourceImageDimensions,
    source: coverage.source,
    geography,
    coverage,
    yearOverYear,
    rampCensoring,
    spatialSupport,
    observationStatus: usable
      ? "observed"
      : coverage.coverage.status === "no-sst-coverage"
        ? "no-sst-coverage"
        : "invalid-sample",
    unavailableReason,
  };
}

/** Surface a workflow failure without relabeling it as absent SST. */
export function unavailableMarineBoundarySstReading(
  dataMonth: YearMonth,
  geographyInput: string | MarineCoverageGeography,
  reason: MarineBoundarySstUnavailableReason = "source-colormap-unavailable"
): MarinePlaceInsightReading {
  const geography: MarineCoverageGeography =
    typeof geographyInput === "string"
      ? {
          kind: "boundary",
          label: normalizedGeographyLabel(geographyInput),
        }
      : geographyInput;
  const sampledGeographyLabel = normalizedGeographyLabel(
    geography.label ?? geography.kind
  );
  const place =
    typeof geographyInput === "string"
      ? sampledGeographyLabel
      : geography.label === null
        ? geography.kind
        : `${geography.kind} “${geography.label}”`;
  const unavailableDetail =
    reason === "source-colormap-unavailable"
      ? "could not be sampled from the published source colormap"
      : "could not be sampled for the searched boundary";
  return {
    id: MARINE_PLACE_METRIC.id,
    value: "Unavailable",
    detail: `${formatYm(dataMonth)} SST observation for ${place} ${unavailableDetail}; source ${SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.shortName} v${SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.version}; not a marine-biology observation`,
    kind: "observed-boundary-sea-surface-temperature",
    availability: "sampling-unavailable",
    marineBiologyObservation: false,
    isForecast: false,
    dataMonth,
    sampledGeography: {
      kind: "searched-area-boundary",
      label: sampledGeographyLabel,
    },
    observedValue: null,
    validFraction: null,
    sourceImageDimensions: null,
    source: SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
    geography,
    coverage: null,
    // Sampling did not complete, so there is no target to compare against.
    yearOverYear: unavailableYearComparison("target-not-usable", null),
    rampCensoring: null,
    // Sampling never produced a share, so none is reported. A failed workflow
    // must not be recorded as a boundary that held no water.
    spatialSupport: summarizeMarineBoundarySstSupport(null),
    observationStatus:
      reason === "source-colormap-unavailable"
        ? "source-unavailable"
        : "sampling-failed",
    unavailableReason: reason,
  };
}

/**
 * Difference one boundary-mean SST sample against a supplied sample for the
 * same boundary and the same calendar month exactly one year earlier.
 *
 * The prior-year month must be exactly that: an adjacent, nearby, or
 * differently numbered month is refused rather than substituted, because a
 * seasonal cycle would otherwise be reported as a year-over-year change. Both
 * samples must independently be usable SST values with valid coverage; an
 * unusable month is stated, never dropped so the other month can stand alone.
 */
export function compareMarineBoundarySstToPriorYear(
  target: {
    dataMonth: YearMonth;
    observedValue: number | null;
    validFraction: number | null;
  },
  priorYear: MarineBoundarySstPriorYearInput | undefined
): MarineBoundarySstYearComparison {
  if (priorYear === undefined) {
    return unavailableYearComparison("not-supplied", null);
  }
  if (
    !isCalendarMonth(target.dataMonth) ||
    !isCalendarMonth(priorYear.dataMonth) ||
    priorYear.dataMonth.year !== target.dataMonth.year - 1 ||
    priorYear.dataMonth.month !== target.dataMonth.month
  ) {
    return unavailableYearComparison(
      "not-same-calendar-month-one-year-earlier",
      priorYear
    );
  }
  if (
    !isSstSourceValue(target.observedValue) ||
    !isCoverage(target.validFraction)
  ) {
    return unavailableYearComparison("target-not-usable", priorYear);
  }
  if (
    !isSstSourceValue(priorYear.observedValue) ||
    !isCoverage(priorYear.validFraction)
  ) {
    return unavailableYearComparison("prior-year-not-usable", priorYear);
  }

  const difference = target.observedValue - priorYear.observedValue;
  return {
    ...yearComparisonBase,
    status: "available",
    priorDataMonth: priorYear.dataMonth,
    priorObservedValue: priorYear.observedValue,
    priorValidFraction: priorYear.validFraction,
    difference,
    direction:
      difference > 0 ? "warmer" : difference < 0 ? "cooler" : "unchanged",
    minValidFraction: Math.min(target.validFraction, priorYear.validFraction),
    validFractionDelta: Math.abs(
      target.validFraction - priorYear.validFraction
    ),
    reason: null,
  };
}

const yearComparisonBase = {
  kind: "same-calendar-month-boundary-sst-difference",
  isForecast: false,
  isTrend: false,
  claimScope: "descriptive-difference-between-two-observations-only",
  marineBiologyObservation: false,
  differenceUnit: SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.sourceUnit,
} as const;

/**
 * Retain whichever prior-year month was offered even when it cannot be used,
 * so a consumer can show what was compared against rather than an empty slot.
 */
function unavailableYearComparison(
  status: Exclude<MarineBoundarySstYearComparisonStatus, "available">,
  priorYear: MarineBoundarySstPriorYearInput | null
): MarineBoundarySstYearComparison {
  return {
    ...yearComparisonBase,
    status,
    priorDataMonth: priorYear?.dataMonth ?? null,
    priorObservedValue: null,
    priorValidFraction: null,
    difference: null,
    direction: null,
    minValidFraction: null,
    validFractionDelta: null,
    reason: status,
  };
}

/**
 * A short clause for the insight card. It names both months and both sampled
 * coverages so the reader can see how comparable the two boundary means are,
 * and says outright that two observations are not a trend.
 */
function describeYearOverYear(
  comparison: MarineBoundarySstYearComparison
): string {
  if (comparison.status !== "available") return "";
  const sign = comparison.difference! > 0 ? "+" : "";
  return `; ${sign}${comparison.difference!.toFixed(1)} ${comparison.differenceUnit} vs ${formatYm(
    comparison.priorDataMonth!
  )} for the same boundary (${Math.round(
    comparison.priorValidFraction! * 100
  )}% sampled coverage that month) — a difference between two observations, not a trend`;
}

function isCoverage(validFraction: number | null): validFraction is number {
  return (
    validFraction !== null &&
    Number.isFinite(validFraction) &&
    validFraction > 0 &&
    validFraction <= 1
  );
}

function isCalendarMonth(month: YearMonth): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function normalizedGeographyLabel(label: string): string {
  const normalized = label.trim();
  return normalized || "unknown searched area";
}

function marineBoundaryUnavailableReason(
  observedValue: number | null,
  coverage: MarineCoverageSummary
): MarinePlaceInsightReading["unavailableReason"] {
  if (coverage.coverage.reason === "zero-sst-coverage") {
    return "zero-sst-coverage";
  }
  if (coverage.coverage.reason === "invalid-month") {
    return "invalid-month";
  }
  if (coverage.coverage.status === "invalid") {
    return "invalid-coverage";
  }
  if (coverage.sourceImageDimensions === null) {
    return "invalid-source-image-dimensions";
  }
  if (!isSstSourceValue(observedValue)) {
    return "invalid-sst-value";
  }
  return null;
}

function isSstSourceValue(value: number | null): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= PROBE_SCALES.sst.min &&
    value <= PROBE_SCALES.sst.max
  );
}
