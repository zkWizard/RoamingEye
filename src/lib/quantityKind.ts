import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first quantity-kind (time-integrability) descriptor for a
 * multi-signal environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature as
 * monthly observations for one place. Placing the four monthly values side by
 * side invites a reader to treat them as the same kind of number — and, in
 * particular, to accumulate them over time the same way (a monthly total, a
 * yearly sum). But the signals differ in their *kinematic nature*:
 *
 *  - Rainfall (precipitation rate, kg/m²/s) is a per-unit-time **flux**. A flux
 *    is a rate, so its integral over a period is a meaningful accumulated total:
 *    multiply the monthly mean rate by the month's seconds and it becomes a
 *    period precipitation depth (the same 86,400 s/day factor `climateConventional-
 *    Units.ts` uses to reach mm/day).
 *  - Soil moisture (kg/m²) is a stored **state** — a level of water present at an
 *    instant or mean, not a rate. Successive monthly values are not summed to a
 *    "total soil moisture"; there is no such accumulation.
 *  - Air temperature (2 m, K) is an intensive **state** — a level, likewise not a
 *    rate and not time-integrable.
 *  - NDVI (unitless) is a bounded **dimensionless index** — a reflectance ratio,
 *    not a physical amount at all, and not time-integrable.
 *
 * So only the flux may be integrated (or summed) over time to a period total; the
 * states and the index must not be. This helper classifies each signal by its
 * quantity kind and reports which signals — if any — are time-integrable, so a
 * flux is never silently accumulated the same way as a level, nor a level
 * mistakenly summed into a meaningless "total".
 *
 * It is deliberately distinct from — and composes with — the brief's other rigor
 * descriptors:
 *   - Earth-system compartment (`signalCompartment.ts`) places each signal in a
 *     vertical medium (air / surface / soil) and happens to note that rainfall is
 *     a surface flux; but its axis is WHERE the value sits, not whether it may be
 *     integrated over time. Quantity kind is that missing axis.
 *   - Within-month aggregation (`temporalAggregation.ts`) says HOW the month was
 *     reduced (composite vs time-average); a time-average of a flux is still a
 *     flux and a time-average of a state is still a state, so aggregation does not
 *     answer whether the value is a rate.
 *   - Unit commensurability (`unitCommensurability.ts`) groups by native unit;
 *     two different units can both be states, so units alone do not reveal the
 *     rate-vs-state distinction.
 *
 * It reports the kinematic structure only. It never combines the values, weights
 * them, actually integrates or accumulates anything, or infers any condition,
 * balance, causation, or forecast — the brief's shared method limits still hold.
 */

export type QuantityKind =
  /** A per-unit-time rate (e.g. precipitation rate); time-integrable. */
  | "flux"
  /** A physical level/state (e.g. soil-moisture storage, air temperature). */
  | "state"
  /** A bounded ratio carrying no physical unit (e.g. NDVI). */
  | "dimensionless-index"
  /** Signal absent from the quantity-kind table; never guessed. */
  | "unclassified";

interface KindInfo {
  /** Short human phrase for a statement, e.g. "per-unit-time flux (rate)". */
  description: string;
  /**
   * True only for a flux: a per-unit-time rate whose integral over a period is a
   * meaningful accumulated total. False for a state, a dimensionless index, and
   * for `unclassified` (whose kind is not asserted).
   */
  timeIntegrable: boolean;
}

const KIND_INFO: Record<QuantityKind, KindInfo> = {
  flux: { description: "per-unit-time flux (rate)", timeIntegrable: true },
  state: {
    description: "physical state (a level, not a rate)",
    timeIntegrable: false,
  },
  "dimensionless-index": {
    description: "dimensionless index",
    timeIntegrable: false,
  },
  unclassified: { description: "unclassified quantity", timeIntegrable: false },
};

/**
 * Quantity kind keyed by the brief signal id. Kind is a property of the
 * geophysical variable the signal reports — not of the cited product — so it is
 * asserted per signal here: this is the single place each brief signal's kind is
 * declared. Like the Earth-system compartment, the two GLDAS fields share a
 * product yet differ (rainfall is a flux, soil moisture a state). A signal id
 * absent from this table resolves to `unclassified`; a kind is never inferred
 * from a value or a unit.
 */
const SIGNAL_QUANTITY_KIND: Record<EnvironmentSignalId, QuantityKind> = {
  // NDVI: a normalized reflectance ratio, unitless and bounded — an index.
  vegetation: "dimensionless-index",
  // Precipitation rate (kg/m²/s): a per-unit-time water/mass flux.
  rainfall: "flux",
  // Soil-moisture storage (kg/m²): a stored amount of water — a state, not a rate.
  "soil-moisture": "state",
  // 2 m air temperature (K): an intensive level — a state, not a rate.
  "air-temperature": "state",
};

/** One signal classified by the kind of physical quantity it reports. */
export interface SignalQuantityKind {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  quantityKind: QuantityKind;
  /**
   * True only when the value is a per-unit-time flux, so its integral over a
   * period is a meaningful accumulated total. False for a state, an index, and
   * for an unclassified signal (whose kind is not asserted).
   */
  timeIntegrable: boolean;
  /** Honest, source-carrying sentence; no condition, value, or fitness claim. */
  statement: string;
}

export interface QuantityKindSummary {
  kind: "quantity-kind";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal quantity-kind classifications, in signal order. */
  signals: SignalQuantityKind[];
  /** Count of considered signals in each quantity kind (zeros included). */
  kindCounts: Record<QuantityKind, number>;
  /** Ids of considered signals that are time-integrable (fluxes), in order. */
  integrableSignalIds: EnvironmentSignalId[];
  /** Considered signals whose id is not in the quantity-kind table. */
  unclassifiedCount: number;
  /** True when every considered signal shares one quantity kind. */
  homogeneous: boolean;
  /**
   * True when the considered signals mix a time-integrable flux with a
   * non-integrable state or index — the case a reader must not accumulate the
   * same way over time.
   */
  mixesFluxAndState: boolean;
  /** Honest one-line quantity-kind statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface QuantityKindOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because integrability matters for the values
   * a reader would actually try to accumulate; "all" describes the whole brief's
   * quantity-kind basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const QUANTITY_KIND_LIMITS = [
  "Quantity kind is a property of the geophysical variable, not the cited product: the two GLDAS fields (precipitation flux and soil-moisture state) share a product yet are different kinds.",
  "Only a per-unit-time flux is time-integrable: its integral over a period is a meaningful accumulated total (e.g. a precipitation rate integrates to a period depth). A state or index has no such accumulation and must not be summed over time.",
  "This axis describes the kinematic nature of the value and whether it may be integrated over time; it is distinct from the Earth-system compartment (which vertical medium) and the within-month aggregation (how the month was reduced).",
  "A signal absent from the quantity-kind table is reported as unclassified, never inferred from its value or unit.",
];

/**
 * Look up a signal's quantity kind by its brief id, returning "unclassified" for
 * any id not in the table so a kind is never silently invented for an unknown
 * signal.
 */
export function classifyQuantityKind(id: EnvironmentSignalId): QuantityKind {
  return SIGNAL_QUANTITY_KIND[id] ?? "unclassified";
}

/**
 * Classify each brief signal by the kind of physical quantity it reports and
 * report which considered signals are time-integrable. A flux (precipitation
 * rate) may be integrated over a period to an accumulated total; a state (soil
 * moisture, air temperature) or a dimensionless index (NDVI) may not. This makes
 * that explicit without touching the values themselves.
 */
export function summarizeQuantityKinds(
  signals: readonly EnvironmentSignalBrief[],
  options?: QuantityKindOptions
): QuantityKindSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalQuantityKind[] = considered.map((signal) => {
    const quantityKind = classifyQuantityKind(signal.id);
    const info = KIND_INFO[quantityKind];
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      quantityKind,
      timeIntegrable: info.timeIntegrable,
      statement: `${signal.label}: ${info.description} (${quantityKind}), ${
        info.timeIntegrable ? "time-integrable" : "not time-integrable"
      }; source ${sourceLabel(signal.source)}.`,
    };
  });

  const kindCounts = countKinds(classified);
  const integrableSignalIds = classified
    .filter((s) => s.timeIntegrable)
    .map((s) => s.id);
  const unclassifiedCount = kindCounts.unclassified;
  const distinctKinds = QUANTITY_KINDS.filter(
    (quantityKind) => kindCounts[quantityKind] > 0
  ).length;
  const classifiedCount = classified.length - unclassifiedCount;
  const nonIntegrableClassified = classifiedCount - integrableSignalIds.length;

  return {
    kind: "quantity-kind",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    kindCounts,
    integrableSignalIds,
    unclassifiedCount,
    homogeneous: classified.length >= 1 && distinctKinds === 1,
    // A reader accumulates a flux and a state differently, so the mix that
    // matters is a time-integrable signal alongside a non-integrable one.
    mixesFluxAndState:
      integrableSignalIds.length > 0 && nonIntegrableClassified > 0,
    statement: quantityKindStatement(
      classified.length,
      kindCounts,
      integrableSignalIds,
      classifiedCount,
      unclassifiedCount
    ),
    limits: QUANTITY_KIND_LIMITS,
  };
}

/** Fixed quantity-kind order for reporting, so none is silently dropped. */
const QUANTITY_KINDS: readonly QuantityKind[] = [
  "flux",
  "state",
  "dimensionless-index",
  "unclassified",
];

function countKinds(
  signals: readonly SignalQuantityKind[]
): Record<QuantityKind, number> {
  const counts = Object.fromEntries(
    QUANTITY_KINDS.map((quantityKind) => [quantityKind, 0])
  ) as Record<QuantityKind, number>;
  for (const signal of signals) counts[signal.quantityKind] += 1;
  return counts;
}

function quantityKindStatement(
  consideredCount: number,
  kindCounts: Record<QuantityKind, number>,
  integrableSignalIds: EnvironmentSignalId[],
  classifiedCount: number,
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by quantity kind.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = kindBreakdown(kindCounts);
  const integrableCount = integrableSignalIds.length;

  let integrabilityClause: string;
  if (classifiedCount === 0) {
    integrabilityClause =
      "no considered signal is in the quantity-kind table, so their kind is not asserted";
  } else if (integrableCount === 0) {
    integrabilityClause =
      "none is a per-unit-time rate, so no value is time-integrable to a period total; these states and indices must not be summed over time";
  } else if (integrableCount === classifiedCount) {
    const verb = integrableCount === 1 ? "is a" : "are";
    integrabilityClause = `all ${integrableCount} classified ${verb} per-unit-time flux${plural(
      integrableCount
    )}, time-integrable to a period total`;
  } else {
    integrabilityClause = `only ${integrableSignalIds.join(
      ", "
    )} ${integrableCount === 1 ? "is a" : "are"} time-integrable flux${plural(
      integrableCount
    )}; the remaining state and index signals must not be summed or integrated over time`;
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified signal${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${integrabilityClause}.${unclassifiedClause}`;
}

/** Non-zero kind counts in fixed order, e.g. "1 flux, 2 state". */
function kindBreakdown(kindCounts: Record<QuantityKind, number>): string {
  return QUANTITY_KINDS.filter((quantityKind) => kindCounts[quantityKind] > 0)
    .map((quantityKind) => `${kindCounts[quantityKind]} ${quantityKind}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
