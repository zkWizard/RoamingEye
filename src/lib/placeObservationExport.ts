import { isRampSaturated } from "./aerosolPlaceInsight";
import {
  characterizeLayerInversion,
  inversionUncertaintyForLayer,
  type UncharacterizedReason,
} from "./briefValueUncertainty";
import {
  geometryBounds,
  type GeoGeometry,
  type GeometrySamplingStrategy,
} from "./geojson";
import {
  classifyModality,
  describeModality,
  MODALITY_LIMITS,
  type ObservationBasis,
  type ObservationModality,
} from "./observationModality";
import { NDVI_UNIT } from "./phenology";
import {
  SST_OBSERVING_CONSTRAINT_LAYER_ID,
  summarizeSstObservingConstraints,
} from "./sstObservingConstraints";
import { summarizeSstRampCensoring } from "./sstRampCensoring";
import {
  LAYERS,
  type DatasetRef,
  type LayerId,
  type YearMonth,
} from "./timeline";
import {
  summarizeVegetationObservingConstraints,
  vegetationObservingConstraintsApply,
  type VegetationSamplingDirection,
} from "./vegetationObservingConstraints";

/**
 * A deliberately small, provenance-first JSON contract for sharing sampled
 * place observations. It records the requested boundary and cited products,
 * but never adds account, session, search, or device information.
 *
 * The values in this contract are supplied sampling results. They are not a
 * diagnosis, a condition score, a forecast, or an interpretation of a place.
 */

export const PLACE_OBSERVATION_EXPORT_SCHEMA =
  "roamingeye-place-observation-export/v12" as const;

export const PLACE_OBSERVATION_GEOGRAPHY = {
  coordinateReferenceSystem: "OGC:CRS84",
  coordinateOrder: "longitude-latitude",
  boundaryRole: "requested-sampling-footprint",
} as const;

export const GIBS_IMAGERY_SOURCE = {
  name: "NASA Global Imagery Browse Services (GIBS)",
  url: "https://gibs.earthdata.nasa.gov",
} as const;

export type PlaceObservationSampling =
  "point-median" | "area-weighted-grid-mean";

export interface PlaceObservationExportInput {
  /** The requested area boundary, retained as GeoJSON rather than a place name. */
  boundary: GeoGeometry;
  products: readonly PlaceObservationProductInput[];
  method: PlaceObservationMethodInput;
  /** ISO 8601 timestamp when this export was generated. */
  generatedIso: string;
  toolVersion: string;
}

export interface PlaceObservationProductInput {
  layerId: LayerId;
  wmsLayer: string;
  /** Underlying data product citation; this is not replaced by imagery metadata. */
  source: DatasetRef;
  nativeUnit: string;
  /** Bounded geometry-mask budget used by the rendered-image sampler. */
  samplingSupport?: PlaceObservationSamplingSupport;
  /** Exact transformation applied to sampled values before export. */
  sampleToNative?: PlaceObservationValueTransform;
  /** Exact searched-boundary strategy used for this product's observations. */
  samplingStrategy?: GeometrySamplingStrategy | "unavailable";
  /** Actual rendered image returned by the sampler for this product. */
  sourceImageDimensions?: { width: number; height: number };
  /** Exact rendered-value mapping used, or why it was unavailable. */
  valueMapping?: PlaceObservationValueMapping;
  /** Open-ended legend-bin censoring measured on the sampled colours. */
  legendCapCensoring?: PlaceObservationLegendCapCensoringInput;
  observations: readonly PlaceObservationInput[];
}

/**
 * Censoring by an open-ended terminal legend bin, as measured on the colours a
 * product was sampled from.
 *
 * A rendered ramp that ends in an open "≥" catch-all cannot resolve a value in
 * that bin: the pixel is known only to be at or above the bin's one finite
 * edge. The inversion drops such a pixel, so it leaves the same trace in
 * `validFraction` as cloud, ocean, or an unpublished month — and because the
 * dropped pixels sit at one end of the ramp, dropping them biases the mean over
 * the survivors *away* from that end by an amount the image cannot resolve.
 * Recording the tally is what lets a consumer of this file tell a two-sided
 * measurement from a one-sided bound.
 *
 * This is representability structure only. It never estimates how far past the
 * edge a censored value lies, never infers a condition or cause, and makes no
 * claim about months it does not name.
 */
export interface PlaceObservationLegendCapCensoringInput {
  /**
   * The single data month the tally was measured for. Other months of the same
   * product are unassessed, which is not the same as uncensored.
   */
  assessedDataMonth: YearMonth;
  /** Sampled cells that fell in the open-ended bin. */
  censoredSampleCount: number;
  /** Sampled cells carrying any value at all (censored plus resolved). */
  valuedSampleCount: number;
  /** The bin's one finite edge, in the product's `nativeUnit`. */
  bound: number;
  boundRelation: "at-or-above";
  /** The bin's label, verbatim from the source colormap document. */
  publishedLabel: string;
  /** Colormap document the bin structure was read from. */
  colormapDocument: string;
}

export interface PlaceObservationLegendCapCensoring extends Omit<
  PlaceObservationLegendCapCensoringInput,
  "assessedDataMonth"
> {
  assessedDataMonth: string;
  /**
   * True when the open-ended bin actually took samples, so the assessed
   * month's value is a one-sided bound rather than an estimate. This is the
   * one bit a consumer needs before treating the value as a measurement.
   */
  valueIsOneSidedBound: boolean;
}

export type PlaceObservationValueMapping =
  | { status: "gibs-colormap"; url: string }
  | { status: "ui-legend-approximation"; url: null }
  | { status: "not-available"; url: null };

export interface PlaceObservationSamplingSupport {
  gridSize: number;
  candidatePointCount: number;
  interiorPointCount: number;
  retainedPointCount: number;
  sourcePixelCount: number;
  pointLimitApplied: boolean;
}

export interface PlaceObservationValueTransform {
  sampledUnit: string;
  operation: "divide";
  factor: number;
}

export interface PlaceObservationInput {
  dataMonth: YearMonth;
  /** Supplied value in `nativeUnit`; null retains an explained unavailable result. */
  value: number | null;
  /** Required for null values so an unavailable result is never ambiguous. */
  unavailableReason?: PlaceObservationUnavailableReason;
  /** Supplied share of sampled area with a usable value. */
  validFraction?: number;
  /**
   * Set when this month's own value is a one-sided bound rather than a point
   * estimate. Omitted means no bound was assessed for this observation, which
   * is not the same as a value known to be resolved.
   */
  valueBound?: PlaceObservationValueBound;
}

/**
 * Which side of the recorded value the true observation lies on, when the
 * rendered ramp could bound it but not resolve it.
 *
 * This is a per-observation companion to {@link
 * PlaceObservationLegendCapCensoringInput}, which counts how many *cells* a
 * product's open-ended bin took. The two describe different mechanisms and are
 * not interchangeable: a cap tally says pixels were rejected and how many,
 * while a value bound says the recorded number itself — a single decoded value,
 * or a mean of decoded values — came to rest in a terminal bin the ramp cannot
 * see past. A product may supply either, both, or neither.
 *
 * `"at-or-below"` means the true value is no greater than the recorded one;
 * `"at-or-above"` means it is no less. Neither states how far past the edge the
 * true value lies, and neither is a condition, cause, or forecast claim.
 */
export type PlaceObservationValueBound = "at-or-below" | "at-or-above";

const PLACE_OBSERVATION_VALUE_BOUNDS = [
  "at-or-below",
  "at-or-above",
] as const satisfies readonly PlaceObservationValueBound[];

export type PlaceObservationUnavailableReason =
  "source-no-data" | "insufficient-valid-coverage" | "sampling-failed";

const PLACE_OBSERVATION_UNAVAILABLE_REASONS = [
  "source-no-data",
  "insufficient-valid-coverage",
  "sampling-failed",
] as const satisfies readonly PlaceObservationUnavailableReason[];

export interface PlaceObservationMethodInput {
  sampling: PlaceObservationSampling;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Whether a product's committed inversion figure measures the inversion that
 * actually produced that product's values.
 *
 * The three cases are decided by the product's recorded `valueMapping` and are
 * not interchangeable: the first says the quoted error belongs to these
 * numbers, the second says it belongs to a different ramp, and the third says
 * the value method was never recorded — which is not evidence that either ran.
 */
export type InversionAccuracyScope =
  /**
   * Values were read through the UI legend gradient — the very inversion
   * `MEASURED_INVERSION` measures — so the figure characterizes them.
   */
  | "measures-this-product"
  /**
   * Values were read through GIBS's published colormap. The figure measures the
   * UI legend gradient instead, so it is not this product's measured error and
   * is not evidence of a larger or a smaller one.
   */
  | "measures-a-different-inversion"
  /**
   * No value mapping was recorded for the product, so which ramp was inverted
   * is unknown and the figure cannot be tied to these values either way.
   */
  | "value-inversion-unrecorded";

/**
 * The measured end-to-end error of RoamingEye's *UI legend gradient*, plus a
 * statement of whether that is the inversion which produced this product's
 * values.
 *
 * Every value here is produced by inverting a rendered pixel colour through a
 * ramp — but not always the *same* ramp. `ProbeSampler.sampleGeometryPhysical`
 * inverts against GIBS's published colormap entries, while
 * `ProbeSampler.sampleGeometry` inverts through this app's approximate legend
 * gradient, and the place controller chooses between them per product according
 * to whether the published colormap document loaded. Which one ran is already
 * recorded, per product, in `valueMapping`.
 *
 * The committed measurement covers exactly one of those two. `validateInversion`
 * feeds GIBS's authoritative colormap through `LEGENDS[layer]` — the UI legend
 * LUT — and compares the recovered value to the published one; the residuals are
 * committed in `MEASURED_INVERSION`, documented in METHODS §3 and
 * docs/validation.md, and re-asserted against live GIBS by
 * `contract/inversion-validation.contract.test.ts`. No equivalent validation run
 * measures the published-colormap inversion.
 *
 * So on a `gibs-colormap` product this figure characterizes a *different*
 * inversion from the one that produced the numbers beside it. That is not a
 * reason to drop it — it is the only measured characterization this repository
 * holds, and the probe panel and probe CSV quote the same table
 * (`probeInversionAccuracy`) — but it must not be read as this product's own
 * error, in either direction. `scope` states which case a reader is in, so two
 * fields of one record cannot silently disagree about how the values were read.
 *
 * Honesty rules, matching the probe's:
 *  - `nativeRmse` is in this product's own `nativeUnit`, the unit `value` is
 *    recorded in, converted from the published figure with the same
 *    `SCALE_CONVERSIONS` factor `sampleToNative` uses — so a ± band is never
 *    dimensionally mismatched to the number it qualifies. `reportedRmse` keeps
 *    the published figure traceable when the two units differ (precipitation).
 *  - This is the *rendering-inversion* error only. It is not the source
 *    product's own validation against in-situ measurement, which METHODS.md
 *    cites separately, and it implies nothing causal, predictive, or about
 *    environmental condition.
 *  - It is a whole-ramp pooled scalar, not a per-value band. Where a layer's
 *    error is known to be strongly non-uniform across its ramp, that split is
 *    reported separately rather than folded in here.
 *  - A layer with no measured figure is recorded as uncharacterized with the
 *    reason it has none. An error is never invented, and absence is never
 *    rendered as accuracy.
 *  - `scope` reports the mismatch; it never repairs it. Where the figure
 *    characterizes a different inversion, no substitute figure is estimated,
 *    scaled, or asserted for the one that actually ran — an unmeasured
 *    inversion is recorded as unmeasured, exactly as an unmeasured *layer* is.
 */
export interface PlaceObservationInversionAccuracy {
  status: "characterized" | "uncharacterized";
  /**
   * Whether the quoted figure measures the inversion that produced this
   * product's values. Read from the product's own `valueMapping`, so it can
   * never disagree with the recorded value method.
   */
  scope: InversionAccuracyScope;
  /** Null exactly when `status === "characterized"`. */
  uncharacterizedReason: UncharacterizedReason | null;
  /** RMSE in this product's `nativeUnit`; null when uncharacterized. */
  nativeRmse: number | null;
  /** The published RMSE in the probe's reported unit; null when uncharacterized. */
  reportedRmse: number | null;
  /** The reported-unit label (e.g. "mm/day"); null when uncharacterized. */
  reportedUnit: string | null;
  /**
   * Published colormap steps the inversion recovered, and the total considered.
   * Retained even when nothing recovered — "0 of 250" is a finding, not the
   * absence of one — and null only for a layer never measured at all.
   */
  recoveredColormapSteps: number | null;
  totalColormapSteps: number | null;
}

/**
 * Decide whether the committed figure describes the inversion that produced a
 * product's values, from the value method the product already records.
 *
 * Read off `valueMapping` rather than re-deciding here: the controller picks
 * the inverter per product at sampling time and records the choice, so reading
 * the record is the only way this verdict cannot drift away from it.
 */
function inversionAccuracyScope(
  mapping: PlaceObservationValueMapping | undefined
): InversionAccuracyScope {
  switch (mapping?.status) {
    case "ui-legend-approximation":
      return "measures-this-product";
    case "gibs-colormap":
      return "measures-a-different-inversion";
    default:
      return "value-inversion-unrecorded";
  }
}

/**
 * Bind a product to its committed inversion measurement, in the product's own
 * native unit, and state whether that measurement covers the inversion the
 * product's values came from. Nothing is re-derived or re-measured here: the
 * figure is read from the same committed table the probe surfaces quote, and
 * the scope from the product's own recorded value method.
 */
function inversionAccuracyForProduct(
  layerId: LayerId,
  nativeUnit: string,
  valueMapping: PlaceObservationValueMapping | undefined
): PlaceObservationInversionAccuracy {
  const scope = inversionAccuracyScope(valueMapping);
  const measured = inversionUncertaintyForLayer(layerId, nativeUnit);
  if (measured === null) {
    // The classifier supplies both the reason and the recovery counts, so the
    // recorded reason can never disagree with the recorded evidence.
    const characterization = characterizeLayerInversion(layerId);
    return {
      status: "uncharacterized",
      scope,
      uncharacterizedReason: characterization.reason,
      nativeRmse: null,
      reportedRmse: null,
      reportedUnit: null,
      recoveredColormapSteps: characterization.recoveredSteps,
      totalColormapSteps: characterization.totalSteps,
    };
  }
  return {
    status: "characterized",
    scope,
    uncharacterizedReason: null,
    nativeRmse: measured.nativeRmse,
    reportedRmse: measured.reportedRmse,
    reportedUnit: measured.reportedUnit,
    recoveredColormapSteps: measured.recoveredSteps,
    totalColormapSteps: measured.totalSteps,
  };
}

/**
 * Which way a monthly value may sit relative to the quantity a reader is likely
 * to assume it is, where the observing geometry fixes the sign.
 *
 * Declared here rather than imported from a product's own descriptor so the
 * contract does not take its vocabulary from one layer. It widens as products
 * are added; a sign that depends on regime is `not-asserted`, which is a
 * refusal to guess and not a claim that the two directions are equally likely.
 */
export type PlaceObservationSamplingDirection =
  "warm-leaning" | "green-leaning" | "sparse-leaning" | "not-asserted";

export interface PlaceObservationObservingConstraint {
  /** Stable identifier for the constraint, from the product's descriptor. */
  id: string;
  /** What the product's observing system does; a property of the product. */
  constraint: string;
  /** What that means for reading one monthly value; never a magnitude. */
  implication: string;
  direction: PlaceObservationSamplingDirection;
}

/**
 * What the product's observing system samples — which moments, through which
 * sky, at which depth — as distinct from how well its rendered ramp inverts.
 *
 * `inversionAccuracy` above answers *how close is this number to the number the
 * source published*. This answers the prior question: *what is the quantity the
 * source published in the first place*. They are independent, and a file
 * carrying only the first invites the reading that a perfectly inverted value is
 * an unqualified one. For the cited SST product it is not: `MODIS Aqua L3 SST
 * Thermal IR Monthly 9km Daytime` composites the daytime overpass alone, on
 * cloud-screened days alone, as a radiometric temperature of the surface layer —
 * so a monthly value is not a monthly mean sea-surface temperature, is averaged
 * over a non-random subset of the month's days, and does not describe water
 * below the surface layer.
 *
 * Nor is it for the cited vegetation-index product. MOD13A3 needs a clear,
 * sunlit, snow-free view for an observation to exist at all, and each
 * compositing window then keeps the single eligible observation with the
 * highest NDVI rather than averaging them — so a monthly value is a selected
 * within-month state rather than that month's average greenness, and for NDVI
 * the selection rule fixes the sign of the difference. Averaging the exported
 * column averages selected states, which is the reading the rows alone invite
 * and cannot correct.
 *
 * The app already states this in the SST legend caption, the probe status line,
 * the probe CSV's `# sst_observing_constraint_*` headers, and the place panel's
 * SST card. This export was the one surface of the five that dropped it — and
 * the one most likely to be read months later, detached from the app that would
 * otherwise have said so.
 *
 * Derived from `layerId` here rather than taken from the caller, for the reason
 * `inversionAccuracy` is: these are fixed properties of a product's observing
 * system, true of every value it publishes, so no sampling run can supply a
 * version of them that disagrees. For the same reason nothing here is per-month;
 * attaching them to an observation would imply they were measured from it.
 *
 * A product with no published descriptor records `not-published` and says so in
 * `notPublishedReason`, rather than being omitted. An absent field reads as
 * "unconstrained"; a present one that names its own absence cannot.
 *
 * Statements about an instrument and an orbit only. No organism, habitat,
 * ecosystem, thermal-stress, causal, hazard, or forecast claim follows.
 */
export interface PlaceObservationObservingConstraints {
  status: "published" | "not-published";
  /** These describe the product's observing system, never a sampled value. */
  claimScope: "product-observing-system-only";
  /**
   * Null exactly when `status === "published"`. Records that this export holds
   * no observing-constraint descriptor for the product — never that the product
   * observes every moment, every sky, or every depth.
   */
  notPublishedReason: "no-descriptor-published-for-this-product" | null;
  /**
   * Whether a monthly value represents the whole diurnal cycle. Null when no
   * descriptor is published, which is not an answer of `true`.
   */
  representsFullDiurnalCycle: boolean | null;
  /** Empty exactly when `status === "not-published"`. */
  constraints: readonly PlaceObservationObservingConstraint[];
  /** The descriptor's own limits, carried so the record reads standalone. */
  limits: readonly string[];
}

/**
 * How the cited product produced the value — sensed from the surface, or
 * computed by a model — as distinct from what its observing system samples and
 * from how well its rendered ramp inverts.
 *
 * The three product-level blocks answer three different questions, and this is
 * the most basic of them. `inversionAccuracy` asks *how close is this number to
 * the number the source published*; `observingConstraints` asks *which moments,
 * skies and depths did the source observe*; both presuppose that the source
 * observed anything at all. For half this app's place products it did not:
 * rainfall and soil moisture are fields of the GLDAS Noah **land-surface
 * model** and 2 m air temperature is a **MERRA-2 reanalysis** state, so those
 * numbers are model estimates constrained by observations rather than
 * measurements of the sampled cell.
 *
 * The place panel's own card already says so — `climateInsightText` renders
 * "model-derived, not a direct measurement" in every branch it can take, from
 * the same table read here. This export was the surface that dropped it, and it
 * is the one read months later detached from the app that would have said so:
 * a reader opening the file sees a precise native-unit number, a DOI, a
 * measured inversion RMSE and a coverage share, every one of which describes a
 * modelled field exactly as faithfully as it would describe a measured one.
 * Nothing in the file distinguished the two.
 *
 * Derived from the product's own cited `source` here rather than taken from the
 * caller, for the reason `inversionAccuracy` and `observingConstraints` are:
 * modality is a fixed property of the published product, true of every value it
 * carries, so no sampling run can supply a version of it that disagrees. For
 * the same reason nothing here is per-month — attaching it to an observation
 * would imply it had been measured from that observation.
 *
 * A product absent from the modality table records `unclassified` with basis
 * `unknown`, which is never a finding that its value was measured. It reports
 * how the value was produced and nothing further: no condition, quality,
 * agreement, causation, or forecast claim follows from it.
 */
export interface PlaceObservationProductModality {
  /** Modality of the cited product, keyed by the product, never by a value. */
  modality: ObservationModality;
  /** The coarse production basis that modality falls under. */
  basis: ObservationBasis;
  /**
   * True exactly when `basis === "model"`. False for a remotely-sensed product
   * and for an unclassified one, whose basis is not asserted — a false here is
   * never a claim that the value is a direct measurement.
   */
  modelDerived: boolean;
  /** Honest, source-carrying sentence; no condition, quality, or value claim. */
  statement: string;
  /** The axis's own limits, carried so the record reads standalone. */
  limits: readonly string[];
}

/**
 * Classify a product by how it produces a value, in the modality table's own
 * words.
 *
 * `observationModality.ts` is the single place this repository asserts a
 * product's modality, and it is already what the place card renders, so reading
 * it here is what stops the download and the card on screen from disagreeing
 * about the same product.
 */
function productModalityFor(
  source: DatasetRef
): PlaceObservationProductModality {
  const modality = classifyModality(source);
  const info = describeModality(modality);
  const modelDerived = info.basis === "model";
  return {
    modality,
    basis: info.basis,
    modelDerived,
    statement: `${source.shortName} v${source.version} is ${indefiniteArticle(info.description)} ${info.description} (${modality}); ${modalityReadingClause(info.basis)}.`,
    limits: [...MODALITY_LIMITS],
  };
}

/**
 * The article a modality description takes, so a statement built from the
 * table's own words still reads as English ("is an unclassified product", not
 * "is a unclassified product"). Chosen from the leading letter because every
 * description is a plain noun phrase written in this repository.
 */
function indefiniteArticle(description: string): string {
  return /^[aeiou]/i.test(description) ? "an" : "a";
}

/** How a basis must be read, stated without sharpening what it can support. */
function modalityReadingClause(basis: ObservationBasis): string {
  switch (basis) {
    case "model":
      return "model-derived, not a direct measurement of the sampled cell";
    case "remote-sensing":
      return "remotely sensed, not a direct in-situ measurement";
    case "unknown":
      return "production basis not asserted for this product";
  }
}

/**
 * Bind a product to the observing-constraint descriptor published for it.
 *
 * Sea surface temperature is the one product this repository publishes a
 * descriptor for; `sstObservingConstraints` is its single source of truth and is
 * read verbatim, so the export can never state a constraint the app's other
 * surfaces do not. Every other layer records `not-published` — an honest gap a
 * later descriptor fills, not a finding that the product is unconstrained.
 */
/**
 * The vegetation descriptor's own direction vocabulary in the contract's terms.
 *
 * A `Record` rather than a cast so the two vocabularies cannot silently diverge:
 * the day the vegetation module adds a sign, this fails to compile until the
 * contract decides what that sign means to a reader. Mapping an asserted sign
 * onto `not-asserted` to keep the union narrow would drop a published finding,
 * so every member maps to a member that means the same thing.
 */
const VEGETATION_EXPORT_DIRECTIONS: Record<
  VegetationSamplingDirection,
  PlaceObservationSamplingDirection
> = {
  "green-leaning": "green-leaning",
  "sparse-leaning": "sparse-leaning",
  "not-asserted": "not-asserted",
};

function observingConstraintsForProduct(
  layerId: LayerId
): PlaceObservationObservingConstraints {
  if (layerId === SST_OBSERVING_CONSTRAINT_LAYER_ID) {
    const summary = summarizeSstObservingConstraints();
    return publishedConstraints(
      summary.representsFullDiurnalCycle,
      summary.constraints.map((entry) => ({
        id: entry.id,
        constraint: entry.constraint,
        implication: entry.implication,
        direction: entry.direction,
      })),
      summary.limits
    );
  }
  // The vegetation-index descriptor is published for the two MOD13A3 layers and
  // refuses to speak for a layer repointed off the GIBS identifier it was
  // written against, which is the question `vegetationObservingConstraintsApply`
  // answers. Only `ndvi` reaches this export today; `evi` is handled because the
  // descriptor asserts a genuinely different selection claim for it, and a
  // branch that quietly covered one of the two would be the omission this fixes.
  if (vegetationObservingConstraintsApply(layerId)) {
    const summary = summarizeVegetationObservingConstraints(layerId);
    return publishedConstraints(
      summary.representsFullDiurnalCycle,
      summary.constraints.map((entry) => ({
        id: entry.id,
        constraint: entry.constraint,
        implication: entry.implication,
        direction: VEGETATION_EXPORT_DIRECTIONS[entry.direction],
      })),
      summary.limits
    );
  }
  return {
    status: "not-published",
    claimScope: "product-observing-system-only",
    notPublishedReason: "no-descriptor-published-for-this-product",
    representsFullDiurnalCycle: null,
    constraints: [],
    limits: [],
  };
}

/** Assemble a published record, so each descriptor states only its own facts. */
function publishedConstraints(
  representsFullDiurnalCycle: boolean,
  constraints: PlaceObservationObservingConstraint[],
  limits: readonly string[]
): PlaceObservationObservingConstraints {
  return {
    status: "published",
    claimScope: "product-observing-system-only",
    notPublishedReason: null,
    representsFullDiurnalCycle,
    constraints,
    limits: [...limits],
  };
}

export interface PlaceObservationExport {
  schema: typeof PLACE_OBSERVATION_EXPORT_SCHEMA;
  kind: "place-observation-export";
  boundary: GeoGeometry;
  geography: typeof PLACE_OBSERVATION_GEOGRAPHY;
  products: PlaceObservationExportProduct[];
  method: {
    sampling: PlaceObservationSampling;
    imagery: typeof GIBS_IMAGERY_SOURCE;
    sourceImage: { width: number; height: number };
    valueMethod: "approximate-colormap-inversion";
  };
  generated: { iso: string; tool: "RoamingEye"; version: string };
  privacy: {
    includesPersonalData: false;
    includesHiddenTelemetry: false;
    excludedFields: readonly [
      "place-name",
      "search-query",
      "account-id",
      "session-id",
      "device-id",
    ];
  };
  reproducibility: {
    canonicalOrder: {
      products: "layer-id-ascending";
      observations: "data-month-ascending";
    };
    geography: PlaceObservationGeography;
    /**
     * Per-month record states across all exported products. This describes
     * only what the export contains; `not-recorded` makes no claim about
     * source-product availability.
     */
    dataMonthMatrix: PlaceObservationDataMonth[];
  };
  limitations: readonly [
    "Values are supplied sampling results in native source units.",
    "Rendered-imagery values are approximate; use the cited data product for measurement-grade work.",
    "The boundary is the requested sampling footprint; per-observation validFraction records usable sampled coverage.",
    "This export does not infer conditions, causes, risks, or future values.",
    "Coverage status describes the sampling result, not environmental condition or source-product availability.",
    "Data-month record states do not make values across products interchangeable or describe environmental condition.",
    "A legend-cap censoring record marks the month it names as a one-sided bound rather than a measurement; where no record is supplied, none was assessed, which is not evidence that no censoring occurred.",
    "An observation's valueBound marks that value as a bound the rendered ramp could not resolve past, never as a measurement; a null bound records that this observation was not assessed for one, which is not evidence its value was resolved.",
    "A product's inversionAccuracy is the measured end-to-end error of RoamingEye's UI legend gradient inverted against the published GIBS colormap, pooled over the whole ramp and stated in the product's native unit; it is not the source product's validation against in-situ measurement, and a layer recorded as uncharacterized carries an unmeasured inversion error rather than none.",
    "That figure does not always describe the inversion a product's values came from: inversionAccuracy.scope reports measures-a-different-inversion where the values were read through GIBS's published colormap rather than the UI legend gradient, and no validation run measures that inversion, so the quoted figure is neither this product's error nor evidence of a larger or smaller one.",
    "Not every product measured what it reports: observationModality.modelDerived marks a value produced by a land-surface model or an atmospheric reanalysis rather than sensed, and such a value is an estimate for the sampled cell rather than a measurement of it; an unclassified product's basis is not asserted, which is not a finding that it was measured.",
  ];
}

export type PlaceObservationCoverageStatus =
  "fraction-recorded" | "no-valid-samples" | "not-supplied";

export interface PlaceObservationExportProduct {
  layerId: LayerId;
  wmsLayer: string;
  source: DatasetRef;
  nativeUnit: string;
  samplingSupport: PlaceObservationSamplingSupport | null;
  sampleToNative: PlaceObservationValueTransform;
  samplingStrategy: GeometrySamplingStrategy | "unavailable";
  sourceImage: { width: number; height: number } | null;
  valueMapping: PlaceObservationValueMapping;
  legendCapCensoring: PlaceObservationLegendCapCensoring | null;
  /** Measured end-to-end error of the colormap inversion that produced `value`. */
  inversionAccuracy: PlaceObservationInversionAccuracy;
  /** What the product's observing system samples, and what it does not. */
  observingConstraints: PlaceObservationObservingConstraints;
  /** Whether the cited product measured the value or modelled it. */
  observationModality: PlaceObservationProductModality;
  observations: {
    dataMonth: string;
    value: number | null;
    validFraction: number | null;
    unavailableReason?: PlaceObservationUnavailableReason | null;
    coverageStatus: PlaceObservationCoverageStatus;
    valueBound: PlaceObservationValueBound | null;
  }[];
}

export type PlaceObservationRecordStatus =
  "value-recorded" | "no-data-recorded" | "not-recorded";

export interface PlaceObservationDataMonth {
  dataMonth: string;
  layers: {
    layerId: LayerId;
    recordStatus: PlaceObservationRecordStatus;
  }[];
}

/**
 * Machine-readable interpretation of the preserved GeoJSON boundary.
 *
 * CRS84 makes the longitude/latitude axis order explicit. A west bound greater
 * than the east bound is an intentional short-arc antimeridian envelope, not
 * an invalid or global footprint.
 */
export interface PlaceObservationGeography {
  geometryType: "Polygon" | "MultiPolygon";
  coordinateReferenceSystem: "OGC:CRS84";
  axisOrder: readonly ["longitude", "latitude"];
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  crossesAntimeridian: boolean;
}

/** Native product units for the independently sampled place-insight signals. */
export const PLACE_OBSERVATION_NATIVE_UNITS = {
  ndvi: NDVI_UNIT,
  precip: "kg/m²/s",
  soil: "kg/m²",
  airtemp: "K",
  // MOD11C3 stores land-surface temperature in kelvin. The panel card shows °C
  // for legibility, but the export keeps the product's own unit — the card's
  // Celsius is an exact −273.15 offset applied at render time, not a stored
  // value, and this record is the native-unit one.
  lst: "K",
  sst: "°C",
  // Column aerosol optical thickness at 550 nm is an optical property with no
  // physical unit; "dimensionless" is the product's own unit, not a placeholder
  // for one we failed to record.
  aerosol: "dimensionless",
} as const satisfies Partial<Record<LayerId, string>>;

export type PlaceObservationExportLayerId =
  keyof typeof PLACE_OBSERVATION_NATIVE_UNITS;

/**
 * A completed place sample before it is placed in the reproducibility record.
 * `sourceValueFactor` reverses a display conversion (for example, mm/day back
 * to GLDAS's kg/m²/s) so the export itself remains in native product units.
 */
export interface PlaceObservationExportSample {
  layerId: PlaceObservationExportLayerId;
  observations: readonly PlaceObservationInput[];
  /** Unit represented by the sampled values before native-unit conversion. */
  sampledUnit?: string;
  samplingStrategy?: GeometrySamplingStrategy;
  sourceImageDimensions?: { width: number; height: number };
  sourceValueFactor?: number;
  samplingSupport?: PlaceObservationSamplingSupport;
  colormapUrl?: string | null;
  usedUiLegendApproximation?: boolean;
  /** Open-ended legend-bin tally, when the sampler classified the colours. */
  legendCapCensoring?: PlaceObservationLegendCapCensoringInput;
}

/**
 * Preserve a completed SST sampler result as an export observation. A null
 * value is still a result: retain whether the rendered boundary had no usable
 * SST pixels or only partial coverage that could not support a value.
 *
 * A recorded value carries the same terminal-bin judgement the place card
 * renders it under. NASA's published SST ramp ends in two open caps, so a
 * boundary mean landing in the lowest or highest finite bin cannot be told
 * apart from one the ramp collapsed into a cap — the card states it as
 * `≤ 0.1 °C` or `≥ 31.9 °C` for exactly that reason. Writing the bare number
 * here would hand the downloaded record, the surface that outlives the panel,
 * a bound presented as a measurement, and the file's own limitations would then
 * read as though no censoring had been assessed when it had been, and found.
 * The number itself is unchanged: this marks how to read it, never re-estimates
 * it, and never guesses how far past the cap the true value lies.
 *
 * This is physical ocean-temperature sampling metadata, never biological
 * evidence or an ecological interpretation.
 */
export function sstPlaceObservationFromSample(
  dataMonth: YearMonth,
  value: number | null,
  validFraction: number
): PlaceObservationInput {
  if (value !== null) {
    const censoring = summarizeSstRampCensoring(value);
    return {
      dataMonth,
      value,
      validFraction,
      // Only a terminal bin yields a direction; an interior value is returned
      // unqualified so the record never carries doubt the ramp cannot justify.
      ...(censoring.boundDirection
        ? { valueBound: sstValueBound(censoring.boundDirection) }
        : {}),
    };
  }

  return {
    dataMonth,
    value: null,
    validFraction,
    unavailableReason: coverageUnavailableReason(validFraction),
  };
}

/**
 * Preserve a completed column-AOD sampler result as an export observation.
 *
 * The aerosol place card already screens both of its months with
 * {@link isRampSaturated}: NASA's rendered MERRA-2 ramp ends in an open
 * `≥ 0.900` bin that `parseColormapEntries` drops, so a boundary mean recovered
 * through it can rise no further than the topmost finite bin
 * (`AEROSOL_RAMP_CEILING`, 0.8975). Where a month rests there the card
 * says the true column may be higher, downgrades the loading tier to
 * "… or heavier", and withholds the month-over-month difference outright when
 * both months are capped.
 *
 * The downloaded record was built from those same two values and said none of
 * it, so a dust-outbreak or biomass-burning column left the app as a plain
 * number. That is the surface which outlives the panel — and the file's own
 * limitations state that an absent bound records an *unassessed* observation,
 * not a resolved one, which was untrue here: it had been assessed, on these
 * exact values, for the card.
 *
 * The number is unchanged. This marks how to read it, never re-estimates it,
 * and never guesses how far past the cap the true column lies. It is a
 * colour-ramp representability statement about total-column optical depth,
 * never surface air quality, an exposure or health claim, or a forecast.
 */
export function aerosolPlaceObservationFromSample(
  dataMonth: YearMonth,
  value: number | null,
  validFraction: number
): PlaceObservationInput {
  return {
    dataMonth,
    value,
    validFraction,
    // Only the open top bin censors this ramp — its low end is closed at 0 and
    // column AOD cannot be negative — so the one direction a capped month can
    // be wrong in is upward. An interior value is returned unqualified.
    ...(isRampSaturated(value) ? { valueBound: "at-or-above" as const } : {}),
  };
}

/**
 * Translate the ramp screen's bound direction into the export's contract
 * vocabulary. `"upper"` there means the ramp bounds the true SST from above —
 * the floor bin, where a censored colder pixel always decodes warmer than it
 * is — so the recorded value is one the truth sits at or below.
 */
function sstValueBound(
  boundDirection: "upper" | "lower"
): PlaceObservationValueBound {
  return boundDirection === "upper" ? "at-or-below" : "at-or-above";
}

/**
 * What a recorded coverage share says about why a month carries no value.
 *
 * A positive share is direct evidence the source published over part of the
 * boundary and this probe declined to average what it got — `weightedMeanValid`
 * withholds a region mean below its admission threshold while
 * `weightedValidFraction` still reports the share it saw. Only a zero share is
 * evidence the source had nothing here. Reporting the first case as
 * `source-no-data` blames the source for our own admission rule.
 */
function coverageUnavailableReason(
  validFraction: number
): PlaceObservationUnavailableReason {
  return validFraction > 0 ? "insufficient-valid-coverage" : "source-no-data";
}

const EXCLUDED_FIELDS = [
  "place-name",
  "search-query",
  "account-id",
  "session-id",
  "device-id",
] as const;

const LIMITATIONS = [
  "Values are supplied sampling results in native source units.",
  "Rendered-imagery values are approximate; use the cited data product for measurement-grade work.",
  "The boundary is the requested sampling footprint; per-observation validFraction records usable sampled coverage.",
  "This export does not infer conditions, causes, risks, or future values.",
  "Coverage status describes the sampling result, not environmental condition or source-product availability.",
  "Data-month record states do not make values across products interchangeable or describe environmental condition.",
  "A legend-cap censoring record marks the month it names as a one-sided bound rather than a measurement; where no record is supplied, none was assessed, which is not evidence that no censoring occurred.",
  "An observation's valueBound marks that value as a bound the rendered ramp could not resolve past, never as a measurement; a null bound records that this observation was not assessed for one, which is not evidence its value was resolved.",
  "A product's inversionAccuracy is the measured end-to-end error of RoamingEye's UI legend gradient inverted against the published GIBS colormap, pooled over the whole ramp and stated in the product's native unit; it is not the source product's validation against in-situ measurement, and a layer recorded as uncharacterized carries an unmeasured inversion error rather than none.",
  "That figure does not always describe the inversion a product's values came from: inversionAccuracy.scope reports measures-a-different-inversion where the values were read through GIBS's published colormap rather than the UI legend gradient, and no validation run measures that inversion, so the quoted figure is neither this product's error nor evidence of a larger or smaller one.",
  "Not every product measured what it reports: observationModality.modelDerived marks a value produced by a land-surface model or an atmospheric reanalysis rather than sensed, and such a value is an estimate for the sampled cell rather than a measurement of it; an unclassified product's basis is not asserted, which is not a finding that it was measured.",
] as const;

/** Create a JSON-ready, whitelist-only reproducibility record. */
export function createPlaceObservationExport(
  input: PlaceObservationExportInput
): PlaceObservationExport {
  validateInput(input);
  const products = exportProducts(input.products);
  const geography = exportGeography(input.boundary);

  return {
    schema: PLACE_OBSERVATION_EXPORT_SCHEMA,
    kind: "place-observation-export",
    boundary: cloneGeometry(input.boundary),
    geography: PLACE_OBSERVATION_GEOGRAPHY,
    products,
    method: {
      sampling: input.method.sampling,
      imagery: { ...GIBS_IMAGERY_SOURCE },
      sourceImage: {
        width: input.method.imageWidth,
        height: input.method.imageHeight,
      },
      valueMethod: "approximate-colormap-inversion",
    },
    generated: {
      iso: input.generatedIso,
      tool: "RoamingEye",
      version: input.toolVersion,
    },
    privacy: {
      includesPersonalData: false,
      includesHiddenTelemetry: false,
      excludedFields: [...EXCLUDED_FIELDS],
    },
    reproducibility: {
      canonicalOrder: {
        products: "layer-id-ascending",
        observations: "data-month-ascending",
      },
      geography,
      dataMonthMatrix: dataMonthMatrix(products),
    },
    limitations: [...LIMITATIONS],
  };
}

function exportGeography(boundary: GeoGeometry): PlaceObservationGeography {
  const bounds = geometryBounds(boundary);
  // validateInput establishes this invariant before export construction.
  if (!bounds) throw new Error("Boundary must have geographic bounds.");
  const west = canonicalCoordinate(normalizeLongitude(bounds.west));
  const east = canonicalCoordinate(normalizeLongitude(bounds.east));

  return {
    geometryType: boundary.type as "Polygon" | "MultiPolygon",
    coordinateReferenceSystem: "OGC:CRS84",
    axisOrder: ["longitude", "latitude"],
    bounds: {
      west,
      south: canonicalCoordinate(bounds.south),
      east,
      north: canonicalCoordinate(bounds.north),
    },
    crossesAntimeridian: west > east,
  };
}

function normalizeLongitude(longitude: number): number {
  if (longitude === 180) return 180;
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function canonicalCoordinate(coordinate: number): number {
  return Number(coordinate.toFixed(12));
}

/** Serialize the whitelist-only contract without adding hidden export fields. */
export function serializePlaceObservationExport(
  input: PlaceObservationExportInput
): string {
  return `${JSON.stringify(createPlaceObservationExport(input), null, 2)}\n`;
}

/**
 * Build a cited, native-unit product record from a completed place sample.
 * This intentionally supports only the independent place-insight signals;
 * no composite condition or derived score is introduced here. SST remains a
 * physical ocean observation and is never biological evidence.
 *
 * A null value whose sample recorded a coverage share gains the reason that
 * share implies ({@link coverageUnavailableReason}). Without this, a builder
 * that supplies coverage but no reason produces a record the unexplained-null
 * rule rejects, and because that rule is enforced during serialization the
 * rejection discards the *entire* export — every other product with it — rather
 * than the one month that lacked a reason. The two sampling paths that record
 * coverage without a reason are `lst` and `aerosol`, whose boundary means are
 * withheld below the sampler's admission threshold often enough (cloud on
 * MOD11C3, thin boundaries on either) that the download went missing whenever
 * sampling *succeeded* with a thin month, while a sampling *failure* kept it —
 * the placeholder path in `environmentUnavailableSample` always states a reason.
 *
 * A null value with no recorded coverage is left alone: there is no evidence to
 * read, and inventing `source-no-data` would assert the source published
 * nothing. Such a record still fails validation, which is the correct outcome
 * for a genuinely unexplained null.
 */
export function placeObservationProductFromSample(
  sample: PlaceObservationExportSample
): PlaceObservationProductInput {
  const layer = LAYERS[sample.layerId];
  const nativeUnit = PLACE_OBSERVATION_NATIVE_UNITS[sample.layerId];
  const sourceValueFactor = sample.sourceValueFactor ?? 1;
  if (!Number.isFinite(sourceValueFactor) || sourceValueFactor <= 0) {
    throw new Error("sourceValueFactor must be a positive finite number.");
  }
  if (!layer.dataset) {
    throw new Error(
      `Product ${sample.layerId} needs a complete source citation.`
    );
  }
  if (
    sample.samplingStrategy === undefined &&
    sample.observations.some((observation) => observation.value !== null)
  ) {
    throw new Error(
      `Product ${sample.layerId} needs a sampling strategy for recorded values.`
    );
  }

  return {
    layerId: sample.layerId,
    wmsLayer: layer.wmsLayer,
    source: layer.dataset,
    nativeUnit,
    samplingSupport: sample.samplingSupport,
    sampleToNative: {
      sampledUnit: sample.sampledUnit ?? nativeUnit,
      operation: "divide",
      factor: sourceValueFactor,
    },
    samplingStrategy: sample.samplingStrategy ?? "unavailable",
    sourceImageDimensions: sample.sourceImageDimensions
      ? { ...sample.sourceImageDimensions }
      : undefined,
    valueMapping: sample.colormapUrl
      ? { status: "gibs-colormap", url: sample.colormapUrl }
      : sample.usedUiLegendApproximation
        ? { status: "ui-legend-approximation", url: null }
        : { status: "not-available", url: null },
    legendCapCensoring: sample.legendCapCensoring,
    observations: sample.observations.map((observation) => ({
      ...observation,
      value:
        observation.value === null
          ? null
          : observation.value / sourceValueFactor,
      // A sample builder that recorded the month's coverage has already stated
      // why the value is absent; the reason is a reading of that share, not
      // extra knowledge. Deriving it here keeps a builder that supplies
      // coverage without a reason from failing the unexplained-null rule and
      // discarding the whole export — see the note on this function.
      ...(observation.value === null &&
      observation.unavailableReason === undefined &&
      observation.validFraction !== undefined
        ? {
            unavailableReason: coverageUnavailableReason(
              observation.validFraction
            ),
          }
        : {}),
    })),
  };
}

function validateInput(input: PlaceObservationExportInput): void {
  // Type check first, then detailed ring validation: isAreaGeometry also
  // rejects malformed rings, which would mask the specific footprint
  // diagnostics below behind the generic wrong-type message.
  if (
    input.boundary.type !== "Polygon" &&
    input.boundary.type !== "MultiPolygon"
  ) {
    throw new Error(
      "A Polygon or MultiPolygon boundary is required for export."
    );
  }
  if (!hasValidBoundaryCoordinates(input.boundary)) {
    throw new Error(
      "Boundary must contain closed GeoJSON rings with finite longitude/latitude coordinates in range and a non-zero area extent."
    );
  }
  if (!isIsoTimestamp(input.generatedIso)) {
    throw new Error(
      "generatedIso must be a calendar-valid ISO 8601 timestamp with a timezone."
    );
  }
  const generatedMonth = yearMonthFromIsoCalendar(input.generatedIso);
  if (!input.toolVersion.trim()) throw new Error("toolVersion is required.");
  if (input.products.length === 0)
    throw new Error("At least one product is required.");
  if (
    !isPositiveInteger(input.method.imageWidth) ||
    !isPositiveInteger(input.method.imageHeight)
  ) {
    throw new Error("Source image dimensions must be positive integers.");
  }

  const layerIds = new Set<LayerId>();
  for (const product of input.products) {
    if (layerIds.has(product.layerId)) {
      throw new Error(`Duplicate product layer: ${product.layerId}.`);
    }
    layerIds.add(product.layerId);
    if (
      !product.wmsLayer.trim() ||
      !product.nativeUnit.trim() ||
      (product.sampleToNative !== undefined &&
        !product.sampleToNative.sampledUnit.trim())
    ) {
      throw new Error("Each product needs a WMS layer and native unit.");
    }
    if (
      product.sampleToNative !== undefined &&
      (product.sampleToNative.operation !== "divide" ||
        !Number.isFinite(product.sampleToNative.factor) ||
        product.sampleToNative.factor <= 0)
    ) {
      throw new Error(
        `Product ${product.layerId} has an invalid sample-to-native transform.`
      );
    }
    if (
      product.samplingStrategy !== undefined &&
      !["boundary-grid", "boundary-point", "unavailable"].includes(
        product.samplingStrategy
      )
    ) {
      throw new Error(
        `Product ${product.layerId} has an invalid sampling strategy.`
      );
    }
    if (
      (product.samplingStrategy === undefined ||
        product.samplingStrategy === "unavailable") &&
      product.observations.some((observation) => observation.value !== null)
    ) {
      throw new Error(
        `Product ${product.layerId} must retain a boundary sampling strategy for recorded values.`
      );
    }
    if (
      product.sourceImageDimensions !== undefined &&
      (!isPositiveInteger(product.sourceImageDimensions.width) ||
        !isPositiveInteger(product.sourceImageDimensions.height))
    ) {
      throw new Error(
        `Product ${product.layerId} has invalid source-image dimensions.`
      );
    }
    if (
      product.observations.some((observation) => observation.value !== null) &&
      product.sourceImageDimensions === undefined
    ) {
      throw new Error(
        `Product ${product.layerId} must identify its source image when a value is recorded.`
      );
    }
    validateValueMapping(product.layerId, product.valueMapping);
    if (!hasCitation(product.source)) {
      throw new Error(
        `Product ${product.layerId} needs a complete source citation.`
      );
    }
    const configuredLayer = LAYERS[product.layerId];
    if (product.wmsLayer !== configuredLayer.wmsLayer) {
      throw new Error(
        `Product ${product.layerId} WMS layer does not match the configured RoamingEye data product.`
      );
    }
    if (
      !configuredLayer.dataset ||
      !sameDatasetRef(product.source, configuredLayer.dataset)
    ) {
      throw new Error(
        `Product ${product.layerId} citation does not match the configured RoamingEye data product.`
      );
    }
    if (product.samplingSupport) validateSamplingSupport(product);
    const months = new Set<string>();
    for (const observation of product.observations) {
      if (!isYearMonth(observation.dataMonth)) {
        throw new Error(
          `Product ${product.layerId} has an invalid data month.`
        );
      }
      const month = formatYearMonth(observation.dataMonth);
      if (month > generatedMonth) {
        throw new Error(
          `Product ${product.layerId} has data month ${month} after export generation month ${generatedMonth}.`
        );
      }
      if (months.has(month)) {
        throw new Error(
          `Product ${product.layerId} has duplicate month ${month}.`
        );
      }
      months.add(month);
      if (observation.value !== null && !Number.isFinite(observation.value)) {
        throw new Error(`Product ${product.layerId} has a non-finite value.`);
      }
      if (observation.value === null && !observation.unavailableReason) {
        throw new Error(
          `Product ${product.layerId} must explain an unavailable value.`
        );
      }
      if (
        observation.unavailableReason !== undefined &&
        !isPlaceObservationUnavailableReason(observation.unavailableReason)
      ) {
        throw new Error(
          `Product ${product.layerId} has an unsupported unavailable reason.`
        );
      }
      if (observation.value !== null && observation.unavailableReason) {
        throw new Error(
          `Product ${product.layerId} cannot mark a recorded value unavailable.`
        );
      }
      if (observation.value !== null && observation.validFraction === 0) {
        throw new Error(
          `Product ${product.layerId} has a value with zero sampled coverage.`
        );
      }
      if (
        observation.validFraction !== undefined &&
        (!Number.isFinite(observation.validFraction) ||
          observation.validFraction < 0 ||
          observation.validFraction > 1)
      ) {
        throw new Error(
          `Product ${product.layerId} has invalid sampled coverage.`
        );
      }
      if (
        observation.valueBound !== undefined &&
        !isPlaceObservationValueBound(observation.valueBound)
      ) {
        throw new Error(
          `Product ${product.layerId} has an unsupported value bound.`
        );
      }
      // A bound describes which side of a recorded number the truth lies on.
      // With no number there is nothing to bound, and emitting one would imply
      // a value the export does not carry.
      if (observation.value === null && observation.valueBound !== undefined) {
        throw new Error(
          `Product ${product.layerId} cannot bound an unavailable value.`
        );
      }
    }
    if (product.legendCapCensoring) {
      validateLegendCapCensoring(
        product.layerId,
        product.legendCapCensoring,
        months
      );
    }
  }
}

/**
 * A censoring tally that cannot be checked against the months it ships beside
 * is worse than none: it would qualify a value this file does not contain.
 * Validated after the month loop so the assessed month is compared against the
 * product's actual record.
 */
function validateLegendCapCensoring(
  layerId: LayerId,
  censoring: PlaceObservationLegendCapCensoringInput,
  months: ReadonlySet<string>
): void {
  if (!isYearMonth(censoring.assessedDataMonth)) {
    throw new Error(
      `Product ${layerId} has an invalid legend-cap censoring month.`
    );
  }
  if (!months.has(formatYearMonth(censoring.assessedDataMonth))) {
    throw new Error(
      `Product ${layerId} records legend-cap censoring for a month it does not export.`
    );
  }
  if (
    !isNonNegativeInteger(censoring.censoredSampleCount) ||
    !isNonNegativeInteger(censoring.valuedSampleCount)
  ) {
    throw new Error(
      `Product ${layerId} has invalid legend-cap censoring sample counts.`
    );
  }
  if (censoring.censoredSampleCount > censoring.valuedSampleCount) {
    throw new Error(
      `Product ${layerId} counts more censored cells than valued cells.`
    );
  }
  if (censoring.boundRelation !== "at-or-above") {
    throw new Error(
      `Product ${layerId} has an unsupported legend-cap bound relation.`
    );
  }
  if (!Number.isFinite(censoring.bound)) {
    throw new Error(`Product ${layerId} has a non-finite legend-cap bound.`);
  }
  if (
    censoring.publishedLabel.trim() === "" ||
    censoring.colormapDocument.trim() === ""
  ) {
    throw new Error(
      `Product ${layerId} must cite the published legend bin it was capped by.`
    );
  }
}

/**
 * Validate the exported geographic footprint before preserving it. The shared
 * GeoJSON helpers intentionally accept loose external data for display, while
 * a reproducibility record must not serialize malformed or ambiguous rings.
 */
function hasValidBoundaryCoordinates(boundary: GeoGeometry): boolean {
  const polygons =
    boundary.type === "Polygon"
      ? [boundary.coordinates]
      : boundary.type === "MultiPolygon"
        ? boundary.coordinates
        : null;
  if (!Array.isArray(polygons) || polygons.length === 0) return false;

  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) return false;
    for (const ring of polygon) {
      if (!isValidLinearRing(ring)) return false;
    }
  }

  return geometryBounds(boundary) !== null;
}

function isValidLinearRing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4) return false;
  const positions = value.map(validPosition);
  if (positions.some((position) => position === null)) return false;

  const ring = positions as [number, number][];
  const [firstLon, firstLat] = ring[0];
  const [lastLon, lastLat] = ring[ring.length - 1];
  if (firstLon !== lastLon || firstLat !== lastLat) return false;

  return (
    new Set(ring.slice(0, -1).map(([lon, lat]) => `${lon},${lat}`)).size >= 3 &&
    ringHasArea(ring)
  );
}

function ringHasArea(ring: [number, number][]): boolean {
  const unwrapped: [number, number][] = [[...ring[0]]];
  for (let index = 1; index < ring.length; index++) {
    let lon = ring[index][0];
    const lat = ring[index][1];
    const previousLon = unwrapped[index - 1][0];
    while (lon - previousLon > 180) lon -= 360;
    while (lon - previousLon < -180) lon += 360;
    unwrapped.push([lon, lat]);
  }

  let twiceArea = 0;
  const [originLon, originLat] = unwrapped[0];
  for (let index = 0; index + 1 < unwrapped.length; index++) {
    const [lon, lat] = unwrapped[index];
    const [nextLon, nextLat] = unwrapped[index + 1];
    twiceArea +=
      (lon - originLon) * (nextLat - originLat) -
      (nextLon - originLon) * (lat - originLat);
  }
  return Math.abs(twiceArea) > 1e-12;
}

function validPosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [lon, lat] = value;
  return typeof lon === "number" &&
    Number.isFinite(lon) &&
    lon >= -180 &&
    lon <= 180 &&
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90
    ? [lon, lat]
    : null;
}

function exportProducts(
  products: readonly PlaceObservationProductInput[]
): PlaceObservationExportProduct[] {
  return products
    .map((product) => ({
      layerId: product.layerId,
      wmsLayer: product.wmsLayer,
      // Emit citation fields in contract order rather than preserving the
      // caller's object insertion order. Equivalent citations must produce
      // byte-identical reproducibility records.
      source: canonicalDatasetRef(product.source),
      nativeUnit: product.nativeUnit,
      samplingSupport: product.samplingSupport
        ? { ...product.samplingSupport }
        : null,
      sampleToNative: product.sampleToNative
        ? { ...product.sampleToNative }
        : {
            sampledUnit: product.nativeUnit,
            operation: "divide" as const,
            factor: 1,
          },
      samplingStrategy: product.samplingStrategy ?? "unavailable",
      sourceImage: product.sourceImageDimensions
        ? { ...product.sourceImageDimensions }
        : null,
      valueMapping: exportValueMapping(product.valueMapping),
      legendCapCensoring: exportLegendCapCensoring(product.legendCapCensoring),
      // Derived here rather than taken from the caller: the measurement is a
      // property of the layer's committed validation run, not of any one
      // sampling, so no builder can supply a figure that disagrees with it.
      inversionAccuracy: inversionAccuracyForProduct(
        product.layerId,
        product.nativeUnit,
        product.valueMapping
      ),
      // Derived for the same reason: the observing system is a property of the
      // cited product, not of the sampling that read it.
      observingConstraints: observingConstraintsForProduct(product.layerId),
      // And for the same reason again, from the product's own citation: whether
      // the source measured this quantity or modelled it is fixed by the
      // product, so it is read from the cited `source` rather than supplied.
      observationModality: productModalityFor(product.source),
      observations: product.observations
        .map((observation) => ({
          dataMonth: formatYearMonth(observation.dataMonth),
          value: observation.value,
          validFraction: observation.validFraction ?? null,
          unavailableReason: observation.unavailableReason ?? null,
          coverageStatus: coverageStatus(observation.validFraction),
          // null records that this observation was not assessed for a bound —
          // deliberately not a claim that its value was resolved.
          valueBound: observation.valueBound ?? null,
        }))
        .sort((left, right) => compareText(left.dataMonth, right.dataMonth)),
    }))
    .sort((left, right) => compareText(left.layerId, right.layerId));
}

function exportValueMapping(
  mapping: PlaceObservationValueMapping | undefined
): PlaceObservationValueMapping {
  return mapping ? { ...mapping } : { status: "not-available", url: null };
}

/**
 * Emit the censoring tally in contract order, with the one derived bit stated
 * rather than left for a consumer to infer from the counts. `null` records
 * that no assessment was supplied — deliberately not a zeroed tally, which
 * would assert an uncensored footprint nobody measured.
 */
function exportLegendCapCensoring(
  censoring: PlaceObservationLegendCapCensoringInput | undefined
): PlaceObservationLegendCapCensoring | null {
  return censoring
    ? {
        assessedDataMonth: formatYearMonth(censoring.assessedDataMonth),
        censoredSampleCount: censoring.censoredSampleCount,
        valuedSampleCount: censoring.valuedSampleCount,
        bound: censoring.bound,
        boundRelation: censoring.boundRelation,
        publishedLabel: censoring.publishedLabel,
        colormapDocument: censoring.colormapDocument,
        valueIsOneSidedBound: censoring.censoredSampleCount > 0,
      }
    : null;
}

function validateValueMapping(
  layerId: LayerId,
  mapping: PlaceObservationValueMapping | undefined
): void {
  if (!mapping || mapping.status !== "gibs-colormap") return;

  let url: URL;
  try {
    url = new URL(mapping.url);
  } catch {
    throw new Error(`Product ${layerId} has an invalid GIBS colormap URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "gibs.earthdata.nasa.gov" ||
    !/^\/colormaps\/v\d+(?:\.\d+)*\/[^/]+\.xml$/.test(url.pathname)
  ) {
    throw new Error(`Product ${layerId} has an invalid GIBS colormap URL.`);
  }
}

function validateSamplingSupport(product: PlaceObservationProductInput): void {
  const support = product.samplingSupport!;
  const counts = [
    support.gridSize,
    support.candidatePointCount,
    support.interiorPointCount,
    support.retainedPointCount,
    support.sourcePixelCount,
  ];
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error(
      `Product ${product.layerId} has invalid sampling-support counts.`
    );
  }
  if (support.gridSize === 0 || support.candidatePointCount === 0) {
    throw new Error(
      `Product ${product.layerId} has an empty sampling-support plan.`
    );
  }
  if (
    support.interiorPointCount > support.candidatePointCount ||
    support.retainedPointCount > support.interiorPointCount ||
    support.sourcePixelCount > support.retainedPointCount
  ) {
    throw new Error(
      `Product ${product.layerId} has inconsistent sampling-support counts.`
    );
  }
  if (
    support.candidatePointCount !== support.gridSize * support.gridSize ||
    typeof support.pointLimitApplied !== "boolean" ||
    support.pointLimitApplied !==
      support.retainedPointCount < support.interiorPointCount
  ) {
    throw new Error(
      `Product ${product.layerId} has inconsistent sampling-support plan metadata.`
    );
  }
}

function coverageStatus(
  validFraction: number | undefined
): PlaceObservationCoverageStatus {
  if (validFraction === undefined) return "not-supplied";
  return validFraction === 0 ? "no-valid-samples" : "fraction-recorded";
}

function dataMonthMatrix(
  products: readonly PlaceObservationExportProduct[]
): PlaceObservationDataMonth[] {
  const dataMonths = new Set<string>();
  for (const product of products) {
    for (const observation of product.observations) {
      dataMonths.add(observation.dataMonth);
    }
  }

  return [...dataMonths].sort(compareText).map((dataMonth) => ({
    dataMonth,
    layers: products.map((product) => {
      const observation = product.observations.find(
        (candidate) => candidate.dataMonth === dataMonth
      );
      return {
        layerId: product.layerId,
        recordStatus:
          observation === undefined
            ? "not-recorded"
            : observation.value === null
              ? "no-data-recorded"
              : "value-recorded",
      };
    }),
  }));
}

function cloneGeometry(geometry: GeoGeometry): GeoGeometry {
  return {
    type: geometry.type,
    coordinates: structuredClone(geometry.coordinates),
  };
}

function hasCitation(source: DatasetRef): boolean {
  return [source.shortName, source.version, source.doi, source.title].every(
    (field) => field.trim().length > 0
  );
}

function sameDatasetRef(left: DatasetRef, right: DatasetRef): boolean {
  return (
    left.shortName === right.shortName &&
    left.version === right.version &&
    left.doi === right.doi &&
    left.title === right.title
  );
}

function canonicalDatasetRef(source: DatasetRef): DatasetRef {
  return {
    shortName: source.shortName,
    version: source.version,
    doi: source.doi,
    title: source.title,
  };
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isPlaceObservationUnavailableReason(
  value: unknown
): value is PlaceObservationUnavailableReason {
  return (
    typeof value === "string" &&
    PLACE_OBSERVATION_UNAVAILABLE_REASONS.some((reason) => reason === value)
  );
}

function isPlaceObservationValueBound(
  value: unknown
): value is PlaceObservationValueBound {
  return (
    typeof value === "string" &&
    PLACE_OBSERVATION_VALUE_BOUNDS.some((bound) => bound === value)
  );
}

function isIsoTimestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value
    );
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? null : Number(match[7]);
  const offsetMinute = match[8] === undefined ? null : Number(match[8]);
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (offsetHour !== null &&
      (offsetHour > 23 || offsetMinute === null || offsetMinute > 59))
  ) {
    return false;
  }

  // Date.parse normalizes impossible calendar dates (for example February
  // 30), so validate the represented wall-clock date before parsing the
  // offset-bearing instant.
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day &&
    !Number.isNaN(Date.parse(value))
  );
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    value.year >= 1000 &&
    value.year <= 9999 &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

/**
 * Preserve the calendar month explicitly written by the producer. Converting
 * to UTC first can move an export across a month boundary and falsely accept
 * or reject a source month depending on the producer's timezone.
 */
function yearMonthFromIsoCalendar(value: string): string {
  return value.slice(0, 7);
}

function formatYearMonth(value: YearMonth): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
