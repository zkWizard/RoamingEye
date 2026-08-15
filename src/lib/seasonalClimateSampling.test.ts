import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import { planSeasonalClimateSampling } from "./seasonalClimateSampling";
import { LAYERS, addMonths } from "./timeline";

describe("seasonal climate sampling plans", () => {
  it("requests only GLDAS-published January observations with source provenance", () => {
    const plan = planSeasonalClimateSampling(
      "precipitation-rate",
      { year: 2026, month: 1 },
      { baselineStartYear: 2016, minimumSamples: 10 }
    );

    expect(plan).toMatchObject({
      kind: "same-calendar-month-climate-sampling-plan",
      isForecast: false,
      status: "ready",
      metric: {
        nativeUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
        source: expect.objectContaining({ shortName: "GLDAS_NOAH025_M" }),
      },
      layer: { id: "precip" },
      sourceAvailability: {
        firstAvailableMonth: { year: 2000, month: 1 },
        availableThrough: LAYERS.precip.latest,
      },
      target: {
        dataMonth: { year: 2026, month: 1 },
        observationStatus: "not-sampled",
      },
      baselineStartYear: 2016,
      baselineEndYear: 2025,
      requiredSampleCount: 10,
      reason: null,
    });
    expect(
      plan.baselineRequests.map(({ dataMonth }) => dataMonth.year)
    ).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(plan.sampleMonths).toEqual([
      { year: 2026, month: 1 },
      ...plan.baselineRequests.map(({ dataMonth }) => dataMonth),
    ]);
  });

  it("uses each product's own availability rather than another layer's newer month", () => {
    // One month past GLDAS's end — and still inside MERRA-2's, which is the
    // whole point: the newer layer's record must not license this target.
    const beyondPrecip = addMonths(LAYERS.precip.latest!, 1);
    const precip = planSeasonalClimateSampling(
      "precipitation-rate",
      beyondPrecip
    );
    const air = planSeasonalClimateSampling("air-temperature-2m", beyondPrecip);

    expect(precip).toMatchObject({
      status: "target-not-yet-published",
      target: null,
      baselineRequests: [],
      sampleMonths: [],
      reason: "target-not-yet-published",
    });
    expect(air).toMatchObject({
      status: "ready",
      layer: { id: "airtemp" },
      sourceAvailability: {
        availableThrough: LAYERS.airtemp.latest,
      },
    });
  });

  it("keeps partial historical source records explicit instead of filling a baseline", () => {
    const plan = planSeasonalClimateSampling(
      "soil-moisture",
      { year: 2005, month: 1 },
      { minimumSamples: 10 }
    );

    expect(plan).toMatchObject({
      isForecast: false,
      status: "insufficient-source-history",
      target: { observationStatus: "not-sampled" },
      requiredSampleCount: 10,
      reason: "too-few-source-available-baseline-months",
    });
    expect(plan.baselineRequests.map(({ dataMonth }) => dataMonth)).toEqual([
      { year: 2000, month: 1 },
      { year: 2001, month: 1 },
      { year: 2002, month: 1 },
      { year: 2003, month: 1 },
      { year: 2004, month: 1 },
    ]);
  });

  it("does not request observations before the cited source record or for invalid options", () => {
    const beforeRecord = planSeasonalClimateSampling("soil-moisture", {
      year: 1999,
      month: 12,
    });
    const invalid = planSeasonalClimateSampling(
      "air-temperature-2m",
      { year: 2026, month: 3 },
      { baselineStartYear: 2020, baselineEndYear: 2019 }
    );

    expect(beforeRecord).toMatchObject({
      status: "target-before-source-record",
      target: null,
      sampleMonths: [],
      reason: "target-before-source-record",
    });
    expect(invalid).toMatchObject({
      status: "invalid-configuration",
      target: null,
      sampleMonths: [],
      reason: "invalid-sampling-configuration",
    });
  });
});
