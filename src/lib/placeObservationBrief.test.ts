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
    expect(result.observationSelection).toEqual({
      vegetation: {
        recordedObservationCount: 2,
        earliestDataMonth: { year: 2025, month: 12 },
        latestDataMonth: { year: 2026, month: 1 },
        selectedDataMonth: { year: 2026, month: 1 },
      },
      rainfall: {
        recordedObservationCount: 2,
        earliestDataMonth: { year: 2025, month: 12 },
        latestDataMonth: { year: 2026, month: 1 },
        selectedDataMonth: { year: 2026, month: 1 },
      },
      "soil-moisture": {
        recordedObservationCount: 1,
        earliestDataMonth: { year: 2026, month: 1 },
        latestDataMonth: { year: 2026, month: 1 },
        selectedDataMonth: { year: 2026, month: 1 },
      },
      "air-temperature": {
        recordedObservationCount: 1,
        earliestDataMonth: { year: 2026, month: 3 },
        latestDataMonth: { year: 2026, month: 3 },
        selectedDataMonth: { year: 2026, month: 3 },
      },
    });
    expect(result.samplingProvenance).toEqual({
      vegetation: {
        samplingStrategy: "unavailable",
        samplingSupport: null,
        sampleToNative: {
          sampledUnit: NDVI_UNIT,
          operation: "divide",
          factor: 1,
        },
        selectedObservation: {
          dataMonth: { year: 2026, month: 1 },
          validFraction: 0.8,
          unavailableReason: null,
        },
      },
      rainfall: {
        samplingStrategy: "unavailable",
        samplingSupport: null,
        sampleToNative: {
          sampledUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
          operation: "divide",
          factor: 1,
        },
        selectedObservation: {
          dataMonth: { year: 2026, month: 1 },
          validFraction: 0.7,
          unavailableReason: null,
        },
      },
      "soil-moisture": {
        samplingStrategy: "unavailable",
        samplingSupport: null,
        sampleToNative: {
          sampledUnit: CLIMATE_METRICS["soil-moisture"].nativeUnit,
          operation: "divide",
          factor: 1,
        },
        selectedObservation: {
          dataMonth: { year: 2026, month: 1 },
          validFraction: 0,
          unavailableReason: "source-no-data",
        },
      },
      "air-temperature": {
        samplingStrategy: "unavailable",
        samplingSupport: null,
        sampleToNative: {
          sampledUnit: CLIMATE_METRICS["air-temperature-2m"].nativeUnit,
          operation: "divide",
          factor: 1,
        },
        selectedObservation: {
          dataMonth: { year: 2026, month: 3 },
          validFraction: 0.9,
          unavailableReason: null,
        },
      },
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
      coverage: { reason: "source-no-data" },
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

  it("retains bounded product sampling evidence without aliasing the export", () => {
    const record = exportRecord();
    const vegetation = record.products.find((p) => p.layerId === "ndvi")!;
    vegetation.samplingStrategy = "boundary-grid";
    vegetation.samplingSupport = {
      gridSize: 24,
      candidatePointCount: 576,
      interiorPointCount: 430,
      retainedPointCount: 400,
      sourcePixelCount: 388,
      pointLimitApplied: true,
    };
    vegetation.sampleToNative = {
      sampledUnit: "rendered NDVI",
      operation: "divide",
      factor: 10_000,
    };

    const result = composePlaceObservationBrief(record);

    expect(result.samplingProvenance.vegetation).toEqual({
      samplingStrategy: "boundary-grid",
      samplingSupport: vegetation.samplingSupport,
      sampleToNative: vegetation.sampleToNative,
      selectedObservation: {
        dataMonth: { year: 2026, month: 1 },
        validFraction: 0.8,
        unavailableReason: null,
      },
    });
    expect(result.samplingProvenance.vegetation!.samplingSupport).not.toBe(
      vegetation.samplingSupport
    );
    expect(result.samplingProvenance.vegetation!.sampleToNative).not.toBe(
      vegetation.sampleToNative
    );

    vegetation.samplingSupport.sourcePixelCount = 1;
    vegetation.sampleToNative.factor = 1;
    expect(
      result.samplingProvenance.vegetation!.samplingSupport!.sourcePixelCount
    ).toBe(388);
    expect(result.samplingProvenance.vegetation!.sampleToNative.factor).toBe(
      10_000
    );
  });

  it("rejects impossible external sampling support instead of restating it", () => {
    const record = exportRecord();
    const vegetation = record.products.find((p) => p.layerId === "ndvi")!;
    vegetation.samplingSupport = {
      gridSize: 24,
      candidatePointCount: 575,
      interiorPointCount: 430,
      retainedPointCount: 400,
      sourcePixelCount: 388,
      pointLimitApplied: true,
    };

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("rejected-sampling-support");
    expect(result.samplingProvenance.vegetation).toBeNull();
    expect(result.observationSelection.vegetation).toEqual({
      recordedObservationCount: 2,
      earliestDataMonth: null,
      latestDataMonth: null,
      selectedDataMonth: null,
    });
    expect(result.brief.signals[0]).toMatchObject({
      status: "unavailable",
      dataMonth: null,
      observedValue: null,
      coverage: { reason: "rejected-sampling-support" },
    });
  });

  it.each([
    {
      label: "non-integer counts",
      patch: { sourcePixelCount: 387.5 },
    },
    {
      label: "source pixels beyond retained points",
      patch: { sourcePixelCount: 401 },
    },
    {
      label: "a contradictory point-limit flag",
      patch: { pointLimitApplied: false },
    },
  ])("rejects $label in external sampling support", ({ patch }) => {
    const record = exportRecord();
    const vegetation = record.products.find((p) => p.layerId === "ndvi")!;
    vegetation.samplingSupport = {
      gridSize: 24,
      candidatePointCount: 576,
      interiorPointCount: 430,
      retainedPointCount: 400,
      sourcePixelCount: 388,
      pointLimitApplied: true,
      ...patch,
    };

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("rejected-sampling-support");
    expect(result.samplingProvenance.vegetation).toBeNull();
    expect(result.brief.signals[0].status).toBe("unavailable");
  });

  it.each([
    "source-no-data",
    "insufficient-valid-coverage",
    "sampling-failed",
  ] as const)("preserves the exported %s unavailable state", (reason) => {
    const record = exportRecord();
    record.products.find((p) => p.layerId === "precip")!.observations = [
      {
        dataMonth: "2026-01",
        value: null,
        validFraction: 0,
        unavailableReason: reason,
      },
    ];

    const result = composePlaceObservationBrief(record);

    expect(result.brief.signals[1]).toMatchObject({
      id: "rainfall",
      status: "no-data",
      observedValue: null,
      coverage: { validFraction: 0, reason },
    });
    expect(result.brief.signals[1].statement).toContain(`(${reason})`);
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
      coverage: { reason: "rejected-source" },
    });
    expect(result.brief.signals[3]).toMatchObject({
      status: "unavailable",
      coverage: { reason: "rejected-native-unit" },
    });
    expect(result.samplingProvenance.rainfall).toBeNull();
    expect(result.samplingProvenance["air-temperature"]).toBeNull();
  });

  it("distinguishes an accepted empty product from an unrecorded product", () => {
    const record = exportRecord();
    record.products.find((p) => p.layerId === "soil")!.observations = [];
    record.products = record.products.filter((p) => p.layerId !== "ndvi");

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus["soil-moisture"]).toBe("accepted");
    expect(result.brief.signals[2].coverage.reason).toBe(
      "no-observations-recorded"
    );
    expect(result.productStatus.vegetation).toBe("not-recorded");
    expect(result.brief.signals[0].coverage.reason).toBe(
      "product-not-recorded"
    );
  });

  it("rejects duplicate layer products instead of depending on array order", () => {
    const record = exportRecord();
    const vegetation = record.products.find((p) => p.layerId === "ndvi")!;
    record.products.push({
      ...vegetation,
      observations: [
        {
          dataMonth: "2026-02",
          value: 0.99,
          validFraction: 1,
        },
      ],
    });

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("rejected-duplicate-products");
    expect(result.brief.signals[0]).toMatchObject({
      status: "unavailable",
      observedValue: null,
      coverage: { reason: "rejected-duplicate-products" },
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
      coverage: { reason: "rejected-observation-months" },
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
    expect(result.observationSelection.vegetation).toEqual({
      recordedObservationCount: 2,
      earliestDataMonth: null,
      latestDataMonth: null,
      selectedDataMonth: null,
    });
    expect(result.brief.signals[0]).toMatchObject({
      status: "unavailable",
      dataMonth: null,
      observedValue: null,
      coverage: { reason: "rejected-observation-months" },
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

  it("rejects a product containing an observation dated after export generation", () => {
    const record = exportRecord();
    const vegetation = record.products.find(
      (product) => product.layerId === "ndvi"
    );
    if (!vegetation) throw new Error("Missing vegetation fixture");
    vegetation.observations.push({
      dataMonth: "2026-08",
      value: 0.62,
      validFraction: 0.85,
      unavailableReason: null,
    });

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe(
      "rejected-observation-after-generation"
    );
    expect(result.observationSelection.vegetation).toEqual({
      recordedObservationCount: 3,
      earliestDataMonth: null,
      latestDataMonth: null,
      selectedDataMonth: null,
    });
    expect(result.brief.signals[0]).toMatchObject({
      status: "unavailable",
      dataMonth: null,
      coverage: { reason: "rejected-observation-after-generation" },
    });
  });

  it("uses the generated timestamp's stated calendar month at timezone boundaries", () => {
    const record = exportRecord();
    record.generated.iso = "2026-01-31T23:30:00-08:00";
    const vegetation = record.products.find(
      (product) => product.layerId === "ndvi"
    );
    if (!vegetation) throw new Error("Missing vegetation fixture");
    vegetation.observations = [
      {
        dataMonth: "2026-01",
        value: 0.58,
        validFraction: 0.8,
        unavailableReason: null,
      },
    ];

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("accepted");
    expect(result.observationSelection.vegetation.selectedDataMonth).toEqual({
      year: 2026,
      month: 1,
    });
  });

  it.each([
    {
      name: "an unexplained null",
      observation: {
        dataMonth: "2026-01",
        value: null,
        unavailableReason: null,
      },
    },
    {
      name: "an unavailable reason attached to a value",
      observation: {
        dataMonth: "2026-01",
        value: 0.45,
        unavailableReason: "source-no-data",
      },
    },
    {
      name: "an unknown unavailable reason",
      observation: {
        dataMonth: "2026-01",
        value: null,
        unavailableReason: "cloudy",
      },
    },
    {
      name: "a non-finite value",
      observation: {
        dataMonth: "2026-01",
        value: Number.NaN,
        unavailableReason: null,
      },
    },
  ])("rejects $name from an external export record", ({ observation }) => {
    const record = exportRecord();
    record.products.find((p) => p.layerId === "ndvi")!.observations = [
      observation,
    ] as (typeof record.products)[number]["observations"];

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("rejected-observation-state");
    expect(result.observationSelection.vegetation).toEqual({
      recordedObservationCount: 1,
      earliestDataMonth: null,
      latestDataMonth: null,
      selectedDataMonth: null,
    });
    expect(result.samplingProvenance.vegetation).toBeNull();
    expect(result.brief.signals[0]).toMatchObject({
      status: "unavailable",
      dataMonth: null,
      observedValue: null,
      coverage: { reason: "rejected-observation-state" },
    });
  });

  it("records an accepted empty product without inventing a selected month", () => {
    const record = exportRecord();
    record.products.find((p) => p.layerId === "ndvi")!.observations = [];

    const result = composePlaceObservationBrief(record);

    expect(result.productStatus.vegetation).toBe("accepted");
    expect(result.observationSelection.vegetation).toEqual({
      recordedObservationCount: 0,
      earliestDataMonth: null,
      latestDataMonth: null,
      selectedDataMonth: null,
    });
    expect(result.brief.signals[0]).toMatchObject({
      status: "unavailable",
      dataMonth: null,
      observedValue: null,
    });
  });
});
