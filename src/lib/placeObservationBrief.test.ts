import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import { NDVI_UNIT } from "./phenology";
import { createPlaceObservationExport } from "./placeObservationExport";
import { composePlaceObservationBrief } from "./placeObservationBrief";
import { LAYERS } from "./timeline";

function sourceFor(layerId: keyof typeof LAYERS) {
  const source = LAYERS[layerId].dataset;
  if (!source) throw new Error(`Missing fixture source for ${layerId}`);
  return source;
}

function exportRecord() {
  return createPlaceObservationExport({
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-120, 35],
          [-119, 35],
          [-119, 36],
          [-120, 35],
        ],
      ],
    },
    products: [
      {
        layerId: "ndvi",
        wmsLayer: LAYERS.ndvi.wmsLayer,
        source: sourceFor("ndvi"),
        nativeUnit: NDVI_UNIT,
        observations: [
          { dataMonth: { year: 2025, month: 12 }, value: 0.41 },
          {
            dataMonth: { year: 2026, month: 1 },
            value: 0.58,
            validFraction: 0.8,
          },
        ],
      },
      {
        layerId: "precip",
        wmsLayer: LAYERS.precip.wmsLayer,
        source: sourceFor("precip"),
        nativeUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
        observations: [
          {
            dataMonth: { year: 2026, month: 1 },
            value: 0.00012,
            validFraction: 0.7,
          },
          { dataMonth: { year: 2025, month: 12 }, value: 0.0001 },
        ],
      },
      {
        layerId: "soil",
        wmsLayer: LAYERS.soil.wmsLayer,
        source: sourceFor("soil"),
        nativeUnit: CLIMATE_METRICS["soil-moisture"].nativeUnit,
        observations: [
          {
            dataMonth: { year: 2026, month: 1 },
            value: null,
            unavailableReason: "source-no-data",
            validFraction: 0,
          },
        ],
      },
      {
        layerId: "airtemp",
        wmsLayer: LAYERS.airtemp.wmsLayer,
        source: sourceFor("airtemp"),
        nativeUnit: CLIMATE_METRICS["air-temperature-2m"].nativeUnit,
        observations: [
          {
            dataMonth: { year: 2026, month: 3 },
            value: 289.4,
            validFraction: 0.9,
          },
        ],
      },
    ],
    method: {
      sampling: "area-weighted-grid-mean",
      imageWidth: 512,
      imageHeight: 512,
    },
    generatedIso: "2026-07-13T07:00:00.000Z",
    toolVersion: "test",
  });
}

describe("place observation environmental brief", () => {
  it("adapts latest native-unit observations with product-specific availability", () => {
    const record = exportRecord();
    const result = composePlaceObservationBrief(record);

    expect(result.kind).toBe("place-observation-environment-brief");
    expect(result.provenance).toEqual({
      exportSchema: "roamingeye-place-observation-export/v3",
      boundary: record.boundary,
      sampling: "area-weighted-grid-mean",
      imagery: record.method.imagery,
      sourceImage: { width: 512, height: 512 },
      valueMethod: "approximate-colormap-inversion",
      generated: {
        iso: "2026-07-13T07:00:00.000Z",
        tool: "RoamingEye",
        version: "test",
      },
    });
    expect(result.productStatus).toEqual({
      vegetation: "accepted",
      rainfall: "accepted",
      "soil-moisture": "accepted",
      "air-temperature": "accepted",
    });
    expect(result.brief.signals[0]).toMatchObject({
      id: "vegetation",
      observedValue: 0.58,
      dataMonth: { year: 2026, month: 1 },
    });
    expect(result.brief.signals[1]).toMatchObject({
      id: "rainfall",
      observedValue: 0.00012,
      nativeUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
    });
    expect(result.brief.signals[2]).toMatchObject({
      id: "soil-moisture",
      status: "no-data",
      observedValue: null,
    });
    expect(result.brief.signals[3]).toMatchObject({
      id: "air-temperature",
      status: "available",
      observedValue: 289.4,
      climateSummary: { availableThrough: { year: 2026, month: 3 } },
    });
    expect(result.brief.unsupportedLanguageHits).toEqual([]);
    expect("score" in result).toBe(false);
  });

  it("copies geography and method provenance instead of aliasing the export", () => {
    const record = exportRecord();
    const result = composePlaceObservationBrief(record);

    expect(result.provenance.boundary).not.toBe(record.boundary);
    expect(result.provenance.sourceImage).not.toBe(record.method.sourceImage);
    expect(result.provenance.generated).not.toBe(record.generated);

    (record.boundary.coordinates as [number, number][][])[0][0][0] = 999;
    record.method.sourceImage.width = 1;
    record.generated.iso = "changed";

    expect(
      (result.provenance.boundary.coordinates as [number, number][][])[0][0]
    ).toEqual([-120, 35]);
    expect(result.provenance.sourceImage.width).toBe(512);
    expect(result.provenance.generated.iso).toBe("2026-07-13T07:00:00.000Z");
  });

  it("rejects source or unit mismatches instead of relabelling them", () => {
    const record = exportRecord();
    // Products are canonically ordered by layer id in the export, so address
    // them by layer id rather than fixture order.
    const precip = record.products.find((p) => p.layerId === "precip")!;
    precip.source = { ...precip.source, version: "other" };
    const airtemp = record.products.find((p) => p.layerId === "airtemp")!;
    airtemp.nativeUnit = "C";

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.rainfall).toBe("rejected-source");
    expect(result.productStatus["air-temperature"]).toBe(
      "rejected-native-unit"
    );
    expect(result.brief.signals[1]).toMatchObject({
      status: "unavailable",
      coverage: { reason: "not-supplied" },
    });
    expect(result.brief.signals[3]).toMatchObject({
      status: "unavailable",
      coverage: { reason: "not-supplied" },
    });
  });

  it("rejects an invalid serialized month rather than treating it as absent", () => {
    const record = exportRecord();
    record.products.find((p) => p.layerId === "ndvi")!.observations = [
      { dataMonth: "2026-13", value: 0.45, validFraction: 0.8 },
    ];

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("rejected-observation-months");
    expect(result.brief.signals[0]).toMatchObject({
      status: "unavailable",
      observedValue: null,
      coverage: { reason: "not-supplied" },
    });
  });

  it("rejects the whole product when a malformed month accompanies a valid record", () => {
    const record = exportRecord();
    record.products.find((p) => p.layerId === "ndvi")!.observations = [
      { dataMonth: "2026-01", value: 0.45, validFraction: 0.8 },
      { dataMonth: "2026-13", value: 0.72, validFraction: 0.9 },
    ];

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("rejected-observation-months");
    expect(result.brief.signals[0]).toMatchObject({
      status: "unavailable",
      dataMonth: null,
      observedValue: null,
      coverage: { reason: "not-supplied" },
    });
  });

  it("rejects duplicate serialized months rather than choosing one value", () => {
    const record = exportRecord();
    record.products.find((p) => p.layerId === "ndvi")!.observations = [
      { dataMonth: "2026-01", value: 0.45, validFraction: null },
      { dataMonth: "2026-01", value: 0.72, validFraction: null },
    ];

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("rejected-observation-months");
    expect(result.brief.signals[0].status).toBe("unavailable");
  });
});
