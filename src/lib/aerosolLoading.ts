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
 * Honest scope limits shared by the aerosol descriptors. Kept in code because
 * callers surface them alongside any AOD value or change they present.
 */
export const AEROSOL_LOADING_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index.",
  "MERRA-2 is a reanalysis (a model constrained by assimilated observations), so a value is a modelled monthly mean, not a direct pixel measurement.",
  "Loading tiers and the change band are descriptive reading conventions, not standardized thresholds, and carry no health, safety, or compliance meaning.",
  "A month-over-month change describes only the difference between two modelled monthly means; it implies nothing about cause, surface air quality, or any future value.",
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
   */
  tierProximity: AerosolBandProximity | null;
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

  const change = laterValue - earlierValue;
  const trend: AerosolLoadingTrend =
    Math.abs(change) < threshold
      ? "little-change"
      : change > 0
        ? "increasing"
        : "decreasing";

  return {
    ...base,
    status: "available",
    changeValue: change,
    trend,
    reason: null,
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
