import { CLIMATE_METRICS } from "./climate";
import {
  composeEnvironmentBrief,
  type EnvironmentBrief,
  type EnvironmentObservation,
  type EnvironmentSignalId,
  type EnvironmentUnavailableReason,
} from "./environmentBrief";
import { NDVI_UNIT } from "./phenology";
import type {
  PlaceObservationExport,
  PlaceObservationExportProduct,
  PlaceObservationSampling,
} from "./placeObservationExport";
import type { GeoGeometry } from "./geojson";
import {
  DATA_LATEST,
  LAYERS,
  compareYm,
  type DatasetRef,
  type LayerId,
  type YearMonth,
} from "./timeline";

/**
 * Adapts a provenance-preserving place-observation export to the existing
 * independent-signal brief. A product is accepted only if its layer, WMS
 * layer, citation, and native unit match RoamingEye's source catalog.
 */

interface SignalBinding {
  signalId: EnvironmentSignalId;
  layerId: LayerId;
}

const SIGNAL_BINDINGS: readonly SignalBinding[] = [
  { signalId: "vegetation", layerId: "ndvi" },
  { signalId: "rainfall", layerId: "precip" },
  { signalId: "soil-moisture", layerId: "soil" },
  { signalId: "air-temperature", layerId: "airtemp" },
];

export type PlaceObservationProductStatus =
  | "accepted"
  | "not-recorded"
  | "rejected-duplicate-products"
  | "rejected-wms-layer"
  | "rejected-source"
  | "rejected-native-unit"
  | "rejected-generation-timestamp"
  | "rejected-sampling-support"
  | "rejected-observation-months"
  | "rejected-observation-after-generation"
  | "rejected-observation-coverage"
  | "rejected-observation-state";

export interface PlaceObservationSelectionProvenance {
  /** Number of source observations recorded for this product. */
  recordedObservationCount: number;
  /** Earliest canonical source month considered; null for absent/rejected data. */
  earliestDataMonth: YearMonth | null;
  /** Latest canonical source month considered; null for absent/rejected data. */
  latestDataMonth: YearMonth | null;
  /** Month selected for the brief; null when no observation was selected. */
  selectedDataMonth: YearMonth | null;
}

export interface PlaceObservationSamplingProvenance {
  /** Exact searched-boundary strategy reported by the accepted product. */
  samplingStrategy: PlaceObservationExportProduct["samplingStrategy"];
  /**
   * Bounded sampler counts for the requested geography. Null means the export
   * did not report support; it must not be read as zero usable source pixels.
   */
  samplingSupport: PlaceObservationExportProduct["samplingSupport"];
  /** Exact conversion from rendered sample values to the cited native unit. */
  sampleToNative: PlaceObservationExportProduct["sampleToNative"];
  /** Provenance attached to the observation selected for the brief. */
  selectedObservation: {
    dataMonth: YearMonth;
    validFraction: number | null;
    unavailableReason: NonNullable<
      PlaceObservationExportProduct["observations"][number]["unavailableReason"]
    > | null;
  } | null;
}

export interface PlaceObservationBrief {
  kind: "place-observation-environment-brief";
  brief: EnvironmentBrief;
  /** Exact export context retained so the brief remains tied to its sample. */
  provenance: {
    exportSchema: PlaceObservationExport["schema"];
    boundary: GeoGeometry;
    sampling: PlaceObservationSampling;
    imagery: PlaceObservationExport["method"]["imagery"];
    sourceImage: PlaceObservationExport["method"]["sourceImage"];
    valueMethod: PlaceObservationExport["method"]["valueMethod"];
    generated: PlaceObservationExport["generated"];
  };
  /** Source acceptance is independent for every signal; it is not a score. */
  productStatus: Record<EnvironmentSignalId, PlaceObservationProductStatus>;
  /**
   * Bounded selection provenance for reproducing the latest-month choice.
   * Rejected products expose only their recorded count; malformed months are
   * never normalized or silently interpreted.
   */
  observationSelection: Record<
    EnvironmentSignalId,
    PlaceObservationSelectionProvenance
  >;
  /**
   * Per-product evidence supporting the brief. Rejected or absent products
   * expose null so their sampling metadata is never presented as accepted.
   */
  samplingProvenance: Record<
    EnvironmentSignalId,
    PlaceObservationSamplingProvenance | null
  >;
  limitations: readonly [
    "Only products matching the expected layer, WMS layer, citation, and native unit are used.",
    "The sampled boundary and export method are retained as provenance, not interpreted as environmental condition.",
    "Each signal uses its own product availability checkpoint and remains independent.",
    "The brief retains supplied approximate rendered-imagery observations; it does not infer conditions, causes, risks, or future values.",
  ];
}

const LIMITATIONS = [
  "Only products matching the expected layer, WMS layer, citation, and native unit are used.",
  "The sampled boundary and export method are retained as provenance, not interpreted as environmental condition.",
  "Each signal uses its own product availability checkpoint and remains independent.",
  "The brief retains supplied approximate rendered-imagery observations; it does not infer conditions, causes, risks, or future values.",
] as const;

/**
 * Select the latest supplied observation for every accepted product. Values
 * are kept in source-native units; absent and rejected products remain
 * explicit rather than being substituted or estimated.
 */
export function composePlaceObservationBrief(
  exportRecord: Pick<
    PlaceObservationExport,
    "schema" | "boundary" | "products" | "method" | "generated"
  >
): PlaceObservationBrief {
  const productStatus = {} as Record<
    EnvironmentSignalId,
    PlaceObservationProductStatus
  >;
  const observations = {} as Record<
    EnvironmentSignalId,
    EnvironmentObservation | null
  >;
  const observationSelection = {} as Record<
    EnvironmentSignalId,
    PlaceObservationSelectionProvenance
  >;
  const samplingProvenance = {} as Record<
    EnvironmentSignalId,
    PlaceObservationSamplingProvenance | null
  >;

  for (const binding of SIGNAL_BINDINGS) {
    const matchingProducts = exportRecord.products.filter(
      (candidate) => candidate.layerId === binding.layerId
    );
    const product =
      matchingProducts.length === 1 ? matchingProducts[0] : undefined;
    const status =
      matchingProducts.length > 1
        ? "rejected-duplicate-products"
        : productStatusFor(product, binding, exportRecord.generated.iso);
    productStatus[binding.signalId] = status;
    observations[binding.signalId] =
      status === "accepted" && product
        ? latestObservation(product.observations)
        : null;
    observationSelection[binding.signalId] = selectionProvenance(
      product,
      status,
      observations[binding.signalId]
    );
    samplingProvenance[binding.signalId] = productSamplingProvenance(
      product,
      status,
      observations[binding.signalId]
    );
  }

  return {
    kind: "place-observation-environment-brief",
    provenance: {
      exportSchema: exportRecord.schema,
      boundary: structuredClone(exportRecord.boundary),
      sampling: exportRecord.method.sampling,
      imagery: { ...exportRecord.method.imagery },
      sourceImage: { ...exportRecord.method.sourceImage },
      valueMethod: exportRecord.method.valueMethod,
      generated: { ...exportRecord.generated },
    },
    brief: composeEnvironmentBrief({
      vegetation: observations.vegetation,
      rainfall: observations.rainfall,
      soilMoisture: observations["soil-moisture"],
      airTemperature: observations["air-temperature"],
      availableThrough: latestForLayer("precip"),
      availableThroughBySignal: {
        rainfall: latestForLayer("precip"),
        "soil-moisture": latestForLayer("soil"),
        "air-temperature": latestForLayer("airtemp"),
      },
      unavailableReasonBySignal: unavailableReasons(
        productStatus,
        observations
      ),
    }),
    productStatus,
    observationSelection,
    samplingProvenance,
    limitations: LIMITATIONS,
  };
}

function productSamplingProvenance(
  product: PlaceObservationExportProduct | undefined,
  status: PlaceObservationProductStatus,
  selected: EnvironmentObservation | null
): PlaceObservationSamplingProvenance | null {
  if (status !== "accepted" || !product) return null;
  const selectedSourceObservation = selected
    ? product.observations.find(
        (observation) =>
          observation.dataMonth === formatYearMonth(selected.dataMonth)
      )
    : undefined;

  return {
    samplingStrategy: product.samplingStrategy,
    samplingSupport: product.samplingSupport
      ? { ...product.samplingSupport }
      : null,
    sampleToNative: { ...product.sampleToNative },
    selectedObservation:
      selected && selectedSourceObservation
        ? {
            dataMonth: { ...selected.dataMonth },
            validFraction: selectedSourceObservation.validFraction ?? null,
            unavailableReason:
              selectedSourceObservation.unavailableReason ?? null,
          }
        : null,
  };
}

function selectionProvenance(
  product: PlaceObservationExport["products"][number] | undefined,
  status: PlaceObservationProductStatus,
  selected: EnvironmentObservation | null
): PlaceObservationSelectionProvenance {
  const recordedObservationCount = product?.observations.length ?? 0;
  if (status !== "accepted" || !product || product.observations.length === 0) {
    return {
      recordedObservationCount,
      earliestDataMonth: null,
      latestDataMonth: null,
      selectedDataMonth: null,
    };
  }

  const months = product.observations.map((observation) => {
    const month = parseYearMonth(observation.dataMonth);
    // Accepted products have already passed hasCanonicalObservationMonths.
    if (!month) throw new Error("Accepted observation month was not canonical");
    return month;
  });
  let earliestDataMonth = months[0];
  let latestDataMonth = months[0];
  for (const month of months) {
    if (compareYm(month, earliestDataMonth) < 0) earliestDataMonth = month;
    if (compareYm(month, latestDataMonth) > 0) latestDataMonth = month;
  }

  return {
    recordedObservationCount,
    earliestDataMonth: { ...earliestDataMonth },
    latestDataMonth: { ...latestDataMonth },
    selectedDataMonth: selected ? { ...selected.dataMonth } : null,
  };
}

function unavailableReasons(
  productStatus: Record<EnvironmentSignalId, PlaceObservationProductStatus>,
  observations: Record<EnvironmentSignalId, EnvironmentObservation | null>
): Record<EnvironmentSignalId, EnvironmentUnavailableReason> {
  return Object.fromEntries(
    SIGNAL_BINDINGS.map((binding) => [
      binding.signalId,
      unavailableReasonFor(
        productStatus[binding.signalId],
        observations[binding.signalId]
      ),
    ])
  ) as Record<EnvironmentSignalId, EnvironmentUnavailableReason>;
}

function unavailableReasonFor(
  status: PlaceObservationProductStatus,
  observation: EnvironmentObservation | null
): EnvironmentUnavailableReason {
  if (status === "not-recorded") return "product-not-recorded";
  if (status !== "accepted") return status;
  return observation === null ? "no-observations-recorded" : "not-supplied";
}

function productStatusFor(
  product: PlaceObservationExport["products"][number] | undefined,
  binding: SignalBinding,
  generatedIso: string
): PlaceObservationProductStatus {
  if (!product) return "not-recorded";
  if (!isCanonicalIsoTimestamp(generatedIso)) {
    return "rejected-generation-timestamp";
  }
  const expected = LAYERS[binding.layerId];
  if (product.wmsLayer !== expected.wmsLayer) return "rejected-wms-layer";
  if (!sameSource(product.source, expected.dataset)) return "rejected-source";
  if (product.nativeUnit !== nativeUnitFor(binding.signalId)) {
    return "rejected-native-unit";
  }
  if (!hasConsistentSamplingSupport(product.samplingSupport)) {
    return "rejected-sampling-support";
  }
  if (!hasCanonicalObservationMonths(product.observations)) {
    return "rejected-observation-months";
  }
  if (hasObservationAfterGeneration(product.observations, generatedIso)) {
    return "rejected-observation-after-generation";
  }
  if (!hasConsistentObservationCoverage(product.observations)) {
    return "rejected-observation-coverage";
  }
  return hasConsistentObservationStates(product.observations)
    ? "accepted"
    : "rejected-observation-state";
}

/**
 * External JSON can reach the brief adapter without passing through the export
 * constructor. Reject malformed generation provenance here so later source
 * months are never accepted against an unknown or normalized calendar date.
 */
function isCanonicalIsoTimestamp(value: string): boolean {
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

  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day &&
    !Number.isNaN(Date.parse(value))
  );
}

/**
 * Recheck bounded sampler evidence at the brief ingestion boundary. Export
 * records can arrive from JSON or other structurally typed callers without
 * passing through createPlaceObservationExport, so impossible counts must not
 * be repeated as accepted provenance.
 */
function hasConsistentSamplingSupport(
  support: PlaceObservationExportProduct["samplingSupport"]
): boolean {
  if (support === null) return true;
  if (typeof support !== "object") return false;

  const counts = [
    support.gridSize,
    support.candidatePointCount,
    support.interiorPointCount,
    support.retainedPointCount,
    support.sourcePixelCount,
  ];
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
    return false;
  }
  if (
    support.gridSize === 0 ||
    support.candidatePointCount !== support.gridSize * support.gridSize
  ) {
    return false;
  }
  if (
    support.interiorPointCount > support.candidatePointCount ||
    support.retainedPointCount > support.interiorPointCount ||
    support.sourcePixelCount > support.retainedPointCount
  ) {
    return false;
  }
  return (
    typeof support.pointLimitApplied === "boolean" &&
    support.pointLimitApplied ===
      support.retainedPointCount < support.interiorPointCount
  );
}

function hasCanonicalObservationMonths(
  observations: PlaceObservationExport["products"][number]["observations"]
): boolean {
  const months = new Set<string>();
  for (const observation of observations) {
    if (!parseYearMonth(observation.dataMonth)) return false;
    if (months.has(observation.dataMonth)) return false;
    months.add(observation.dataMonth);
  }
  return true;
}

/**
 * An export cannot contain a source month later than the calendar month in
 * which it says it was generated. Compare the explicit ISO calendar month,
 * rather than converting to UTC and potentially shifting a timestamp near a
 * timezone boundary into an adjacent month.
 */
function hasObservationAfterGeneration(
  observations: PlaceObservationExport["products"][number]["observations"],
  generatedIso: string
): boolean {
  const generatedMonthMatch = /^(\d{4})-(\d{2})-\d{2}T/.exec(generatedIso);
  if (!generatedMonthMatch) return false;
  const generatedMonth = {
    year: Number(generatedMonthMatch[1]),
    month: Number(generatedMonthMatch[2]),
  };
  if (
    !Number.isInteger(generatedMonth.year) ||
    generatedMonth.month < 1 ||
    generatedMonth.month > 12
  ) {
    return false;
  }
  return observations.some((observation) => {
    const dataMonth = parseYearMonth(observation.dataMonth);
    return dataMonth !== null && compareYm(dataMonth, generatedMonth) > 0;
  });
}

function hasConsistentObservationStates(
  observations: PlaceObservationExport["products"][number]["observations"]
): boolean {
  const unavailableReasons = new Set([
    "source-no-data",
    "insufficient-valid-coverage",
    "sampling-failed",
  ]);
  return observations.every((observation) => {
    const hasValue =
      typeof observation.value === "number" &&
      Number.isFinite(observation.value);
    const hasUnavailableReason =
      typeof observation.unavailableReason === "string" &&
      unavailableReasons.has(observation.unavailableReason);
    return (
      (hasValue &&
        (observation.unavailableReason === null ||
          observation.unavailableReason === undefined)) ||
      (observation.value === null && hasUnavailableReason)
    );
  });
}

/**
 * Recheck serialized coverage before it is used or repeated as provenance.
 * Null means coverage was not reported; a numeric fraction is bounded to the
 * sampled area, and zero usable coverage cannot support a recorded value.
 */
function hasConsistentObservationCoverage(
  observations: PlaceObservationExport["products"][number]["observations"]
): boolean {
  return observations.every((observation) => {
    const fraction = observation.validFraction;
    if (fraction === null || fraction === undefined) return true;
    return (
      typeof fraction === "number" &&
      Number.isFinite(fraction) &&
      fraction >= 0 &&
      fraction <= 1 &&
      (observation.value === null || fraction > 0)
    );
  });
}

function nativeUnitFor(signalId: EnvironmentSignalId): string {
  switch (signalId) {
    case "vegetation":
      return NDVI_UNIT;
    case "rainfall":
      return CLIMATE_METRICS["precipitation-rate"].nativeUnit;
    case "soil-moisture":
      return CLIMATE_METRICS["soil-moisture"].nativeUnit;
    case "air-temperature":
      return CLIMATE_METRICS["air-temperature-2m"].nativeUnit;
  }
}

function latestObservation(
  observations: PlaceObservationExport["products"][number]["observations"]
): EnvironmentObservation | null {
  if (observations.length === 0) return null;
  const parsed = observations.map((observation) => ({
    observation,
    month: parseYearMonth(observation.dataMonth),
  }));
  const valid = parsed.filter(
    (entry): entry is typeof entry & { month: YearMonth } =>
      entry.month !== null
  );
  const latest = valid.reduce<(typeof valid)[number] | null>(
    (current, entry) =>
      !current || compareYm(entry.month, current.month) > 0 ? entry : current,
    null
  );
  if (!latest) return invalidObservation(parsed[0].observation);
  return {
    dataMonth: latest.month,
    value: latest.observation.value,
    validFraction: latest.observation.validFraction ?? undefined,
    unavailableReason: latest.observation.unavailableReason ?? undefined,
  };
}

function invalidObservation(
  observation: PlaceObservationExport["products"][number]["observations"][number]
): EnvironmentObservation {
  return {
    dataMonth: { year: 0, month: 0 },
    value: observation.value,
    validFraction: observation.validFraction ?? undefined,
    unavailableReason: observation.unavailableReason ?? undefined,
  };
}

function parseYearMonth(value: string): YearMonth | null {
  const match = /^(\d{4,})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
    ? { year, month }
    : null;
}

function formatYearMonth(value: YearMonth): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
}

function latestForLayer(layerId: LayerId): YearMonth {
  return LAYERS[layerId].latest ?? DATA_LATEST;
}

function sameSource(
  source: DatasetRef,
  expected: DatasetRef | undefined
): boolean {
  return (
    !!expected &&
    source.shortName === expected.shortName &&
    source.version === expected.version &&
    source.doi === expected.doi &&
    source.title === expected.title
  );
}
