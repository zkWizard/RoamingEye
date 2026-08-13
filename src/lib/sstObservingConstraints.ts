import { LAYERS, type DatasetRef, type LayerId } from "./timeline";

/**
 * Provenance-first observing-constraint descriptor for the cited MODIS/Aqua
 * monthly sea-surface-temperature product.
 *
 * Every other SST descriptor in this repo answers a question about the *value*
 * that was sampled: `oceanConditions` gives it a descriptive band,
 * `marineCoverage` reports what share of the footprint returned usable pixels,
 * and `spatialSupport` reports the size of the native grid cell it was averaged
 * onto. None of them answer the question a marine reader actually needs before
 * using the number: *which moments, and which water, does this monthly value
 * represent?*
 *
 * The cited product answers that in its own name — "MODIS Aqua L3 SST Thermal
 * IR Monthly 9km **Daytime**" — and the answer is narrower than "the sea
 * surface temperature that month":
 *
 *  - It is built from the **daytime** overpass only. Aqua crosses the equator
 *    in the early afternoon, so the retrievals composited into a monthly value
 *    are drawn from near the daily maximum of the diurnal cycle, not spread
 *    across it. A monthly mean of daytime retrievals is therefore not a monthly
 *    mean of sea-surface temperature.
 *  - It is a **thermal-infrared** retrieval, and thermal infrared does not pass
 *    through cloud. Only cloud-screened days contribute, so a monthly composite
 *    averages a non-random subset of that month's days — in a persistently
 *    cloudy regime, its atypically clear ones.
 *  - It is a **radiometric temperature of the ocean's surface layer**. It is not
 *    an in-situ measurement at depth and not a depth-integrated profile, so it
 *    does not describe the water an organism below the surface layer occupies.
 *
 * Each of those is a fixed, documented property of the product's observing
 * system, so — like the gap mechanism in `observabilityGating` — this module is
 * the single place they are asserted, and it asserts them for one product only.
 *
 * Deliberately **not** asserted here:
 *  - Any magnitude. The size of a daytime-versus-daily-mean offset depends on
 *    wind, insolation, and mixing, none of which this app observes. Only the
 *    *direction* is named, and only where the observing geometry fixes it.
 *  - Any clear-sky sampling direction. Whether a month's cloud-free days run
 *    warmer or cooler than its cloudy ones is regime-dependent — the same
 *    screening that favours calm sunlit days in one basin coincides with
 *    upwelling in another — so the direction is reported as not asserted rather
 *    than guessed.
 *  - Anything biological. These are statements about an instrument and an
 *    orbit. They carry no claim about organisms, habitat, ecosystem condition,
 *    thermal stress, causation, or any future value.
 */

/** The one layer these constraints are asserted for, and only it. */
export const SST_OBSERVING_CONSTRAINT_LAYER_ID = "sst" as const;

const sstSource = LAYERS[SST_OBSERVING_CONSTRAINT_LAYER_ID].dataset;
if (!sstSource) {
  throw new Error("RoamingEye: the SST layer must retain a cited dataset");
}

/** The cited product these constraints are asserted for, and only for it. */
export const SST_OBSERVING_CONSTRAINT_SOURCE: DatasetRef = sstSource;

export type SstObservingConstraintId =
  /** Composited from the daytime overpass only, near the diurnal maximum. */
  | "daytime-overpass-only"
  /** Thermal infrared retrieves only through cloud-free sky. */
  | "clear-sky-retrieval-only"
  /** A radiometric surface-layer temperature, not an at-depth measurement. */
  | "near-surface-radiometric";

/**
 * Direction in which a monthly value may sit relative to the quantity a reader
 * is likely to assume it is (a full-diurnal, all-weather, at-depth temperature).
 *
 * `warm-leaning` is asserted only where the observing geometry fixes the sign —
 * sampling near the diurnal maximum cannot lean cool. Magnitude is never
 * asserted: it depends on wind, insolation, and mixing that this app does not
 * observe. Where the sign is regime-dependent, it is `not-asserted`.
 */
export type SstSamplingDirection = "warm-leaning" | "not-asserted";

export interface SstObservingConstraint {
  id: SstObservingConstraintId;
  /** What the product's observing system does; a property of the product. */
  constraint: string;
  /** What that means for reading one monthly value; never a magnitude. */
  implication: string;
  /** Sign only, and only where observing geometry fixes it. */
  direction: SstSamplingDirection;
}

/**
 * The three constraints, in the order a reader meets them: when the product
 * looks, whether it can see, and what it is looking at.
 */
export const SST_OBSERVING_CONSTRAINTS: readonly SstObservingConstraint[] = [
  {
    id: "daytime-overpass-only",
    constraint:
      "composited from Aqua's daytime overpass only, which samples near the daily maximum of the diurnal cycle",
    implication:
      "a monthly mean of daytime retrievals is not a monthly mean sea-surface temperature",
    direction: "warm-leaning",
  },
  {
    id: "clear-sky-retrieval-only",
    constraint:
      "retrieved in the thermal infrared, which does not pass through cloud, so only cloud-screened days contribute",
    implication:
      "a monthly value averages a non-random subset of that month's days, not all of them",
    direction: "not-asserted",
  },
  {
    id: "near-surface-radiometric",
    constraint:
      "a radiometric temperature of the ocean's surface layer, not an in-situ or depth-integrated measurement",
    implication:
      "it does not describe the water below the surface layer, and is not interchangeable with an at-depth reading",
    direction: "not-asserted",
  },
] as const;

export const SST_OBSERVING_CONSTRAINT_LIMITS = [
  "These are fixed properties of the cited product's observing system, not properties of any individual value or month.",
  "No offset magnitude is asserted; a daytime-versus-daily-mean difference depends on wind, insolation, and mixing that this app does not observe.",
  "A direction is asserted only where the observing geometry fixes its sign; a regime-dependent sign is reported as not asserted.",
  "Native grid size is a separate axis, reported by the spatial-support descriptor, not here.",
  "Sea surface temperature is a physical observation; these constraints carry no claim about organisms, habitat, ecosystem condition, causation, or any future value.",
] as const;

export interface SstObservingConstraintsSummary {
  kind: "sea-surface-temperature-observing-constraints";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "product-observing-system-only";
  /** Prevents these constraints from being mistaken for biology data. */
  marineBiologyObservation: false;
  source: DatasetRef;
  constraints: readonly SstObservingConstraint[];
  /**
   * False for this product: the monthly composite is daytime- and clear-sky-
   * gated, so it does not represent every moment of the month.
   */
  representsFullDiurnalCycle: false;
  /** Constraints whose sign the observing geometry fixes; may be empty. */
  directionalConstraintIds: SstObservingConstraintId[];
  /** Honest, source-carrying sentence, ready for a screen reader. */
  statement: string;
  limits: typeof SST_OBSERVING_CONSTRAINT_LIMITS;
}

/**
 * Describe what the cited monthly SST product's observing system does and does
 * not sample. This takes no observation: the constraints hold for every value
 * the product publishes, so applying them to one month would imply they were
 * derived from it.
 */
export function summarizeSstObservingConstraints(): SstObservingConstraintsSummary {
  return {
    kind: "sea-surface-temperature-observing-constraints",
    isForecast: false,
    claimScope: "product-observing-system-only",
    marineBiologyObservation: false,
    source: SST_OBSERVING_CONSTRAINT_SOURCE,
    constraints: SST_OBSERVING_CONSTRAINTS,
    representsFullDiurnalCycle: false,
    directionalConstraintIds: SST_OBSERVING_CONSTRAINTS.filter(
      (entry) => entry.direction !== "not-asserted"
    ).map((entry) => entry.id),
    statement: sstObservingConstraintStatement(),
    limits: SST_OBSERVING_CONSTRAINT_LIMITS,
  };
}

function sstObservingConstraintStatement(): string {
  const clauses = SST_OBSERVING_CONSTRAINTS.map(
    (entry) => `${entry.constraint} — ${entry.implication}`
  ).join("; ");
  return `Sea-surface-temperature observing constraints: this product is ${clauses}. Source: ${SST_OBSERVING_CONSTRAINT_SOURCE.shortName} v${SST_OBSERVING_CONSTRAINT_SOURCE.version}. These describe the product's observing system, not any marine-biological condition.`;
}

/**
 * The shortest honest phrase that keeps a displayed monthly value from being
 * read as a full-diurnal, all-weather sea-surface temperature. Intended to sit
 * inside an existing provenance line rather than occupy its own row.
 */
export const SST_SAMPLING_GATE_NOTE =
  "daytime clear-sky monthly composite, not a full-diurnal mean";

/**
 * The sampling gate as a probe status-line clause, or `""` when it does not
 * apply.
 *
 * The probe summarizes a sampled record as `min · mean · max · trend`. Every one
 * of those statistics is computed from daytime, cloud-screened retrievals alone,
 * so a reader who takes the mean for "the mean sea-surface temperature over this
 * record" has a different quantity than the one that was sampled — and unlike
 * the ramp censoring reported beside it, nothing in the values themselves hints
 * at the gate. The place panel already states this for its single-month boundary
 * reading (see marinePlaceInsight); a multi-year mean and a fitted trend inherit
 * the same gate and were saying nothing about it.
 *
 * This is the product's observing system, not a property of the sampled months,
 * so it is not derived from them: `hasReportedStatistics` only asks whether a
 * statistic is on screen for the note to qualify. Returns `""` for every layer
 * but SST and for a record that reported none, leaving an ordinary readout — and
 * every other layer's — byte-identical.
 */
export function probeSstSamplingGateClause(
  layerId: LayerId | undefined,
  hasReportedStatistics: boolean
): string {
  if (layerId !== SST_OBSERVING_CONSTRAINT_LAYER_ID) return "";
  return hasReportedStatistics ? SST_SAMPLING_GATE_NOTE : "";
}

/**
 * Surface forms that count as stating a constraint in the rendered caption, or
 * `null` for a constraint the caption is not required to carry.
 *
 * Only the two *sampling gates* are required. They are the constraints that
 * decide which moments of the month contribute at all, so a caption that omits
 * one describes a mean over days that never entered the composite. The third
 * constraint is about what the instrument senses rather than when, the caption
 * already names the retrieval as thermal, and it is stated in full on the probe
 * status line, the place card and the exported CSV — a one-sentence caption has
 * no room for every qualifier, and pretending otherwise would push the useful
 * ones out.
 *
 * Keyed by `SstObservingConstraintId` on purpose: adding a fourth constraint
 * fails to compile until someone decides whether the caption must carry it.
 */
const SST_CAPTION_CONSTRAINT_PHRASES: Record<
  SstObservingConstraintId,
  readonly string[] | null
> = {
  "daytime-overpass-only": ["daytime", "day-time", "daylight"],
  "clear-sky-retrieval-only": [
    "clear-sky",
    "clear sky",
    "cloud-free",
    "cloud free",
    "cloud-screened",
  ],
  "near-surface-radiometric": null,
};

/** A sampling gate the rendered caption fails to state. */
export interface SstCaptionOmission {
  layerId: typeof SST_OBSERVING_CONSTRAINT_LAYER_ID;
  constraintId: SstObservingConstraintId;
  /** The product property the caption left out, verbatim from the table. */
  constraint: string;
  /** What omitting it lets a reader assume, verbatim from the table. */
  implication: string;
  reason: string;
}

/**
 * Report every sampling gate the SST caption fails to state.
 *
 * `Legend` renders `LAYERS.sst.description` verbatim under the globe and
 * `LayerSelector` uses it as the option tooltip, so that one sentence is the
 * most-read claim the app makes about this layer — and for most readers the
 * only one, since the probe and place surfaces need a gesture to reach. The
 * caption named the daytime overpass and stopped there, while the constraint
 * table beside it, `SST_SAMPLING_GATE_NOTE`, the place card, the probe status
 * line and the exported CSV all carry the clear-sky gate too. A caption that
 * states one of two co-equal gates reads as the complete qualification, which
 * is why this is a check and not a comment.
 *
 * Limits of the check (it is a copy audit, nothing more):
 *  - It matches declared surface forms. A clean audit means the caption states
 *    the *checked* gates; it is not evidence the caption is complete or that
 *    any other wording in it is accurate.
 *  - It reads only the caption. It cannot confirm what the layer renders, and
 *    it asserts no magnitude or direction for either gate — those stay where
 *    `SST_OBSERVING_CONSTRAINTS` puts them.
 *  - Nothing biological follows from a stated or an omitted gate.
 */
export function sstCaptionConstraintOmissions(
  caption: string = LAYERS[SST_OBSERVING_CONSTRAINT_LAYER_ID].description
): SstCaptionOmission[] {
  const haystack = caption.toLowerCase();
  return SST_OBSERVING_CONSTRAINTS.filter((entry) => {
    const phrases = SST_CAPTION_CONSTRAINT_PHRASES[entry.id];
    return phrases !== null && !phrases.some((p) => haystack.includes(p));
  }).map((entry) => ({
    layerId: SST_OBSERVING_CONSTRAINT_LAYER_ID,
    constraintId: entry.id,
    constraint: entry.constraint,
    implication: entry.implication,
    reason:
      "The caption is the most-read claim the app makes about this layer, and it is the only SST surface a reader meets without a gesture; a sampling gate left out of it reads as a gate that does not apply.",
  }));
}

/** One-line rendering of an omission, for a test failure message. */
export function formatSstCaptionOmission(omission: SstCaptionOmission): string {
  return `${omission.layerId}: caption omits ${omission.constraintId} — the product is ${omission.constraint}, so ${omission.implication}; ${omission.reason}`;
}
