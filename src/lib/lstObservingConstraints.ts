import { LAYERS, type DatasetRef, type LayerId } from "./timeline";

/**
 * Provenance-first observing-constraint descriptor for the cited MODIS/Terra
 * monthly daytime land-surface-temperature product.
 *
 * The probe summarizes a sampled record as `min · mean · max · trend`. For sea
 * surface temperature the status line already says which moments and which
 * water those statistics describe (see `probeSstSamplingGateClause`); for land
 * surface temperature it said nothing, even though the same three questions
 * have narrower answers here and the place panel already states them for its
 * single-month card (see `lstPlaceInsight`'s card scope). A multi-year mean and
 * a fitted trend inherit the identical gate, and unlike the ramp censoring
 * reported beside them, nothing in the values themselves hints at it.
 *
 * The rendered layer is `MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day`, and its
 * answer is narrower than "the land surface temperature that month":
 *
 *  - It is built from **Terra's daytime overpass only**, near 10:30 local solar
 *    time. Over land the diurnal cycle of skin temperature is large and peaks in
 *    the early afternoon, so a mid-morning retrieval sits on the rising limb: a
 *    monthly mean of them is neither a diurnal mean nor a diurnal maximum.
 *  - It is a **thermal-infrared** retrieval, and thermal infrared does not pass
 *    through cloud. Only cloud-screened days contribute, so a monthly composite
 *    averages a non-random subset of that month's days, and cloudy days are
 *    absent from it rather than averaged in.
 *  - It is a **radiometric skin temperature** of the ground, roof, or canopy the
 *    sensor sees. The app renders MERRA-2 2 m air temperature as a sibling layer
 *    in the same "Temperature" category, so the same point can be probed on both
 *    and the two series set side by side — but they are different quantities,
 *    not two measurements of one.
 *
 * Each is a fixed, documented property of the product's observing system, so —
 * like `sstObservingConstraints` — this module is the single place they are
 * asserted, and it asserts them for one product only.
 *
 * Deliberately **not** asserted here:
 *  - Any magnitude, for any of the three.
 *  - **Any direction at all**, which is where this descriptor departs from its
 *    SST counterpart. That one asserts `warm-leaning` for its overpass because
 *    Aqua crosses in the early afternoon, near the diurnal maximum, so the sign
 *    is fixed by observing geometry. Terra's 10:30 crossing is not: it falls
 *    between the pre-dawn minimum and the afternoon maximum, and where it sits
 *    relative to the day's mean depends on surface cover, soil moisture, season
 *    and latitude, none of which this app observes. The skin-versus-air offset
 *    is regime-dependent for the same reasons — it runs strongly positive over
 *    dry, sparsely vegetated ground at midday and can invert over dense canopy
 *    or snow — so it too is reported as not asserted rather than guessed. The
 *    point of that constraint is that the quantity differs, not that it is
 *    biased in a knowable direction.
 *  - Anything about weather, heat hazard, health, comfort, urban heat-island
 *    attribution, or any future value. These are statements about an instrument
 *    and an orbit.
 *
 * References:
 * Wan, Z. (2014). New refinements and validation of the collection-6 MODIS
 * land-surface temperature/emissivity product. Remote Sensing of Environment,
 * 140, 36–45.
 * Jin, M. & Dickinson, R. E. (2010). Land surface skin temperature climatology:
 * benefitting from the strengths of satellite observations. Environmental
 * Research Letters, 5(4), 044004.
 */

/** The one layer these constraints are asserted for, and only it. */
export const LST_OBSERVING_CONSTRAINT_LAYER_ID = "lst" as const;

/**
 * The GIBS identifier every constraint below is asserted for, kept literal for
 * the export drift guard the way `seaSurfaceTemperatureSamplingIdentity` keeps
 * `gibsLayer`. GIBS spells the diurnal half into the identifier itself, so a
 * layer repointed at the night product or an all-sky one must not inherit a
 * mid-morning clear-sky qualifier.
 */
export const LST_OBSERVING_CONSTRAINT_GIBS_LAYER =
  "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day" as const;

const lstSource = LAYERS[LST_OBSERVING_CONSTRAINT_LAYER_ID].dataset;
if (!lstSource) {
  throw new Error(
    "RoamingEye: the land-surface-temperature layer must retain a cited dataset"
  );
}

/** The cited product these constraints are asserted for, and only for it. */
export const LST_OBSERVING_CONSTRAINT_SOURCE: DatasetRef = lstSource;

export type LstObservingConstraintId =
  /** Composited from Terra's ~10:30 daytime overpass only. */
  | "morning-overpass-only"
  /** Thermal infrared retrieves only through cloud-free sky. */
  | "clear-sky-retrieval-only"
  /** A radiometric skin temperature, not the 2 m air temperature. */
  | "radiometric-skin-temperature";

/**
 * Direction in which a monthly value may sit relative to the quantity a reader
 * is likely to assume it is.
 *
 * Every constraint below is `not-asserted`, and the union is written open so a
 * future product change can add a sign without reshaping the type. See the
 * module comment: none of the three signs is fixed by observing geometry here,
 * which is a substantive difference from the SST product, not an omission.
 */
export type LstSamplingDirection =
  "warm-leaning" | "cool-leaning" | "not-asserted";

export interface LstObservingConstraint {
  id: LstObservingConstraintId;
  /** What the product's observing system does; a property of the product. */
  constraint: string;
  /** What that means for reading one monthly value; never a magnitude. */
  implication: string;
  /** Sign only, and only where observing geometry fixes it. */
  direction: LstSamplingDirection;
  /**
   * The same constraint compressed to a status-line fragment. The probe note
   * is built by joining these rather than restating them, so the constraint
   * and the phrase the user reads cannot drift apart.
   */
  shortForm: string;
}

/**
 * The three constraints, in the order a reader meets them: when the product
 * looks, whether it can see, and what it is looking at.
 */
export const LST_OBSERVING_CONSTRAINTS: readonly LstObservingConstraint[] = [
  {
    id: "morning-overpass-only",
    constraint:
      "composited from Terra's daytime overpass only, near 10:30 local solar time, hours before the early-afternoon maximum of the land diurnal cycle",
    implication:
      "a monthly mean of those retrievals is neither a diurnal mean nor a diurnal maximum",
    direction: "not-asserted",
    shortForm: "Terra's 10:30 overpass only, not a diurnal mean",
  },
  {
    id: "clear-sky-retrieval-only",
    constraint:
      "retrieved in the thermal infrared, which does not pass through cloud, so only cloud-screened days contribute",
    implication:
      "a monthly value averages a non-random subset of that month's days, with cloudy days absent rather than averaged in",
    direction: "not-asserted",
    shortForm: "clear-sky days only",
  },
  {
    id: "radiometric-skin-temperature",
    constraint:
      "a radiometric skin temperature of the ground, roof or canopy the sensor sees, not the 2 m air temperature the app renders as a sibling layer",
    implication:
      "it is a different quantity from air temperature rather than a biased estimate of it, so the two series are not interchangeable",
    direction: "not-asserted",
    shortForm: "skin temperature, not 2 m air temperature",
  },
] as const;

export const LST_OBSERVING_CONSTRAINT_LIMITS = [
  "These are fixed properties of the cited product's observing system, not properties of any individual value, month or place.",
  "No offset magnitude is asserted; a mid-morning-versus-daily-mean difference depends on surface cover, soil moisture, season and latitude that this app does not observe.",
  "No direction is asserted for this product: Terra's 10:30 crossing falls between the pre-dawn minimum and the afternoon maximum, and the skin-versus-air offset is regime-dependent.",
  "Native grid size and inversion accuracy are separate axes, reported by the spatial-support and measured-inversion descriptors, not here.",
  "Land surface temperature is a physical observation; these constraints carry no claim about weather, heat hazard, health, comfort, urban heat-island attribution, causation, or any future value.",
] as const;

/**
 * The shortest honest phrase that keeps a displayed monthly value from being
 * read as an all-day, all-weather, near-surface air temperature. Built from the
 * constraints above so the two cannot drift. Intended to sit inside an existing
 * provenance line rather than occupy its own row.
 */
export const LST_SAMPLING_GATE_NOTE = LST_OBSERVING_CONSTRAINTS.map(
  (entry) => entry.shortForm
).join("; ");

/**
 * The sampling gate as a probe status-line clause, or `""` when it does not
 * apply.
 *
 * This is the product's observing system, not a property of the sampled months,
 * so it is not derived from them: `hasReportedStatistics` only asks whether a
 * statistic is on screen for the note to qualify. Returns `""` for every layer
 * but `lst` and for a record that reported none, leaving an ordinary readout —
 * and every other layer's — byte-identical.
 */
export function probeLstSamplingGateClause(
  layerId: LayerId | undefined,
  hasReportedStatistics: boolean
): string {
  if (layerId !== LST_OBSERVING_CONSTRAINT_LAYER_ID) return "";
  return hasReportedStatistics ? LST_SAMPLING_GATE_NOTE : "";
}

/**
 * Each sampling gate written out for the exported CSV, keyed by constraint id.
 *
 * Fuller than the status-line short forms on purpose, for the reason the SST
 * export gives: an archived file has no display budget, and it is read by
 * someone who no longer has the status line in front of them. Hand-written
 * rather than interpolated from `constraint`/`implication` because those carry
 * commas and a `#` line must not (see the header discipline on `csvHeaderText`
 * in probe.ts); the keyed `Record` is what keeps them from drifting apart —
 * adding a fourth constraint fails to compile until its export prose is
 * written, exactly as `LST_CAPTION_CONSTRAINT_PHRASES` does for the caption.
 */
const LST_SAMPLING_IDENTITY_CSV_PROSE: Record<
  LstObservingConstraintId,
  string
> = {
  "morning-overpass-only":
    "composited from Terra's daytime overpass only near 10:30 local solar time — hours before the early-afternoon maximum of the land diurnal cycle — so a monthly mean of these rows is neither a diurnal mean nor a diurnal maximum",
  "clear-sky-retrieval-only":
    "retrieved in the thermal infrared which does not pass through cloud — only cloud-screened days contribute — so a monthly value averages a non-random subset of that month's days with cloudy days absent rather than averaged in",
  "radiometric-skin-temperature":
    "a radiometric skin temperature of the ground or roof or canopy the sensor sees — not the 2 m air temperature this app renders as a sibling layer in the same category — so it is a different quantity rather than a biased estimate of one and the two series must not be differenced as though they measured the same thing",
};

/**
 * Provenance headers naming *which* moments and *what quantity* the exported
 * land-surface-temperature rows represent, or an empty list for every other
 * layer.
 *
 * The probe already states this gate on screen (`probeLstSamplingGateClause`),
 * and the download is the surface that needs it more: the file outlives the
 * session and names the product only through `# data_product`, whose short name
 * is `MOD11C3`. A reader who opens it six months later sees a column headed
 * `value` in kelvin with no indication that it samples one mid-morning moment,
 * omits every cloudy day, and describes the radiating surface rather than the
 * air above it. All three change what the column may be compared against, and
 * none is recoverable from the numbers — least of all the third, since the app
 * renders 2 m air temperature as a sibling layer whose export looks identical.
 *
 * This is the product's observing system, so it does not depend on the sampled
 * months and is not derived from them. It is emitted whenever the LST layer is
 * exported.
 *
 * Silent when the configured layer has drifted off the declared identifier: a
 * stale mid-morning clear-sky claim attached to a different product would be
 * worse than no claim at all, and an exported file cannot be corrected after
 * the fact. No magnitude and no direction are asserted — see
 * `LST_OBSERVING_CONSTRAINT_LIMITS` — and nothing about weather, heat hazard,
 * health, comfort or urban heat-island attribution follows from any line here.
 */
export function lstSamplingIdentityCsvHeaders(
  layerId: LayerId | undefined
): string[] {
  if (layerId !== LST_OBSERVING_CONSTRAINT_LAYER_ID) return [];
  if (
    LAYERS[LST_OBSERVING_CONSTRAINT_LAYER_ID].wmsLayer !==
    LST_OBSERVING_CONSTRAINT_GIBS_LAYER
  ) {
    return [];
  }
  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  return [
    ...LST_OBSERVING_CONSTRAINTS.map(
      (entry) =>
        `# lst_${entry.id.replace(/-/g, "_")}: ${
          LST_SAMPLING_IDENTITY_CSV_PROSE[entry.id]
        }`
    ),
    `# lst_sampling_direction: no direction and no magnitude are asserted — Terra's 10:30 crossing falls between the pre-dawn minimum and the afternoon maximum and the skin-versus-air offset is regime-dependent; these are fixed properties of the cited product's observing system and not of any individual value month or place`,
  ];
}

/**
 * Surface forms that count as stating a constraint in the rendered caption, or
 * `null` for one the caption is not required to carry.
 *
 * `radiometric-skin-temperature` is `null` for the same reason its SST
 * counterpart `near-surface-radiometric` is: the caption already names the
 * quantity it renders ("land-surface temperature"), which is what distinguishes
 * it from the 2 m air-temperature sibling, and a caption has no room for every
 * qualifier — pretending otherwise would push the useful ones out.
 *
 * Keyed by `LstObservingConstraintId` on purpose: adding a fourth constraint
 * fails to compile until someone decides whether the caption must carry it.
 */
const LST_CAPTION_CONSTRAINT_PHRASES: Record<
  LstObservingConstraintId,
  readonly string[] | null
> = {
  "morning-overpass-only": ["daytime", "day-time", "daylight", "morning"],
  "clear-sky-retrieval-only": [
    "clear-sky",
    "clear sky",
    "cloud-free",
    "cloud free",
    "cloud-screened",
  ],
  "radiometric-skin-temperature": null,
};

/** A sampling gate the rendered caption fails to state. */
export interface LstCaptionOmission {
  layerId: typeof LST_OBSERVING_CONSTRAINT_LAYER_ID;
  constraintId: LstObservingConstraintId;
  /** The product property the caption left out, verbatim from the table. */
  constraint: string;
  /** What omitting it lets a reader assume, verbatim from the table. */
  implication: string;
  reason: string;
}

/**
 * Report every sampling gate the LST caption fails to state.
 *
 * `Legend` renders `LAYERS.lst.description` verbatim under the globe and
 * `LayerSelector` uses it as the option tooltip, so that one sentence is the
 * most-read claim the app makes about this layer — and for most readers the
 * only one, since the probe and place surfaces need a gesture to reach. The
 * caption named the daytime overpass and stopped there, while the constraint
 * table beside it, `LST_SAMPLING_GATE_NOTE`, the place card and the probe
 * status line all carry the clear-sky gate too. A caption that states one of
 * two co-equal gates reads as the complete qualification, which is why this is
 * a check and not a comment.
 *
 * This mirrors `sstCaptionConstraintOmissions` deliberately. The ocean twin's
 * caption was corrected to name both gates; the land caption was left stating
 * the overpass alone, even though thermal infrared is stopped by cloud over
 * land exactly as it is over water, and land cloudiness is itself seasonal —
 * so the absent days are not a random sample of the month.
 *
 * Limits of the check (it is a copy audit, nothing more):
 *  - It matches declared surface forms. A clean audit means the caption states
 *    the *checked* gates; it is not evidence the caption is complete or that
 *    any other wording in it is accurate.
 *  - It reads only the caption. It cannot confirm what the layer renders, and
 *    it asserts no magnitude or direction for either gate — those stay where
 *    `LST_OBSERVING_CONSTRAINTS` puts them, and that module asserts no
 *    direction at all for this product.
 *  - Nothing about weather, heat hazard, health or comfort follows from a
 *    stated or an omitted gate.
 */
export function lstCaptionConstraintOmissions(
  caption: string = LAYERS[LST_OBSERVING_CONSTRAINT_LAYER_ID].description
): LstCaptionOmission[] {
  const haystack = caption.toLowerCase();
  return LST_OBSERVING_CONSTRAINTS.filter((entry) => {
    const phrases = LST_CAPTION_CONSTRAINT_PHRASES[entry.id];
    return phrases !== null && !phrases.some((p) => haystack.includes(p));
  }).map((entry) => ({
    layerId: LST_OBSERVING_CONSTRAINT_LAYER_ID,
    constraintId: entry.id,
    constraint: entry.constraint,
    implication: entry.implication,
    reason:
      "The caption is the most-read claim the app makes about this layer, and it is the only LST surface a reader meets without a gesture; a sampling gate left out of it reads as a gate that does not apply.",
  }));
}

/** One-line rendering of an omission, for a test failure message. */
export function formatLstCaptionOmission(omission: LstCaptionOmission): string {
  return `${omission.layerId}: caption omits ${omission.constraintId} — the product is ${omission.constraint}, so ${omission.implication}; ${omission.reason}`;
}
