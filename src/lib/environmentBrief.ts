import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateCoverage,
  type ClimateMetricId,
  type MonthlyClimateObservation,
  type MonthlyClimateSummary,
} from "./climate";
import { NDVI_SOURCE, NDVI_UNIT } from "./phenology";
import { GIBS_ACKNOWLEDGMENT } from "./providers";
import {
  compareYm,
  type DatasetRef,
  type LayerId,
  type YearMonth,
} from "./timeline";

/**
 * Provenance-first environmental condition briefs.
 *
 * This module composes independent monthly vegetation, rainfall,
 * soil-moisture, and air-temperature observations. It preserves source,
 * native unit, data month, coverage, and unavailable states for each signal.
 * It deliberately does not combine signals into a score or make risk,
 * diagnosis, forecast, compliance, health, or causal claims.
 */

export type EnvironmentSignalId =
  "vegetation" | "rainfall" | "soil-moisture" | "air-temperature";

export type EnvironmentSignalStatus =
  "available" | "no-data" | "invalid" | "unavailable";

export interface EnvironmentObservation {
  /** Month represented by the supplied source observation. */
  dataMonth: YearMonth;
  /** Value in the signal's native unit; null means no usable source value. */
  value: number | null;
  /** Usable share of the sampled area, when spatial sampling provides it. */
  validFraction?: number;
}

export interface EnvironmentBriefInput {
  vegetation: EnvironmentObservation | null;
  rainfall: EnvironmentObservation | null;
  soilMoisture: EnvironmentObservation | null;
  airTemperature: EnvironmentObservation | null;
  /** Availability checkpoint for lagged monthly climate products. */
  availableThrough: YearMonth;
  /**
   * Optional product-specific availability checkpoints. Use this when cited
   * climate products publish on different monthly schedules; omitted entries
   * retain the shared `availableThrough` fallback.
   */
  availableThroughBySignal?: Partial<
    Record<Exclude<EnvironmentSignalId, "vegetation">, YearMonth>
  >;
}

export interface EnvironmentSignalCoverage {
  status: EnvironmentSignalStatus;
  /** Null means the sampler did not provide spatial coverage. */
  validFraction: number | null;
  reason: string | null;
}

export interface EnvironmentSignalBrief {
  id: EnvironmentSignalId;
  label: string;
  layerId: LayerId;
  source: DatasetRef;
  nativeUnit: string;
  dataMonth: YearMonth | null;
  coverage: EnvironmentSignalCoverage;
  status: EnvironmentSignalStatus;
  observedValue: number | null;
  statement: string;
  climateSummary?: MonthlyClimateSummary;
}

/**
 * Cross-signal temporal spread of the *usable* observations only.
 *
 * The four signals are independent products on different composite calendars
 * and publication lags, so an "available" vegetation month can differ from an
 * "available" air-temperature month. This summary makes that spread explicit
 * so usable observations are never silently read as a synchronized snapshot.
 * It is a provenance descriptor over data months — never a condition,
 * comparison, trend, or change claim about the values themselves.
 */
export interface EnvironmentTemporalAlignment {
  /** Available signals whose data months were compared, in signal order. */
  comparedSignalIds: EnvironmentSignalId[];
  /** Oldest data month among available signals; null when none are usable. */
  earliestMonth: YearMonth | null;
  /** Newest data month among available signals; null when none are usable. */
  latestMonth: YearMonth | null;
  /**
   * Whole-month distance between earliest and latest usable data month.
   * 0 when a single month covers every usable signal; null when none usable.
   */
  spanMonths: number | null;
  /** True only when 2+ usable signals share one data month. */
  aligned: boolean;
  /** Honest caveat sentence; carries no value comparison or condition claim. */
  statement: string;
}

export interface EnvironmentBriefCompleteness {
  /** Number of signals the brief attempted to compose. */
  total: number;
  /** Signals carrying a usable observed value (status "available"). */
  available: number;
  /** Count of signals in each status, so no state is silently dropped. */
  byStatus: Record<EnvironmentSignalStatus, number>;
  /** Ids of the signals with usable observations, in signal order. */
  availableSignalIds: EnvironmentSignalId[];
  /** available / total in [0, 1]; a data-coverage share, not a condition score. */
  usableFraction: number;
  /** Honest one-line data-completeness statement (no condition inference). */
  statement: string;
}

export interface EnvironmentBrief {
  kind: "provenance-first-environment-brief";
  signals: EnvironmentSignalBrief[];
  statements: string[];
  completeness: EnvironmentBriefCompleteness;
  unsupportedLanguageHits: string[];
  methodLimits: string[];
  temporalAlignment: EnvironmentTemporalAlignment;
}

interface SignalMeta {
  id: EnvironmentSignalId;
  label: string;
  layerId: LayerId;
  source: DatasetRef;
  nativeUnit: string;
}

const VEGETATION_META: SignalMeta = {
  id: "vegetation",
  label: "Vegetation (NDVI)",
  layerId: "ndvi",
  source: NDVI_SOURCE,
  nativeUnit: NDVI_UNIT,
};

const CLIMATE_SIGNAL_META: Record<
  Exclude<EnvironmentSignalId, "vegetation">,
  SignalMeta & { metricId: ClimateMetricId }
> = {
  rainfall: {
    id: "rainfall",
    label: "Rainfall (precipitation rate)",
    layerId: "precip",
    source: CLIMATE_METRICS["precipitation-rate"].source,
    nativeUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
    metricId: "precipitation-rate",
  },
  "soil-moisture": {
    id: "soil-moisture",
    label: "Soil moisture",
    layerId: "soil",
    source: CLIMATE_METRICS["soil-moisture"].source,
    nativeUnit: CLIMATE_METRICS["soil-moisture"].nativeUnit,
    metricId: "soil-moisture",
  },
  "air-temperature": {
    id: "air-temperature",
    label: "Air temperature",
    layerId: "airtemp",
    source: CLIMATE_METRICS["air-temperature-2m"].source,
    nativeUnit: CLIMATE_METRICS["air-temperature-2m"].nativeUnit,
    metricId: "air-temperature-2m",
  },
};

const METHOD_LIMITS = [
  "Signals are independent monthly source observations and are not combined.",
  "Values remain in native source units with supplied spatial coverage only.",
  "Missing coverage, no-data, invalid, and unpublished states remain explicit.",
];

const UNSUPPORTED_CLAIM_PATTERNS: readonly {
  label: string;
  pattern: RegExp;
}[] = [
  { label: "risk", pattern: /\brisk(s)?\b/i },
  { label: "hazard", pattern: /\bhazard(s|ous)?\b/i },
  { label: "diagnosis", pattern: /\bdiagnos(e|es|ed|is|tic)\b/i },
  { label: "forecast", pattern: /\bforecast(s|ed|ing)?\b/i },
  { label: "prediction", pattern: /\bpredict(s|ed|ion|ive)?\b/i },
  { label: "compliance", pattern: /\bcompliance\b/i },
  { label: "health", pattern: /\bhealth(y)?\b/i },
  { label: "causal", pattern: /\b(cause|causes|caused|causal|because)\b/i },
  { label: "attribution", pattern: /\bdue to\b/i },
  { label: "safety", pattern: /\b(safe|unsafe|danger)\b/i },
];

export function composeEnvironmentBrief(
  input: EnvironmentBriefInput
): EnvironmentBrief {
  const signals = [
    vegetationSignal(input.vegetation),
    climateSignal(
      CLIMATE_SIGNAL_META.rainfall,
      input.rainfall,
      availableThroughFor(input, "rainfall")
    ),
    climateSignal(
      CLIMATE_SIGNAL_META["soil-moisture"],
      input.soilMoisture,
      availableThroughFor(input, "soil-moisture")
    ),
    climateSignal(
      CLIMATE_SIGNAL_META["air-temperature"],
      input.airTemperature,
      availableThroughFor(input, "air-temperature")
    ),
  ];
  const statements = signals.map((signal) => signal.statement);

  return {
    kind: "provenance-first-environment-brief",
    signals,
    statements,
    completeness: summarizeCompleteness(signals),
    unsupportedLanguageHits: unsupportedBriefLanguageHits(statements.join(" ")),
    methodLimits: METHOD_LIMITS,
    temporalAlignment: summarizeTemporalAlignment(signals),
  };
}

/**
 * Report the temporal spread of the usable (`available`) observations so a
 * multi-month set is never read as one synchronized moment. Only signals that
 * carry an observed value are compared — no-data, invalid, and unpublished
 * signals contribute no month to align. This is a data-currency descriptor,
 * not a claim that the values themselves rose, fell, or agree.
 */
export function summarizeTemporalAlignment(
  signals: EnvironmentSignalBrief[]
): EnvironmentTemporalAlignment {
  const usable = signals.filter(
    (signal): signal is EnvironmentSignalBrief & { dataMonth: YearMonth } =>
      signal.status === "available" && signal.dataMonth !== null
  );

  if (usable.length === 0) {
    return {
      comparedSignalIds: [],
      earliestMonth: null,
      latestMonth: null,
      spanMonths: null,
      aligned: false,
      statement: "No usable observations to compare across time.",
    };
  }

  let earliest = usable[0].dataMonth;
  let latest = usable[0].dataMonth;
  for (const signal of usable) {
    if (compareYm(signal.dataMonth, earliest) < 0) earliest = signal.dataMonth;
    if (compareYm(signal.dataMonth, latest) > 0) latest = signal.dataMonth;
  }
  const spanMonths = compareYm(latest, earliest);
  const comparedSignalIds = usable.map((signal) => signal.id);

  return {
    comparedSignalIds,
    earliestMonth: earliest,
    latestMonth: latest,
    spanMonths,
    // A lone usable signal has nothing to align with, so alignment requires
    // 2+ usable signals resolving to one shared data month.
    aligned: usable.length >= 2 && spanMonths === 0,
    statement: temporalAlignmentStatement(
      comparedSignalIds.length,
      earliest,
      latest,
      spanMonths
    ),
  };
}

function temporalAlignmentStatement(
  count: number,
  earliest: YearMonth,
  latest: YearMonth,
  spanMonths: number
): string {
  const noun = count === 1 ? "observation" : "observations";
  if (count === 1) {
    return `1 usable ${noun}, dated ${formatYearMonth(earliest)}; no cross-signal temporal comparison.`;
  }
  if (spanMonths === 0) {
    return `${count} usable ${noun} all dated ${formatYearMonth(earliest)}; temporally aligned.`;
  }
  const monthWord = spanMonths === 1 ? "month" : "months";
  return `${count} usable ${noun} span ${formatYearMonth(earliest)} to ${formatYearMonth(latest)} (${spanMonths}-${monthWord} spread); signals are not a synchronized snapshot and should not be read as simultaneous.`;
}

/** DOI resolver prefix, so every credited source carries a resolvable link. */
const DOI_RESOLVER = "https://doi.org/";

/** One credited source dataset, with the brief signals it backed. */
export interface SourceAttribution {
  /** The distinct source dataset (deduplicated by DOI). */
  source: DatasetRef;
  /** Ids of the signals this source backed, in signal order. */
  signalIds: EnvironmentSignalId[];
  /** Human labels for the backed signals, in signal order. */
  signalLabels: string[];
  /**
   * True when at least one backed signal carried a usable observation. A
   * source can still be credited with this false — the brief consulted it and
   * honestly reported its no-data / invalid / unpublished state.
   */
  contributedValue: boolean;
  /** Resolvable DOI link, or null when the source carries no DOI to resolve. */
  doiUrl: string | null;
}

/**
 * Brief-scoped source credit: exactly the datasets that fed one environment
 * brief, deduplicated by DOI, plus GIBS's requested acknowledgment and a
 * ready-to-paste one-line credit for a figure caption or observation export.
 */
export interface BriefAttribution {
  /** Distinct credited sources, deduplicated by DOI, in first-seen order. */
  sources: SourceAttribution[];
  /** GIBS's requested acknowledgment, verbatim. */
  acknowledgment: string;
  /** Human-readable one-line source credit for a caption or export. */
  line: string;
}

/**
 * Credit exactly the sources a brief drew on. Rainfall and soil moisture are
 * both GLDAS (one DOI), so a naive per-signal credit would list that product
 * twice and over-count it; this deduplicates by DOI and records every signal
 * each source backed. It credits every consulted source — including ones that
 * only returned a no-data or unpublished state — so the credit never implies a
 * usable value where there was none (see `contributedValue`). This is a
 * provenance descriptor, not a value, comparison, or condition claim.
 */
export function attributeBrief(
  signals: readonly EnvironmentSignalBrief[]
): BriefAttribution {
  const byDoi = new Map<string, SourceAttribution>();
  const order: string[] = [];
  for (const signal of signals) {
    const key = signal.source.doi;
    let entry = byDoi.get(key);
    if (!entry) {
      const doi = signal.source.doi.trim();
      entry = {
        source: signal.source,
        signalIds: [],
        signalLabels: [],
        contributedValue: false,
        doiUrl: doi ? `${DOI_RESOLVER}${doi}` : null,
      };
      byDoi.set(key, entry);
      order.push(key);
    }
    entry.signalIds.push(signal.id);
    entry.signalLabels.push(signal.label);
    if (signal.status === "available") entry.contributedValue = true;
  }

  const sources = order.map((key) => byDoi.get(key)!);
  return {
    sources,
    acknowledgment: GIBS_ACKNOWLEDGMENT,
    line: attributionLine(sources),
  };
}

function attributionLine(sources: readonly SourceAttribution[]): string {
  if (sources.length === 0) return "No data sources to credit.";
  const credits = sources
    .map((entry) => {
      const link = entry.doiUrl ? ` (${entry.doiUrl})` : "";
      return `${sourceLabel(entry.source)} — ${entry.signalLabels.join(", ")}${link}`;
    })
    .join("; ");
  return `Data sources: ${credits}. ${GIBS_ACKNOWLEDGMENT}`;
}

/** Fixed status order for reporting, so no state is silently dropped. */
const SIGNAL_STATUSES: readonly EnvironmentSignalStatus[] = [
  "available",
  "no-data",
  "invalid",
  "unavailable",
];

/**
 * Honest data-completeness tally across the composed signals. This counts how
 * many signals carry a usable observation; it deliberately does not combine the
 * values, weight the signals, or infer any condition, risk, or forecast.
 */
export function summarizeCompleteness(
  signals: readonly EnvironmentSignalBrief[]
): EnvironmentBriefCompleteness {
  const byStatus = Object.fromEntries(
    SIGNAL_STATUSES.map((status) => [status, 0])
  ) as Record<EnvironmentSignalStatus, number>;
  const availableSignalIds: EnvironmentSignalId[] = [];
  for (const signal of signals) {
    byStatus[signal.status] += 1;
    if (signal.status === "available") availableSignalIds.push(signal.id);
  }

  const total = signals.length;
  const available = byStatus.available;
  const usableFraction = total === 0 ? 0 : available / total;

  return {
    total,
    available,
    byStatus,
    availableSignalIds,
    usableFraction,
    statement: completenessStatement({
      total,
      available,
      byStatus,
      availableSignalIds,
    }),
  };
}

function completenessStatement(summary: {
  total: number;
  available: number;
  byStatus: Record<EnvironmentSignalStatus, number>;
  availableSignalIds: EnvironmentSignalId[];
}): string {
  const others = SIGNAL_STATUSES.filter((status) => status !== "available")
    .filter((status) => summary.byStatus[status] > 0)
    .map((status) => `${summary.byStatus[status]} ${status}`)
    .join(", ");
  const remainder = others ? ` (${others})` : "";

  if (summary.total === 0) return "No signals composed.";
  if (summary.available === 0) {
    return `No usable observations across ${summary.total} signal${plural(summary.total)}${remainder}.`;
  }
  return `Usable observations for ${summary.available} of ${summary.total} signal${plural(summary.total)}: ${summary.availableSignalIds.join(", ")}${remainder}.`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function availableThroughFor(
  input: EnvironmentBriefInput,
  signal: Exclude<EnvironmentSignalId, "vegetation">
): YearMonth {
  return input.availableThroughBySignal?.[signal] ?? input.availableThrough;
}

export function unsupportedBriefLanguageHits(text: string): string[] {
  return UNSUPPORTED_CLAIM_PATTERNS.filter(({ pattern }) =>
    pattern.test(text)
  ).map(({ label }) => label);
}

function vegetationSignal(
  observation: EnvironmentObservation | null
): EnvironmentSignalBrief {
  if (!observation) return unavailableSignal(VEGETATION_META);

  const coverage = vegetationCoverage(observation);
  const status = coverage.status;
  const observedValue = status === "available" ? observation.value : null;

  return {
    ...VEGETATION_META,
    dataMonth: observation.dataMonth,
    coverage,
    status,
    observedValue,
    statement: statementFor({
      ...VEGETATION_META,
      dataMonth: observation.dataMonth,
      coverage,
      status,
      observedValue,
    }),
  };
}

function climateSignal(
  meta: SignalMeta & { metricId: ClimateMetricId },
  observation: EnvironmentObservation | null,
  availableThrough: YearMonth
): EnvironmentSignalBrief {
  if (!observation) return unavailableSignal(meta);

  const climateSummary = summarizeMonthlyClimate(
    {
      metricId: meta.metricId,
      dataMonth: observation.dataMonth,
      value: observation.value,
      validFraction: observation.validFraction,
    } satisfies MonthlyClimateObservation,
    availableThrough
  );
  const publicationUnavailable =
    climateSummary.publicationStatus !== "published";
  const coverage = signalCoverageFromClimate(climateSummary.coverage);
  const status = publicationUnavailable ? "unavailable" : coverage.status;
  const observedValue =
    status === "available" ? climateSummary.observedValue : null;
  const reason = publicationUnavailable
    ? climateSummary.publicationStatus
    : coverage.reason;
  const signalCoverage = { ...coverage, status, reason };

  return {
    id: meta.id,
    label: meta.label,
    layerId: meta.layerId,
    source: meta.source,
    nativeUnit: meta.nativeUnit,
    dataMonth: climateSummary.dataMonth,
    coverage: signalCoverage,
    status,
    observedValue,
    statement: statementFor({
      ...meta,
      dataMonth: climateSummary.dataMonth,
      coverage: signalCoverage,
      status,
      observedValue,
    }),
    climateSummary,
  };
}

function unavailableSignal(meta: SignalMeta): EnvironmentSignalBrief {
  const coverage: EnvironmentSignalCoverage = {
    status: "unavailable",
    validFraction: null,
    reason: "not-supplied",
  };
  return {
    ...meta,
    dataMonth: null,
    coverage,
    status: "unavailable",
    observedValue: null,
    statement: `${meta.label}: no supplied observation; data month unavailable; coverage not supplied; source ${sourceLabel(meta.source)}.`,
  };
}

function vegetationCoverage(
  observation: EnvironmentObservation
): EnvironmentSignalCoverage {
  if (!isYearMonth(observation.dataMonth)) {
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
  if (
    !Number.isFinite(observation.value) ||
    observation.value < -1 ||
    observation.value > 1
  ) {
    return {
      status: "invalid",
      validFraction: fraction ?? null,
      reason: "invalid-value",
    };
  }
  return { status: "available", validFraction: fraction ?? null, reason: null };
}

function signalCoverageFromClimate(
  coverage: ClimateCoverage
): EnvironmentSignalCoverage {
  return {
    status: coverage.status === "available" ? "available" : coverage.status,
    validFraction: coverage.validFraction,
    reason: coverage.reason,
  };
}

function statementFor(signal: {
  label: string;
  nativeUnit: string;
  source: DatasetRef;
  dataMonth: YearMonth | null;
  coverage: EnvironmentSignalCoverage;
  status: EnvironmentSignalStatus;
  observedValue: number | null;
}): string {
  const month = signal.dataMonth
    ? formatYearMonth(signal.dataMonth)
    : "data month unavailable";
  const coverage = coverageText(signal.coverage);
  const source = sourceLabel(signal.source);

  if (signal.status === "available") {
    return `${signal.label}: ${formatValue(signal.observedValue)} ${signal.nativeUnit} observed for ${month}; ${coverage}; source ${source}.`;
  }
  return `${signal.label}: ${signal.status} observation for ${month} (${signal.coverage.reason ?? "unspecified"}); ${coverage}; source ${source}.`;
}

function coverageText(coverage: EnvironmentSignalCoverage): string {
  if (coverage.validFraction === null) return "coverage not supplied";
  return `${Math.round(coverage.validFraction * 100)}% sampled coverage`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function formatValue(value: number | null): string {
  return value === null
    ? "unavailable"
    : Number(value.toPrecision(6)).toString();
}

function formatYearMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
