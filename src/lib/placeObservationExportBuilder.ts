import { CLIMATE_METRICS } from "./climate";
import { NDVI_UNIT } from "./phenology";
import type {
  PlaceObservationExportInput,
  PlaceObservationProductInput,
} from "./placeObservationExport";
import type { GeoGeometry } from "./geojson";
import { LAYERS, type LayerId, type YearMonth } from "./timeline";

/** The independently sampled signals supported by the place export workflow. */
export type PlaceObservationExportLayerId =
  "ndvi" | "precip" | "soil" | "airtemp";

export interface CalibratedPlaceObservationSample {
  layerId: PlaceObservationExportLayerId;
  /** Months and values have the same order and are retained without filling gaps. */
  months: readonly YearMonth[];
  /** Values returned by the cited GIBS colormap, before display formatting. */
  values: readonly (number | null)[];
  /** Share of the requested boundary that supplied a usable rendered value. */
  validFractions: readonly number[];
  /** Conversion applied while decoding the GIBS colormap (for example, 86400). */
  sourceToRenderedFactor: number;
  sourceImageDimensions: { width: number; height: number };
}

export interface PlaceObservationExportBuildInput {
  boundary: GeoGeometry;
  samples: readonly CalibratedPlaceObservationSample[];
  generatedIso: string;
  toolVersion: string;
}

/**
 * Build the existing reproducibility contract from calibrated place samples.
 *
 * The imagery sampler may apply a documented display conversion (GLDAS
 * precipitation rate to mm/day). This builder reverses only that conversion,
 * so exported values retain the cited product's native unit. Callers supply
 * only independently calibrated source samples; no output values are filled,
 * inferred, or combined here.
 */
export function buildPlaceObservationExportInput(
  input: PlaceObservationExportBuildInput
): PlaceObservationExportInput {
  if (input.samples.length === 0) {
    throw new Error("At least one calibrated place sample is required.");
  }
  const dimensions = input.samples[0].sourceImageDimensions;
  const products = input.samples.map((sample) => {
    if (
      sample.sourceImageDimensions.width !== dimensions.width ||
      sample.sourceImageDimensions.height !== dimensions.height
    ) {
      throw new Error(
        "All place samples must use the same source image dimensions."
      );
    }
    return productFromSample(sample);
  });

  return {
    boundary: input.boundary,
    products,
    method: {
      sampling: "area-weighted-grid-mean",
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
    },
    generatedIso: input.generatedIso,
    toolVersion: input.toolVersion,
  };
}

function productFromSample(
  sample: CalibratedPlaceObservationSample
): PlaceObservationProductInput {
  if (
    sample.months.length !== sample.values.length ||
    sample.months.length !== sample.validFractions.length
  ) {
    throw new Error(`Sample ${sample.layerId} has mismatched monthly values.`);
  }
  if (
    !Number.isFinite(sample.sourceToRenderedFactor) ||
    sample.sourceToRenderedFactor <= 0
  ) {
    throw new Error(
      `Sample ${sample.layerId} has an invalid source conversion.`
    );
  }
  const layer = LAYERS[sample.layerId];
  if (!layer.dataset) {
    throw new Error(`Layer ${sample.layerId} has no cited dataset.`);
  }

  return {
    layerId: sample.layerId,
    wmsLayer: layer.wmsLayer,
    source: layer.dataset,
    nativeUnit: nativeUnitFor(sample.layerId),
    observations: sample.months.map((dataMonth, index) => ({
      dataMonth,
      value: nativeValue(sample.values[index], sample.sourceToRenderedFactor),
      validFraction: sample.validFractions[index],
    })),
  };
}

function nativeValue(value: number | null, factor: number): number | null {
  if (value === null) return null;
  return value / factor;
}

function nativeUnitFor(layerId: PlaceObservationExportLayerId): string {
  switch (layerId) {
    case "ndvi":
      return NDVI_UNIT;
    case "precip":
      return CLIMATE_METRICS["precipitation-rate"].nativeUnit;
    case "soil":
      return CLIMATE_METRICS["soil-moisture"].nativeUnit;
    case "airtemp":
      return CLIMATE_METRICS["air-temperature-2m"].nativeUnit;
  }
}

/** Narrows a general layer id before a sampling result is retained for export. */
export function isPlaceObservationExportLayer(
  layerId: LayerId
): layerId is PlaceObservationExportLayerId {
  return (
    layerId === "ndvi" ||
    layerId === "precip" ||
    layerId === "soil" ||
    layerId === "airtemp"
  );
}
