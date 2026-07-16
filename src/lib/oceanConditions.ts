import { PROBE_SCALES } from "./probe";
import { formatYm, LAYERS, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Descriptive summaries for supplied MODIS/Aqua sea-surface-temperature values.
 *
 * This model describes only the provided SST observation and coverage context.
 * It does not infer biological abundance, habitat quality, ecosystem health,
 * causal drivers, risk, or future ocean conditions.
 */

const sstSource = LAYERS.sst.dataset;
if (!sstSource) {
  throw new Error("RoamingEye: the SST layer must retain a cited dataset");
}

export const SEA_SURFACE_TEMPERATURE_METRIC = {
  id: "sea-surface-temperature",
  layerId: "sst",
  label: "Sea surface temperature",
  sourceUnit: PROBE_SCALES.sst.unit,
  source: sstSource,
} as const satisfies {
  id: "sea-surface-temperature";
  layerId: "sst";
  label: string;
  sourceUnit: string;
  source: DatasetRef;
};

export type SstFootprint = "water" | "land-mixed-coastal" | "land" | "unknown";

export interface SeaSurfaceTemperatureObservation {
  /** Month represented by the supplied SST observation. */
  dataMonth: YearMonth;
  /** SST value in the existing SST layer/source unit; null means no usable SST. */
  value: number | null;
  /** Usable share of the sampled area, when spatial sampling provides it. */
  validFraction?: number;
  /**
   * Surface context supplied by the caller, not inferred from SST alone.
   * This keeps land, coastal/land-mixed, and missing-data cases distinct.
   */
  footprint: SstFootprint;
}

export type OceanCoverageStatus =
  "water" | "land-mixed-coastal" | "land" | "missing" | "invalid";

export type OceanCoverageReason =
  | "invalid-month"
  | "invalid-coverage"
  | "invalid-value"
  | "land-footprint"
  | "unknown-footprint"
  | "missing-sst-value"
  | "zero-sst-coverage"
  | null;

export interface OceanConditionCoverage {
  status: OceanCoverageStatus;
  footprint: SstFootprint;
  /** Null means the sampler did not provide spatial coverage. */
  validFraction: number | null;
  reason: OceanCoverageReason;
}

export type SeaSurfaceTemperatureBand =
  "near-freezing" | "cool" | "temperate" | "warm" | "very-warm";

export interface OceanConditionSummary {
  kind: "observed-sea-surface-temperature-condition";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  dataMonth: YearMonth;
  coverage: OceanConditionCoverage;
  /** Retained unchanged in `metric.sourceUnit`, or null when not usable. */
  observedValue: number | null;
  /** Temperature-only descriptive band, never a biological or hazard claim. */
  temperatureBand: SeaSurfaceTemperatureBand | null;
}

export function summarizeOceanConditions(
  observation: SeaSurfaceTemperatureObservation
): OceanConditionSummary {
  const coverage = coverageFor(observation);
  const observedValue =
    coverage.status === "water" || coverage.status === "land-mixed-coastal"
      ? observation.value
      : null;

  return {
    kind: "observed-sea-surface-temperature-condition",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    dataMonth: observation.dataMonth,
    coverage,
    observedValue,
    temperatureBand:
      observedValue === null ? null : temperatureBandForSst(observedValue),
  };
}

function coverageFor(
  observation: SeaSurfaceTemperatureObservation
): OceanConditionCoverage {
  const validFraction = observation.validFraction;
  const base = {
    footprint: observation.footprint,
    validFraction: validFraction ?? null,
  };

  if (!isYearMonth(observation.dataMonth)) {
    return { ...base, status: "invalid", reason: "invalid-month" };
  }
  if (
    validFraction !== undefined &&
    (!Number.isFinite(validFraction) || validFraction < 0 || validFraction > 1)
  ) {
    return { ...base, status: "invalid", reason: "invalid-coverage" };
  }
  if (observation.footprint === "land") {
    return { ...base, status: "land", reason: "land-footprint" };
  }
  if (observation.footprint === "unknown") {
    return { ...base, status: "missing", reason: "unknown-footprint" };
  }
  if (observation.value === null) {
    return { ...base, status: "missing", reason: "missing-sst-value" };
  }
  if (validFraction === 0) {
    return { ...base, status: "missing", reason: "zero-sst-coverage" };
  }
  if (!isSstSourceValue(observation.value)) {
    return { ...base, status: "invalid", reason: "invalid-value" };
  }
  if (observation.footprint === "land-mixed-coastal") {
    return { ...base, status: "land-mixed-coastal", reason: null };
  }
  return { ...base, status: "water", reason: null };
}

function isSstSourceValue(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= PROBE_SCALES.sst.min &&
    value <= PROBE_SCALES.sst.max
  );
}

function temperatureBandForSst(value: number): SeaSurfaceTemperatureBand {
  if (value < 2) return "near-freezing";
  if (value < 10) return "cool";
  if (value < 20) return "temperate";
  if (value < 28) return "warm";
  return "very-warm";
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

/**
 * Plain-language phrase for a descriptive temperature band. These are named
 * categories over the supplied SST value, never a hazard, comfort, or
 * biological claim.
 */
const TEMPERATURE_BAND_PHRASES: Record<SeaSurfaceTemperatureBand, string> = {
  "near-freezing": "a near-freezing descriptive band",
  cool: "a cool descriptive band",
  temperate: "a temperate descriptive band",
  warm: "a warm descriptive band",
  "very-warm": "a very-warm descriptive band",
};

/**
 * Build a provenance-tagged, screen-reader-ready sentence for a summarized SST
 * condition. It reports only the supplied value, its descriptive band, and
 * coverage context; it never infers marine biology, ecosystem health, hazard,
 * comfort, causation, or any forecast. Land, missing, and invalid cases are
 * stated honestly instead of substituting a value.
 */
export function describeOceanCondition(summary: OceanConditionSummary): string {
  const source = summary.metric.source;
  const provenance = `Source: ${source.shortName} v${source.version}. This is a physical sea-surface-temperature observation, not a marine-biology, ecosystem, hazard, or forecast claim.`;

  const month = isYearMonth(summary.dataMonth)
    ? formatYm(summary.dataMonth)
    : "an invalid month";
  const lead = `Sea surface temperature for ${month}:`;

  const { coverage } = summary;
  let body: string;
  if (coverage.status === "land") {
    body =
      "the sampled footprint is land, so no sea-surface temperature is reported.";
  } else if (coverage.reason === "unknown-footprint") {
    body =
      "the sampled footprint's surface context is unavailable, so no sea-surface temperature is reported.";
  } else if (coverage.status === "missing") {
    body = "no usable sea-surface-temperature value was supplied.";
  } else if (coverage.status === "invalid" || summary.observedValue === null) {
    body = `sea-surface-temperature metadata is invalid (${coverage.reason ?? "unspecified"}), so no value is reported.`;
  } else {
    const band = summary.temperatureBand
      ? TEMPERATURE_BAND_PHRASES[summary.temperatureBand]
      : "an unclassified band";
    const value = `${summary.observedValue}${summary.metric.sourceUnit}, ${band}`;
    const coastalNote =
      coverage.status === "land-mixed-coastal"
        ? " The footprint is coastal or land-mixed, so some samples fall on land."
        : "";
    body = `${value}.${coastalNote}${coverageNote(coverage.validFraction)}`;
  }

  return `${lead} ${body} ${provenance}`;
}

function coverageNote(validFraction: number | null): string {
  if (validFraction === null) {
    return " Spatial SST coverage was not supplied.";
  }
  return ` ${Math.round(validFraction * 100)}% of the sampled footprint had usable SST samples.`;
}
