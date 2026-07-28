import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
  EnvironmentSignalStatus,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first data-gap-mechanism (observability-gating) descriptor for a
 * multi-signal environment brief.
 *
 * The brief already reports, per signal, whether an observation is `available`,
 * `no-data`, `invalid`, or `unavailable`, and — when the sampler supplies it —
 * the usable share of the sampled area (`validFraction`). What those raw states
 * do not say is *why a gap is even possible*, and that reason differs
 * fundamentally between the cited products:
 *
 *  - NDVI (MOD13A3) is an *optical* satellite index: a value only exists where
 *    the sensor got a clear, sunlit, snow-free view of the surface. Cloud,
 *    aerosol, low solar elevation, and snow routinely leave a monthly composite
 *    with missing or spatially reduced coverage. A `no-data` month or a low
 *    `validFraction` for NDVI is an *expected, physically-caused* consequence of
 *    observability — not a product defect.
 *  - Rainfall and soil moisture (GLDAS_NOAH025_M) and air temperature
 *    (M2TMNXSLV, MERRA-2) are produced by numerical *models / reanalysis*: the
 *    field is integrated forward for every land cell every month and does not
 *    depend on a clear-sky view, so it is gap-free by construction over its
 *    domain. If such a field is ever missing, that points to the land/ocean mask
 *    or an ingestion failure — *not* to observability.
 *
 * So the same `no-data` state means different things depending on the signal:
 * routine for an observation-gated optical product, but anomalous (worth
 * checking) for a model-continuous field that should always resolve over land.
 * This helper classifies each signal's gap mechanism and, for signals that are
 * actually `no-data`, flags whether that gap is expected or anomalous.
 *
 * The gap mechanism is a fixed property of the cited *product*, so — like
 * observation modality and temporal aggregation — this keys on the source short
 * name. It is a distinct axis, though: modality says HOW a value was produced
 * (remote-sensing vs model), coverage adequacy says HOW MUCH of the area was
 * usable, and this says WHY a value may be absent or partial in the first place,
 * and whether the brief's own missing states are routine or surprising.
 *
 * It reports provenance structure only. It never combines the values, weights
 * them, attributes any specific gap to a specific cause, or infers any
 * condition, risk, causation, or forecast — the brief's shared method limits
 * still hold. Naming cloud / sun / snow as the *class* of cause for an
 * observation-gated gap is a statement about the product's observing physics,
 * not a claim about what happened in any particular pixel or month (the
 * product's own QA mask is the authority on that).
 */

export type GapMechanism =
  /**
   * Value exists only with a clear, sunlit, snow-free view (e.g. optical NDVI);
   * cloud / aerosol / low sun / snow cause expected data gaps and reduced
   * coverage.
   */
  | "observation-gated"
  /**
   * Field is model/reanalysis-integrated for every land cell every month and is
   * gap-free by construction over its domain (e.g. GLDAS, MERRA-2); a gap points
   * to the land/ocean mask or ingestion, not observability.
   */
  | "model-continuous"
  /** Product absent from the gap-mechanism table; never guessed. */
  | "unclassified";

interface MechanismInfo {
  /** Short human phrase for a statement, e.g. "gap-free model/reanalysis field". */
  description: string;
  /**
   * True when a data gap is an *expected* consequence of observing physics
   * (clear-sky/sunlit/snow-free dependence). False for a model-continuous field
   * (a gap is anomalous) and for `unclassified` (never asserted).
   */
  gapProne: boolean;
  /**
   * The typical *class* of cause for a gap in this mechanism, for an honest
   * statement. Never an attribution of any specific gap to a specific cause.
   */
  typicalGapCause: string;
}

const MECHANISM_INFO: Record<GapMechanism, MechanismInfo> = {
  "observation-gated": {
    description: "observation-gated optical product",
    gapProne: true,
    typicalGapCause: "cloud, aerosol, low solar elevation, or snow",
  },
  "model-continuous": {
    description: "gap-free model/reanalysis field",
    gapProne: false,
    typicalGapCause: "the land/ocean mask or an ingestion failure",
  },
  unclassified: {
    description: "unclassified product",
    gapProne: false,
    typicalGapCause: "an unasserted cause",
  },
};

/**
 * Gap mechanism keyed by the cited product's short name. The DOI and short name
 * uniquely name a published product; whether a value depends on a clear-sky view
 * is a fixed property of that product's observing system, so this table is the
 * single place each brief product's gap mechanism is asserted. A product not
 * listed here resolves to `unclassified` — its gap mechanism is never inferred
 * from a value or a status.
 */
const PRODUCT_MECHANISM: Record<string, GapMechanism> = {
  // MODIS/Terra Vegetation Indices Monthly: optical index, clear-sky/sunlit
  // views only; the compositing window screens cloud and other bad views, so a
  // month can still be missing or partially covered.
  MOD13A3: "observation-gated",
  // GLDAS Noah Land Surface Model L4 monthly: modelled precipitation and soil
  // moisture on every land cell; gap-free by construction over land.
  GLDAS_NOAH025_M: "model-continuous",
  // MERRA-2 monthly single-level diagnostics: reanalysis 2 m air temperature on
  // every cell; gap-free by construction.
  M2TMNXSLV: "model-continuous",
};

/**
 * How an actual `no-data` state reads against the signal's gap mechanism. Only
 * meaningful for a `no-data` signal; every other status carries "not-applicable"
 * because it is not a data gap (an unpublished or malformed observation is a
 * different axis, handled by currency and completeness).
 */
export type NoDataExpectedness =
  /** `no-data` on an observation-gated product: a routine, expected optical gap. */
  | "expected"
  /**
   * `no-data` on a model-continuous field: anomalous — the field should resolve
   * over land, so this points to the mask or ingestion, worth checking.
   */
  | "anomalous"
  /** `no-data` on an unclassified product: expectedness is not asserted. */
  | "unassessed"
  /** Signal is not `no-data`, so gap expectedness does not apply. */
  | "not-applicable";

/** One signal classified by its data-gap mechanism and any actual-gap reading. */
export interface SignalObservabilityGating {
  id: EnvironmentSignalId;
  label: string;
  status: EnvironmentSignalStatus;
  source: DatasetRef;
  mechanism: GapMechanism;
  /** True when a data gap is an expected consequence of observing physics. */
  gapProne: boolean;
  /** Reading of an actual `no-data` state against the mechanism (see the type). */
  noDataExpectedness: NoDataExpectedness;
  /** Honest, source-carrying sentence; no condition, cause, or value claim. */
  statement: string;
}

export interface ObservabilityGatingSummary {
  kind: "observability-gating";
  /** Signals assessed (all by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal gap-mechanism classifications, in signal order. */
  signals: SignalObservabilityGating[];
  /** Count of considered signals in each mechanism (zeros included). */
  mechanismCounts: Record<GapMechanism, number>;
  /** Considered signals whose gaps are expected (observation-gated). */
  observationGatedCount: number;
  /** Considered signals whose product is not in the mechanism table. */
  unclassifiedCount: number;
  /**
   * Ids of signals that are actually `no-data` AND model-continuous — an
   * anomalous gap in a field that should resolve over land, worth checking.
   * Empty when no such signal is present.
   */
  anomalousGapSignalIds: EnvironmentSignalId[];
  /** True when every considered signal shares one gap mechanism. */
  homogeneous: boolean;
  /** Honest one-line gap-mechanism statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface ObservabilityGatingOptions {
  /**
   * Which signals to classify. "all" (default) considers every signal, because
   * the point of this descriptor is to interpret *missing* states too — the
   * `no-data` signals are exactly the ones whose gap mechanism a reader needs.
   * "available" restricts to signals carrying a usable observation, describing
   * only the gap susceptibility of the evidence actually shown.
   */
  include?: "available" | "all";
}

const GATING_LIMITS = [
  "The gap mechanism is a fixed property of the cited source product's observing system, not of any individual value.",
  "An observation-gated gap's typical cause (cloud, sun angle, snow) is the product's observing physics, not an attribution of any specific gap to a specific cause; the product's QA mask is the authority on that.",
  "A model-continuous field is gap-free by construction over its domain; an actual gap in one points to the land/ocean mask or ingestion, never to observability.",
  "A product absent from the mechanism table is reported as unclassified, never inferred from its value or status.",
];

/**
 * Look up a product's data-gap mechanism by its short name, returning
 * "unclassified" for any product not in the table so a mechanism is never
 * silently invented for an unknown source.
 */
export function classifyGapMechanism(source: DatasetRef): GapMechanism {
  return PRODUCT_MECHANISM[source.shortName] ?? "unclassified";
}

/**
 * Read an actual signal status against its gap mechanism. Only a `no-data`
 * status is a data gap; for it, an observation-gated product's gap is expected
 * and a model-continuous field's gap is anomalous. Every other status is a
 * different axis and returns "not-applicable".
 */
export function classifyNoDataExpectedness(
  status: EnvironmentSignalStatus,
  mechanism: GapMechanism
): NoDataExpectedness {
  if (status !== "no-data") return "not-applicable";
  if (mechanism === "observation-gated") return "expected";
  if (mechanism === "model-continuous") return "anomalous";
  return "unassessed";
}

/**
 * Classify each brief signal by *why* a value could be absent or spatially
 * reduced — an expected optical observability gap versus a gap-free model field —
 * and flag any actual `no-data` state as routine or anomalous accordingly. This
 * gives the brief's own missing and low-coverage states the right interpretive
 * frame without touching the values themselves.
 */
export function summarizeObservabilityGating(
  signals: readonly EnvironmentSignalBrief[],
  options?: ObservabilityGatingOptions
): ObservabilityGatingSummary {
  const include = options?.include ?? "all";
  const considered = signals.filter((signal) =>
    include === "available" ? signal.status === "available" : true
  );

  const classified: SignalObservabilityGating[] = considered.map((signal) => {
    const mechanism = classifyGapMechanism(signal.source);
    const info = MECHANISM_INFO[mechanism];
    const noDataExpectedness = classifyNoDataExpectedness(
      signal.status,
      mechanism
    );
    return {
      id: signal.id,
      label: signal.label,
      status: signal.status,
      source: signal.source,
      mechanism,
      gapProne: info.gapProne,
      noDataExpectedness,
      statement: signalStatement(
        signal.label,
        signal.source,
        mechanism,
        info,
        noDataExpectedness
      ),
    };
  });

  const mechanismCounts = countMechanisms(classified);
  const observationGatedCount = mechanismCounts["observation-gated"];
  const unclassifiedCount = mechanismCounts.unclassified;
  const anomalousGapSignalIds = classified
    .filter((s) => s.noDataExpectedness === "anomalous")
    .map((s) => s.id);
  const distinctMechanisms = MECHANISMS.filter(
    (mechanism) => mechanismCounts[mechanism] > 0
  ).length;

  return {
    kind: "observability-gating",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    mechanismCounts,
    observationGatedCount,
    unclassifiedCount,
    anomalousGapSignalIds,
    homogeneous: classified.length >= 1 && distinctMechanisms === 1,
    statement: gatingStatement(
      classified.length,
      mechanismCounts,
      anomalousGapSignalIds,
      unclassifiedCount
    ),
    limits: GATING_LIMITS,
  };
}

/** Fixed mechanism order for reporting, so none is silently dropped. */
const MECHANISMS: readonly GapMechanism[] = [
  "observation-gated",
  "model-continuous",
  "unclassified",
];

function countMechanisms(
  signals: readonly SignalObservabilityGating[]
): Record<GapMechanism, number> {
  const counts = Object.fromEntries(
    MECHANISMS.map((mechanism) => [mechanism, 0])
  ) as Record<GapMechanism, number>;
  for (const signal of signals) counts[signal.mechanism] += 1;
  return counts;
}

function signalStatement(
  label: string,
  source: DatasetRef,
  mechanism: GapMechanism,
  info: MechanismInfo,
  noDataExpectedness: NoDataExpectedness
): string {
  const src = sourceLabel(source);
  const base = `${label}: ${info.description} (${mechanism})`;

  if (mechanism === "unclassified") {
    return `${base}; gap mechanism not asserted; source ${src}.`;
  }

  const gapClause = info.gapProne
    ? `data gaps and reduced coverage are expected (typically ${info.typicalGapCause})`
    : `gap-free by construction over its domain (a gap would point to ${info.typicalGapCause})`;

  if (noDataExpectedness === "expected") {
    return `${base}; currently no-data — a routine, expected observability gap (${info.typicalGapCause}); source ${src}.`;
  }
  if (noDataExpectedness === "anomalous") {
    return `${base}; currently no-data — anomalous for a gap-free field, pointing to ${info.typicalGapCause}, worth checking; source ${src}.`;
  }
  return `${base}; ${gapClause}; source ${src}.`;
}

function gatingStatement(
  consideredCount: number,
  mechanismCounts: Record<GapMechanism, number>,
  anomalousGapSignalIds: readonly EnvironmentSignalId[],
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No signals to classify by data-gap mechanism.";
  }

  const noun = consideredCount === 1 ? "signal" : "signals";
  const breakdown = mechanismBreakdown(mechanismCounts);
  const gated = mechanismCounts["observation-gated"];
  const model = mechanismCounts["model-continuous"];

  const clauses: string[] = [];
  if (gated > 0) {
    const verb = gated === 1 ? "is an" : "are";
    const productWord =
      gated === 1 ? "optical product whose" : "optical products whose";
    clauses.push(
      `${gated} ${verb} observation-gated ${productWord} data gaps and reduced coverage are expected consequences of cloud, sun angle, or snow, not product defects`
    );
  }
  if (model > 0) {
    const verb = model === 1 ? "is a" : "are";
    const fieldWord = model === 1 ? "field" : "fields";
    clauses.push(
      `${model} ${verb} model-continuous ${fieldWord} gap-free by construction over their domain`
    );
  }
  const mechanismClause =
    clauses.length > 0
      ? clauses.join(", and ")
      : "no considered signal is in the mechanism table, so their gap mechanism is not asserted";

  const anomalousClause =
    anomalousGapSignalIds.length > 0
      ? ` ${anomalousGapSignalIds.length} model-continuous ${anomalousGapSignalIds.length === 1 ? "signal is" : "signals are"} currently no-data (${anomalousGapSignalIds.join(", ")}) — anomalous for a gap-free field and worth checking.`
      : "";

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified product${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} ${noun}: ${breakdown}; ${mechanismClause}.${anomalousClause}${unclassifiedClause}`;
}

/** Non-zero mechanism counts in fixed order, e.g. "1 observation-gated, 3 model-continuous". */
function mechanismBreakdown(
  mechanismCounts: Record<GapMechanism, number>
): string {
  return MECHANISMS.filter((mechanism) => mechanismCounts[mechanism] > 0)
    .map((mechanism) => `${mechanismCounts[mechanism]} ${mechanism}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
