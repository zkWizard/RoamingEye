import {
  SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
  summarizeMarineCoverage,
  type MarineCoverageSummary,
  type MarineCoverageGeography,
  type SourceImageDimensions,
} from "./marineCoverage";
import {
  describeMarineBoundarySstSupport,
  formatSampledBoundaryShare,
  summarizeMarineBoundarySstSupport,
  type MarineBoundarySstSupportSummary,
} from "./marineBoundarySstSupport";
import { PROBE_SCALES } from "./probe";
import {
  describeSstDifferenceCensoring,
  summarizeSstRampCensoring,
  type SstDifferenceBound,
  type SstRampCensoringSummary,
} from "./sstRampCensoring";
import { SST_SAMPLING_GATE_NOTE } from "./sstObservingConstraints";
import { marineBoundaryMeanSstCensoringNote } from "./marineAveragedSstCensoring";
import {
  qualifyingSstNativeSupportNote,
  summarizeSstNativeSupport,
  type SstNativeSupportSummary,
} from "./sstNativeSupport";
import { formatYm, type YearMonth } from "./timeline";
import type { Bounds } from "./imagery";
// Value import, but no runtime cycle: marineBoundarySstChange imports this
// module with `import type` only, which is erased at compile time.
import { MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT } from "./marineBoundarySstChange";

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
  /**
   * Bounding box of the sampled boundary, for the native-grid support bound.
   * Omitted when the workflow did not supply one; support is then unbounded
   * rather than assumed.
   */
  bounds?: Bounds | null;
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
  | "prior-year-not-usable"
  /** Both months sit in terminal ramp bins, so no difference can be bounded. */
  | "censored-endpoints"
  /**
   * The two months' usable boundary shares differ beyond the repo's stated
   * comparability convention, so the means describe materially different water.
   */
  | "incomparable-coverage";

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
 * than how warm it was. Beyond
 * `MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT` — the same convention the
 * month-over-month comparison uses — no difference is stated at all.
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
  /**
   * Target SST minus prior-year SST, in `source.sourceUnit`. A ONE-SIDED BOUND
   * rather than the difference itself when `differenceBound` is set.
   */
  difference: number | null;
  differenceUnit: string;
  /**
   * How the published colormap's open end caps constrain the difference:
   * "lower" → the true difference is at least `difference`, "upper" → at most,
   * null → neither endpoint is censored. Two endpoints censored in opposing
   * directions yield no difference at all (status `censored-endpoints`).
   */
  differenceBound: "upper" | "lower" | null;
  /**
   * Null when a censored endpoint leaves the direction unestablished. That is
   * NOT `unchanged`, which asserts the two months matched.
   */
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
  /**
   * How many native source cells the searched boundary can span. Rendered
   * pixels are not independent measurements, so a boundary smaller than one
   * ~9 km cell yields a "mean" resting on a single source value. Reported
   * alongside the value, never folded into it.
   */
  nativeSupport: SstNativeSupportSummary;
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

  // That screen reads the boundary MEAN, and a mean of capped and resolved
  // pixels lands inside the finite ramp — so an unmarked card is not evidence of
  // an uncensored boundary. The probe already states this for its own averaged
  // footprints, which are combined by the very same weighted mean; without it
  // here the identical combiner is qualified on one surface and silent on the
  // other. See marineAveragedSstCensoring for why presence is unrecoverable.
  //
  // The comparison computed just above is reduced from the very same means, one
  // for each of the two months, and `describeSstDifferenceCensoring` screens it
  // by reading them — so its `≥`/`≤` prefix, its suppressed direction, and its
  // withheld doubly-censored pair all inherit this blindness. Left as it was,
  // the card qualified the single value and then printed a difference of two
  // such values bare, which reads as the screened number on the line. The bound
  // is passed only when a difference is actually stated: a withheld one has no
  // claim left to qualify.
  const averagedCensoringNote = marineBoundaryMeanSstCensoringNote(
    rampCensoring,
    yearOverYear.status === "available"
      ? yearOverYear.differenceBound
      : undefined
  );

  // Grade the share as the sampler supplied it, not as `summarizeMarineCoverage`
  // nulls it out on rejection: an invalid fraction was still supplied, and
  // reporting it as "not supplied" would hide which of the two happened.
  const spatialSupport = summarizeMarineBoundarySstSupport(input.validFraction);

  // Coverage grades what SHARE of the boundary returned pixels; it cannot say
  // how many independent source values those pixels carry. A searched town is
  // routinely smaller than one ~9 km L3 cell, so a card can print "94% sampled
  // coverage" over a mean that rests on a single retrieval whose footprint
  // extends outside the boundary. The note speaks only in the two cases where
  // that changes how the printed mean may be read, and only beside a value
  // there is a mean to qualify.
  const nativeSupport = summarizeSstNativeSupport(input.bounds ?? null);
  const nativeSupportNote = usable
    ? qualifyingSstNativeSupportNote(nativeSupport)
    : null;

  return {
    id: MARINE_PLACE_METRIC.id,
    value:
      input.observedValue !== null && usable
        ? (rampCensoring?.valueText ??
          `${input.observedValue.toFixed(1)} ${coverage.source.sourceUnit}`)
        : "No usable SST observation",
    // The sampling-gate note qualifies a value, so it is appended only when one
    // is reported. See sstObservingConstraints for what the note stands in for:
    // the cited product composites Aqua's daytime overpass on cloud-screened
    // days only, so this mean is not a full-diurnal, all-weather monthly mean.
    detail: `${month} approximate mean SST observation sampled within ${geographyLabel}; ${describeMarineBoundarySstSupport(spatialSupport)}${nativeSupportNote ? `; ${nativeSupportNote}` : ""}; ${image}; source ${source}${describeYearOverYear(yearOverYear)}${rampCensoring?.qualifier ? `; ${rampCensoring.qualifier}` : ""}${
      averagedCensoringNote ? `; ${averagedCensoringNote}` : ""
    }${usable ? `; ${SST_SAMPLING_GATE_NOTE}` : ""}; not a marine-biology observation`,
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
    nativeSupport,
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
    // Sampling never completed, so no extent was established to bound.
    nativeSupport: summarizeSstNativeSupport(null),
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

  // A thermal-infrared retrieval only exists under cloud-free sky, so each month
  // is a mean over whichever boundary cells happened to return a value. When
  // those usable shares differ grossly the two means describe materially
  // different water, and their arithmetic difference may record which water was
  // sampled rather than how warm it was. The month-over-month sibling withholds
  // a signed change on exactly this test, so the same convention is applied here
  // — otherwise the card prints one screened difference beside one unscreened
  // difference and gives the reader no way to tell them apart.
  const validFractionDelta = Math.abs(
    target.validFraction - priorYear.validFraction
  );
  const minValidFraction = Math.min(
    target.validFraction,
    priorYear.validFraction
  );
  if (validFractionDelta > MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT) {
    return {
      ...yearComparisonBase,
      status: "incomparable-coverage",
      priorDataMonth: priorYear.dataMonth,
      // Withheld like every other non-available status: publishing both
      // endpoints would hand back the very difference this branch refuses to
      // state. Every sampled month still reaches the CSV export, so the record
      // remains recomputable without the card asserting a comparison.
      priorObservedValue: null,
      priorValidFraction: priorYear.validFraction,
      difference: null,
      differenceBound: null,
      direction: null,
      // Retained rather than nulled: these two fields ARE the disclosure in
      // this branch — they say how far apart the supports were.
      minValidFraction,
      validFractionDelta,
      reason: "coverage-disparity",
    };
  }

  // The published ramp's end caps are open, so a month decoded inside one is a
  // bound, not a value. Two months censored in opposing directions leave the
  // difference unbounded both ways — and since both then typically decode to the
  // SAME capped value, the arithmetic would read "unchanged" for water whose
  // year-over-year change is entirely unknown.
  const censoring = describeSstDifferenceCensoring(
    priorYear.observedValue,
    target.observedValue
  );
  if (censoring.bound === "indeterminate") {
    return unavailableYearComparison("censored-endpoints", priorYear);
  }

  const difference = target.observedValue - priorYear.observedValue;
  return {
    ...yearComparisonBase,
    status: "available",
    priorDataMonth: priorYear.dataMonth,
    priorObservedValue: priorYear.observedValue,
    priorValidFraction: priorYear.validFraction,
    difference,
    differenceBound: censoring.bound === "none" ? null : censoring.bound,
    direction: yearDifferenceDirection(difference, censoring.bound),
    minValidFraction,
    validFractionDelta,
    reason: null,
  };
}

/**
 * Direction of a year-over-year difference, honouring what a censored endpoint
 * permits. A one-sided bound can only prove the direction it already points in;
 * `unchanged` asserts both sides at once and so needs an uncensored pair.
 */
function yearDifferenceDirection(
  difference: number,
  bound: SstDifferenceBound
): MarineBoundarySstDifferenceDirection | null {
  if (bound === "none") {
    return difference > 0 ? "warmer" : difference < 0 ? "cooler" : "unchanged";
  }
  if (bound === "lower") return difference > 0 ? "warmer" : null;
  if (bound === "upper") return difference < 0 ? "cooler" : null;
  return null;
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
    differenceBound: null,
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
 *
 * The PRIOR month's share is rendered through the same
 * {@link formatSampledBoundaryShare} the card already uses for the sampled
 * month, so the one card states one quantity one way. Rounded on its own it
 * would read "100% of the boundary" for a boundary one rejected pixel short of
 * whole — and SST is undefined over land, so that is not a rounding of the
 * share but a claim that an entire administrative area is water that returned
 * usable SST. The coverage GAP beside it stays a plain rounded point count: it
 * is a difference between two shares, not a share, and neither end of it
 * carries the "whole boundary" claim.
 */
function describeYearOverYear(
  comparison: MarineBoundarySstYearComparison
): string {
  if (comparison.status === "censored-endpoints") {
    return "; no year-over-year difference stated — both months land in the published colormap's open end caps, which bound them in opposing directions";
  }
  if (comparison.status === "incomparable-coverage") {
    return `; no year-over-year difference stated — ${formatYm(
      comparison.priorDataMonth!
    )} sampled ${formatSampledBoundaryShare(
      comparison.priorValidFraction!
    )} of the boundary, ${Math.round(
      comparison.validFractionDelta! * 100
    )} points from this month's usable share, so the two means may differ in which water was sampled rather than in temperature`;
  }
  if (comparison.status !== "available") return "";
  const sign = comparison.difference! > 0 ? "+" : "";
  // A bounded difference is rendered with its inequality so it can never be
  // read as a point value, and says outright that the direction is open.
  const prefix =
    comparison.differenceBound === "lower"
      ? "≥ "
      : comparison.differenceBound === "upper"
        ? "≤ "
        : "";
  const bounded =
    comparison.differenceBound === null
      ? ""
      : comparison.direction === null
        ? " (a censored endpoint bounds this difference on one side only, so no direction is stated)"
        : " (a censored endpoint bounds this difference on one side only)";
  return `; ${prefix}${sign}${comparison.difference!.toFixed(1)} ${comparison.differenceUnit} vs ${formatYm(
    comparison.priorDataMonth!
  )} for the same boundary (${formatSampledBoundaryShare(
    comparison.priorValidFraction!
  )} sampled coverage that month)${bounded} — a difference between two observations, not a trend`;
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
