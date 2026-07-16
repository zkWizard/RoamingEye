import { CLIMATE_METRICS } from "./climate";
import {
  composeEnvironmentBrief,
  type EnvironmentBrief,
  type EnvironmentObservation,
  type EnvironmentSignalId,
} from "./environmentBrief";
import { NDVI_UNIT } from "./phenology";
import type { PlaceObservationExport } from "./placeObservationExport";
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
  | "rejected-wms-layer"
  | "rejected-source"
  | "rejected-native-unit"
  | "rejected-observation-months";

export interface PlaceObservationBrief {
  kind: "place-observation-environment-brief";
  brief: EnvironmentBrief;
  /** Source acceptance is independent for every signal; it is not a score. */
  productStatus: Record<EnvironmentSignalId, PlaceObservationProductStatus>;
  limitations: readonly [
    "Only products matching the expected layer, WMS layer, citation, and native unit are used.",
    "Each signal uses its own product availability checkpoint and remains independent.",
    "The brief retains supplied approximate rendered-imagery observations; it does not infer conditions, causes, risks, or future values.",
  ];
}

const LIMITATIONS = [
  "Only products matching the expected layer, WMS layer, citation, and native unit are used.",
  "Each signal uses its own product availability checkpoint and remains independent.",
  "The brief retains supplied approximate rendered-imagery observations; it does not infer conditions, causes, risks, or future values.",
] as const;

/**
 * Select the latest supplied observation for every accepted product. Values
 * are kept in source-native units; absent and rejected products remain
 * explicit rather than being substituted or estimated.
 */
export function composePlaceObservationBrief(
  exportRecord: Pick<PlaceObservationExport, "products">
): PlaceObservationBrief {
  const productStatus = {} as Record<
    EnvironmentSignalId,
    PlaceObservationProductStatus
  >;
  const observations = {} as Record<
    EnvironmentSignalId,
    EnvironmentObservation | null
  >;

  for (const binding of SIGNAL_BINDINGS) {
    const product = exportRecord.products.find(
      (candidate) => candidate.layerId === binding.layerId
    );
    const status = productStatusFor(product, binding);
    productStatus[binding.signalId] = status;
    observations[binding.signalId] =
      status === "accepted" && product
        ? latestObservation(product.observations)
        : null;
  }

  return {
    kind: "place-observation-environment-brief",
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
    }),
    productStatus,
    limitations: LIMITATIONS,
  };
}

function productStatusFor(
  product: PlaceObservationExport["products"][number] | undefined,
  binding: SignalBinding
): PlaceObservationProductStatus {
  if (!product) return "not-recorded";
  const expected = LAYERS[binding.layerId];
  if (product.wmsLayer !== expected.wmsLayer) return "rejected-wms-layer";
  if (!sameSource(product.source, expected.dataset)) return "rejected-source";
  if (product.nativeUnit !== nativeUnitFor(binding.signalId)) {
    return "rejected-native-unit";
  }
  return hasCanonicalObservationMonths(product.observations)
    ? "accepted"
    : "rejected-observation-months";
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
  };
}

function invalidObservation(
  observation: PlaceObservationExport["products"][number]["observations"][number]
): EnvironmentObservation {
  return {
    dataMonth: { year: 0, month: 0 },
    value: observation.value,
    validFraction: observation.validFraction ?? undefined,
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
