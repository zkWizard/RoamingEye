import { isAreaGeometry, type GeoGeometry } from "./geojson";
import type { DatasetRef, LayerId, YearMonth } from "./timeline";

/**
 * A deliberately small, provenance-first JSON contract for sharing sampled
 * place observations. It records the requested boundary and cited products,
 * but never adds account, session, search, or device information.
 *
 * The values in this contract are supplied sampling results. They are not a
 * diagnosis, a condition score, a forecast, or an interpretation of a place.
 */

export const PLACE_OBSERVATION_EXPORT_SCHEMA =
  "roamingeye-place-observation-export/v1" as const;

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
  limitations: readonly [
    "Values are supplied sampling results in native source units.",
    "Rendered-imagery values are approximate; use the cited data product for measurement-grade work.",
    "This export does not infer conditions, causes, risks, or future values.",
  ];
}

export interface PlaceObservationExportProduct {
  layerId: LayerId;
  wmsLayer: string;
  source: DatasetRef;
  nativeUnit: string;
  observations: {
    dataMonth: string;
    value: number | null;
    validFraction: number | null;
  }[];
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
] as const;

/** Create a JSON-ready, whitelist-only reproducibility record. */
export function createPlaceObservationExport(
  input: PlaceObservationExportInput
): PlaceObservationExport {
  validateInput(input);

  return {
    schema: PLACE_OBSERVATION_EXPORT_SCHEMA,
    kind: "place-observation-export",
    boundary: cloneGeometry(input.boundary),
    products: input.products.map((product) => ({
      layerId: product.layerId,
      wmsLayer: product.wmsLayer,
      source: { ...product.source },
      nativeUnit: product.nativeUnit,
      observations: product.observations.map((observation) => ({
        dataMonth: formatYearMonth(observation.dataMonth),
        value: observation.value,
        validFraction: observation.validFraction ?? null,
      })),
    })),
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
    limitations: LIMITATIONS,
  };
}

/** Serialize the whitelist-only contract without adding hidden export fields. */
export function serializePlaceObservationExport(
  input: PlaceObservationExportInput
): string {
  return `${JSON.stringify(createPlaceObservationExport(input), null, 2)}\n`;
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
