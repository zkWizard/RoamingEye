import { describe, expect, it } from "vitest";
import { LAYERS } from "./timeline";
import {
  GIBS_IMAGERY_SOURCE,
  createPlaceObservationExport,
  placeObservationProductFromSample,
  serializePlaceObservationExport,
} from "./placeObservationExport";

const boundary = {
  type: "Polygon",
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

const input = {
  boundary,
  products: [
    {
      layerId: "ndvi" as const,
      wmsLayer: LAYERS.ndvi.wmsLayer,
      source: LAYERS.ndvi.dataset!,
      nativeUnit: "NDVI",
      observations: [
        {
          dataMonth: { year: 2026, month: 4 },
          value: 0.62,
          validFraction: 0.82,
        },
        { dataMonth: { year: 2026, month: 5 }, value: null },
      ],
    },
    {
      layerId: "precip" as const,
      wmsLayer: LAYERS.precip.wmsLayer,
      source: LAYERS.precip.dataset!,
      nativeUnit: "kg m^-2 s^-1",
      observations: [
        {
          dataMonth: { year: 2026, month: 4 },
          value: 0.00014,
          validFraction: 0.61,
        },
      ],
    },
  ],
  method: {
    sampling: "area-weighted-grid-mean" as const,
    imageWidth: 1024,
    imageHeight: 512,
  },
  generatedIso: "2026-07-13T06:00:00Z",
  toolVersion: "1.1.0",
};

describe("place observation export", () => {
  it("retains boundary, cited products, native units, months, coverage, and method", () => {
    const exported = createPlaceObservationExport(input);

    expect(exported).toMatchObject({
      schema: "roamingeye-place-observation-export/v1",
      kind: "place-observation-export",
      boundary,
      products: [
        {
          layerId: "ndvi",
          wmsLayer: LAYERS.ndvi.wmsLayer,
          source: LAYERS.ndvi.dataset,
          nativeUnit: "NDVI",
          observations: [
            { dataMonth: "2026-04", value: 0.62, validFraction: 0.82 },
            { dataMonth: "2026-05", value: null, validFraction: null },
          ],
        },
        {
          layerId: "precip",
          source: LAYERS.precip.dataset,
          nativeUnit: "kg m^-2 s^-1",
          observations: [
            { dataMonth: "2026-04", value: 0.00014, validFraction: 0.61 },
          ],
        },
      ],
      method: {
        sampling: "area-weighted-grid-mean",
        imagery: GIBS_IMAGERY_SOURCE,
        sourceImage: { width: 1024, height: 512 },
        valueMethod: "approximate-colormap-inversion",
      },
      generated: {
        iso: "2026-07-13T06:00:00Z",
        tool: "RoamingEye",
        version: "1.1.0",
      },
    });
    expect(exported.limitations.join(" ")).toMatch(
      /not infer conditions, causes, risks, or future values/i
    );
  });

  it("uses a whitelist-only contract with no personal-data or hidden-telemetry fields", () => {
    const exported = createPlaceObservationExport(input);
    expect(Object.keys(exported).sort()).toEqual([
      "boundary",
      "generated",
      "kind",
      "limitations",
      "method",
      "privacy",
      "products",
      "schema",
    ]);
    expect(exported.privacy).toEqual({
      includesPersonalData: false,
      includesHiddenTelemetry: false,
      excludedFields: [
        "place-name",
        "search-query",
        "account-id",
        "session-id",
        "device-id",
      ],
    });
    const dataBearingExport = Object.fromEntries(
      Object.entries(exported).filter(([key]) => key !== "privacy")
    );
    expect(JSON.stringify(dataBearingExport)).not.toMatch(
      /account|session|device|search-query/i
    );
  });

  it("serializes stable JSON and rejects ambiguous or invalid reproducibility metadata", () => {
    const json = serializePlaceObservationExport(input);
    expect(JSON.parse(json)).toEqual(createPlaceObservationExport(input));
    expect(json).toContain('"dataMonth": "2026-04"');

    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          ...input.products,
          {
            ...input.products[0],
            observations: input.products[0].observations,
          },
        ],
      })
    ).toThrow("Duplicate product layer: ndvi.");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        method: { ...input.method, imageWidth: 0 },
      })
    ).toThrow("Source image dimensions must be positive integers.");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            observations: [
              { dataMonth: { year: 2026, month: 4 }, value: 0.1 },
              { dataMonth: { year: 2026, month: 4 }, value: 0.2 },
            ],
          },
        ],
      })
    ).toThrow("Product ndvi has duplicate month 2026-04.");
  });

  it("reverses display conversions before exporting cited native units", () => {
    const precipitation = placeObservationProductFromSample({
      layerId: "precip",
      sourceValueFactor: 86_400,
      observations: [
        {
          dataMonth: { year: 2026, month: 4 },
          // The place card displays this equivalent rate as mm/day.
          value: 8.64,
          validFraction: 0.75,
        },
        { dataMonth: { year: 2026, month: 5 }, value: null },
      ],
    });

    expect(precipitation).toMatchObject({
      layerId: "precip",
      wmsLayer: LAYERS.precip.wmsLayer,
      source: LAYERS.precip.dataset,
      nativeUnit: "kg/m²/s",
      observations: [
        {
          dataMonth: { year: 2026, month: 4 },
          value: 0.0001,
          validFraction: 0.75,
        },
        { dataMonth: { year: 2026, month: 5 }, value: null },
      ],
    });

    expect(() =>
      placeObservationProductFromSample({
        layerId: "ndvi",
        observations: [],
        sourceValueFactor: 0,
      })
    ).toThrow("sourceValueFactor must be a positive finite number.");
  });
});
