import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import { createPlaceObservationExport } from "./placeObservationExport";
import { buildPlaceObservationExportInput } from "./placeObservationExportBuilder";

const boundary = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-77.1, 38.8],
      [-76.9, 38.8],
      [-76.9, 39.0],
      [-77.1, 39.0],
      [-77.1, 38.8],
    ],
  ],
};

describe("place observation export builder", () => {
  it("reverses only the documented rendered-unit conversion before export", () => {
    const input = buildPlaceObservationExportInput({
      boundary,
      generatedIso: "2026-07-13T08:00:00Z",
      toolVersion: "1.1.0",
      samples: [
        {
          layerId: "ndvi",
          months: [{ year: 2026, month: 4 }],
          values: [0.62],
          validFractions: [0.82],
          sourceToRenderedFactor: 1,
          sourceImageDimensions: { width: 512, height: 512 },
        },
        {
          layerId: "precip",
          months: [{ year: 2026, month: 1 }],
          values: [8.64],
          validFractions: [0.61],
          sourceToRenderedFactor: 86_400,
          sourceImageDimensions: { width: 512, height: 512 },
        },
      ],
    });

    const exported = createPlaceObservationExport(input);
    expect(exported.products).toMatchObject([
      {
        layerId: "ndvi",
        nativeUnit: "NDVI (unitless)",
        observations: [
          { dataMonth: "2026-04", value: 0.62, validFraction: 0.82 },
        ],
      },
      {
        layerId: "precip",
        nativeUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
        observations: [
          { dataMonth: "2026-01", value: 0.0001, validFraction: 0.61 },
        ],
      },
    ]);
    expect(exported.method).toMatchObject({
      sampling: "area-weighted-grid-mean",
      sourceImage: { width: 512, height: 512 },
    });
  });

  it("rejects incomplete or incompatible sampling provenance", () => {
    const sample = {
      layerId: "soil" as const,
      months: [{ year: 2026, month: 1 }],
      values: [12],
      validFractions: [0.7],
      sourceToRenderedFactor: 1,
      sourceImageDimensions: { width: 512, height: 512 },
    };
    expect(() =>
      buildPlaceObservationExportInput({
        boundary,
        generatedIso: "2026-07-13T08:00:00Z",
        toolVersion: "1.1.0",
        samples: [{ ...sample, validFractions: [] }],
      })
    ).toThrow("Sample soil has mismatched monthly values.");
    expect(() =>
      buildPlaceObservationExportInput({
        boundary,
        generatedIso: "2026-07-13T08:00:00Z",
        toolVersion: "1.1.0",
        samples: [{ ...sample, sourceToRenderedFactor: 0 }],
      })
    ).toThrow("Sample soil has an invalid source conversion.");
  });
});
