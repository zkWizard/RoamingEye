import { describe, expect, it } from "vitest";
import {
  climateInsightText,
  climateMetricForLayer,
  climateObservationPlausibility,
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
        "2026-02 land-surface-model field; +0.6 kg/m\u00b2 vs 2026-01 (at least 70% and at most 80% of the sampled area is common to both months); 90% sampled coverage; rendered source image dimensions not supplied; single in-boundary image sample, not a regional mean; model-derived, not a direct measurement; GIBS layer GLDAS_Underground_Soil_Moisture_Monthly; source GLDAS_NOAH025_M v2.1",
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
        "2026-02 land-surface-model field; +4.32 mm/day vs 2026-01 (at least 70% and at most 80% of the sampled area is common to both months); 28-day total 241.92 mm water-equivalent (mean rate integrated over the calendar month); native source value 0.0001 kg/m²/s (1 kg/m² of liquid water ≡ 1 mm depth; × 86,400 s/day); 90% sampled coverage; rendered source image dimensions not supplied; sampling strategy not supplied; model-derived, not a direct measurement; GIBS layer GLDAS_Surface_Total_Precipitation_Rate_Monthly; source GLDAS_NOAH025_M v2.1",
    });
    expect(
      climateInsightText(airTemperature[0], airTemperature[1])
    ).toMatchObject({
      value: "1 °C",
      detail: expect.stringContaining(
        "+1 °C vs 2026-01 (exactly 100% of the sampled area is common to both months); native source value 274.15 K (kelvin to Celsius is an exact −273.15 offset)"
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

  it("withholds deltas across different metrics, sources, and non-earlier months", () => {
    const [january, february] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [280, 282],
        nativeToSampledValueFactor: 1,
        validFractions: [1, 1],
      },
      { year: 2026, month: 2 }
    );
    const [soil] = summarizeRenderedClimateSample(
      {
        metricId: "soil-moisture",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [280],
        nativeToSampledValueFactor: 1,
        validFractions: [1],
      },
      { year: 2026, month: 2 }
    );

    expect(climateInsightText(soil, february).detail).toContain(
      "comparison unavailable (different climate metric or native unit)"
    );
    expect(
      climateInsightText(
        {
          ...january,
          metric: {
            ...january.metric,
            source: { ...january.metric.source, version: "different-version" },
          },
        },
        february
      ).detail
    ).toContain("comparison unavailable (different source product)");
    expect(climateInsightText(february, january).detail).toContain(
      "comparison unavailable (comparison month is not earlier)"
    );
    expect(climateInsightText(soil, february).detail).not.toContain("kg/m² vs");
  });

  it("applies the metric-appropriate gross-error band and none to soil moisture", () => {
    const [airTemperature] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [287.4],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9],
      },
      { year: 2026, month: 1 }
    );
    const [precipitation] = summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [8.64],
        nativeToSampledValueFactor: 86_400,
        validFractions: [0.9],
      },
      { year: 2026, month: 1 }
    );
    const [soil] = summarizeRenderedClimateSample(
      {
        metricId: "soil-moisture",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [280],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9],
      },
      { year: 2026, month: 1 }
    );

    expect(climateObservationPlausibility(airTemperature)).toMatchObject({
      status: "plausible",
    });
    expect(climateObservationPlausibility(airTemperature).statement).toContain(
      "not a correctness guarantee"
    );
    expect(climateObservationPlausibility(precipitation)).toMatchObject({
      status: "plausible",
    });
    // Soil moisture is out of scope here; no band is invented for it.
    expect(climateObservationPlausibility(soil)).toEqual({
      status: "not-checked",
      statement:
        "No gross-error plausibility band is defined for Surface soil moisture (0-10 cm)",
    });
  });

  it("does not check a band when there is no usable value to check", () => {
    const [missing] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [null],
        nativeToSampledValueFactor: 1,
        validFractions: [0],
      },
      { year: 2026, month: 1 }
    );

    expect(climateObservationPlausibility(missing)).toMatchObject({
      status: "not-checked",
    });
    expect(climateObservationPlausibility(missing).statement).toContain(
      "No usable 2 m air-temperature value to check"
    );
  });

  it("withholds an air-temperature value left in degrees Celsius rather than kelvin", () => {
    // 15 would be a plausible °C monthly mean but is an impossible 15 K reading.
    const [unconverted] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [15],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9],
        geometrySamplingStrategy: "boundary-grid",
      },
      { year: 2026, month: 1 }
    );

    expect(climateObservationPlausibility(unconverted)).toMatchObject({
      status: "implausible",
    });

    const insight = climateInsightText(undefined, unconverted);
    expect(insight.value).toBe("Unavailable");
    expect(insight.detail).toContain("implausibly-cold");
    expect(insight.detail).toContain("gross-error band (170–340 K");
    // Provenance survives the withheld value.
    expect(insight.detail).toContain("source M2TMNXSLV");
    expect(insight.detail).toContain("90% sampled coverage");
  });

  it("withholds a precipitation rate left in mm/day rather than kg/m²/s", () => {
    // A native 20 kg/m²/s is ~5 orders of magnitude above any monthly mean.
    const [unconverted] = summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [20 * 86_400],
        nativeToSampledValueFactor: 86_400,
        validFractions: [0.9],
      },
      { year: 2026, month: 1 }
    );

    const insight = climateInsightText(undefined, unconverted);
    expect(insight.value).toBe("Unavailable");
    expect(insight.detail).toContain("implausibly-wet");
    expect(insight.detail).toContain("gross-error band (0–0.01 kg/m²/s");
    expect(insight.detail).toContain("source GLDAS_NOAH025_M");
  });

  it("withholds a delta computed against an implausible comparison month", () => {
    const [decodeError, usable] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2025, month: 12 },
          { year: 2026, month: 1 },
        ],
        sampledValues: [15, 287.4],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9, 0.9],
      },
      { year: 2026, month: 1 }
    );

    const insight = climateInsightText(decodeError, usable);
    // The current month is usable, so its value is still reported (in the
    // conventional display unit, with the native kelvin value kept in detail).
    expect(insight.value).toBe("14.25 °C");
    expect(insight.detail).toContain("native source value 287.4 K");
    expect(insight.detail).toContain(
      "comparison unavailable (comparison month failed the gross-error plausibility band)"
    );
    expect(insight.detail).not.toContain("vs 2025-12");
  });

  it("leaves a plausible reading's value and delta untouched", () => {
    const [december, january] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2025, month: 12 },
          { year: 2026, month: 1 },
        ],
        sampledValues: [285.4, 287.4],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9, 0.9],
      },
      { year: 2026, month: 1 }
    );

    const insight = climateInsightText(december, january);
    expect(insight.value).not.toBe("Unavailable");
    expect(insight.detail).toContain("vs 2025-12");
    // A sanity pass is never announced as a quality claim.
    expect(insight.detail).not.toContain("plausib");
  });
});

/**
 * Precipitation climatology is conventionally reported as a monthly total, not
 * as the mean rate the source product stores. The place readout states both:
 * the total is the exact integration of the reported mean rate over the data
 * month's own calendar length, so it must track month length and must never
 * appear for a metric that is not a rate or for a month with no usable value.
 */
describe("place readout monthly precipitation accumulation", () => {
  const rateSummary = (month: { year: number; month: number }) =>
    summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months: [month],
        // 4.32 mm/day rendered is 5e-5 kg/m²/s native.
        sampledValues: [4.32],
        nativeToSampledValueFactor: 86_400,
        validFractions: [0.9],
        geometrySamplingStrategy: "boundary-grid",
      },
      month
    )[0];

  it("states the total depth integrated over the data month's own length", () => {
    // 5e-5 kg/m²/s x 31 days = 133.92 mm; the mm/day rate is kept alongside it.
    const detail = climateInsightText(
      undefined,
      rateSummary({ year: 2026, month: 1 })
    ).detail;
    expect(detail).toContain("31-day total 133.92 mm water-equivalent");
    expect(detail).toContain("mean rate integrated over the calendar month");
    expect(
      climateInsightText(undefined, rateSummary({ year: 2026, month: 1 })).value
    ).toBe("4.32 mm/day");
  });

  it("tracks calendar-month length rather than assuming a fixed month", () => {
    // Same mean rate, shorter month: 5e-5 x 28 days = 120.96 mm.
    expect(
      climateInsightText(undefined, rateSummary({ year: 2026, month: 2 }))
        .detail
    ).toContain("28-day total 120.96 mm water-equivalent");
    // A leap February is 29 days: 5e-5 x 29 days = 125.28 mm.
    expect(
      climateInsightText(undefined, rateSummary({ year: 2024, month: 2 }))
        .detail
    ).toContain("29-day total 125.28 mm water-equivalent");
  });

  it("adds no total for metrics that are not a precipitation rate", () => {
    const [airTemperature] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [287.4],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9],
      },
      { year: 2026, month: 1 }
    );
    const [soil] = summarizeRenderedClimateSample(
      {
        metricId: "soil-moisture",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [280],
        nativeToSampledValueFactor: 1,
        validFractions: [0.9],
      },
      { year: 2026, month: 1 }
    );

    expect(climateInsightText(undefined, airTemperature).detail).not.toContain(
      "water-equivalent"
    );
    expect(climateInsightText(undefined, soil).detail).not.toContain(
      "water-equivalent"
    );
  });

  it("withholds a total when the month has no usable observation", () => {
    const [noData] = summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [null],
        nativeToSampledValueFactor: 86_400,
        validFractions: [0],
      },
      { year: 2026, month: 1 }
    );
    const [unpublished] = summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months: [{ year: 2026, month: 6 }],
        sampledValues: [4.32],
        nativeToSampledValueFactor: 86_400,
        validFractions: [0.9],
      },
      { year: 2026, month: 1 }
    );

    // A missing total means "no total can be stated", never "no rain fell".
    expect(climateInsightText(undefined, noData).value).toBe("Unavailable");
    expect(climateInsightText(undefined, noData).detail).not.toContain(
      "water-equivalent"
    );
    expect(climateInsightText(undefined, unpublished).detail).not.toContain(
      "water-equivalent"
    );
  });
});

/**
 * A month-over-month difference on the place readout subtracts two area
 * aggregates, each taken over only its own month's usable pixels. When the two
 * months' coverage differs, part of that difference is a change in which ground
 * was aggregated. The readout must therefore carry the bound on how much ground
 * the two months can share, and must say plainly when that guarantee is zero.
 */
describe("place readout month-over-month shared-coverage bound", () => {
  const pair = (validFractions: readonly number[]) =>
    summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [286.15, 287.15],
        nativeToSampledValueFactor: 1,
        validFractions,
        geometrySamplingStrategy: "boundary-grid",
      },
      { year: 2026, month: 2 }
    );

  it("bounds the area the differenced months have in common", () => {
    // 0.9 + 0.85 − 1 = 0.75 guaranteed; the less-covered month caps it at 0.85.
    const [january, february] = pair([0.9, 0.85]);

    expect(climateInsightText(january, february).detail).toContain(
      "+1 °C vs 2026-01 (at least 75% and at most 85% of the sampled area is common to both months)"
    );
  });

  it("warns when two available months may share no ground at all", () => {
    // Both months are individually usable, yet 0.6 + 0.3 − 1 < 0: the readout
    // must not let the difference imply a change over one fixed place.
    const [january, february] = pair([0.6, 0.3]);

    expect(climateInsightText(january, february).detail).toContain(
      "+1 °C vs 2026-01 (the two months may share no common sampled area; at most 30% can overlap)"
    );
  });

  it("adds no bound when the difference itself is withheld", () => {
    const [january, february] = pair([0.9, 0.85]);

    // Reversed months are not differenced, so there is no overlap to qualify.
    const reversed = climateInsightText(february, january).detail;
    expect(reversed).toContain("comparison unavailable");
    expect(reversed).not.toContain("common to both months");
  });

  it("leaves the overlap unstated when a month supplied no coverage", () => {
    const [january, february] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [286.15, 287.15],
        nativeToSampledValueFactor: 1,
      },
      { year: 2026, month: 2 }
    );

    const detail = climateInsightText(january, february).detail;
    expect(detail).toContain("+1 °C vs 2026-01;");
    // Absent coverage must not be silently read as complete coverage.
    expect(detail).not.toContain("common to both months");
  });
});

describe("gross-error plausibility screening of reported atmosphere values", () => {
  // Each case is a published, fully covered month whose value carries the
  // right sign — so `climate.ts` admits it — but whose magnitude no monthly
  // mean could have. These are the signatures of a unit or decode mistake.
  const airTemperature = (sampled: number) =>
    summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [sampled],
        nativeToSampledValueFactor: 1,
        validFractions: [0.95],
      },
      { year: 2026, month: 3 }
    )[0];

  // Sampled precipitation is mm/day; native is kg/m²/s (÷ 86,400).
  const precipitation = (sampledMmPerDay: number) =>
    summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [sampledMmPerDay],
        nativeToSampledValueFactor: 86_400,
        validFractions: [0.95],
      },
      { year: 2026, month: 1 }
    )[0];

  it("still admits the value as a covered observation upstream", () => {
    // Establishes that this screen is load-bearing: without it the impossible
    // value is a published, available observation and would be printed.
    const summary = airTemperature(15);
    expect(summary.coverage).toMatchObject({ status: "available" });
    expect(summary.observedValue).toBe(15);
  });

  it.each([
    ["a °C figure never converted to kelvin", 15, "implausibly-cold"],
    ["a mis-scaled decode", 3000, "implausibly-warm"],
  ])("refuses to report air temperature from %s", (_label, sampled, status) => {
    const reading = climateInsightText(undefined, airTemperature(sampled));

    expect(reading.value).toBe("Unavailable");
    expect(reading.detail).toContain(status);
    // The cited basis travels with the refusal, not a bare rejection.
    expect(reading.detail).toContain("gross-error band");
    expect(reading.detail).toContain("source M2TMNXSLV");
  });

  it("refuses to report a precipitation rate above the cited band", () => {
    // ~2,000 mm/day as a monthly mean — ~6.7x the wettest calendar month
    // ever recorded, and ~2.3x the band's own upper bound.
    const reading = climateInsightText(undefined, precipitation(2000));

    expect(reading.value).toBe("Unavailable");
    expect(reading.detail).toContain("implausibly-wet");
    expect(reading.detail).toContain("Cherrapunji");
  });

  it("withholds an implausible value from the export as a sampling failure", () => {
    // Not "insufficient-valid-coverage": coverage was 95%. The defect is ours,
    // and the export must not blame the source for it.
    expect(
      exportObservationsFromRenderedClimateSample(
        {
          metricId: "air-temperature-2m",
          months: [{ year: 2026, month: 1 }],
          sampledValues: [3000],
          nativeToSampledValueFactor: 1,
          validFractions: [0.95],
        },
        { year: 2026, month: 3 }
      )
    ).toEqual([
      {
        dataMonth: { year: 2026, month: 1 },
        value: null,
        unavailableReason: "sampling-failed",
        validFraction: 0.95,
      },
    ]);
  });

  it("reports real extremes and ordinary months unchanged", () => {
    // The bands are drawn wider than any record, so a genuine extreme must
    // survive. Vostok's -89.2 °C and a 250 mm/day monsoon month both stand.
    for (const summary of [
      airTemperature(183.95),
      airTemperature(329.85),
      airTemperature(288.15),
      precipitation(250),
      precipitation(0),
    ]) {
      expect(climateInsightText(undefined, summary).value).not.toBe(
        "Unavailable"
      );
    }
  });

  it("leaves soil moisture unjudged, having no cited band of its own", () => {
    // Inventing a limit for a GLDAS soil-moisture store would be a fabricated
    // bound, not a cited one, so a large value is still reported.
    const soil = summarizeRenderedClimateSample(
      {
        metricId: "soil-moisture",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [9000],
        nativeToSampledValueFactor: 1,
        validFractions: [0.95],
      },
      { year: 2026, month: 1 }
    )[0];

    expect(climateInsightText(undefined, soil).value).not.toBe("Unavailable");
  });
});
