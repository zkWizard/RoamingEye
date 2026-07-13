import { LAYERS, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Source-aware descriptions of monthly-average snow-cover extent (cryosphere).
 *
 * The snow layer renders MOD10CM: the per-cell monthly-average share of the
 * MODIS/Terra footprint flagged as snow, expressed as a percentage (0-100).
 * That percentage is a *fractional-area* descriptor, not a depth or mass
 * measurement. These helpers classify supplied extent into transparent
 * categorical bins and describe month-over-month change in covered area. They
 * never estimate snow depth, snow-water-equivalent, melt or accumulation rate,
 * runoff, cause, or any future value.
 *
 * Pure, render-free logic (see snowCover.test.ts). The cited product is
 * resolved once from the timeline catalog so a publication can cite the
 * dataset, not the picture (NASA data-use guidance).
 */

/** MOD10CM ships on a 0.05° climate-modeling grid — roughly 5 km per cell. */
export const SNOW_COVER_SOURCE_RESOLUTION = "0.05° (~5 km) CMG";

/** Cited MOD10CM product backing every snow-cover description. */
export const SNOW_COVER_DATASET: DatasetRef = requireSnowDataset();

function requireSnowDataset(): DatasetRef {
  const dataset = LAYERS.snow.dataset;
  if (!dataset) {
    throw new Error("RoamingEye: snow layer must retain a cited dataset");
  }
  return dataset;
}

/**
 * Categorical extent bins over the continuous 0-100% snow-covered-area value.
 * The boundaries are reporting conventions, not physical thresholds, and are
 * kept explicit so a reader can see exactly where each label begins.
 */
export type SnowCoverExtentClass =
  "snow-free" | "patchy" | "broken" | "extensive" | "complete";

export interface SnowCoverExtentBin {
  id: SnowCoverExtentClass;
  label: string;
  /** Inclusive lower bound, in percent of monthly-average covered area. */
  minPercent: number;
}

/** Ordered high-to-low so the first satisfied bound wins. */
export const SNOW_COVER_EXTENT_BINS: readonly SnowCoverExtentBin[] = [
  { id: "complete", label: "Complete snow cover", minPercent: 90 },
  { id: "extensive", label: "Extensive snow cover", minPercent: 50 },
  { id: "broken", label: "Broken snow cover", minPercent: 25 },
  { id: "patchy", label: "Patchy snow cover", minPercent: 5 },
  { id: "snow-free", label: "Effectively snow-free", minPercent: 0 },
];

/**
 * Map a monthly-average snow-covered-area percentage to its extent bin, or
 * null when the value is outside the physical 0-100% range or non-finite.
 */
export function classifySnowCoverExtent(
  percent: number
): SnowCoverExtentBin | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return null;
  }
  for (const bin of SNOW_COVER_EXTENT_BINS) {
    if (percent >= bin.minPercent) {
      return bin;
    }
  }
  return null;
}

export interface SnowCoverObservation {
  /** Month represented by the supplied source observation. */
  dataMonth: YearMonth;
  /** Monthly-average snow-covered-area percentage (0-100); null is no data. */
  snowCoveredPercent: number | null;
  /** Usable share of the sampled area (0-1), when the sampler provides it. */
  validFraction?: number;
}

export type SnowCoverStatus = "available" | "no-data" | "invalid";

export interface SnowCoverCoverage {
  status: SnowCoverStatus;
  /** Null means the sampler did not provide spatial coverage. */
  validFraction: number | null;
  /** Why a value cannot be described as a usable monthly observation. */
  reason: string | null;
}

export type SnowCoverPublicationStatus =
  "published" | "not-yet-published" | "invalid-reference-month";

export const SNOW_COVER_LIMITATIONS = [
  "Values are the monthly-average fraction of area flagged as snow, not snow depth or snow-water-equivalent.",
  "Extent classes are reporting bins over a continuous percentage; their boundaries are conventions, not physical thresholds.",
  "Monthly averaging and cloud or polar-darkness gaps can depress the covered-area value below the true extent.",
  "This description does not infer melt, accumulation, runoff, water volume, cause, or any future value.",
] as const;

export interface SnowCoverSummary {
  kind: "observed-monthly-snow-cover";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  dataset: DatasetRef;
  sourceResolution: string;
  dataMonth: YearMonth;
  /** Month through which the caller had confirmed source availability. */
  availableThrough: YearMonth;
  publicationStatus: SnowCoverPublicationStatus;
  /** Calendar-month difference, or null when data month is not yet published. */
  publicationLagMonths: number | null;
  coverage: SnowCoverCoverage;
  /** Retained 0-100 percentage, or null when not usable. */
  snowCoveredPercent: number | null;
  /** Categorical extent bin, or null when no usable value. */
  extentClass: SnowCoverExtentClass | null;
  extentLabel: string | null;
  limitations: readonly string[];
}

/**
 * Describe a single supplied monthly snow-cover value: its publication lag at
 * month precision, its usable coverage, and its categorical extent bin.
 * `availableThrough` is an availability checkpoint, not a promise that a future
 * monthly value will be published. The value and extent are surfaced only for a
 * published month with usable coverage, so an unpublished future month is never
 * dressed up as an observation.
 */
export function summarizeSnowCover(
  observation: SnowCoverObservation,
  availableThrough: YearMonth
): SnowCoverSummary {
  const dataMonth = observation.dataMonth;
  const validMonths =
    isCalendarMonth(dataMonth) && isCalendarMonth(availableThrough);
  const lag = validMonths ? monthDistance(dataMonth, availableThrough) : null;
  const publicationStatus: SnowCoverPublicationStatus =
    lag === null
      ? "invalid-reference-month"
      : lag < 0
        ? "not-yet-published"
        : "published";
  const coverage = coverageFor(observation, validMonths);
  const usablePercent =
    publicationStatus === "published" && coverage.status === "available"
      ? observation.snowCoveredPercent
      : null;
  const extent =
    usablePercent === null ? null : classifySnowCoverExtent(usablePercent);

  return {
    kind: "observed-monthly-snow-cover",
    isForecast: false,
    dataset: SNOW_COVER_DATASET,
    sourceResolution: SNOW_COVER_SOURCE_RESOLUTION,
    dataMonth,
    availableThrough,
    publicationStatus,
    publicationLagMonths: lag === null || lag < 0 ? null : lag,
    coverage,
    snowCoveredPercent: usablePercent,
    extentClass: extent?.id ?? null,
    extentLabel: extent?.label ?? null,
    limitations: SNOW_COVER_LIMITATIONS,
  };
}

function coverageFor(
  observation: SnowCoverObservation,
  validMonths: boolean
): SnowCoverCoverage {
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
  const value = observation.snowCoveredPercent;
  if (value === null || fraction === 0) {
    return {
      status: "no-data",
      validFraction: fraction ?? null,
      reason: value === null ? "missing-value" : "zero-coverage",
    };
  }
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return {
      status: "invalid",
      validFraction: fraction ?? null,
      reason: "invalid-value",
    };
  }
  return { status: "available", validFraction: fraction ?? null, reason: null };
}

/** Direction of change in monthly-average snow-covered area between months. */
export type SnowSeasonTrend = "advancing" | "retreating" | "little-change";

export type SnowSeasonChangeStatus =
  "available" | "non-adjacent-months" | "unavailable";

/**
 * Change of the covered-area value (percentage points) below which the season
 * is reported as `little-change` rather than advancing or retreating. Chosen to
 * match the `snow-free` floor so sub-bin wobble is not over-read.
 */
export const SNOW_SEASON_CHANGE_THRESHOLD_PP = 5;

export interface SnowSeasonChange {
  kind: "month-over-month-snow-cover-change";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: SnowSeasonChangeStatus;
  dataset: DatasetRef;
  earlier: SnowCoverSummary;
  later: SnowCoverSummary;
  /** Later minus earlier, in percentage points; null when not computable. */
  changePercentPoints: number | null;
  trend: SnowSeasonTrend | null;
  thresholdPercentPoints: number;
  /** Short machine-readable reason when no trend is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface SnowSeasonChangeOptions {
  /** Percentage-point band treated as `little-change` (defaults to floor). */
  thresholdPercentPoints?: number;
}

/**
 * Describe the change in monthly-average snow-covered area between two
 * consecutive months of the same MOD10CM product. Both months must be
 * published with usable coverage, and `later` must fall exactly one calendar
 * month after `earlier` — the helper never spans a gap or fills a missing
 * month. The result describes a change in covered area only; it implies nothing
 * about depth, melt or accumulation rate, water volume, cause, or the future.
 */
export function describeSnowSeasonChange(
  earlierObservation: SnowCoverObservation,
  laterObservation: SnowCoverObservation,
  availableThrough: YearMonth,
  options: SnowSeasonChangeOptions = {}
): SnowSeasonChange {
  const earlier = summarizeSnowCover(earlierObservation, availableThrough);
  const later = summarizeSnowCover(laterObservation, availableThrough);
  const threshold =
    options.thresholdPercentPoints ?? SNOW_SEASON_CHANGE_THRESHOLD_PP;
  const validThreshold = Number.isFinite(threshold) && threshold >= 0;

  const base = {
    kind: "month-over-month-snow-cover-change" as const,
    isForecast: false as const,
    dataset: SNOW_COVER_DATASET,
    earlier,
    later,
    changePercentPoints: null,
    trend: null,
    thresholdPercentPoints: validThreshold
      ? threshold
      : SNOW_SEASON_CHANGE_THRESHOLD_PP,
    limitations: SNOW_COVER_LIMITATIONS,
  };

  if (!validThreshold) {
    return { ...base, status: "unavailable", reason: "invalid-threshold" };
  }
  if (
    !isCalendarMonth(earlier.dataMonth) ||
    !isCalendarMonth(later.dataMonth) ||
    monthDistance(earlier.dataMonth, later.dataMonth) !== 1
  ) {
    return {
      ...base,
      status: "non-adjacent-months",
      reason: "months-not-consecutive",
    };
  }
  if (
    earlier.snowCoveredPercent === null ||
    later.snowCoveredPercent === null
  ) {
    return { ...base, status: "unavailable", reason: "endpoint-not-available" };
  }

  const change = later.snowCoveredPercent - earlier.snowCoveredPercent;
  const trend: SnowSeasonTrend =
    Math.abs(change) < threshold
      ? "little-change"
      : change > 0
        ? "advancing"
        : "retreating";

  return {
    ...base,
    status: "available",
    changePercentPoints: change,
    trend,
    reason: null,
  };
}

function isCalendarMonth(month: YearMonth): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function monthDistance(earlier: YearMonth, later: YearMonth): number {
  return (later.year - earlier.year) * 12 + later.month - earlier.month;
}
