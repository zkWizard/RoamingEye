import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first Earth-system-compartment (vertical-reference) descriptor for
 * a multi-signal environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature as
 * monthly observations for one place. Sampling them at a shared point invites a
 * reader to collapse the four values into a single "state at this point". But
 * each signal describes a different compartment of the Earth system, at a
 * different vertical reference relative to the ground surface:
 *
 *  - Air temperature (2 m) is a state of the *near-surface atmosphere*, above
 *    the ground.
 *  - Rainfall (precipitation rate) is an *atmosphere-to-surface water flux*
 *    accounted at the surface plane, not a stored quantity.
 *  - Vegetation (NDVI) is a property of the *vegetated land surface* (the
 *    reflective canopy) at the surface.
 *  - Soil moisture is water stored in the *subsurface soil column*, below the
 *    surface.
 *
 * So a "one place" brief spans the atmosphere above the ground, the surface, and
 * the soil below it — four different physical media, not one point-state. This
 * helper classifies each signal by its compartment and coarse vertical
 * reference so the signals are never silently read as describing the same patch
 * of matter.
 *
 * Unlike observation modality (`observationModality.ts`), which is a property of
 * the cited *product* (one product → one modality), a compartment is a property
 * of the geophysical *variable*: the two GLDAS fields (rainfall and soil
 * moisture) share a product and a DOI yet fall in different compartments. This
 * descriptor therefore keys on the signal, not the source. It is a companion to
 * modality (HOW produced), spatial support (native horizontal grid), and unit
 * commensurability (which dimension): a distinct axis describing WHICH part of
 * the Earth column — and which physical medium — the value belongs to.
 *
 * It reports provenance structure only. It never combines the values, weights
 * them, models any exchange between compartments, or infers any condition, flux
 * balance, causation, or forecast — the brief's shared method limits still hold.
 */

export type EarthSystemCompartment =
  /** Air state above the ground (e.g. 2 m air temperature). */
  | "near-surface-atmosphere"
  /** Atmosphere-to-surface flux accounted at the surface (e.g. precipitation). */
  | "surface-flux"
  /** Property of the vegetated land surface / canopy (e.g. NDVI). */
  | "land-surface"
  /** Water stored below the surface in the soil column (e.g. soil moisture). */
  | "subsurface-soil"
  /** Signal absent from the compartment table; never guessed. */
  | "unclassified";

/** Coarse position of the compartment relative to the ground surface. */
export type VerticalReference =
  "above-surface" | "at-surface" | "below-surface" | "unknown";

interface CompartmentInfo {
  /** Short human phrase for a statement, e.g. "subsurface soil column". */
  description: string;
  /** The coarse vertical reference this compartment sits at. */
  verticalReference: VerticalReference;
}

const COMPARTMENT_INFO: Record<EarthSystemCompartment, CompartmentInfo> = {
  "near-surface-atmosphere": {
    description: "near-surface atmosphere (air at 2 m)",
    verticalReference: "above-surface",
  },
  "surface-flux": {
    description: "atmosphere-to-surface water flux",
    verticalReference: "at-surface",
  },
  "land-surface": {
    description: "vegetated land surface (canopy)",
    verticalReference: "at-surface",
  },
  "subsurface-soil": {
    description: "subsurface soil column",
    verticalReference: "below-surface",
  },
  unclassified: {
    description: "unclassified compartment",
    verticalReference: "unknown",
  },
};

/**
 * Compartment keyed by the brief signal id. A compartment is a property of the
 * geophysical variable the signal reports, so it is asserted per signal here —
 * this is the single place each brief signal's compartment is declared. A signal
 * id absent from this table resolves to `unclassified`; a compartment is never
 * inferred from a value.
 */
const SIGNAL_COMPARTMENT: Record<EnvironmentSignalId, EarthSystemCompartment> =
  {
    vegetation: "land-surface",
    rainfall: "surface-flux",
    "soil-moisture": "subsurface-soil",
    "air-temperature": "near-surface-atmosphere",
  };

/** One signal classified by the Earth-system compartment it describes. */
export interface SignalCompartment {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  compartment: EarthSystemCompartment;
  verticalReference: VerticalReference;
  /** Honest, source-carrying sentence; no condition, flux, or value claim. */
  statement: string;
}

export interface SignalCompartmentSummary {
  kind: "signal-compartment";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal compartment classifications, in signal order. */
  signals: SignalCompartment[];
  /** Count of considered signals in each compartment (zeros included). */
  compartmentCounts: Record<EarthSystemCompartment, number>;
  /** Count of considered signals at each vertical reference (zeros included). */
  verticalReferenceCounts: Record<VerticalReference, number>;
  /** Number of distinct compartments among the considered signals. */
  distinctCompartmentCount: number;
  /** Number of distinct vertical references among the considered signals. */
  distinctVerticalReferenceCount: number;
  /** Considered signals whose id is not in the compartment table. */
  unclassifiedCount: number;
  /** True when every considered signal shares one compartment. */
  homogeneous: boolean;
  /**
   * True when the considered signals occupy above-, at-, and below-surface
   * references together — i.e. the brief samples the full vertical column.
   */
  spansFullColumn: boolean;
  /** Honest one-line compartment statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface SignalCompartmentOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because the compartment spread matters for
   * the values a reader would actually place at a point; "all" describes the
   * whole brief's compartment structure regardless of per-signal status.
   */
  include?: "available" | "all";
}

const COMPARTMENT_LIMITS = [
  "A compartment is a property of the geophysical variable, not the cited product: two signals from one product (GLDAS rainfall and soil moisture) fall in different compartments.",
  "The vertical reference is a coarse position relative to the ground surface (above / at / below), not a measured height or depth.",
  "This descriptor never combines the values or asserts any exchange, balance, or link between compartments.",
];

/**
 * Look up a signal's Earth-system compartment by its brief id, returning
 * "unclassified" for any id not in the table so a compartment is never silently
 * invented for an unknown signal.
 */
export function classifyCompartment(
  id: EnvironmentSignalId
): EarthSystemCompartment {
  return SIGNAL_COMPARTMENT[id] ?? "unclassified";
}

/**
 * Classify each brief signal by the Earth-system compartment it describes and
 * report how the considered signals spread across the vertical column. Signals
 * sharing a data month, a product, or a place can still describe different
 * physical media (air, a surface flux, the canopy, the soil), and this makes
 * that explicit without touching the values themselves.
 */
export function summarizeSignalCompartments(
  signals: readonly EnvironmentSignalBrief[],
  options?: SignalCompartmentOptions
): SignalCompartmentSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalCompartment[] = considered.map((signal) => {
    const compartment = classifyCompartment(signal.id);
    const info = COMPARTMENT_INFO[compartment];
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      compartment,
      verticalReference: info.verticalReference,
      statement: `${signal.label}: ${info.description} (${compartment}, ${info.verticalReference}); source ${sourceLabel(signal.source)}.`,
    };
  });

  const compartmentCounts = countCompartments(classified);
  const verticalReferenceCounts = countVerticalReferences(classified);
  const distinctCompartmentCount = COMPARTMENTS.filter(
    (compartment) => compartmentCounts[compartment] > 0
  ).length;
  const distinctVerticalReferenceCount = VERTICAL_REFERENCES.filter(
    (reference) => verticalReferenceCounts[reference] > 0
  ).length;
  const unclassifiedCount = compartmentCounts.unclassified;
  const spansFullColumn =
    verticalReferenceCounts["above-surface"] > 0 &&
    verticalReferenceCounts["at-surface"] > 0 &&
    verticalReferenceCounts["below-surface"] > 0;

  return {
    kind: "signal-compartment",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    compartmentCounts,
    verticalReferenceCounts,
    distinctCompartmentCount,
    distinctVerticalReferenceCount,
    unclassifiedCount,
    homogeneous: classified.length >= 1 && distinctCompartmentCount === 1,
    spansFullColumn,
    statement: compartmentStatement(
      classified.length,
      compartmentCounts,
      distinctCompartmentCount,
      spansFullColumn,
      unclassifiedCount
    ),
    limits: COMPARTMENT_LIMITS,
  };
}

/** Fixed compartment order for reporting, so none is silently dropped. */
const COMPARTMENTS: readonly EarthSystemCompartment[] = [
  "near-surface-atmosphere",
  "surface-flux",
  "land-surface",
  "subsurface-soil",
  "unclassified",
];

/** Fixed vertical-reference order, ground-up, for reporting. */
const VERTICAL_REFERENCES: readonly VerticalReference[] = [
  "above-surface",
  "at-surface",
  "below-surface",
  "unknown",
];

function countCompartments(
  signals: readonly SignalCompartment[]
): Record<EarthSystemCompartment, number> {
  const counts = Object.fromEntries(
    COMPARTMENTS.map((compartment) => [compartment, 0])
  ) as Record<EarthSystemCompartment, number>;
  for (const signal of signals) counts[signal.compartment] += 1;
  return counts;
}

function countVerticalReferences(
  signals: readonly SignalCompartment[]
): Record<VerticalReference, number> {
  const counts = Object.fromEntries(
    VERTICAL_REFERENCES.map((reference) => [reference, 0])
  ) as Record<VerticalReference, number>;
  for (const signal of signals) counts[signal.verticalReference] += 1;
  return counts;
}

function compartmentStatement(
  consideredCount: number,
  compartmentCounts: Record<EarthSystemCompartment, number>,
  distinctCompartmentCount: number,
  spansFullColumn: boolean,
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by Earth-system compartment.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = compartmentBreakdown(compartmentCounts);
  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified signal${plural(unclassifiedCount)} not asserted.`
      : "";

  if (distinctCompartmentCount === 1) {
    return `${consideredCount} usable ${noun} in 1 Earth-system compartment (${breakdown}); a single physical medium.${unclassifiedClause}`;
  }

  const columnClause = spansFullColumn
    ? ", spanning the full above-, at-, and below-surface column"
    : "";
  const compartmentWord =
    distinctCompartmentCount === 1 ? "compartment" : "compartments";
  return `${consideredCount} usable ${noun} across ${distinctCompartmentCount} Earth-system ${compartmentWord} (${breakdown})${columnClause}; the signals describe different physical media at different vertical references and are not a single point-state.${unclassifiedClause}`;
}

/** Non-zero compartment counts in fixed order, e.g. "1 land-surface, 1 subsurface-soil". */
function compartmentBreakdown(
  compartmentCounts: Record<EarthSystemCompartment, number>
): string {
  return COMPARTMENTS.filter(
    (compartment) => compartmentCounts[compartment] > 0
  )
    .map((compartment) => `${compartmentCounts[compartment]} ${compartment}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
