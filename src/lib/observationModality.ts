import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first observation-modality descriptor for a multi-signal
 * environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature
 * as "independent monthly source observations", which invites a reader to treat
 * them as four measurements of the world. But the cited products differ in a
 * more fundamental way than which instrument or DOI they carry: they differ in
 * how the value came to exist. In this app:
 *
 *  - NDVI (MOD13A3) is a satellite-derived spectral index — a normalized
 *    difference of remotely-sensed reflectances, not a physical measurement in
 *    SI units.
 *  - Rainfall and soil moisture (GLDAS_NOAH025_M) are fields produced by the
 *    GLDAS Noah land-surface *model*, constrained by observations but not a
 *    direct measurement of rain or soil water.
 *  - Air temperature (M2TMNXSLV) is an atmospheric *reanalysis* field — a model
 *    state assimilating many observations, not a thermometer reading.
 *
 * None of the four are direct in-situ measurements. This helper classifies each
 * signal by its observation modality so agreement between two model-derived
 * fields is never read as independent measurement confirmation. It reports
 * provenance structure only; it never combines the values, weights them, or
 * infers any condition, risk, causation, or forecast — the shared method limits
 * of the brief still hold. Modality is a companion to source independence
 * (which product?) and coverage adequacy (how much of the area?): a distinct
 * axis describing HOW each value was produced.
 */

export type ObservationModality =
  /** Remotely-sensed spectral index (e.g. NDVI); an observation, but derived. */
  | "satellite-derived-index"
  /** Field from a land-surface model (e.g. GLDAS Noah); not measured. */
  | "land-surface-model"
  /** Field from an atmospheric reanalysis (e.g. MERRA-2); not measured. */
  | "atmospheric-reanalysis"
  /** Product absent from the modality table; never guessed. */
  | "unclassified";

/** How a value was produced: sensed from the surface, or produced by a model. */
export type ObservationBasis = "remote-sensing" | "model" | "unknown";

interface ModalityInfo {
  /** Short human phrase for a statement, e.g. "land-surface-model field". */
  description: string;
  /** The coarse production basis this modality falls under. */
  basis: ObservationBasis;
}

const MODALITY_INFO: Record<ObservationModality, ModalityInfo> = {
  "satellite-derived-index": {
    description: "satellite-derived spectral index",
    basis: "remote-sensing",
  },
  "land-surface-model": {
    description: "land-surface-model field",
    basis: "model",
  },
  "atmospheric-reanalysis": {
    description: "atmospheric reanalysis field",
    basis: "model",
  },
  unclassified: {
    description: "unclassified product",
    basis: "unknown",
  },
};

/**
 * Observation modality keyed by the cited product's short name. The DOI and
 * short name uniquely name a published product; its modality is a fixed
 * property of that product, so this table is the single place the modality of
 * each brief product is asserted. A product not listed here resolves to
 * `unclassified` — its production basis is never inferred from a value.
 */
const PRODUCT_MODALITY: Record<string, ObservationModality> = {
  // MODIS/Terra Vegetation Indices Monthly (NDVI/EVI).
  MOD13A3: "satellite-derived-index",
  // GLDAS Noah Land Surface Model L4 monthly (precipitation, soil moisture).
  GLDAS_NOAH025_M: "land-surface-model",
  // MERRA-2 monthly single-level diagnostics (2 m air temperature).
  M2TMNXSLV: "atmospheric-reanalysis",
};

/** One signal classified by how its cited product produces a value. */
export interface SignalModality {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  modality: ObservationModality;
  basis: ObservationBasis;
  /**
   * True when the value is produced by a model or reanalysis (basis "model"),
   * so it is not a direct measurement. False for remotely-sensed and for
   * unclassified products (whose basis is not asserted).
   */
  modelDerived: boolean;
  /** Honest, source-carrying sentence; no fitness, condition, or value claim. */
  statement: string;
}

export interface ObservationModalitySummary {
  kind: "observation-modality";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal modality classifications, in signal order. */
  signals: SignalModality[];
  /** Count of considered signals in each modality (zeros included). */
  modalityCounts: Record<ObservationModality, number>;
  /** Considered signals produced by a model or reanalysis (not measured). */
  modelDerivedCount: number;
  /** Considered signals whose product is not in the modality table. */
  unclassifiedCount: number;
  /** True when every considered signal shares one modality. */
  homogeneous: boolean;
  /** Honest one-line modality statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface ObservationModalityOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because modality matters for the evidence a
   * reader would actually combine; "all" describes the whole brief's modality
   * basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const MODALITY_LIMITS = [
  "Modality is a fixed property of the cited source product, not of any individual value.",
  "Model and reanalysis fields are constrained by observations but are not direct measurements; agreement across them is not independent measurement confirmation.",
  "A product absent from the modality table is reported as unclassified, never inferred from its value.",
];

/**
 * Look up a product's observation modality by its short name, returning
 * "unclassified" for any product not in the table so a modality is never
 * silently invented for an unknown source.
 */
export function classifyModality(source: DatasetRef): ObservationModality {
  return PRODUCT_MODALITY[source.shortName] ?? "unclassified";
}

/**
 * Classify each brief signal by how its cited product produces a value, and
 * report how many of the considered signals are model-derived. Two signals
 * sharing the "model" basis (e.g. GLDAS rainfall and soil moisture, or a GLDAS
 * field and a MERRA-2 field) are not independent measurements of the world, and
 * this makes that explicit without touching the values themselves.
 */
export function summarizeObservationModality(
  signals: readonly EnvironmentSignalBrief[],
  options?: ObservationModalityOptions
): ObservationModalitySummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalModality[] = considered.map((signal) => {
    const modality = classifyModality(signal.source);
    const info = MODALITY_INFO[modality];
    const modelDerived = info.basis === "model";
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      modality,
      basis: info.basis,
      modelDerived,
      statement: `${signal.label}: ${info.description} (${modality}); source ${sourceLabel(signal.source)}.`,
    };
  });

  const modalityCounts = countModalities(classified);
  const modelDerivedCount = classified.filter((s) => s.modelDerived).length;
  const unclassifiedCount = modalityCounts.unclassified;
  const distinctModalities = MODALITIES.filter(
    (modality) => modalityCounts[modality] > 0
  ).length;

  return {
    kind: "observation-modality",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    modalityCounts,
    modelDerivedCount,
    unclassifiedCount,
    homogeneous: classified.length >= 1 && distinctModalities === 1,
    statement: modalityStatement(
      classified.length,
      modalityCounts,
      modelDerivedCount,
      unclassifiedCount
    ),
    limits: MODALITY_LIMITS,
  };
}

/** Fixed modality order for reporting, so no modality is silently dropped. */
const MODALITIES: readonly ObservationModality[] = [
  "satellite-derived-index",
  "land-surface-model",
  "atmospheric-reanalysis",
  "unclassified",
];

function countModalities(
  signals: readonly SignalModality[]
): Record<ObservationModality, number> {
  const counts = Object.fromEntries(
    MODALITIES.map((modality) => [modality, 0])
  ) as Record<ObservationModality, number>;
  for (const signal of signals) counts[signal.modality] += 1;
  return counts;
}

function modalityStatement(
  consideredCount: number,
  modalityCounts: Record<ObservationModality, number>,
  modelDerivedCount: number,
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by observation modality.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = modalityBreakdown(modalityCounts);
  const classifiedCount = consideredCount - unclassifiedCount;

  // Only claim "none are direct measurements" when every considered signal was
  // classifiable; an unclassified product's basis is not asserted.
  let basisClause: string;
  if (classifiedCount === 0) {
    basisClause =
      "no considered signal is in the modality table, so their production basis is not asserted";
  } else if (modelDerivedCount === classifiedCount) {
    const verb = modelDerivedCount === 1 ? "is a" : "are";
    const fieldNoun = modelDerivedCount === 1 ? "field" : "fields";
    basisClause = `all ${modelDerivedCount} classified ${verb} model or reanalysis ${fieldNoun}, not direct measurements — agreement across them is not independent measurement confirmation`;
  } else if (modelDerivedCount > 0) {
    basisClause = `${modelDerivedCount} of ${classifiedCount} classified are model or reanalysis fields, not direct measurements`;
  } else {
    basisClause =
      "the classified signals are remotely sensed, not model-derived";
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified product${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${basisClause}.${unclassifiedClause}`;
}

/** Non-zero modality counts in fixed order, e.g. "1 satellite-derived-index, 2 land-surface-model". */
function modalityBreakdown(
  modalityCounts: Record<ObservationModality, number>
): string {
  return MODALITIES.filter((modality) => modalityCounts[modality] > 0)
    .map((modality) => `${modalityCounts[modality]} ${modality}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
