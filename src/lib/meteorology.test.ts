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
});
