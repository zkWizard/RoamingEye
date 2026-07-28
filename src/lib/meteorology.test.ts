import { describe, expect, it } from "vitest";
import {
  climateInsightText,
  climateMetricForLayer,
  observationsFromRenderedClimateSample,
  summarizeRenderedClimateSample,
} from "./meteorology";

describe("rendered monthly meteorology", () => {
  it("returns rendered precipitation to GLDAS native units with month and coverage intact", () => {
    const series = observationsFromRenderedClimateSample({
      metricId: "precipitation-rate",
      months: [
        { year: 2025, month: 12 },
        { year: 2026, month: 1 },
      ],
      sampledValues: [4.32, 8.64],
      nativeToSampledValueFactor: 86_400,
      validFractions: [0.81, 0.76],
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(series).toMatchObject({
      kind: "rendered-monthly-climate-observations",
      isForecast: false,
      metric: { source: { shortName: "GLDAS_NOAH025_M" } },
      observations: [
        {
          dataMonth: { year: 2025, month: 12 },
          value: 0.00005,
          validFraction: 0.81,
        },
        {
          dataMonth: { year: 2026, month: 1 },
          value: 0.0001,
          validFraction: 0.76,
        },
      ],
    });
    expect(series.metric.nativeUnit).toBe("kg/m\u00b2/s");
    expect(series.observations[1].sourceImageDimensions).toEqual({
      width: 512,
      height: 512,
    });
  });

  it("keeps native source values, missing samples, image provenance, and publication state explicit", () => {
    const summaries = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        sampledValues: [287.4, null],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9, 0],
        sourceImageDimensions: { width: 1024, height: 512 },
      },
      { year: 2026, month: 3 }
    );

    expect(summaries[0]).toMatchObject({
      observedValue: 287.4,
      metric: { nativeUnit: "K", source: { shortName: "M2TMNXSLV" } },
      sourceImageDimensions: { width: 1024, height: 512 },
    });
    expect(climateInsightText(summaries[0], summaries[1])).toEqual({
      value: "Unavailable",
      detail:
        "No usable 2026-03 observation (missing-value); 0% sampled coverage; rendered source image 1024 x 512 px; source M2TMNXSLV v5.12.4",
    });
  });

  it("keeps rendered image provenance aligned to each data month", () => {
    const summaries = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        sampledValues: [281, 282, 283],
        nativeToSampledValueFactor: 1,
        sourceImageDimensions: { width: 256, height: 256 },
        sourceImageDimensionsByMonth: [
          { width: 512, height: 256 },
          null,
          { width: 1024, height: 512 },
        ],
      },
      { year: 2026, month: 3 }
    );

    expect(summaries.map((summary) => summary.sourceImageDimensions)).toEqual([
      { width: 512, height: 256 },
      null,
      { width: 1024, height: 512 },
    ]);
    expect(climateInsightText(summaries[0], summaries[1]).detail).toContain(
      "rendered source image dimensions not supplied"
    );
  });

  it("uses native-unit comparisons and refuses misaligned positional series", () => {
    const summaries = summarizeRenderedClimateSample(
      {
        metricId: "soil-moisture",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [7.2, 7.8],
        nativeToSampledValueFactor: 1,
        validFractions: [0.8, 0.9],
      },
      { year: 2026, month: 2 }
    );

    expect(climateInsightText(summaries[0], summaries[1])).toEqual({
      value: "7.8 kg/m\u00b2",
      detail:
        "2026-02 observed; +0.6 kg/m\u00b2 vs 2026-01; 90% sampled coverage; rendered source image dimensions not supplied; approximate regional mean; source GLDAS_NOAH025_M v2.1",
    });
    expect(climateMetricForLayer("precip")).toBe("precipitation-rate");
    expect(climateMetricForLayer("ndvi")).toBeNull();
    expect(() =>
      observationsFromRenderedClimateSample({
        metricId: "soil-moisture",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [1, 2],
        nativeToSampledValueFactor: 1,
      })
    ).toThrow("matching lengths");
    expect(() =>
      observationsFromRenderedClimateSample({
        metricId: "soil-moisture",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [1],
        nativeToSampledValueFactor: 1,
        sourceImageDimensionsByMonth: [
          { width: 256, height: 256 },
          { width: 512, height: 512 },
        ],
      })
    ).toThrow("image provenance must have matching lengths");
  });

  it("shows conventional atmospheric units while retaining native conversion provenance", () => {
    const precipitation = summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [4.32, 8.64],
        nativeToSampledValueFactor: 86_400,
        validFractions: [0.8, 0.9],
      },
      { year: 2026, month: 2 }
    );
    const airTemperature = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [273.15, 274.15],
        nativeToSampledValueFactor: 1,
        validFractions: [1, 1],
      },
      { year: 2026, month: 2 }
    );

    expect(climateInsightText(precipitation[0], precipitation[1])).toEqual({
      value: "8.64 mm/day",
      detail:
        "2026-02 observed; +4.32 mm/day vs 2026-01; native source value 0.0001 kg/m²/s (1 kg/m² of liquid water ≡ 1 mm depth; × 86,400 s/day); 90% sampled coverage; rendered source image dimensions not supplied; approximate regional mean; source GLDAS_NOAH025_M v2.1",
    });
    expect(
      climateInsightText(airTemperature[0], airTemperature[1])
    ).toMatchObject({
      value: "1 °C",
      detail: expect.stringContaining(
        "+1 °C vs 2026-01; native source value 274.15 K (kelvin to Celsius is an exact −273.15 offset)"
      ),
    });
  });

  it("rejects invalid, duplicate, and reversed data months before pairing samples", () => {
    const input = {
      metricId: "precipitation-rate" as const,
      sampledValues: [0.1, 0.2],
      nativeToSampledValueFactor: 1,
    };

    expect(() =>
      observationsFromRenderedClimateSample({
        ...input,
        months: [
          { year: 2026, month: 0 },
          { year: 2026, month: 1 },
        ],
      })
    ).toThrow("invalid data month");
    expect(() =>
      observationsFromRenderedClimateSample({
        ...input,
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 1 },
        ],
      })
    ).toThrow("strictly increasing");
    expect(() =>
      observationsFromRenderedClimateSample({
        ...input,
        months: [
          { year: 2026, month: 2 },
          { year: 2026, month: 1 },
        ],
      })
    ).toThrow("strictly increasing");
  });

  it("preserves intentional gaps between ordered source months", () => {
    const series = observationsFromRenderedClimateSample({
      metricId: "air-temperature-2m",
      months: [
        { year: 2025, month: 11 },
        { year: 2026, month: 2 },
      ],
      sampledValues: [280, null],
      nativeToSampledValueFactor: 1,
      validFractions: [0.75, 0],
    });

    expect(series.observations).toEqual([
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2025, month: 11 },
        value: 280,
        validFraction: 0.75,
      },
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 2 },
        value: null,
        validFraction: 0,
      },
    ]);
  });

  it("does not round partial sampled coverage to zero or complete coverage", () => {
    const summaries = summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [0.00001, 0.00002],
        nativeToSampledValueFactor: 1,
        validFractions: [0.004, 0.9996],
      },
      { year: 2026, month: 2 }
    );

    expect(climateInsightText(undefined, summaries[0]).detail).toContain(
      "0.4% sampled coverage"
    );
    expect(climateInsightText(summaries[0], summaries[1]).detail).toContain(
      "99.96% sampled coverage"
    );
  });
});
