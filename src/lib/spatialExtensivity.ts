import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first spatial-extensivity (area-integrability) descriptor for a
 * multi-signal environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature as
 * monthly observations for one place. Reporting all four for that place invites a
 * reader to aggregate them over an *area* the same way — to read a single-point
 * value as if it stood for a region, or to add up per-cell values into a
 * catchment or grid-box "total". But the signals differ in how they combine over
 * space:
 *
 *  - Rainfall (precipitation rate, kg/m²/s) and soil moisture (kg/m²) are both
 *    reported as **per-unit-area densities** — an amount (or rate) *per square
 *    metre*. A per-area density is *area-integrable*: multiply it by an area
 *    (∫ density dA) and it becomes a meaningful extensive regional total (a total
 *    mass flux in kg/s, a total stored mass in kg). The per-m² value itself is
 *    the density, not the regional total.
 *  - Air temperature (2 m, K) is an **intensive** quantity: it does not scale
 *    with the size of the region, so it has no area-integral to a "total
 *    temperature". Only an (ideally area-weighted) average over the region is
 *    meaningful; summing per-cell temperatures is not.
 *  - NDVI (unitless) is a bounded **dimensionless index** — likewise intensive:
 *    it is area-averaged, never summed into an area total.
 *
 * So only the per-area densities may be integrated (or, on a fixed grid, summed
 * with their cell areas) over space to an extensive total; the intensive signals
 * must be area-averaged instead. This helper classifies each signal by its
 * spatial extensivity and reports which signals — if any — are area-integrable,
 * so a per-area density is never read as if it were already a regional total, nor
 * an intensive quantity mistakenly summed over area into a meaningless number.
 *
 * It is the *spatial* companion to the time axis in `quantityKind.ts`, and the
 * two are genuinely independent: soil-moisture storage (kg/m²) is a physical
 * *state* and therefore **not time-integrable** (successive months are not summed
 * to a "total soil moisture"), yet it **is area-integrable** (multiply the per-m²
 * storage by an area for a total stored mass). Quantity kind answers "may I sum
 * this over TIME?"; spatial extensivity answers the distinct "may I sum this over
 * AREA?". It is also distinct from spatial support (`spatialSupport.ts`, the
 * native grid *size*) and from unit commensurability (`unitCommensurability.ts`,
 * whether two signals share a *dimension*).
 *
 * It reports the spatial-aggregation structure only. It never combines the
 * values, weights them, actually integrates or sums anything over area, or infers
 * any condition, balance, causation, or forecast — the brief's shared method
 * limits still hold.
 */

export type SpatialExtensivity =
  /** A per-unit-area density (e.g. kg/m²/s, kg/m²); area-integrable. */
  | "areal-density"
  /** A quantity with no per-area factor (e.g. temperature, an index); not. */
  | "intensive"
  /** Signal absent from the spatial-extensivity table; never guessed. */
  | "unclassified";

interface ExtensivityInfo {
  /** Short human phrase for a statement, e.g. "per-unit-area density". */
  description: string;
  /**
   * True only for a per-unit-area density: its integral over an area is a
   * meaningful extensive regional total. False for an intensive quantity and for
   * `unclassified` (whose extensivity is not asserted).
   */
  areaIntegrable: boolean;
}

const EXTENSIVITY_INFO: Record<SpatialExtensivity, ExtensivityInfo> = {
  "areal-density": {
    description: "per-unit-area density",
    areaIntegrable: true,
  },
  intensive: {
    description: "intensive quantity (no per-area factor)",
    areaIntegrable: false,
  },
  unclassified: {
    description: "unclassified quantity",
    areaIntegrable: false,
  },
};

/**
 * Spatial extensivity keyed by the brief signal id. Extensivity is a property of
 * the geophysical variable the signal reports — not of the cited product — so it
 * is asserted per signal here: this is the single place each brief signal's
 * extensivity is declared. Like the Earth-system compartment and the quantity
 * kind, the two GLDAS fields share a product yet are both per-area densities. A
 * signal id absent from this table resolves to `unclassified`; an extensivity is
 * never inferred from a value or a unit.
 */
const SIGNAL_SPATIAL_EXTENSIVITY: Record<
  EnvironmentSignalId,
  SpatialExtensivity
> = {
  // NDVI: a normalized reflectance ratio, unitless and bounded — intensive; it
  // is area-averaged, never summed over area into a total.
  vegetation: "intensive",
  // Precipitation rate (kg/m²/s): a per-square-metre water/mass flux density —
  // area-integrable (× area → a total mass flux, kg/s).
  rainfall: "areal-density",
  // Soil-moisture storage (kg/m²): a per-square-metre stored mass density —
  // area-integrable (× area → a total stored mass, kg).
  "soil-moisture": "areal-density",
  // 2 m air temperature (K): an intensive level with no per-area factor; it is
  // area-averaged, never summed over area.
  "air-temperature": "intensive",
};

/** One signal classified by whether it may be integrated over area. */
export interface SignalSpatialExtensivity {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  extensivity: SpatialExtensivity;
  /**
   * True only when the value is a per-unit-area density, so its integral over an
   * area is a meaningful extensive regional total. False for an intensive
   * quantity and for an unclassified signal (whose extensivity is not asserted).
   */
  areaIntegrable: boolean;
  /** Honest, source-carrying sentence; no condition, value, or fitness claim. */
  statement: string;
}

export interface SpatialExtensivitySummary {
  kind: "spatial-extensivity";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal extensivity classifications, in signal order. */
  signals: SignalSpatialExtensivity[];
  /** Count of considered signals in each extensivity (zeros included). */
  extensivityCounts: Record<SpatialExtensivity, number>;
  /** Ids of considered signals that are area-integrable (densities), in order. */
  integrableSignalIds: EnvironmentSignalId[];
  /** Considered signals whose id is not in the spatial-extensivity table. */
  unclassifiedCount: number;
  /** True when every considered signal shares one extensivity. */
  homogeneous: boolean;
  /**
   * True when the considered signals mix an area-integrable density with an
   * intensive quantity — the case a reader must not aggregate the same way over
   * area.
   */
  mixesDensityAndIntensive: boolean;
  /** Honest one-line spatial-extensivity statement; no condition inference. */
  statement: string;
  limits: string[];
}

export interface SpatialExtensivityOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because extensivity matters for the values a
   * reader would actually try to aggregate over area; "all" describes the whole
   * brief's extensivity basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const EXTENSIVITY_LIMITS = [
  "Spatial extensivity is a property of the geophysical variable's native unit, not the cited product: the two GLDAS fields (precipitation rate and soil moisture) are both per-unit-area densities here.",
  "Only a per-unit-area density is area-integrable: multiplying it by an area yields a meaningful extensive regional total (a per-m² rate integrates to a total over the region). An intensive quantity (a temperature, a dimensionless index) has no such total and must be area-averaged, not summed over area.",
  "This axis describes integrability over AREA and is independent of time-integrability (quantityKind.ts): soil-moisture storage is not time-integrable yet is area-integrable.",
  "A signal absent from the spatial-extensivity table is reported as unclassified, never inferred from its value or unit.",
];

/**
 * Look up a signal's spatial extensivity by its brief id, returning
 * "unclassified" for any id not in the table so an extensivity is never silently
 * invented for an unknown signal.
 */
export function classifySpatialExtensivity(
  id: EnvironmentSignalId
): SpatialExtensivity {
  return SIGNAL_SPATIAL_EXTENSIVITY[id] ?? "unclassified";
}

/**
 * Classify each brief signal by whether it may be integrated over area and
 * report which considered signals are area-integrable. A per-unit-area density
 * (precipitation rate, soil-moisture storage) integrates over an area to an
 * extensive regional total; an intensive quantity (air temperature, NDVI) does
 * not and may only be area-averaged. This makes that explicit without touching
 * the values themselves.
 */
export function summarizeSpatialExtensivity(
  signals: readonly EnvironmentSignalBrief[],
  options?: SpatialExtensivityOptions
): SpatialExtensivitySummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalSpatialExtensivity[] = considered.map((signal) => {
    const extensivity = classifySpatialExtensivity(signal.id);
    const info = EXTENSIVITY_INFO[extensivity];
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      extensivity,
      areaIntegrable: info.areaIntegrable,
      statement: `${signal.label}: ${info.description} (${extensivity}), ${
        info.areaIntegrable ? "area-integrable" : "not area-integrable"
      }; source ${sourceLabel(signal.source)}.`,
    };
  });

  const extensivityCounts = countExtensivities(classified);
  const integrableSignalIds = classified
    .filter((s) => s.areaIntegrable)
    .map((s) => s.id);
  const unclassifiedCount = extensivityCounts.unclassified;
  const distinctExtensivities = EXTENSIVITIES.filter(
    (extensivity) => extensivityCounts[extensivity] > 0
  ).length;
  const classifiedCount = classified.length - unclassifiedCount;
  const nonIntegrableClassified = classifiedCount - integrableSignalIds.length;

  return {
    kind: "spatial-extensivity",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    extensivityCounts,
    integrableSignalIds,
    unclassifiedCount,
    homogeneous: classified.length >= 1 && distinctExtensivities === 1,
    // A reader aggregates a density and an intensive quantity differently over
    // area, so the mix that matters is an area-integrable density alongside an
    // intensive (non-integrable) signal.
    mixesDensityAndIntensive:
      integrableSignalIds.length > 0 && nonIntegrableClassified > 0,
    statement: extensivityStatement(
      classified.length,
      extensivityCounts,
      integrableSignalIds,
      classifiedCount,
      unclassifiedCount
    ),
    limits: EXTENSIVITY_LIMITS,
  };
}

/** Fixed extensivity order for reporting, so none is silently dropped. */
const EXTENSIVITIES: readonly SpatialExtensivity[] = [
  "areal-density",
  "intensive",
  "unclassified",
];

function countExtensivities(
  signals: readonly SignalSpatialExtensivity[]
): Record<SpatialExtensivity, number> {
  const counts = Object.fromEntries(
    EXTENSIVITIES.map((extensivity) => [extensivity, 0])
  ) as Record<SpatialExtensivity, number>;
  for (const signal of signals) counts[signal.extensivity] += 1;
  return counts;
}

function extensivityStatement(
  consideredCount: number,
  extensivityCounts: Record<SpatialExtensivity, number>,
  integrableSignalIds: EnvironmentSignalId[],
  classifiedCount: number,
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by spatial extensivity.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = extensivityBreakdown(extensivityCounts);
  const integrableCount = integrableSignalIds.length;

  let integrabilityClause: string;
  if (classifiedCount === 0) {
    integrabilityClause =
      "no considered signal is in the spatial-extensivity table, so their extensivity is not asserted";
  } else if (integrableCount === 0) {
    integrabilityClause =
      "none is a per-unit-area density, so no value is area-integrable to a regional total; these intensive quantities must be area-averaged, not summed over area";
  } else if (integrableCount === classifiedCount) {
    const verb = integrableCount === 1 ? "is a" : "are";
    integrabilityClause = `all ${integrableCount} classified ${verb} per-unit-area densit${
      integrableCount === 1 ? "y" : "ies"
    }, area-integrable over a region to an extensive total`;
  } else {
    integrabilityClause = `only ${integrableSignalIds.join(", ")} ${
      integrableCount === 1 ? "is a" : "are"
    } area-integrable per-unit-area densit${
      integrableCount === 1 ? "y" : "ies"
    }; the remaining intensive signals must be area-averaged, not summed over area`;
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified signal${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${integrabilityClause}.${unclassifiedClause}`;
}

/** Non-zero extensivity counts in fixed order, e.g. "2 areal-density, 2 intensive". */
function extensivityBreakdown(
  extensivityCounts: Record<SpatialExtensivity, number>
): string {
  return EXTENSIVITIES.filter(
    (extensivity) => extensivityCounts[extensivity] > 0
  )
    .map((extensivity) => `${extensivityCounts[extensivity]} ${extensivity}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
