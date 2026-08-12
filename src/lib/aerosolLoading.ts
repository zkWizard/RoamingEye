import { PROBE_SCALES } from "./probe";
import { LAYERS, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Source-aware descriptors for monthly aerosol optical depth (AOD).
 *
 * The atmosphere layer renders MERRA-2 total aerosol optical thickness at
 * 550 nm — a dimensionless, column-integrated extinction measure. This module
 * describes a single supplied monthly AOD observation, its coverage, and a
 * plain-language loading tier for that value. It does not estimate air quality,
 * derive surface concentrations, diagnose conditions, attribute causes, or
 * forecast future values.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - AOD is a whole-column optical property, NOT a surface concentration and
 *    NOT a regulatory air-quality or health index. A high column value can sit
 *    above clean surface air, and vice versa.
 *  - MERRA-2 is a reanalysis (a model constrained by assimilated observations),
 *    so a value is a modelled monthly mean, not a direct pixel measurement.
 *  - The loading tiers below are descriptive reading aids with commonly cited
 *    break points; they are not standardized thresholds and carry no health,
 *    safety, or compliance meaning.
 */

/** Wavelength of the rendered aerosol optical thickness product, in nm. */
export const AEROSOL_WAVELENGTH_NM = 550;

/** AOD is a dimensionless optical thickness; there is no physical unit. */
export const AEROSOL_UNIT = "dimensionless";

/**
 * Column AOD at which the *rendered* ramp stops resolving, at 550 nm.
 *
 * GIBS draws this product with a colormap whose bins run 0.000–0.900 in 0.005
 * steps and whose final bin is open-ended (`≥ 0.900`), so every column loading
 * at or above this value is painted in one terminal colour. A value recovered
 * from that colour is therefore a *lower bound*, not a measurement: the true
 * AOD could be 0.9 or 3.0 and the pixel would look identical. Heavy dust and
 * biomass-burning plumes routinely exceed it, so this is a live limit on real
 * scenes, not a theoretical edge case.
 *
 * Derived from `PROBE_SCALES.aerosol.max` (the range the probe inverts onto,
 * taken from that colormap) so a scale edit can never silently desync this
 * bound from the values callers actually receive. Colormap document:
 * `MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly.xml`, the
 * same one the inversion contract test validates against.
 */
export const AEROSOL_RENDERED_RAMP_MAX = requireRenderedRampMax();

function requireRenderedRampMax(): number {
  const scale = PROBE_SCALES.aerosol;
  if (!scale.calibrated || !Number.isFinite(scale.max) || scale.max <= 0) {
    throw new Error(
      "RoamingEye: aerosol layer must retain a calibrated rendered ramp maximum"
    );
  }
  return scale.max;
}

/**
 * Honest scope limits shared by the aerosol descriptors. Kept in code because
 * callers surface them alongside any AOD value or change they present.
 */
export const AEROSOL_LOADING_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index.",
  "MERRA-2 is a reanalysis (a model constrained by assimilated observations), so a value is a modelled monthly mean, not a direct pixel measurement.",
  "Loading tiers and the change band are descriptive reading conventions, not standardized thresholds, and carry no health, safety, or compliance meaning.",
  "A month-over-month change describes only the difference between two modelled monthly means; it implies nothing about cause, surface air quality, or any future value.",
  "The rendered colormap's top bin is open-ended (AOD ≥ 0.9 at 550 nm), so a reading at that bound is a lower bound rather than a measurement, and a change computed from one is bounded rather than exact.",
] as const;

/** Cited source for the aerosol optical depth observations (MERRA-2). */
export const AEROSOL_SOURCE: DatasetRef = requireAerosolSource();

function requireAerosolSource(): DatasetRef {
  const source = LAYERS.aerosol.dataset;
  if (!source) {
    throw new Error("RoamingEye: aerosol layer must retain a cited dataset");
  }
  return source;
}

export interface AerosolObservation {
  /** Month represented by the supplied source observation. */
  dataMonth: YearMonth;
  /** Dimensionless AOD at 550 nm; null means no usable source value. */
  value: number | null;
  /** Usable share of the sampled area, when spatial sampling provides it. */
  validFraction?: number;
  /**
   * Dimensions of a rendered source image when the observation was sampled
   * from imagery. This is provenance, not a ground-resolution claim.
   */
  sourceImageDimensions?: { width: number; height: number };
}

export type AerosolCoverageStatus = "available" | "no-data" | "invalid";

export interface AerosolCoverage {
  status: AerosolCoverageStatus;
  /** Null means the sampler did not provide spatial coverage. */
  validFraction: number | null;
  /** Why a value cannot be described as a usable monthly observation. */
  reason: string | null;
}

/**
 * Descriptive loading tiers for column AOD at 550 nm. These are reading aids,
 * not measurements or standardized thresholds; the value in `observedValue`
 * remains the authoritative number.
 */
export type AerosolLoadingCategory =
  "very-low" | "low" | "moderate" | "high" | "very-high";

interface AerosolLoadingBand {
  category: AerosolLoadingCategory;
  /** Inclusive lower bound of column AOD at 550 nm. */
  minInclusive: number;
  /** Exclusive upper bound; null means unbounded above. */
  maxExclusive: number | null;
  label: string;
}

/**
 * Loading bands ordered from clean to heavily loaded. Break points follow
 * values commonly used in aerosol literature to talk about column loading
 * (background ≲0.1; hazy ≳0.2; heavy dust/smoke ≳0.5-1.0). They are
 * qualitative descriptors only — no health or air-quality meaning is implied.
 *
 * Note the interaction with `AEROSOL_RENDERED_RAMP_MAX` (0.9): `very-high`
 * starts at 1.0, *above* the top of the rendered ramp, so it can never be
 * reached by a value read back from imagery. The bands are kept on the
 * literature's break points rather than bent to fit the ramp — a reading that
 * saturates is reported as a lower-bound tier (see `AerosolCensoring`) instead,
 * which is why `summarizeAerosolLoading` never claims a censored value is
 * definitively `high`.
 */
export const AEROSOL_LOADING_BANDS: readonly AerosolLoadingBand[] = [
  {
    category: "very-low",
    minInclusive: 0,
    maxExclusive: 0.1,
    label: "very low column loading",
  },
  {
    category: "low",
    minInclusive: 0.1,
    maxExclusive: 0.2,
    label: "low column loading",
  },
  {
    category: "moderate",
    minInclusive: 0.2,
    maxExclusive: 0.5,
    label: "moderate column loading",
  },
  {
    category: "high",
    minInclusive: 0.5,
    maxExclusive: 1,
    label: "high column loading",
  },
  {
    category: "very-high",
    minInclusive: 1,
    maxExclusive: null,
    label: "very high column loading",
  },
];

export interface AerosolLoadingDescriptor {
  category: AerosolLoadingCategory;
  label: string;
  /** Inclusive lower bound of the matched band, at 550 nm. */
  bandMin: number;
  /** Exclusive upper bound of the matched band, or null when unbounded. */
  bandMax: number | null;
}

/**
 * Whether the rendered ramp could resolve a value, or only bound it below.
 *
 * `censored-high` means the reading sits in the colormap's open-ended top bin
 * (AOD ≥ `AEROSOL_RENDERED_RAMP_MAX`): the true column loading is at least that
 * much and may be far more. This is a *representability* limit of the imagery
 * RoamingEye reads, never a claim that the value is a record or extreme.
 */
export type AerosolCensoringStatus = "uncensored" | "censored-high";

export interface AerosolCensoring {
  status: AerosolCensoringStatus;
  /** AOD at/above which the rendered ramp stops resolving, at 550 nm. */
  rampMax: number;
  /**
   * True when the reported value can only be read as "at least this much".
   * This, not the tier label, is the authoritative signal for callers.
   */
  isLowerBound: boolean;
  /**
   * Lowest loading tier consistent with the reading, or null when there is no
   * usable value. For a censored reading the true tier may be any tier at or
   * above this one, so a caller must not present it as the definite tier.
   */
  lowestPossibleCategory: AerosolLoadingCategory | null;
  /** Plain-language statement for callers that surface the value. */
  statement: string;
}

/**
 * Describe whether a usable column AOD was resolved by the rendered ramp or
 * merely bounded below by it. Returns null for values that are not usable
 * optical thickness, matching `describeAerosolLoading`, so no caller reads a
 * representability claim off an unusable number.
 */
export function describeAerosolCensoring(
  value: number | null,
  rampMax: number = AEROSOL_RENDERED_RAMP_MAX
): AerosolCensoring | null {
  const loading = describeAerosolLoading(value);
  if (value === null || loading === null) return null;
  const bound =
    Number.isFinite(rampMax) && rampMax > 0
      ? rampMax
      : AEROSOL_RENDERED_RAMP_MAX;

  if (value < bound) {
    return {
      status: "uncensored",
      rampMax: bound,
      isLowerBound: false,
      lowestPossibleCategory: loading.category,
      statement: `column AOD ${formatAod(value)} is inside the rendered ramp (below ${formatAod(bound)}), so it reads as a value rather than a bound`,
    };
  }

  return {
    status: "censored-high",
    rampMax: bound,
    isLowerBound: true,
    lowestPossibleCategory: loading.category,
    statement: `the rendered colormap's top bin is open-ended at ${formatAod(bound)}, so this month reads as column AOD of at least ${formatAod(bound)} (${loading.label} or heavier); the true value cannot be recovered from the imagery`,
  };
}

function formatAod(value: number): string {
  return Number(value.toPrecision(5)).toString();
}

/**
 * Default AOD distance, at 550 nm, within which a value is flagged as sitting
 * near a tier boundary. Like the loading bands themselves this is a descriptive
 * reading aid, not a standardized threshold; callers may override it. The
 * authoritative signal is always the numeric `distanceToBoundary`.
 */
export const AEROSOL_TIER_EDGE_MARGIN = 0.02;

export interface AerosolBandProximity {
  /** Loading tier the value falls in (matches `describeAerosolLoading`). */
  category: AerosolLoadingCategory;
  /** AOD value of the nearest boundary between two loading tiers. */
  nearestBoundary: number;
  /**
   * Signed distance `value - nearestBoundary` at 550 nm. Negative means the
   * value sits below the boundary, positive above; zero means it is exactly on
   * it. This raw distance, not the `marginal` flag, is the authoritative signal.
   */
  distanceToBoundary: number;
  /** The loading tier immediately across the nearest boundary. */
  adjacentCategory: AerosolLoadingCategory;
  /**
   * True when `|distanceToBoundary| <= margin`: the tier assignment is close to
   * an edge and a nearby value could read as `adjacentCategory`. A robustness
   * caveat on the categorical tier, never a measurement or forecast.
   */
  marginal: boolean;
  /** Margin applied to derive `marginal`; echoed for provenance. */
  margin: number;
}

export interface AerosolLoadingSummary {
  kind: "observed-monthly-aerosol";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  source: DatasetRef;
  wavelengthNm: number;
  unit: string;
  dataMonth: YearMonth;
  /** Month through which the caller had confirmed source availability. */
  availableThrough: YearMonth;
  /** Whether this data month is within the caller's confirmed availability. */
  publicationStatus:
    "published" | "not-yet-published" | "invalid-reference-month";
  /** Calendar-month difference, or null when data month is not yet published. */
  publicationLagMonths: number | null;
  coverage: AerosolCoverage;
  /** Rendered-image provenance, or null when it was not supplied or invalid. */
  sourceImageDimensions: { width: number; height: number } | null;
  /** Retained AOD value (dimensionless), or null when not usable. */
  observedValue: number | null;
  /** Descriptive loading tier, or null when there is no usable value. */
  loading: AerosolLoadingDescriptor | null;
  /**
   * How close the value sits to the nearest loading-tier boundary, so consumers
   * can tell a robustly-in-tier value from one that is only marginally binned.
   * Null when there is no usable value.
   *
   * Computed on the reported value alone: when `censoring.isLowerBound` is true
   * the reported value is a bound, so a "robustly in tier" proximity here says
   * nothing about the true loading. Callers must check `censoring` first.
   */
  tierProximity: AerosolBandProximity | null;
  /**
   * Whether the rendered ramp resolved the value or only bounded it below.
   * Null when there is no usable value.
   */
  censoring: AerosolCensoring | null;
}

/**
 * Describe a single supplied monthly AOD value, its coverage, publication lag
 * at month precision, and a descriptive loading tier. `availableThrough` is an
 * availability checkpoint, not a promise that a future month will be published.
 */
export function summarizeAerosolLoading(
  observation: AerosolObservation,
  availableThrough: YearMonth
): AerosolLoadingSummary {
  const dataMonth = observation.dataMonth;
  const validMonths = isYearMonth(dataMonth) && isYearMonth(availableThrough);
  const lag = validMonths ? monthDistance(dataMonth, availableThrough) : null;
  const publicationStatus =
    lag === null
      ? "invalid-reference-month"
      : lag < 0
        ? "not-yet-published"
        : "published";
  const coverage = coverageFor(observation, validMonths);
  const observedValue =
    coverage.status === "available" ? observation.value : null;

  return {
    kind: "observed-monthly-aerosol",
    isForecast: false,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    dataMonth,
    availableThrough,
    publicationStatus,
    publicationLagMonths: lag === null || lag < 0 ? null : lag,
    coverage,
    sourceImageDimensions: validImageDimensions(
      observation.sourceImageDimensions
    )
      ? { ...observation.sourceImageDimensions }
      : null,
    observedValue,
    loading:
      observedValue === null ? null : describeAerosolLoading(observedValue),
    tierProximity:
      observedValue === null
        ? null
        : describeAerosolBandProximity(observedValue),
    censoring:
      observedValue === null ? null : describeAerosolCensoring(observedValue),
  };
}

/**
 * Map a finite, non-negative column AOD to its descriptive loading tier.
 * Returns null for values that are not usable optical thickness (negative,
 * non-finite, or null) so no caller reads a tier off an unusable number.
 */
export function describeAerosolLoading(
  value: number | null
): AerosolLoadingDescriptor | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  const band = AEROSOL_LOADING_BANDS.find(
    (candidate) =>
      value >= candidate.minInclusive &&
      (candidate.maxExclusive === null || value < candidate.maxExclusive)
  );
  if (!band) return null;
  return {
    category: band.category,
    label: band.label,
    bandMin: band.minInclusive,
    bandMax: band.maxExclusive,
  };
}

/**
 * Inter-tier boundaries: the AOD values that separate two adjacent loading
 * tiers. The physical floor (0) and the unbounded top of `very-high` are
 * deliberately excluded — they are not choices between two descriptive tiers,
 * so proximity to them carries no "could read as the neighbouring tier" meaning.
 */
const AEROSOL_TIER_BOUNDARIES: readonly {
  value: number;
  below: AerosolLoadingCategory;
  above: AerosolLoadingCategory;
}[] = AEROSOL_LOADING_BANDS.slice(1).map((band, index) => ({
  value: band.minInclusive,
  below: AEROSOL_LOADING_BANDS[index].category,
  above: band.category,
}));

/**
 * Describe how close a usable column AOD sits to the nearest boundary between
 * two loading tiers, so a consumer can distinguish a value that is robustly
 * inside its tier from one that is only marginally binned (e.g. 0.19 vs 0.21
 * both read as roughly the same air but land in different tiers).
 *
 * Returns null for values that are not usable optical thickness (negative,
 * non-finite, or null), matching `describeAerosolLoading`, so no caller reads a
 * robustness claim off an unusable number. The `margin` (default
 * `AEROSOL_TIER_EDGE_MARGIN`) only drives the convenience `marginal` flag; the
 * authoritative signal is the numeric `distanceToBoundary`.
 */
export function describeAerosolBandProximity(
  value: number | null,
  margin: number = AEROSOL_TIER_EDGE_MARGIN
): AerosolBandProximity | null {
  const loading = describeAerosolLoading(value);
  if (value === null || loading === null) return null;
  const safeMargin = Number.isFinite(margin) && margin >= 0 ? margin : 0;

  // Nearest inter-tier boundary; ties resolve to the lower boundary value so
  // the result is deterministic. A value interior to its tier stays on the same
  // side of whichever boundary wins, so `category` always matches the tier it
  // falls in.
  let nearest = AEROSOL_TIER_BOUNDARIES[0];
  let nearestDistance = Math.abs(value - nearest.value);
  for (const boundary of AEROSOL_TIER_BOUNDARIES.slice(1)) {
    const distance = Math.abs(value - boundary.value);
    if (distance < nearestDistance) {
      nearest = boundary;
      nearestDistance = distance;
    }
  }

  const distanceToBoundary = value - nearest.value;
  const adjacentCategory =
    distanceToBoundary >= 0 ? nearest.below : nearest.above;

  return {
    category: loading.category,
    nearestBoundary: nearest.value,
    distanceToBoundary,
    adjacentCategory,
    marginal: nearestDistance <= safeMargin,
    margin: safeMargin,
  };
}

/** Direction of change in column AOD between two consecutive months. */
export type AerosolLoadingTrend = "increasing" | "decreasing" | "little-change";

export type AerosolLoadingChangeStatus =
  "available" | "non-adjacent-months" | "unavailable";

/**
 * How the rendered ramp's open-ended top bin bounds a reported change.
 *
 * A censored endpoint is a lower bound, so the difference built from it is a
 * bound too. When *both* endpoints are censored the difference is not
 * informative at all: two months reading 0.9 could truly be 0.9 and 3.0, so
 * neither the sign nor the magnitude of the change survives, and no trend is
 * reported.
 */
export type AerosolChangeBound =
  /** Neither endpoint censored: `changeValue` is the plain difference. */
  | "exact"
  /** Later month censored: the true change is at least `changeValue`. */
  | "bounded-below"
  /** Earlier month censored: the true change is at most `changeValue`. */
  | "bounded-above"
  /** Both endpoints censored: sign and magnitude are both unrecoverable. */
  | "indeterminate";

/**
 * Absolute change in column AOD below which the difference is reported as
 * `little-change` rather than increasing or decreasing. It is a fifth of the
 * `very-low`/`low` break point (0.1) — small enough to name a real shift, wide
 * enough not to over-read month-to-month reanalysis wobble. Like the loading
 * tiers it is a descriptive reading convention, not a standardized threshold.
 */
export const AEROSOL_LOADING_CHANGE_THRESHOLD = 0.02;

export interface AerosolLoadingChange {
  kind: "month-over-month-aerosol-loading-change";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AerosolLoadingChangeStatus;
  source: DatasetRef;
  wavelengthNm: number;
  unit: string;
  earlier: AerosolLoadingSummary;
  later: AerosolLoadingSummary;
  /** Later minus earlier column AOD (dimensionless); null when not computable. */
  changeValue: number | null;
  trend: AerosolLoadingTrend | null;
  /**
   * How the ramp's censoring bounds `changeValue`. Null when no change was
   * computed. A caller presenting the number must honour this: anything other
   * than `exact` means the difference is a bound, not a measured change.
   */
  changeBound: AerosolChangeBound | null;
  threshold: number;
  /** Short machine-readable reason when no trend is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface AerosolLoadingChangeOptions {
  /** Absolute AOD band treated as `little-change` (defaults to the constant). */
  threshold?: number;
}

/**
 * Whether a summary carries a value usable as a change endpoint. Unlike the
 * summary's own `observedValue` — which tracks coverage alone and can be set for
 * a not-yet-published month — a change requires a *published* month with usable
 * coverage and a finite value, so an unpublished future month never enters a
 * comparison.
 */
function usableEndpointValue(summary: AerosolLoadingSummary): number | null {
  if (summary.publicationStatus !== "published") return null;
  if (summary.coverage.status !== "available") return null;
  const value = summary.observedValue;
  return value !== null && Number.isFinite(value) ? value : null;
}

/**
 * Describe the change in column AOD between two consecutive months of the same
 * MERRA-2 product. Both months must be published with usable coverage, and
 * `later` must fall exactly one calendar month after `earlier` — the helper
 * never spans a gap or fills a missing month. The result describes a difference
 * in modelled column loading only; it implies nothing about surface air quality,
 * cause, or any future value.
 *
 * Readings that saturate the rendered ramp are handled as bounds rather than
 * values: see `changeBound`. A comparison in which *both* months saturate is
 * withheld entirely, because the difference of two lower bounds constrains
 * neither the sign nor the size of the true change.
 */
export function describeAerosolLoadingChange(
  earlierObservation: AerosolObservation,
  laterObservation: AerosolObservation,
  availableThrough: YearMonth,
  options: AerosolLoadingChangeOptions = {}
): AerosolLoadingChange {
  const earlier = summarizeAerosolLoading(earlierObservation, availableThrough);
  const later = summarizeAerosolLoading(laterObservation, availableThrough);
  const threshold = options.threshold ?? AEROSOL_LOADING_CHANGE_THRESHOLD;
  const validThreshold = Number.isFinite(threshold) && threshold >= 0;

  const base = {
    kind: "month-over-month-aerosol-loading-change" as const,
    isForecast: false as const,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    earlier,
    later,
    changeValue: null,
    trend: null,
    changeBound: null,
    threshold: validThreshold ? threshold : AEROSOL_LOADING_CHANGE_THRESHOLD,
    limitations: AEROSOL_LOADING_LIMITATIONS,
  };

  if (!validThreshold) {
    return { ...base, status: "unavailable", reason: "invalid-threshold" };
  }
  if (
    !isYearMonth(earlier.dataMonth) ||
    !isYearMonth(later.dataMonth) ||
    monthDistance(earlier.dataMonth, later.dataMonth) !== 1
  ) {
    return {
      ...base,
      status: "non-adjacent-months",
      reason: "months-not-consecutive",
    };
  }

  const earlierValue = usableEndpointValue(earlier);
  const laterValue = usableEndpointValue(later);
  if (earlierValue === null || laterValue === null) {
    return { ...base, status: "unavailable", reason: "endpoint-not-available" };
  }

  const earlierCensored = earlier.censoring?.isLowerBound === true;
  const laterCensored = later.censoring?.isLowerBound === true;

  // Both months sat in the ramp's open-ended top bin, so both values are lower
  // bounds and their difference carries no information: two readings of 0.9
  // could truly be 0.9 and 3.0, in either order. Reporting the arithmetic
  // difference here would assert stability the imagery cannot support, so the
  // change is withheld rather than qualified.
  if (earlierCensored && laterCensored) {
    return {
      ...base,
      status: "unavailable",
      changeBound: "indeterminate",
      reason: "both-endpoints-censored",
    };
  }

  const change = laterValue - earlierValue;
  const computedTrend: AerosolLoadingTrend =
    Math.abs(change) < threshold
      ? "little-change"
      : change > 0
        ? "increasing"
        : "decreasing";

  // One censored endpoint bounds the true change on a single side, so the
  // computed difference stays reportable as that bound. The *direction*,
  // though, only survives when the difference already clears the threshold in
  // the direction the bound can still travel: with the later month censored the
  // true change lies in [change, +INF), so a computed "little-change" of +0.01
  // is equally consistent with a true jump of +2, and naming a trend there
  // would assert stability the imagery cannot support.
  const changeBound: AerosolChangeBound = laterCensored
    ? "bounded-below"
    : earlierCensored
      ? "bounded-above"
      : "exact";
  const directionSurvives =
    changeBound === "exact" ||
    (changeBound === "bounded-below" && computedTrend === "increasing") ||
    (changeBound === "bounded-above" && computedTrend === "decreasing");

  return {
    ...base,
    status: "available",
    changeValue: change,
    trend: directionSurvives ? computedTrend : null,
    changeBound,
    reason: directionSurvives ? null : "censored-endpoint-direction-unresolved",
  };
}

function coverageFor(
  observation: AerosolObservation,
  validMonths: boolean
): AerosolCoverage {
  if (!validMonths) {
    return { status: "invalid", validFraction: null, reason: "invalid-month" };
  }
  const fraction = observation.validFraction;
  if (
    fraction !== undefined &&
    (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
  ) {
    return {
      status: "invalid",
      validFraction: null,
      reason: "invalid-coverage",
    };
  }
  if (observation.value === null || fraction === 0) {
    return {
      status: "no-data",
      validFraction: fraction ?? null,
      reason: observation.value === null ? "missing-value" : "zero-coverage",
    };
  }
  if (!Number.isFinite(observation.value) || observation.value < 0) {
    return {
      status: "invalid",
      validFraction: fraction ?? null,
      reason: "invalid-value",
    };
  }
  return { status: "available", validFraction: fraction ?? null, reason: null };
}

function validImageDimensions(
  dimensions: AerosolObservation["sourceImageDimensions"]
): dimensions is { width: number; height: number } {
  return (
    dimensions !== undefined &&
    Number.isInteger(dimensions.width) &&
    Number.isInteger(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
  );
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

function monthDistance(earlier: YearMonth, later: YearMonth): number {
  return (later.year - earlier.year) * 12 + later.month - earlier.month;
}
