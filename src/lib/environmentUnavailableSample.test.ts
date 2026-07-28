import { describe, expect, it } from "vitest";
import { createPlaceObservationExport } from "./placeObservationExport";
import { environmentUnavailableSample } from "./environmentUnavailableSample";
import { placeObservationProductFromSample } from "./placeObservationExport";

const boundary = {
  type: "Polygon",
  coordinates: [
    [
      [-77.1, 38.8],
      [-76.9, 38.8],
      [-76.9, 39],
      [-77.1, 39],
      [-77.1, 38.8],
    ],
  ],
};

describe("environment unavailable sample", () => {
  it("keeps a failed SST sample exportable as an explicit unavailable record", () => {
    const sample = environmentUnavailableSample("sst", [
      { year: 2026, month: 5 },
    ]);
    const product = placeObservationProductFromSample(sample);
    const exported = createPlaceObservationExport({
      boundary,
      products: [product],
      method: {
        sampling: "area-weighted-grid-mean",
        imageWidth: 512,
        imageHeight: 512,
      },
      generatedIso: "2026-07-28T06:00:00Z",
      toolVersion: "1.2.0",
    });

    expect(exported.products[0]).toMatchObject({
      layerId: "sst",
      nativeUnit: "°C",
      samplingStrategy: "unavailable",
      observations: [
        {
          dataMonth: "2026-05",
          value: null,
          validFraction: null,
          unavailableReason: "sampling-failed",
        },
      ],
    });
    expect(exported.reproducibility.dataMonthMatrix).toEqual([
      {
        dataMonth: "2026-05",
        layers: [{ layerId: "sst", recordStatus: "no-data-recorded" }],
      },
    ]);
  });

  it("copies months so later caller mutation cannot change provenance", () => {
    const month = { year: 2026, month: 4 };
    const sample = environmentUnavailableSample("ndvi", [month]);
    month.month = 5;

    expect(sample.observations[0]).toEqual({
      dataMonth: { year: 2026, month: 4 },
      value: null,
      unavailableReason: "sampling-failed",
    });
  });
});
