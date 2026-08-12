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
  | "published"
  | "not-distributed"
  | "not-yet-published"
  | "invalid-reference-month";

/**
 * Months inside MOD10CM's own record that the imagery service does not serve.
 *
 * GIBS advertises the snow layer's time dimension as *seven* disjoint ranges
 * rather than one span (WMTS GetCapabilities, verified 2026-08-11):
 * 2000-03/2000-07, 2000-09/2001-05, 2001-07/2002-02, 2002-04/2003-11,
 * 2004-01/2016-01, 2016-03/2022-09, 2022-11/2026-07, each P1M. The six months
 * that fall between those ranges are listed here; each was confirmed to answer
 * HTTP 404 at the tile endpoint while its neighbours serve normally.
 *
 * This is a *distribution* fact about the imagery this app reads, not a claim
 * that NSIDC never produced the granule — the app samples rendered GIBS tiles,
 * so a month GIBS does not serve is unavailable here whatever the archive
 * holds. Recorded as catalog data rather than derived, because an absent month
 * is not an observation: without it, a null for February 2016 is summarized as
 * a published month with no usable coverage, which a reader would credit to
 * cloud, polar darkness, or the quality screen — an implied statement about a
 * snowpack nobody imaged. Four of the six (2001-06, 2002-03, 2003-12, 2016-02)
 * fall inside a hemispheric snow season, so they also silently shorten any
 * season or same-month baseline built from the surrounding months.
 */
export const SNOW_COVER_UNDISTRIBUTED_MONTHS: readonly YearMonth[] = [
  { year: 2000, month: 8 },
  { year: 2001, month: 6 },
  { year: 2002, month: 3 },
  { year: 2003, month: 12 },
  { year: 2016, month: 2 },
  { year: 2022, month: 10 },
];

/**
 * True when the imagery service serves MOD10CM for this month. Months outside
 * the recorded gaps are treated as distributed: this catalog asserts only the
 * absences GIBS advertises, and never guesses at one.
 */
export function isSnowCoverMonthDistributed(month: YearMonth): boolean {
  return !SNOW_COVER_UNDISTRIBUTED_MONTHS.some(
    (gap) => gap.year === month.year && gap.month === month.month
  );
}

export const SNOW_COVER_LIMITATIONS = [
  "Values are the monthly-average fraction of area flagged as snow, not snow depth or snow-water-equivalent.",
  "Extent classes are reporting bins over a continuous percentage; their boundaries are conventions, not physical thresholds.",
  "Monthly averaging and cloud or polar-darkness gaps can depress the covered-area value below the true extent.",
  "Six months inside the record are not distributed by the imagery service; they are reported as not distributed, never as an observed absence of snow.",
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
  /**
   * Calendar-month difference, or null when the data month was never published
   * — a month the service does not distribute has no publication lag to state.
   */
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
 *
 * Reaching `availableThrough` is necessary but not sufficient: a month the
 * service does not distribute at all (see SNOW_COVER_UNDISTRIBUTED_MONTHS) is
 * reported as `not-distributed` rather than as a published month that happened
 * to carry no usable value, so an absent month is never read as an observed
 * absence of snow.
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
        : isSnowCoverMonthDistributed(dataMonth)
          ? "published"
          : "not-distributed";
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
    publicationLagMonths: publicationStatus === "published" ? lag : null,
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
