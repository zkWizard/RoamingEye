import { describe, expect, it } from "vitest";
import {
  climateInsightText,
  climateMetricForLayer,
  exportObservationsFromRenderedClimateSample,
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
      geometrySamplingStrategy: "boundary-grid",
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
    expect(series.metric.sourceLayer).toBe(
      "GLDAS_Surface_Total_Precipitation_Rate_Monthly"
    );
    expect(series.observations[1].sourceImageDimensions).toEqual({
      width: 512,
      height: 512,
    });
    expect(series.observations[1].geometrySamplingStrategy).toBe(
      "boundary-grid"
    );
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
        geometrySamplingStrategy: "boundary-point",
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
        "No usable 2026-03 atmospheric reanalysis field (missing-value); single in-boundary image sample, not a regional mean; 0% sampled coverage; rendered source image 1024 x 512 px; reanalysis-derived, not a direct measurement; GIBS layer MERRA2_2m_Air_Temperature_Monthly; source M2TMNXSLV v5.12.4",
      });
  });

  it("identifies GLDAS values as model fields while retaining native comparisons", () => {
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
        geometrySamplingStrategy: "boundary-point",
      },
      { year: 2026, month: 2 }
    );

      expect(climateInsightText(summaries[0], summaries[1])).toEqual({
        value: "7.8 kg/m\u00b2",
        detail:
        "2026-02 land-surface-model field; +0.6 kg/m\u00b2 vs 2026-01; 90% sampled coverage; rendered source image dimensions not supplied; single in-boundary image sample, not a regional mean; model-derived, not a direct measurement; GIBS layer GLDAS_Underground_Soil_Moisture_Monthly; source GLDAS_NOAH025_M v2.1",
      });
  });

  it("refuses misaligned positional series", () => {
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

  it("keeps rendered values bound to the source months supplied at sampling time", () => {
    const months = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];
    const series = observationsFromRenderedClimateSample({
      metricId: "precipitation-rate",
      months,
      sampledValues: [4.32, null],
      nativeToSampledValueFactor: 86_400,
    });

    months[0].month = 6;
    months[1].year = 2027;

    expect(series.observations).toMatchObject([
      { dataMonth: { year: 2026, month: 1 }, value: 0.00005 },
      { dataMonth: { year: 2026, month: 2 }, value: null },
    ]);
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
        "2026-02 observed; +4.32 mm/day vs 2026-01; native source value 0.0001 kg/m²/s (1 kg/m² of liquid water ≡ 1 mm depth; × 86,400 s/day); 90% sampled coverage; rendered source image dimensions not supplied; sampling strategy not supplied; GIBS layer GLDAS_Surface_Total_Precipitation_Rate_Monthly; source GLDAS_NOAH025_M v2.1",
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

  it("withholds unusable rendered values from exports without losing month or coverage", () => {
    const observations = exportObservationsFromRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
          { year: 2026, month: 4 },
        ],
        sampledValues: [280, Number.NaN, null, null],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9, 0.8, 0.25, 0],
      },
      { year: 2026, month: 3 }
    );

    expect(observations).toEqual([
      {
        dataMonth: { year: 2026, month: 1 },
        value: 280,
        validFraction: 0.9,
      },
      {
        dataMonth: { year: 2026, month: 2 },
        value: null,
        unavailableReason: "sampling-failed",
        validFraction: 0.8,
      },
      {
        dataMonth: { year: 2026, month: 3 },
        value: null,
        unavailableReason: "insufficient-valid-coverage",
        validFraction: 0.25,
      },
      {
        dataMonth: { year: 2026, month: 4 },
        value: null,
        unavailableReason: "sampling-failed",
        validFraction: 0,
      },
    ]);
  });

  it("withholds physically impossible climate values from exports", () => {
    expect(
      exportObservationsFromRenderedClimateSample(
        {
          metricId: "precipitation-rate",
          months: [{ year: 2026, month: 1 }],
          sampledValues: [-1],
          nativeToSampledValueFactor: 86_400,
          validFractions: [1],
        },
        { year: 2026, month: 1 }
      )
    ).toEqual([
      {
        dataMonth: { year: 2026, month: 1 },
        value: null,
        unavailableReason: "sampling-failed",
        validFraction: 1,
      },
    ]);
  });

  it("rejects ambiguous or invalid rendered data-month identities", () => {
    const input = {
      metricId: "precipitation-rate" as const,
      sampledValues: [1, 2],
      nativeToSampledValueFactor: 86_400,
    };

    expect(() =>
      observationsFromRenderedClimateSample({
        ...input,
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 1 },
        ],
      })
    ).toThrow("unique and strictly increasing");

    expect(() =>
      observationsFromRenderedClimateSample({
        ...input,
        months: [
          { year: 2026, month: 2 },
          { year: 2026, month: 1 },
        ],
      })
    ).toThrow("unique and strictly increasing");

    expect(() =>
      observationsFromRenderedClimateSample({
        ...input,
        months: [
          { year: 2026, month: 0 },
          { year: 2026, month: 1 },
        ],
      })
    ).toThrow("invalid data month");
  });

  it("rejects a display conversion that does not belong to the cited climate metric", () => {
    expect(() =>
      observationsFromRenderedClimateSample({
        metricId: "soil-moisture",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [7.2],
        nativeToSampledValueFactor: 86_400,
      })
    ).toThrow(
      "soil-moisture rendered samples require native-to-sampled factor 1"
    );

    expect(() =>
      observationsFromRenderedClimateSample({
        metricId: "precipitation-rate",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [8.64],
        nativeToSampledValueFactor: 1,
      })
    ).toThrow(
      "precipitation-rate rendered samples require native-to-sampled factor 86400"
    );
  });

  it("does not round partial sampled coverage to zero or complete coverage", () => {
    const summaries = summarizeRenderedClimateSample(
      {
        metricId: "soil-moisture",
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
