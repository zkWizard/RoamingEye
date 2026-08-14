import { LAYERS, type DatasetRef, type LayerId } from "./timeline";

/**
 * Provenance-first observing-constraint descriptor for the cited MODIS/Terra
 * monthly vegetation-index product.
 *
 * The probe summarizes a sampled record as `min · mean · max · trend`. Sea
 * surface temperature and land surface temperature each already say which
 * moments of the month those statistics describe (see
 * `probeSstSamplingGateClause` and `probeLstSamplingGateClause`); the two
 * vegetation layers said nothing, even though their monthly value is the one
 * reduction in the app that is not an average at all. A multi-year mean and a
 * fitted trend inherit the identical gate, and — unlike the rendered-floor
 * censoring reported beside them — nothing in the values themselves hints at it.
 *
 * The rendered layers are `MODIS_Terra_L3_NDVI_Monthly` and
 * `MODIS_Terra_L3_EVI_Monthly`, both drawn from MOD13A3, and their answer is
 * narrower than "the greenness that month":
 *
 *  - Both indices are **reflectance ratios in the red and near-infrared**, so an
 *    observation only exists where the sensor got a clear, sunlit, snow-free
 *    view. Cloud, cloud shadow, heavy aerosol, low solar elevation and snow
 *    leave a day out of the record rather than averaging it in. (This is the
 *    same observing physics `observabilityGating` classifies as
 *    `observation-gated`; here it is asserted for the probe's own statistics.)
 *  - Each compositing window is reduced by a **constrained-view maximum-value
 *    composite**: among the eligible observations the algorithm keeps the one
 *    with the highest NDVI, taking view angle into account, rather than
 *    averaging them. The rule exists because the contaminations that survive
 *    screening — thin cloud, shadow, residual aerosol, off-nadir viewing — all
 *    *depress* the index, so the maximum is the least contaminated candidate.
 *  - The monthly value is therefore a **within-month composite built from those
 *    selections**, not a time-average of the month's days. `temporalAggregation`
 *    already classifies MOD13A3 this way for the environment brief; the probe's
 *    own mean and trend average selected within-month states.
 *
 * Each is a fixed, documented property of the product's compositing algorithm,
 * so — like `sstObservingConstraints` and `lstObservingConstraints` — this
 * module is the single place they are asserted, and it asserts them for one
 * product only.
 *
 * **NDVI and EVI do not inherit the same selection claim**, which is the one
 * substantive difference between the two layers here. The compositing decision
 * is made on NDVI; the observation it keeps then supplies that window's EVI as
 * well. So for NDVI the kept value cannot sit below the average of the
 * candidates it was chosen from — that is the selection rule restated, not an
 * estimate — while for EVI the kept value is a selected observation that was
 * never itself maximized, and no such inequality holds. The direction is
 * asserted for NDVI and left unasserted for EVI for exactly that reason.
 *
 * Deliberately **not** asserted here:
 *  - Any magnitude, for either layer. How far a composite sits above the mean of
 *    its candidates depends on how many were eligible and how contaminated they
 *    were, neither of which this app observes.
 *  - Any direction for EVI, and none for the clear-sky or composite constraints
 *    on either layer. The inequality that fixes NDVI's sign is a property of the
 *    selection rule; nothing fixes a sign for the others.
 *  - Which window a probed month's value came from, or which day within it.
 *  - Anything about vegetation cover, biomass, condition, habitat, ecological
 *    health, drought, causation, or any future value. These are statements about
 *    a compositing algorithm.
 *
 * References:
 * Holben, B. N. (1986). Characteristics of maximum-value composite images from
 * temporal AVHRR data. International Journal of Remote Sensing, 7(11),
 * 1417–1434.
 * Huete, A., Didan, K., Miura, T., Rodriguez, E. P., Gao, X. & Ferreira, L. G.
 * (2002). Overview of the radiometric and biophysical performance of the MODIS
 * vegetation indices. Remote Sensing of Environment, 83(1-2), 195–213.
 */

/** The two layers these constraints are asserted for, and only them. */
export const VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS = [
  "ndvi",
  "evi",
] as const;

export type VegetationObservingConstraintLayerId =
  (typeof VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS)[number];

function citedSource(id: VegetationObservingConstraintLayerId): DatasetRef {
  const source = LAYERS[id].dataset;
  if (!source) {
    throw new Error(
      "RoamingEye: the vegetation-index layers must retain a cited dataset"
    );
  }
  return source;
}

/** The cited product per layer, taken from the layer rather than restated. */
export const VEGETATION_OBSERVING_CONSTRAINT_SOURCES: Record<
  VegetationObservingConstraintLayerId,
  DatasetRef
> = {
  ndvi: citedSource("ndvi"),
  evi: citedSource("evi"),
};

export type VegetationObservingConstraintId =
  /** An optical index needs a clear, sunlit, snow-free view to exist at all. */
  | "clear-sky-optical-only"
  /** The compositing window keeps a selected observation, never their average. */
  | "maximum-value-selection"
  /** The published month is a composite of selections, not a time-average. */
  | "composite-not-monthly-mean";

/**
 * Direction in which a monthly value may sit relative to the quantity a reader
 * is likely to assume it is.
 *
 * Only `maximum-value-selection` on NDVI carries one, and it is not a physical
 * estimate: a maximum cannot fall below the mean of the candidates it was drawn
 * from, so the sign is the selection rule restated. Every other entry is
 * `not-asserted`. The union is written open so a future product change can add a
 * sign without reshaping the type.
 */
export type VegetationSamplingDirection =
  "green-leaning" | "sparse-leaning" | "not-asserted";

export interface VegetationObservingConstraint {
  id: VegetationObservingConstraintId;
  /** What the product's compositing algorithm does; a property of the product. */
  constraint: string;
  /** What that means for reading one monthly value; never a magnitude. */
  implication: string;
  /** Sign only, and only where the selection rule fixes it. */
  direction: VegetationSamplingDirection;
  /**
   * The same constraint compressed to a status-line fragment. The probe note is
   * built by joining these rather than restating them, so the constraint and the
   * phrase the user reads cannot drift apart.
   */
  shortForm: string;
}

/** Shared by both layers: whether the sensor could see the surface at all. */
const CLEAR_SKY_CONSTRAINT: VegetationObservingConstraint = {
  id: "clear-sky-optical-only",
  constraint:
    "a reflectance ratio in the red and near-infrared, so only observations with a clear, sunlit, snow-free view of the surface are eligible",
  implication:
    "cloudy, shadowed, low-sun and snow-covered days are left out of the month rather than averaged into it",
  direction: "not-asserted",
  shortForm: "clear, sunlit days only",
};

/** Shared by both layers: what the published monthly number therefore is. */
const COMPOSITE_CONSTRAINT: VegetationObservingConstraint = {
  id: "composite-not-monthly-mean",
  constraint:
    "published as a within-month composite built from those selected observations, not as a time-average of the month's days",
  implication:
    "a probed month is a selected within-month state, so the mean and trend beside it average selected states rather than monthly means",
  direction: "not-asserted",
  shortForm: "a within-month composite, not a monthly mean",
};

/**
 * The three constraints per layer, in the order a reader meets them: whether the
 * product could see, which observation it kept, and what the month's published
 * value therefore is. Only the middle one differs between the layers — see the
 * module comment on why EVI carries no direction.
 */
export const VEGETATION_OBSERVING_CONSTRAINTS: Record<
  VegetationObservingConstraintLayerId,
  readonly VegetationObservingConstraint[]
> = {
  ndvi: [
    CLEAR_SKY_CONSTRAINT,
    {
      id: "maximum-value-selection",
      constraint:
        "reduced by a constrained-view maximum-value composite, which keeps the eligible observation with the highest NDVI rather than averaging them, because the contamination that survives screening depresses the index",
      implication:
        "the kept value cannot sit below the average of the candidates it was chosen from; that is the selection rule restated, not an estimated offset",
      direction: "green-leaning",
      shortForm:
        "each compositing window keeps its highest eligible NDVI, not their average",
    },
    COMPOSITE_CONSTRAINT,
  ],
  evi: [
    CLEAR_SKY_CONSTRAINT,
    {
      id: "maximum-value-selection",
      constraint:
        "reduced by the same constrained-view maximum-value composite, whose selection is made on NDVI; the observation it keeps then supplies that window's EVI",
      implication:
        "the kept value is a selected observation rather than an average, but it was never itself maximized, so no inequality against the candidates' average holds",
      direction: "not-asserted",
      shortForm:
        "each compositing window is selected on NDVI and supplies its EVI, not an EVI maximum",
    },
    COMPOSITE_CONSTRAINT,
  ],
};

export const VEGETATION_OBSERVING_CONSTRAINT_LIMITS = [
  "These are fixed properties of the cited product's compositing algorithm, not properties of any individual value, month or place.",
  "No magnitude is asserted; how far a composite sits above the average of its candidates depends on how many were eligible and how contaminated they were, neither of which this app observes.",
  "A direction is asserted only for NDVI's selection, and only because a maximum cannot fall below the mean of the candidates it was drawn from. EVI's selection is made on NDVI, so no such inequality holds for it.",
  "Which compositing window a probed month drew from, and which day within it, are not asserted.",
  "The rendered floor, native grid size and inversion accuracy are separate axes, reported by the rendered-range, spatial-support and measured-inversion descriptors, not here.",
  "A vegetation index is a reflectance ratio; these constraints carry no claim about vegetation cover, biomass, condition, habitat, ecological health, drought, causation, or any future value.",
] as const;

/**
 * The shortest honest phrase that keeps a displayed monthly value from being
 * read as an all-weather monthly average of greenness. Built from the
 * constraints above so the two cannot drift. Intended to sit inside an existing
 * provenance line rather than occupy its own row.
 */
export const VEGETATION_SAMPLING_GATE_NOTES: Record<
  VegetationObservingConstraintLayerId,
  string
> = {
  ndvi: VEGETATION_OBSERVING_CONSTRAINTS.ndvi
    .map((e) => e.shortForm)
    .join("; "),
  evi: VEGETATION_OBSERVING_CONSTRAINTS.evi.map((e) => e.shortForm).join("; "),
};

function isConstrainedLayer(
  layerId: LayerId | undefined
): layerId is VegetationObservingConstraintLayerId {
  return (
    layerId !== undefined &&
    (VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS as readonly string[]).includes(
      layerId
    )
  );
}

/**
 * The sampling gate as a probe status-line clause, or `""` when it does not
 * apply.
 *
 * This is the product's compositing algorithm, not a property of the sampled
 * months, so it is not derived from them: `hasReportedStatistics` only asks
 * whether a statistic is on screen for the note to qualify. Returns `""` for
 * every layer but the two vegetation-index ones and for a record that reported
 * none, leaving an ordinary readout — and every other layer's — byte-identical.
 */
export function probeVegetationSamplingGateClause(
  layerId: LayerId | undefined,
  hasReportedStatistics: boolean
): string {
  if (!isConstrainedLayer(layerId)) return "";
  return hasReportedStatistics ? VEGETATION_SAMPLING_GATE_NOTES[layerId] : "";
}
