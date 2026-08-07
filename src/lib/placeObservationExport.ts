import {
  geometryBounds,
  type GeoGeometry,
  type GeometrySamplingStrategy,
} from "./geojson";
import { NDVI_UNIT } from "./phenology";
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
  "roamingeye-place-observation-export/v4" as const;

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
  observations: readonly PlaceObservationInput[];
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
}

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
  observations: {
    dataMonth: string;
    value: number | null;
    validFraction: number | null;
    unavailableReason?: PlaceObservationUnavailableReason | null;
    coverageStatus: PlaceObservationCoverageStatus;
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
  sst: "°C",
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
}

/**
 * Preserve a completed SST sampler result as an export observation. A null
 * value is still a result: retain whether the rendered boundary had no usable
 * SST pixels or only partial coverage that could not support a value.
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
    return { dataMonth, value, validFraction };
  }

  return {
    dataMonth,
    value: null,
    validFraction,
    unavailableReason:
      validFraction > 0 ? "insufficient-valid-coverage" : "source-no-data",
  };
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
    }
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
      observations: product.observations
        .map((observation) => ({
          dataMonth: formatYearMonth(observation.dataMonth),
          value: observation.value,
          validFraction: observation.validFraction ?? null,
          unavailableReason: observation.unavailableReason ?? null,
          coverageStatus: coverageStatus(observation.validFraction),
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
