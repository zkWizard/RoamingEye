import {
  isAreaGeometry,
  type GeoGeometry,
  type GeometrySamplingStrategy,
} from "./geojson";
import {
  LAYERS,
  type DatasetRef,
  type LayerId,
  type YearMonth,
} from "./timeline";

/**
 * A deliberately small, provenance-first JSON contract for sharing sampled
 * place observations. It records the requested boundary and cited products,
 * but never adds account, session, search, or device information.
 *
 * The values in this contract are supplied sampling results. They are not a
 * diagnosis, a condition score, a forecast, or an interpretation of a place.
 */

export const PLACE_OBSERVATION_EXPORT_SCHEMA =
  "roamingeye-place-observation-export/v3" as const;

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
  /** Exact searched-boundary strategy used for this product's observations. */
  samplingStrategy?: GeometrySamplingStrategy | "unavailable";
  observations: readonly PlaceObservationInput[];
}

export interface PlaceObservationInput {
  dataMonth: YearMonth;
  /** Supplied value in `nativeUnit`; null retains a source no-data result. */
  value: number | null;
  /** Supplied share of sampled area with a usable value. */
  validFraction?: number;
}

export interface PlaceObservationMethodInput {
  sampling: PlaceObservationSampling;
  imageWidth: number;
  imageHeight: number;
}

export interface PlaceObservationExport {
  schema: typeof PLACE_OBSERVATION_EXPORT_SCHEMA;
  kind: "place-observation-export";
  boundary: GeoGeometry;
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
    "This export does not infer conditions, causes, risks, or future values.",
    "Data-month record states do not make values across products interchangeable or describe environmental condition.",
  ];
}

export interface PlaceObservationExportProduct {
  layerId: LayerId;
  wmsLayer: string;
  source: DatasetRef;
  nativeUnit: string;
  samplingStrategy: GeometrySamplingStrategy | "unavailable";
  observations: {
    dataMonth: string;
    value: number | null;
    validFraction: number | null;
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

/** Native product units for the independently sampled place-insight signals. */
export const PLACE_OBSERVATION_NATIVE_UNITS = {
  ndvi: "NDVI",
  precip: "kg/m²/s",
  soil: "kg/m²",
  airtemp: "K",
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
  samplingStrategy?: GeometrySamplingStrategy;
  sourceValueFactor?: number;
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
  "This export does not infer conditions, causes, risks, or future values.",
  "Data-month record states do not make values across products interchangeable or describe environmental condition.",
] as const;

/** Create a JSON-ready, whitelist-only reproducibility record. */
export function createPlaceObservationExport(
  input: PlaceObservationExportInput
): PlaceObservationExport {
  validateInput(input);
  const products = exportProducts(input.products);

  return {
    schema: PLACE_OBSERVATION_EXPORT_SCHEMA,
    kind: "place-observation-export",
    boundary: cloneGeometry(input.boundary),
    products,
    method: {
      sampling: input.method.sampling,
      imagery: GIBS_IMAGERY_SOURCE,
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
      excludedFields: EXCLUDED_FIELDS,
    },
    reproducibility: {
      canonicalOrder: {
        products: "layer-id-ascending",
        observations: "data-month-ascending",
      },
      dataMonthMatrix: dataMonthMatrix(products),
    },
    limitations: LIMITATIONS,
  };
}

/** Serialize the whitelist-only contract without adding hidden export fields. */
export function serializePlaceObservationExport(
  input: PlaceObservationExportInput
): string {
  return `${JSON.stringify(createPlaceObservationExport(input), null, 2)}\n`;
}

/**
 * Build a cited, native-unit product record from a completed place sample.
 * This intentionally supports only the four independent place-insight
 * signals; no composite condition or derived score is introduced here.
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

  return {
    layerId: sample.layerId,
    wmsLayer: layer.wmsLayer,
    source: layer.dataset,
    nativeUnit,
    samplingStrategy: sample.samplingStrategy ?? "unavailable",
    observations: sample.observations.map((observation) => ({
      ...observation,
      value:
        observation.value === null
          ? null
          : observation.value / sourceValueFactor,
    })),
  };
}

function validateInput(input: PlaceObservationExportInput): void {
  if (!isAreaGeometry(input.boundary)) {
    throw new Error(
      "A Polygon or MultiPolygon boundary is required for export."
    );
  }
  if (!isIsoTimestamp(input.generatedIso)) {
    throw new Error("generatedIso must be an ISO 8601 timestamp.");
  }
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
    if (!product.wmsLayer.trim() || !product.nativeUnit.trim()) {
      throw new Error("Each product needs a WMS layer and native unit.");
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
    if (!hasCitation(product.source)) {
      throw new Error(
        `Product ${product.layerId} needs a complete source citation.`
      );
    }
    const months = new Set<string>();
    for (const observation of product.observations) {
      if (!isYearMonth(observation.dataMonth)) {
        throw new Error(
          `Product ${product.layerId} has an invalid data month.`
        );
      }
      const month = formatYearMonth(observation.dataMonth);
      if (months.has(month)) {
        throw new Error(
          `Product ${product.layerId} has duplicate month ${month}.`
        );
      }
      months.add(month);
      if (observation.value !== null && !Number.isFinite(observation.value)) {
        throw new Error(`Product ${product.layerId} has a non-finite value.`);
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
    }
  }
}

function exportProducts(
  products: readonly PlaceObservationProductInput[]
): PlaceObservationExportProduct[] {
  return products
    .map((product) => ({
      layerId: product.layerId,
      wmsLayer: product.wmsLayer,
      source: { ...product.source },
      nativeUnit: product.nativeUnit,
      samplingStrategy: product.samplingStrategy ?? "unavailable",
      observations: product.observations
        .map((observation) => ({
          dataMonth: formatYearMonth(observation.dataMonth),
          value: observation.value,
          validFraction: observation.validFraction ?? null,
        }))
        .sort((left, right) => compareText(left.dataMonth, right.dataMonth)),
    }))
    .sort((left, right) => compareText(left.layerId, right.layerId));
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

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

function formatYearMonth(value: YearMonth): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
