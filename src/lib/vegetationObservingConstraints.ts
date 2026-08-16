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

/**
 * The rendered GIBS layer each constraint set above is asserted for.
 *
 * Declared here so the export can refuse to speak if a layer is ever repointed:
 * the constraints are properties of MOD13A3's compositing algorithm, and an
 * exported file cannot be corrected after the fact.
 */
export const VEGETATION_OBSERVING_CONSTRAINT_GIBS_LAYERS: Record<
  VegetationObservingConstraintLayerId,
  string
> = {
  ndvi: "MODIS_Terra_L3_NDVI_Monthly",
  evi: "MODIS_Terra_L3_EVI_Monthly",
};

/**
 * Whether these constraints may be asserted for what the app currently renders
 * as `layerId`.
 *
 * Two separate questions, and both have to answer yes: is this one of the two
 * layers the descriptor is written for, and is that layer still pointed at the
 * GIBS identifier the descriptor was written against. The second is the refusal
 * `VEGETATION_OBSERVING_CONSTRAINT_GIBS_LAYERS` exists for — a maximum-value-
 * composite claim attached to some other product would be worse than no claim,
 * and an exported file cannot be corrected after the fact.
 *
 * Exported so every surface that speaks these constraints asks one question
 * rather than each repeating the drift check with its own idea of what counts.
 */
export function vegetationObservingConstraintsApply(
  layerId: LayerId | undefined
): layerId is VegetationObservingConstraintLayerId {
  if (!isConstrainedLayer(layerId)) return false;
  return (
    LAYERS[layerId].wmsLayer ===
    VEGETATION_OBSERVING_CONSTRAINT_GIBS_LAYERS[layerId]
  );
}

/**
 * False for both vegetation-index layers, and not an inference about magnitude.
 *
 * A vegetation index is a ratio of reflected red and near-infrared light, so it
 * cannot be observed without sunlight at all — `clear-sky-optical-only` above
 * states the product needs a clear, *sunlit* view and drops low-sun days — and
 * the eligible observations come from Terra's single mid-morning descending
 * overpass. A monthly value therefore describes selected mid-morning moments,
 * never every moment of the month. That is the observing geometry restated,
 * exactly as the daytime gate fixes the same field to `false` for the SST
 * product; how far a mid-morning index sits from any all-hours quantity is a
 * magnitude, and no magnitude is asserted anywhere in this module.
 */
export const VEGETATION_REPRESENTS_FULL_DIURNAL_CYCLE = false;

export interface VegetationObservingConstraintsSummary {
  kind: "vegetation-index-observing-constraints";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "product-observing-system-only";
  /** Prevents these constraints from being mistaken for an ecological finding. */
  ecologicalConditionObservation: false;
  layerId: VegetationObservingConstraintLayerId;
  source: DatasetRef;
  constraints: readonly VegetationObservingConstraint[];
  /** False for this product; see the constant's own reasoning. */
  representsFullDiurnalCycle: typeof VEGETATION_REPRESENTS_FULL_DIURNAL_CYCLE;
  /** Constraints whose sign the selection rule fixes; empty for EVI. */
  directionalConstraintIds: VegetationObservingConstraintId[];
  /** Honest, source-carrying sentence, ready for a screen reader. */
  statement: string;
  limits: typeof VEGETATION_OBSERVING_CONSTRAINT_LIMITS;
}

/**
 * Describe what the cited monthly vegetation-index product's compositing
 * algorithm does and does not sample, for one of the two layers it is asserted
 * for.
 *
 * This takes no observation: the constraints hold for every value the product
 * publishes, so applying them to one month would imply they were derived from
 * it. Mirrors `summarizeSstObservingConstraints` so a consumer holding both
 * reads one shape — the place export is the surface that needs exactly that.
 */
export function summarizeVegetationObservingConstraints(
  layerId: VegetationObservingConstraintLayerId
): VegetationObservingConstraintsSummary {
  const constraints = VEGETATION_OBSERVING_CONSTRAINTS[layerId];
  return {
    kind: "vegetation-index-observing-constraints",
    isForecast: false,
    claimScope: "product-observing-system-only",
    ecologicalConditionObservation: false,
    layerId,
    source: VEGETATION_OBSERVING_CONSTRAINT_SOURCES[layerId],
    constraints,
    representsFullDiurnalCycle: VEGETATION_REPRESENTS_FULL_DIURNAL_CYCLE,
    directionalConstraintIds: constraints
      .filter((entry) => entry.direction !== "not-asserted")
      .map((entry) => entry.id),
    statement: vegetationObservingConstraintStatement(layerId),
    limits: VEGETATION_OBSERVING_CONSTRAINT_LIMITS,
  };
}

function vegetationObservingConstraintStatement(
  layerId: VegetationObservingConstraintLayerId
): string {
  const source = VEGETATION_OBSERVING_CONSTRAINT_SOURCES[layerId];
  const clauses = VEGETATION_OBSERVING_CONSTRAINTS[layerId]
    .map((entry) => `${entry.constraint} — ${entry.implication}`)
    .join("; ");
  return `Vegetation-index observing constraints: this product is ${clauses}. Source: ${source.shortName} v${source.version}. These describe the product's compositing algorithm, not vegetation cover, condition, or any ecological state.`;
}

/**
 * Each sampling gate written out for the exported CSV, keyed by layer and then
 * by constraint id.
 *
 * Fuller than the status-line short forms on purpose, for the reason the SST and
 * LST exports give: an archived file has no display budget, and it is read by
 * someone who no longer has the status line in front of them. Hand-written
 * rather than interpolated from `constraint`/`implication` because those carry
 * commas and a `#` line must not (see the header discipline on `csvHeaderText`
 * in probe.ts); the doubly-keyed `Record` is what keeps them from drifting apart
 * — a fourth constraint, or a third layer, fails to compile until its export
 * prose is written.
 *
 * Keyed by layer as well as by constraint because `maximum-value-selection` is
 * the one entry whose substance genuinely differs between the two: the
 * compositing decision is made on NDVI, and EVI merely inherits the observation
 * it kept.
 */
const VEGETATION_SAMPLING_IDENTITY_CSV_PROSE: Record<
  VegetationObservingConstraintLayerId,
  Record<VegetationObservingConstraintId, string>
> = {
  ndvi: {
    "clear-sky-optical-only":
      "a reflectance ratio in the red and near-infrared so only a clear sunlit snow-free view of the surface yields an observation at all — cloudy shadowed low-sun and snow-covered days are left out of the month rather than averaged into it — so a month's value describes a non-random subset of that month's days",
    "maximum-value-selection":
      "each compositing window is reduced by a constrained-view maximum-value composite which keeps the single eligible observation with the highest NDVI rather than averaging them; the rule exists because the contamination that survives screening — thin cloud shadow residual aerosol off-nadir viewing — depresses the index",
    "composite-not-monthly-mean":
      "the published month is a within-month composite built from those selected observations and not a time-average of the month's days — so a mean or trend over the rows below averages selected within-month states rather than monthly means",
  },
  evi: {
    "clear-sky-optical-only":
      "a reflectance ratio in the red and near-infrared so only a clear sunlit snow-free view of the surface yields an observation at all — cloudy shadowed low-sun and snow-covered days are left out of the month rather than averaged into it — so a month's value describes a non-random subset of that month's days",
    "maximum-value-selection":
      "each compositing window is reduced by the same constrained-view maximum-value composite whose selection is made on NDVI; the observation it keeps then supplies that window's EVI — so the exported value is a selected observation rather than an average but was never itself maximized",
    "composite-not-monthly-mean":
      "the published month is a within-month composite built from those selected observations and not a time-average of the month's days — so a mean or trend over the rows below averages selected within-month states rather than monthly means",
  },
};

/**
 * What a `direction` other than `not-asserted` means for the exported column,
 * or `null` for the one value that asserts nothing.
 *
 * Keyed by the direction rather than written into the prose above so the export
 * cannot outlive the field it reports: the day NDVI's selection is recorded as
 * unsigned, the line below stops claiming a sign on its own. Adding a third
 * direction fails to compile until its meaning for a reader is stated.
 */
const VEGETATION_CSV_DIRECTION_PHRASES: Record<
  VegetationSamplingDirection,
  string | null
> = {
  "green-leaning":
    "the kept value cannot sit below the average of the eligible observations it was chosen from",
  "sparse-leaning":
    "the kept value cannot sit above the average of the eligible observations it was chosen from",
  "not-asserted": null,
};

/**
 * The one line that says how far the headers above may be read as a bias.
 *
 * Derived from the `direction` fields rather than restated, because this is the
 * single point where the two layers' exports must differ and the difference is
 * substantive: NDVI's selection rule fixes a sign — a maximum cannot fall below
 * the mean of the candidates it was drawn from, which is the rule restated and
 * not an estimate — while EVI's selection is made on NDVI, so no such inequality
 * holds for it. No magnitude is asserted for either.
 */
function samplingDirectionHeader(
  layerId: VegetationObservingConstraintLayerId
): string {
  const key = `# ${layerId}_sampling_direction: `;
  const directed = VEGETATION_OBSERVING_CONSTRAINTS[layerId].filter(
    (entry) => VEGETATION_CSV_DIRECTION_PHRASES[entry.direction] !== null
  );
  if (directed.length === 0) {
    return `${key}no direction and no magnitude are asserted for any constraint above — nothing in this product's compositing fixes a sign for these rows; they are fixed properties of the cited algorithm and not of any individual value month or place`;
  }
  const signed = directed
    .map(
      (entry) =>
        `${entry.id.replace(/-/g, "_")} — ${
          VEGETATION_CSV_DIRECTION_PHRASES[entry.direction]
        }`
    )
    .join("; ");
  return `${key}a sign is asserted only for ${signed}. That is the selection rule restated and not an estimated offset: no magnitude is asserted anywhere here — how far a composite sits above the average of its candidates depends on how many were eligible and how contaminated they were which this app does not observe`;
}

/**
 * Provenance headers naming *which* moments the exported vegetation-index rows
 * were selected from and *what quantity* they therefore are, or an empty list
 * for every other layer.
 *
 * The probe already states this gate on screen
 * (`probeVegetationSamplingGateClause`), and the download is the surface that
 * needs it more, for the reason its SST and LST counterparts give: the file
 * outlives the session and names the product only through `# data_product`,
 * whose short name is `MOD13A3`. A reader who opens it six months later sees a
 * column headed `value` holding a dimensionless index between −1 and 1 with
 * nothing to say that each row is the *highest* eligible observation of its
 * window rather than that month's average greenness, that cloudy and snow-
 * covered days are absent rather than averaged in, or that averaging the column
 * therefore averages selected within-month states. All three change what the
 * column may be compared against, and none is recoverable from the numbers —
 * least of all the first, which for NDVI carries a documented direction.
 *
 * This is the product's compositing algorithm, so it does not depend on the
 * sampled months and is not derived from them. It is emitted whenever either
 * vegetation-index layer is exported.
 *
 * Silent when a layer has drifted off its declared GIBS identifier: a stale
 * maximum-value-composite claim attached to a different product would be worse
 * than no claim at all. Nothing about vegetation cover, biomass, condition,
 * habitat, ecological health, drought, causation or any future value follows
 * from any line here — see `VEGETATION_OBSERVING_CONSTRAINT_LIMITS`.
 */
export function vegetationSamplingIdentityCsvHeaders(
  layerId: LayerId | undefined
): string[] {
  if (!vegetationObservingConstraintsApply(layerId)) return [];
  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  return [
    ...VEGETATION_OBSERVING_CONSTRAINTS[layerId].map(
      (entry) =>
        `# ${layerId}_${entry.id.replace(/-/g, "_")}: ${
          VEGETATION_SAMPLING_IDENTITY_CSV_PROSE[layerId][entry.id]
        }`
    ),
    samplingDirectionHeader(layerId),
  ];
}

/**
 * Surface forms that count as stating a constraint in the rendered caption, or
 * `null` for one that layer's caption is not required to carry.
 *
 * This mirrors `sstCaptionConstraintOmissions` and `lstCaptionConstraintOmissions`
 * deliberately. Both thermal captions were corrected to name the gates that
 * decide which moments their monthly value describes; the two vegetation
 * captions named none of theirs, even though a vegetation month is the one
 * reduction in the app that is not an average at all. The NDVI caption went
 * further and called the layer "the classic seasonal-cycle signal", which
 * invites reading the month-to-month curve as the seasonal cycle of greenness —
 * the one reading the selection rule bends.
 *
 * `maximum-value-selection` is `null` for EVI only, and not for want of room:
 * the composite's selection is made on NDVI and the kept observation merely
 * supplies its EVI, so a caption claiming an EVI maximum would assert an
 * inequality that does not hold for this layer. Naming the selection honestly
 * needs more words than a one-line caption has, and the probe status line and
 * the exported CSV already carry it in full.
 *
 * Keyed by layer *and* constraint id on purpose: adding a fourth constraint, or
 * a third vegetation layer, fails to compile until someone decides whether that
 * caption must carry it.
 */
const VEGETATION_CAPTION_CONSTRAINT_PHRASES: Record<
  VegetationObservingConstraintLayerId,
  Record<VegetationObservingConstraintId, readonly string[] | null>
> = {
  ndvi: {
    "clear-sky-optical-only": [
      "clear-sky",
      "clear sky",
      "cloud-free",
      "cloud-screened",
    ],
    "maximum-value-selection": [
      "max-value",
      "maximum-value",
      "maximum value",
      "highest",
    ],
    "composite-not-monthly-mean": ["composite"],
  },
  evi: {
    "clear-sky-optical-only": [
      "clear-sky",
      "clear sky",
      "cloud-free",
      "cloud-screened",
    ],
    "maximum-value-selection": null,
    "composite-not-monthly-mean": ["composite"],
  },
};

/** One constraint the rendered caption for a vegetation layer fails to state. */
export interface VegetationCaptionOmission {
  layerId: VegetationObservingConstraintLayerId;
  constraintId: VegetationObservingConstraintId;
  /** The product property the caption left out, verbatim from the table. */
  constraint: string;
  /** What omitting it lets a reader assume, verbatim from the table. */
  implication: string;
  reason: string;
}

/**
 * Which declared observing constraints the shipped caption for a vegetation
 * layer does not state.
 *
 * Limits of the check (it is a copy audit, nothing more):
 *  - It matches declared surface forms. A clean audit means the caption states
 *    the *checked* gates; it is not evidence the caption is complete or that
 *    any other wording in it is accurate.
 *  - It reads only the caption. It cannot confirm what the layer renders, and
 *    it asserts no magnitude for any gate — those stay where
 *    `VEGETATION_OBSERVING_CONSTRAINTS` puts them, and a direction is asserted
 *    there for NDVI's selection alone.
 *  - Nothing about vegetation cover, biomass, condition, habitat, ecological
 *    health, drought or causation follows from a stated or an omitted gate.
 */
export function vegetationCaptionConstraintOmissions(
  layerId: VegetationObservingConstraintLayerId,
  caption: string = LAYERS[layerId].description
): VegetationCaptionOmission[] {
  const haystack = caption.toLowerCase();
  return VEGETATION_OBSERVING_CONSTRAINTS[layerId]
    .filter((entry) => {
      const phrases = VEGETATION_CAPTION_CONSTRAINT_PHRASES[layerId][entry.id];
      return phrases !== null && !phrases.some((p) => haystack.includes(p));
    })
    .map((entry) => ({
      layerId,
      constraintId: entry.id,
      constraint: entry.constraint,
      implication: entry.implication,
      reason:
        "The caption is the most-read claim the app makes about this layer, and it is the only surface a reader meets without a gesture; a compositing gate left out of it reads as a gate that does not apply.",
    }));
}

/** One-line rendering of an omission, for a test failure message. */
export function formatVegetationCaptionOmission(
  omission: VegetationCaptionOmission
): string {
  return `${omission.layerId}: caption omits ${omission.constraintId} — the product is ${omission.constraint}, so ${omission.implication}; ${omission.reason}`;
}
