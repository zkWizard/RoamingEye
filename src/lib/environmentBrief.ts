import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateCoverage,
  type ClimateMetricId,
  type MonthlyClimateObservation,
  type MonthlyClimateSummary,
} from "./climate";
import { NDVI_SOURCE, NDVI_UNIT } from "./phenology";
import type { DatasetRef, LayerId, YearMonth } from "./timeline";

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
  };
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
