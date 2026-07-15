import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first observing-system descriptor for a multi-signal environment
 * brief.
 *
 * The brief presents vegetation, rainfall, soil-moisture, and air-temperature
 * side by side as four monthly "observations" for one place. That framing
 * invites a reader to treat all four as measurements of comparable directness —
 * but they are not. Only one of the four is a direct satellite retrieval of the
 * actual surface; the other three are model or reanalysis *estimates*:
 *
 *  - Vegetation (NDVI, MOD13A3) is a satellite-observed retrieval — a normalized
 *    ratio of measured MODIS surface reflectances. It is an observation of the
 *    real surface.
 *  - Rainfall (precipitation rate) and soil moisture are both fields of the
 *    GLDAS Noah **land-surface model** (GLDAS_NOAH025_M, one DOI). They are
 *    model output, not direct measurements of the sampled cell.
 *  - Air temperature (2 m) is a field of the MERRA-2 **atmospheric reanalysis**
 *    (M2TMNXSLV) — an assimilated model estimate, not a station reading.
 *
 * So three of the four values a reader compares are model-derived; reading the
 * GLDAS soil-moisture or MERRA-2 air-temperature number as a "measurement" is a
 * real scientific error. This helper classifies each signal by the observing
 * system of its cited product and reports which signals — if any — are directly
 * observed versus model-derived, so a modelled estimate is never silently read
 * as a direct measurement.
 *
 * Classification is keyed by the cited product (DOI), not by the geophysical
 * variable: the observing system is a property of *how the value was produced*,
 * so the two GLDAS fields share a class though they report different variables
 * (a flux and a state). This is what makes the axis distinct from — and
 * composable with — the brief's other rigor descriptors:
 *   - Source independence (`sourceIndependence.ts`) groups by product/DOI to say
 *     which signals are NOT independent evidence (the two GLDAS fields share a
 *     product). It does not say whether a product is observed or modelled: NDVI,
 *     GLDAS, and MERRA-2 are three distinct sources, yet only NDVI is a direct
 *     observation — the distinction this module draws.
 *   - Quantity kind (`quantityKind.ts`) is keyed by the variable (a flux vs a
 *     state); how the value was produced is orthogonal to its kinematic nature.
 *   - Earth-system compartment (`signalCompartment.ts`) says which vertical
 *     medium the value sits in, not how it was produced.
 *
 * It reports observing-system provenance only. It never combines the signal
 * values, weights them, judges quality, or infers any condition, agreement,
 * causation, or forecast — the brief's shared method limits still hold.
 */

export type ObservingSystemClass =
  /** A satellite retrieval of the actual surface/atmosphere (e.g. MODIS NDVI). */
  | "satellite-retrieval"
  /** An offline land-surface-model field (e.g. GLDAS Noah). */
  | "land-surface-model"
  /** An assimilated atmospheric reanalysis field (e.g. MERRA-2). */
  | "atmospheric-reanalysis"
  /** Product absent from the observing-system table; never guessed. */
  | "unclassified";

export type EvidenceDirectness =
  /** Observed: a satellite retrieval of the real surface/atmosphere. */
  | "directly-observed"
  /** Estimated by a model or reanalysis, not measured directly. */
  | "model-derived"
  /** Observing system not asserted (unclassified product). */
  | "unknown";

interface ClassInfo {
  /** Short human phrase for a statement, e.g. "satellite-observed retrieval". */
  description: string;
  /** Whether this observing system yields a direct observation or an estimate. */
  directness: EvidenceDirectness;
}

const CLASS_INFO: Record<ObservingSystemClass, ClassInfo> = {
  "satellite-retrieval": {
    description: "satellite-observed retrieval",
    directness: "directly-observed",
  },
  "land-surface-model": {
    description: "offline land-surface-model field",
    directness: "model-derived",
  },
  "atmospheric-reanalysis": {
    description: "assimilated atmospheric reanalysis",
    directness: "model-derived",
  },
  unclassified: {
    description: "unclassified observing system",
    directness: "unknown",
  },
};

/**
 * Observing-system class keyed by the cited product DOI. The observing system is
 * a property of the product that produced the value, not of the geophysical
 * variable, so it is keyed here by DOI (the same canonical product identity
 * `sourceIndependence.ts` groups on). The two GLDAS fields share one DOI and so
 * one class, though they report different variables. A DOI absent from this
 * table resolves to `unclassified`; a class is never inferred from a unit or
 * variable.
 */
const PRODUCT_OBSERVING_SYSTEM: Record<string, ObservingSystemClass> = {
  // MOD13A3 v061 — MODIS/Terra monthly NDVI: a satellite surface retrieval.
  "10.5067/MODIS/MOD13A3.061": "satellite-retrieval",
  // GLDAS_NOAH025_M — GLDAS Noah L4 land-surface model (rainfall + soil moisture).
  "10.5067/SXAVCZFAQLNO": "land-surface-model",
  // M2TMNXSLV — MERRA-2 single-level diagnostics: an atmospheric reanalysis.
  "10.5067/AP1B0BA5PD2K": "atmospheric-reanalysis",
};

/** One signal classified by the observing system of its cited product. */
export interface SignalObservingSystem {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  observingSystemClass: ObservingSystemClass;
  directness: EvidenceDirectness;
  /** True only for a directly-observed satellite retrieval. */
  directlyObserved: boolean;
  /** Honest, source-carrying sentence; no condition, value, or quality claim. */
  statement: string;
}

export interface ObservingSystemSummary {
  kind: "observing-system";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal observing-system classifications, in signal order. */
  signals: SignalObservingSystem[];
  /** Count of considered signals in each observing-system class (zeros kept). */
  classCounts: Record<ObservingSystemClass, number>;
  /** Count of considered signals in each directness tier (zeros kept). */
  directnessCounts: Record<EvidenceDirectness, number>;
  /** Ids of considered signals that are directly observed, in signal order. */
  observedSignalIds: EnvironmentSignalId[];
  /** Ids of considered signals that are model-derived, in signal order. */
  modelDerivedSignalIds: EnvironmentSignalId[];
  /** Considered signals whose product is not in the observing-system table. */
  unclassifiedCount: number;
  /** True when every considered signal shares one observing-system class. */
  homogeneous: boolean;
  /**
   * True when the considered signals mix a directly-observed retrieval with a
   * model-derived estimate — the case where a reader must not read the modelled
   * value(s) as measurements alongside the observed one(s).
   */
  mixesObservedAndModeled: boolean;
  /** Honest one-line observing-system statement; no condition or value claim. */
  statement: string;
  limits: string[];
}

export interface ObservingSystemOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because the observed-vs-modelled distinction
   * matters for the values a reader would actually read; "all" describes the
   * whole brief's observing-system basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const OBSERVING_SYSTEM_LIMITS = [
  "Observing-system class is a property of the cited product, not the geophysical variable: the two GLDAS fields share one product and class though one is a flux and the other a state.",
  '"Directly-observed" means a satellite retrieval of the real surface — it still involves algorithmic processing of measured radiances, but it is an observation, not a simulation. "Model-derived" covers both an offline land-surface model (GLDAS Noah) and an assimilated atmospheric reanalysis (MERRA-2): estimates constrained by, but not equal to, direct measurements.',
  "Within GLDAS the precipitation field is the model's meteorological forcing (itself gauge/satellite/reanalysis-blended) while soil moisture is a prognostic model state; both are delivered as one land-model L4 product and neither is an in-situ or single-instrument measurement.",
  "A product absent from the observing-system table is reported as unclassified; a class is never inferred from a unit or variable.",
  "This axis reports how each value was produced (observed vs modelled) and nothing more: it is distinct from source independence (which product), quantity kind (rate vs state), and Earth-system compartment (which medium), and makes no condition, quality, causation, or forecast claim.",
];

/**
 * Look up a product's observing-system class by its DOI, returning
 * "unclassified" for any product not in the table so a class is never silently
 * invented for an unknown source.
 */
export function classifyObservingSystem(
  source: DatasetRef
): ObservingSystemClass {
  return PRODUCT_OBSERVING_SYSTEM[source.doi.trim()] ?? "unclassified";
}

/**
 * Classify each brief signal by the observing system of its cited product and
 * report which considered signals are directly observed versus model-derived. A
 * satellite retrieval (NDVI) is a direct observation of the surface; a
 * land-surface-model field (GLDAS rainfall, soil moisture) and an atmospheric
 * reanalysis (MERRA-2 air temperature) are model estimates. This makes that
 * explicit without touching the values themselves.
 */
export function summarizeObservingSystems(
  signals: readonly EnvironmentSignalBrief[],
  options?: ObservingSystemOptions
): ObservingSystemSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalObservingSystem[] = considered.map((signal) => {
    const observingSystemClass = classifyObservingSystem(signal.source);
    const info = CLASS_INFO[observingSystemClass];
    const directlyObserved = info.directness === "directly-observed";
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      observingSystemClass,
      directness: info.directness,
      directlyObserved,
      statement: `${signal.label}: ${info.description} (${observingSystemClass}), ${
        directlyObserved
          ? "directly observed"
          : directnessPhrase(info.directness)
      }; source ${sourceLabel(signal.source)}.`,
    };
  });

  const classCounts = countClasses(classified);
  const directnessCounts = countDirectness(classified);
  const observedSignalIds = classified
    .filter((s) => s.directness === "directly-observed")
    .map((s) => s.id);
  const modelDerivedSignalIds = classified
    .filter((s) => s.directness === "model-derived")
    .map((s) => s.id);
  const unclassifiedCount = classCounts.unclassified;
  const distinctClasses = OBSERVING_SYSTEM_CLASSES.filter(
    (observingSystemClass) => classCounts[observingSystemClass] > 0
  ).length;

  return {
    kind: "observing-system",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    classCounts,
    directnessCounts,
    observedSignalIds,
    modelDerivedSignalIds,
    unclassifiedCount,
    homogeneous: classified.length >= 1 && distinctClasses === 1,
    // The mix that matters for reading the values is a directly-observed
    // retrieval alongside a model-derived estimate.
    mixesObservedAndModeled:
      observedSignalIds.length > 0 && modelDerivedSignalIds.length > 0,
    statement: observingSystemStatement(
      classified.length,
      classCounts,
      observedSignalIds,
      modelDerivedSignalIds,
      unclassifiedCount
    ),
    limits: OBSERVING_SYSTEM_LIMITS,
  };
}

/** Fixed observing-system class order for reporting, so none is dropped. */
const OBSERVING_SYSTEM_CLASSES: readonly ObservingSystemClass[] = [
  "satellite-retrieval",
  "land-surface-model",
  "atmospheric-reanalysis",
  "unclassified",
];

/** Fixed directness order for reporting, so none is dropped. */
const DIRECTNESS_TIERS: readonly EvidenceDirectness[] = [
  "directly-observed",
  "model-derived",
  "unknown",
];

function countClasses(
  signals: readonly SignalObservingSystem[]
): Record<ObservingSystemClass, number> {
  const counts = Object.fromEntries(
    OBSERVING_SYSTEM_CLASSES.map((observingSystemClass) => [
      observingSystemClass,
      0,
    ])
  ) as Record<ObservingSystemClass, number>;
  for (const signal of signals) counts[signal.observingSystemClass] += 1;
  return counts;
}

function countDirectness(
  signals: readonly SignalObservingSystem[]
): Record<EvidenceDirectness, number> {
  const counts = Object.fromEntries(
    DIRECTNESS_TIERS.map((tier) => [tier, 0])
  ) as Record<EvidenceDirectness, number>;
  for (const signal of signals) counts[signal.directness] += 1;
  return counts;
}

function directnessPhrase(directness: EvidenceDirectness): string {
  return directness === "model-derived"
    ? "a model or reanalysis estimate, not a direct measurement"
    : "observing system not asserted";
}

function observingSystemStatement(
  consideredCount: number,
  classCounts: Record<ObservingSystemClass, number>,
  observedSignalIds: EnvironmentSignalId[],
  modelDerivedSignalIds: EnvironmentSignalId[],
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by observing system.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = classBreakdown(classCounts);
  const observedCount = observedSignalIds.length;
  const modelCount = modelDerivedSignalIds.length;
  const classifiedCount = observedCount + modelCount;

  let directnessClause: string;
  if (classifiedCount === 0) {
    directnessClause =
      "no considered signal's product is in the observing-system table, so their observing system is not asserted";
  } else if (observedCount === 0) {
    directnessClause = `none is a direct measurement; ${
      modelCount === 1
        ? "the value is a model or reanalysis estimate, not an observation"
        : "all values are model or reanalysis estimates, not observations"
    }`;
  } else if (modelCount === 0) {
    const verb = observedCount === 1 ? "is a" : "are";
    directnessClause = `all ${observedCount} classified ${verb} directly-observed satellite retrieval${plural(
      observedCount
    )}`;
  } else {
    directnessClause = `only ${observedSignalIds.join(", ")} ${
      observedCount === 1 ? "is" : "are"
    } directly observed; ${modelDerivedSignalIds.join(", ")} ${
      modelCount === 1
        ? "is a model or reanalysis estimate"
        : "are model or reanalysis estimates"
    } — do not read ${modelCount === 1 ? "the modelled value" : "the modelled values"} as ${
      modelCount === 1 ? "a measurement" : "measurements"
    }`;
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified signal${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${directnessClause}.${unclassifiedClause}`;
}

/** Non-zero class counts in fixed order, e.g. "1 satellite-retrieval, 2 land-surface-model". */
function classBreakdown(
  classCounts: Record<ObservingSystemClass, number>
): string {
  return OBSERVING_SYSTEM_CLASSES.filter(
    (observingSystemClass) => classCounts[observingSystemClass] > 0
  )
    .map(
      (observingSystemClass) =>
        `${classCounts[observingSystemClass]} ${observingSystemClass}`
    )
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
