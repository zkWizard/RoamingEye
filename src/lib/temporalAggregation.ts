import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first within-month temporal-aggregation descriptor for a
 * multi-signal environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature
 * as monthly observations and reports whether their data months line up (see
 * `summarizeTemporalAlignment`). But two signals sharing a data month can still
 * summarize that month in incompatible ways, because the cited products reduce
 * the sub-monthly record to one monthly value differently:
 *
 *  - NDVI (MOD13A3) is a within-month *composite*: the monthly value is a
 *    best-value pixel selected from the observations in the compositing window,
 *    so it reports a single favourable within-month state (e.g. peak greenness),
 *    not an average over the month.
 *  - Rainfall and soil moisture (GLDAS_NOAH025_M) and air temperature
 *    (M2TMNXSLV, MERRA-2) are monthly *time-averages*: the value is the mean of
 *    the model/reanalysis sub-monthly states across the whole month.
 *
 * A composite value and a time-average value dated the same month are therefore
 * not temporally commensurate — one is a selected within-month state, the other
 * a whole-month mean. This helper classifies each signal's within-month
 * aggregation so that "the same month" is never read as "the same reduction of
 * the month". It reports provenance structure only; it never combines the
 * values, weights them, or infers any condition, risk, causation, or forecast —
 * the shared method limits of the brief still hold. Aggregation is a companion
 * to temporal alignment (which month?), observation modality (measured or
 * modelled?), and source independence (which product?): a distinct axis
 * describing HOW each monthly value reduces its month.
 */

export type TemporalAggregation =
  /** Best-value composite selected from within the month (e.g. MODIS NDVI). */
  | "within-month-composite"
  /** Arithmetic time-average of the month's sub-monthly states (e.g. GLDAS). */
  | "monthly-time-average"
  /** Product absent from the aggregation table; never guessed. */
  | "unclassified";

interface AggregationInfo {
  /** Short human phrase for a statement, e.g. "monthly time-average". */
  description: string;
  /**
   * True when the value is the mean over the whole month. False for a composite
   * (a selected within-month state) and for `unclassified` (never asserted).
   */
  wholeMonthMean: boolean;
}

const AGGREGATION_INFO: Record<TemporalAggregation, AggregationInfo> = {
  "within-month-composite": {
    description: "within-month composite",
    wholeMonthMean: false,
  },
  "monthly-time-average": {
    description: "monthly time-average",
    wholeMonthMean: true,
  },
  unclassified: {
    description: "unclassified aggregation",
    wholeMonthMean: false,
  },
};

/**
 * Within-month aggregation keyed by the cited product's short name. The DOI and
 * short name uniquely name a published product; how it reduces a month to one
 * value is a fixed property of that product, so this table is the single place
 * the aggregation of each brief product is asserted. A product not listed here
 * resolves to `unclassified` — its aggregation is never inferred from a value.
 */
const PRODUCT_AGGREGATION: Record<string, TemporalAggregation> = {
  // MODIS/Terra Vegetation Indices Monthly: a constrained-view maximum-value
  // composite selects the best pixel within the compositing window.
  MOD13A3: "within-month-composite",
  // GLDAS Noah Land Surface Model L4 monthly: temporal mean of the 3-hourly
  // model fields (precipitation rate, soil moisture).
  GLDAS_NOAH025_M: "monthly-time-average",
  // MERRA-2 monthly single-level diagnostics (tavgM): time-averaged 2 m air
  // temperature over the month.
  M2TMNXSLV: "monthly-time-average",
};

/** One signal classified by how its cited product reduces a month to a value. */
export interface SignalAggregation {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  aggregation: TemporalAggregation;
  /**
   * True when the monthly value is the mean over the whole month. False for a
   * within-month composite (a selected state) and for `unclassified` (whose
   * aggregation is not asserted).
   */
  wholeMonthMean: boolean;
  /** Honest, source-carrying sentence; no fitness, condition, or value claim. */
  statement: string;
}

export interface TemporalAggregationSummary {
  kind: "temporal-aggregation";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal aggregation classifications, in signal order. */
  signals: SignalAggregation[];
  /** Count of considered signals in each aggregation (zeros included). */
  aggregationCounts: Record<TemporalAggregation, number>;
  /** Considered signals whose product is not in the aggregation table. */
  unclassifiedCount: number;
  /** True when every considered signal shares one aggregation (incl. unclassified). */
  homogeneous: boolean;
  /**
   * True when every *classified* considered signal shares one within-month
   * aggregation, so their monthly values reduce the month the same way and are
   * temporally commensurate. False when a composite and a time-average are
   * mixed. Unclassified products are excluded from this assertion; a lone
   * classified signal is trivially commensurate with itself.
   */
  temporallyCommensurable: boolean;
  /** Honest one-line aggregation statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface TemporalAggregationOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because aggregation matters for the evidence
   * a reader would actually combine; "all" describes the whole brief's
   * aggregation basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const AGGREGATION_LIMITS = [
  "Within-month aggregation is a fixed property of the cited source product, not of any individual value.",
  "A within-month composite reports a selected within-month state, not the mean over the month; a monthly time-average reports the whole-month mean.",
  "Composite and time-average values dated the same month are not temporally commensurate and should not be read as the same reduction of the month.",
  "A product absent from the aggregation table is reported as unclassified, never inferred from its value.",
];

/**
 * Look up a product's within-month aggregation by its short name, returning
 * "unclassified" for any product not in the table so an aggregation is never
 * silently invented for an unknown source.
 */
export function classifyTemporalAggregation(
  source: DatasetRef
): TemporalAggregation {
  return PRODUCT_AGGREGATION[source.shortName] ?? "unclassified";
}

/**
 * Classify each brief signal by how its cited product reduces a month to one
 * value, and report whether the considered signals reduce the month the same
 * way. A within-month composite (NDVI) and a monthly time-average (GLDAS,
 * MERRA-2) dated the same month are not temporally commensurate, and this makes
 * that explicit without touching the values themselves.
 */
export function summarizeTemporalAggregation(
  signals: readonly EnvironmentSignalBrief[],
  options?: TemporalAggregationOptions
): TemporalAggregationSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalAggregation[] = considered.map((signal) => {
    const aggregation = classifyTemporalAggregation(signal.source);
    const info = AGGREGATION_INFO[aggregation];
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      aggregation,
      wholeMonthMean: info.wholeMonthMean,
      statement: `${signal.label}: ${info.description} (${aggregation}); source ${sourceLabel(signal.source)}.`,
    };
  });

  const aggregationCounts = countAggregations(classified);
  const unclassifiedCount = aggregationCounts.unclassified;
  const distinctAggregations = AGGREGATIONS.filter(
    (aggregation) => aggregationCounts[aggregation] > 0
  ).length;
  const distinctClassified = CLASSIFIED_AGGREGATIONS.filter(
    (aggregation) => aggregationCounts[aggregation] > 0
  ).length;
  const classifiedCount = classified.length - unclassifiedCount;

  return {
    kind: "temporal-aggregation",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    aggregationCounts,
    unclassifiedCount,
    homogeneous: classified.length >= 1 && distinctAggregations === 1,
    temporallyCommensurable: classifiedCount >= 1 && distinctClassified === 1,
    statement: aggregationStatement(
      classified.length,
      aggregationCounts,
      classifiedCount,
      distinctClassified,
      unclassifiedCount
    ),
    limits: AGGREGATION_LIMITS,
  };
}

/** Fixed aggregation order for reporting, so no aggregation is silently dropped. */
const AGGREGATIONS: readonly TemporalAggregation[] = [
  "within-month-composite",
  "monthly-time-average",
  "unclassified",
];

/** The asserted (non-`unclassified`) aggregations, used for commensurability. */
const CLASSIFIED_AGGREGATIONS: readonly TemporalAggregation[] = [
  "within-month-composite",
  "monthly-time-average",
];

function countAggregations(
  signals: readonly SignalAggregation[]
): Record<TemporalAggregation, number> {
  const counts = Object.fromEntries(
    AGGREGATIONS.map((aggregation) => [aggregation, 0])
  ) as Record<TemporalAggregation, number>;
  for (const signal of signals) counts[signal.aggregation] += 1;
  return counts;
}

function aggregationStatement(
  consideredCount: number,
  aggregationCounts: Record<TemporalAggregation, number>,
  classifiedCount: number,
  distinctClassified: number,
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by within-month aggregation.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = aggregationBreakdown(aggregationCounts);

  let commensurabilityClause: string;
  if (classifiedCount === 0) {
    commensurabilityClause =
      "no considered signal is in the aggregation table, so their within-month aggregation is not asserted";
  } else if (distinctClassified >= 2) {
    commensurabilityClause =
      "classified signals mix within-month composites with monthly time-averages, so values dated the same month are not temporally commensurate — a composite is a selected within-month state, a time-average is a whole-month mean";
  } else if (aggregationCounts["within-month-composite"] > 0) {
    const verb = classifiedCount === 1 ? "is a" : "are";
    commensurabilityClause = `all ${classifiedCount} classified ${verb} within-month composite${plural(classifiedCount)}, a selected within-month state rather than a whole-month mean`;
  } else {
    const verb = classifiedCount === 1 ? "is a" : "are";
    commensurabilityClause = `all ${classifiedCount} classified ${verb} monthly time-average${plural(classifiedCount)} over the whole month`;
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified product${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${commensurabilityClause}.${unclassifiedClause}`;
}

/** Non-zero aggregation counts in fixed order, e.g. "1 within-month-composite, 3 monthly-time-average". */
function aggregationBreakdown(
  aggregationCounts: Record<TemporalAggregation, number>
): string {
  return AGGREGATIONS.filter(
    (aggregation) => aggregationCounts[aggregation] > 0
  )
    .map((aggregation) => `${aggregationCounts[aggregation]} ${aggregation}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
