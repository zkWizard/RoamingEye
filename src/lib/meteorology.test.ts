import { describe, expect, it } from "vitest";
import {
  climateInsightText,
  climateMetricForLayer,
  climateObservationPlausibility,
  exportObservationsFromRenderedClimateSample,
  observationsFromRenderedClimateSample,
  placeMetricUnavailableDetail,
  summarizeRenderedClimateSample,
} from "./meteorology";
import { MEASURED_INVERSION } from "./validation";

/**
 * The inversion-difference floor the readout prints for a pair of month
 * lengths, formatted the way the readout formats it. Derived from the published
 * figure rather than restated, so a recalibration cannot leave these
 * expectations asserting a number the app no longer shows.
 */
const floorText = (earlierDays: number, laterDays: number) =>
  Number(
    (
      (MEASURED_INVERSION.precip.rmse as number) *
      Math.hypot(earlierDays, laterDays)
    ).toPrecision(5)
  ).toString();

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
        "2026-02 land-surface-model field; +0.6 kg/m\u00b2 vs 2026-01 (at least 70% and at most 80% of the sampled area is common to both months); 90% sampled coverage; the shortfall can include ground at or above the legend's 50 kg/m\u00b2 ceiling, which GIBS renders in an open end cap this probe reads as no-data, so the value is a mean over representable ground only; the 2026-01 mean it is differenced against is itself a mean over representable ground only, so part of the difference can be a change in what the legend could represent rather than in the field; rendered source image dimensions not supplied; single in-boundary image sample, not a regional mean; model-derived, not a direct measurement; GIBS layer GLDAS_Underground_Soil_Moisture_Monthly; source GLDAS_NOAH025_M v2.1",
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
        "2026-02 land-surface-model field; +4.32 mm/day vs 2026-01 (at least 70% and at most 80% of the sampled area is common to both months); 28-day total 241.92 mm water-equivalent (mean rate integrated over the calendar month); 108 mm more than 2026-01's 31-day total (part of any difference is month length, not rate); native source value 0.0001 kg/m²/s (1 kg/m² of liquid water ≡ 1 mm depth; × 86,400 s/day); 90% sampled coverage; the shortfall can include ground at or above the legend's 43.2 mm/day ceiling, which GIBS renders in an open end cap this probe reads as no-data, so the value is a mean over representable ground only; the 2026-01 mean it is differenced against is itself a mean over representable ground only, so part of the difference can be a change in what the legend could represent rather than in the field; rendered source image dimensions not supplied; sampling strategy not supplied; model-derived, not a direct measurement; GIBS layer GLDAS_Surface_Total_Precipitation_Rate_Monthly; source GLDAS_NOAH025_M v2.1",
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
 * The readout's rate difference and its monthly total answer different
 * questions, and a reader cannot bridge them without knowing both months'
 * calendar lengths. These cover the case that makes the gap consequential: a
 * mean rate that rose over a month that delivered less water.
 */
describe("place readout month-over-month precipitation accumulation change", () => {
  const ratePair = (
    months: readonly { year: number; month: number }[],
    mmPerDay: readonly number[]
  ) =>
    summarizeRenderedClimateSample(
      {
        metricId: "precipitation-rate",
        months,
        sampledValues: mmPerDay,
        nativeToSampledValueFactor: 86_400,
        validFractions: months.map(() => 1),
        geometrySamplingStrategy: "boundary-grid",
      },
      months[months.length - 1]
    );

  it("reports less water over a shorter month whose mean rate rose", () => {
    // 2026-01 at 3 mm/day over 31 days is 93 mm; 2026-02 at 3.2 mm/day over 28
    // days is 89.6 mm. The rate rose while 3.4 mm less water fell — the two
    // readings disagree in sign purely because February is shorter.
    const [january, february] = ratePair(
      [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ],
      [3, 3.2]
    );

    const detail = climateInsightText(january, february).detail;
    expect(detail).toContain("+0.2 mm/day vs 2026-01");
    expect(detail).toContain("28-day total 89.6 mm water-equivalent");
    expect(detail).toContain(
      "3.4 mm less than 2026-01's 31-day total (part of any difference is month length, not rate;"
    );
  });

  it("reports a total held level by month length as little change", () => {
    // 2026-03 at 3 mm/day over 31 days and 2026-04 at 3.1 mm/day over 30 days
    // both total 93 mm: the higher rate bought exactly the day that was lost.
    const [march, april] = ratePair(
      [
        { year: 2026, month: 3 },
        { year: 2026, month: 4 },
      ],
      [3, 3.1]
    );

    const detail = climateInsightText(march, april).detail;
    expect(detail).toContain("+0.1 mm/day vs 2026-03");
    expect(detail).toContain("within 1 mm of 2026-03's 31-day total");
  });

  /**
   * Both totals are rendered colours inverted through an approximate legend and
   * then integrated over a calendar month, which scales the layer's measured
   * rate error by that month's day count. The floor is derived from the
   * published figure here so a legend recalibration moves the expectation with
   * the clause instead of leaving a stale literal behind.
   */
  it("says when the two totals are closer than the measured inversion can separate", () => {
    const [january, february] = ratePair(
      [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ],
      [3, 3.2]
    );

    const detail = climateInsightText(january, february).detail;
    // 3.4 mm apart, against a floor built from a 31-day and a 28-day month.
    expect(detail).toContain(
      `the two totals differ by less than the ${floorText(31, 28)} mm colormap-inversion difference floor for these month lengths, so this pipeline cannot separate them`
    );
    // The caveat qualifies the comparison; it never withdraws the direction the
    // clause reported, nor claims the two months delivered the same water.
    expect(detail).toContain("3.4 mm less than 2026-01's 31-day total");
    expect(detail).not.toContain("no change");
  });

  it("qualifies a little-change call, whose 1 mm band is well inside the floor", () => {
    const [march, april] = ratePair(
      [
        { year: 2026, month: 3 },
        { year: 2026, month: 4 },
      ],
      [3, 3.1]
    );

    const detail = climateInsightText(march, april).detail;
    expect(detail).toContain(
      `within 1 mm of 2026-03's 31-day total (part of any difference is month length, not rate; the two totals differ by less than the ${floorText(31, 30)} mm`
    );
  });

  it("stays silent when the difference clears the floor", () => {
    // 93 mm against 168 mm: far outside anything the inversion error explains,
    // so the clause adds nothing and the line keeps its original shape.
    const [january, february] = ratePair(
      [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ],
      [3, 6]
    );

    const detail = climateInsightText(january, february).detail;
    expect(detail).toContain(
      "75 mm more than 2026-01's 31-day total (part of any difference is month length, not rate)"
    );
    expect(detail).not.toContain("colormap-inversion difference floor");
  });

  it("withholds a total difference across non-consecutive months", () => {
    // A gap month is not summed over or interpolated; the rate comparison the
    // readout already permits does not license a total difference.
    const [january, march] = ratePair(
      [
        { year: 2026, month: 1 },
        { year: 2026, month: 3 },
      ],
      [3, 3.2]
    );

    const detail = climateInsightText(january, march).detail;
    expect(detail).toContain("31-day total");
    expect(detail).not.toContain("-day total (part of any difference");
    expect(detail).not.toContain("mm less than");
    expect(detail).not.toContain("mm more than");
  });

  it("adds no total difference for a single month or a non-rate metric", () => {
    const [onlyMonth] = ratePair([{ year: 2026, month: 1 }], [3]);
    expect(climateInsightText(undefined, onlyMonth).detail).not.toContain(
      "than 2026"
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
    expect(
      climateInsightText(airTemperature[0], airTemperature[1]).detail
    ).not.toContain("-day total");
  });
});

/**
 * The readout prints a month-over-month air-temperature difference to five
 * significant figures. Both months are colormap inversions, so a difference of
 * two of them carries a sqrt(2) x RMSE noise floor — about 0.69 K at the
 * measured 0.485 K. Differences of a few tenths are ordinary near the seasonal
 * turning points and throughout the deep tropics, so the readout must say when
 * the pair it is differencing sits inside that floor.
 */
describe("place readout month-over-month air-temperature inversion floor", () => {
  const airPair = (earlierK: number, laterK: number) =>
    summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [earlierK, laterK],
        nativeToSampledValueFactor: 1,
        validFractions: [1, 1],
      },
      { year: 2026, month: 2 }
    );

  // Derived from the committed figure so a recalibration moves the expectation
  // with the code rather than leaving a stale literal asserting the old floor.
  // Formatted the way the readout formats it (meteorology's own five-figure
  // helper), not the way the module's statement does.
  const airFloorText = () =>
    Number(
      (Math.SQRT2 * (MEASURED_INVERSION.airtemp.rmse as number)).toPrecision(5)
    ).toString();

  it("qualifies a difference the inversion cannot resolve", () => {
    const [january, february] = airPair(288.15, 288.45);
    const detail = climateInsightText(january, february).detail;
    expect(detail).toContain("+0.3 °C vs 2026-01");
    expect(detail).toContain(
      `the two monthly means differ by less than the ${airFloorText()} K colormap-inversion difference floor`
    );
    // The clause explains why a kelvin figure may be set beside a Celsius
    // difference at all; without it the two look like different scales.
    expect(detail).toContain(
      "the same figure in °C, an offset-only conversion"
    );
    // It qualifies the difference, it never removes or reverses it.
    expect(detail).not.toContain("no change");
  });

  it("stays silent when the difference clears the floor", () => {
    const [january, february] = airPair(285.15, 288.15);
    const detail = climateInsightText(january, february).detail;
    expect(detail).toContain("+3 °C vs 2026-01");
    expect(detail).not.toContain("colormap-inversion difference floor");
  });

  it("stays silent when there is no comparison to qualify", () => {
    const [, february] = airPair(288.15, 288.45);
    expect(climateInsightText(undefined, february).detail).not.toContain(
      "colormap-inversion difference floor"
    );
  });

  it("does not attach the air-temperature floor to another metric", () => {
    // Soil moisture carries a measured inversion figure too, but it lies
    // outside this module's atmospheric scope and gains no clause here.
    const [january, february] = summarizeRenderedClimateSample(
      {
        metricId: "soil-moisture",
        months: [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        sampledValues: [20, 20.05],
        nativeToSampledValueFactor: 1,
        validFractions: [1, 1],
      },
      { year: 2026, month: 2 }
    );
    expect(climateInsightText(january, february).detail).not.toContain(
      "colormap-inversion difference floor"
    );
  });
});

/**
 * The floor above qualifies a difference. The card's headline value is a single
 * absolute number rendered by the same five-significant-figure helper, and it is
 * shown even for a month with no comparison at all — so it carries the same
 * false precision with nothing beside it to qualify it. A ±0.485 K inversion
 * error fixes the tenths digit and no digit after it, so "14.235 °C" shows two
 * digits the pipeline cannot support.
 */
describe("place readout air-temperature reported-precision caveat", () => {
  const airMonth = (valueK: number) =>
    summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [valueK],
        nativeToSampledValueFactor: 1,
        validFractions: [1],
      },
      { year: 2026, month: 1 }
    )[0];

  // Derived from the committed figure so a recalibration moves the expectation
  // with the code rather than leaving a stale literal asserting the old place.
  const justifiedStepText = () => {
    const rmse = MEASURED_INVERSION.airtemp.rmse as number;
    return Number(
      (10 ** Math.floor(Math.log10(rmse) + 1e-9)).toPrecision(5)
    ).toString();
  };

  it("says how coarsely a five-figure mean may honestly be written", () => {
    const insight = climateInsightText(undefined, airMonth(287.385));
    // The card still leads with the value it always did.
    expect(insight.value).toBe("14.235 °C");
    expect(insight.detail).toContain(
      `justifies reporting this mean only to the nearest ${justifiedStepText()} °C (14.2 °C)`
    );
    // The published figure is quoted in the unit it is documented in.
    expect(insight.detail).toContain(
      `${MEASURED_INVERSION.airtemp.rmse} K measured colormap-inversion error`
    );
  });

  it("states a rounding place and never a significant-figure count", () => {
    // Under an offset-only conversion the justified place is invariant but the
    // figure count is not: 287.385 K and 14.235 °C are one measurement rounded
    // to one place, yet that is four justified figures in K and three in °C. A
    // count carried across the conversion would be wrong where a place is not.
    const insight = climateInsightText(undefined, airMonth(287.385));
    expect(insight.detail).not.toContain("significant figure");
    // It qualifies how the value is written; it never withdraws or replaces it.
    expect(insight.value).toBe("14.235 °C");
    expect(insight.value).not.toBe("Unavailable");
    expect(insight.detail).toContain("native source value 287.38 K");
  });

  it("stays silent when the rendered value already sits at that place", () => {
    // 288.15 K renders as exactly 15 °C, which shows no unjustified digit.
    const insight = climateInsightText(undefined, airMonth(288.15));
    expect(insight.value).toBe("15 °C");
    expect(insight.detail).not.toContain("justifies reporting this mean");
  });

  it("qualifies the value even when there is no comparison month", () => {
    // The difference floor needs a pair; this claim stands on one month alone,
    // which is the case the floor cannot reach.
    const detail = climateInsightText(undefined, airMonth(287.385)).detail;
    expect(detail).not.toContain("colormap-inversion difference floor");
    expect(detail).toContain("justifies reporting this mean");
  });

  it("does not attach the air-temperature caveat to another metric", () => {
    // Soil moisture carries a measured inversion figure too, but it lies
    // outside this module's atmospheric scope and gains no clause here.
    const [soil] = summarizeRenderedClimateSample(
      {
        metricId: "soil-moisture",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [20.235],
        nativeToSampledValueFactor: 1,
        validFractions: [1],
      },
      { year: 2026, month: 1 }
    );
    expect(climateInsightText(undefined, soil).detail).not.toContain(
      "justifies reporting this mean"
    );
  });

  it("withholds the caveat when the month has no usable observation", () => {
    const [noData] = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [{ year: 2026, month: 1 }],
        sampledValues: [null],
        nativeToSampledValueFactor: 1,
        validFractions: [0],
      },
      { year: 2026, month: 1 }
    );
    expect(climateInsightText(undefined, noData).value).toBe("Unavailable");
    expect(climateInsightText(undefined, noData).detail).not.toContain(
      "justifies reporting this mean"
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

describe("coverage shortfall against the legend's open end caps", () => {
  const summaryFor = (
    metricId: Parameters<typeof summarizeRenderedClimateSample>[0]["metricId"],
    sampledValue: number,
    validFraction: number,
    factor = 1
  ) =>
    summarizeRenderedClimateSample(
      {
        metricId,
        months: [{ year: 2026, month: 1 }],
        sampledValues: [sampledValue],
        nativeToSampledValueFactor: factor,
        validFractions: [validFraction],
      },
      { year: 2026, month: 1 }
    )[0];

  it("names both caps for air temperature, in the unit the card shows", () => {
    // MERRA2_2m_Air_Temperature_Monthly caps at "[-INF,220)" and "≥ 310" K.
    // The card reports °C, so the bounds are stated on that same scale via the
    // exact −273.15 offset rather than in the native kelvin the reader is not
    // looking at.
    const detail = climateInsightText(
      undefined,
      summaryFor("air-temperature-2m", 288.15, 0.62)
    ).detail;

    expect(detail).toContain("62% sampled coverage");
    expect(detail).toContain(
      "the shortfall can include ground outside the legend's -53.15 °C to 36.85 °C range"
    );
    expect(detail).toContain("a mean over representable ground only");
  });

  it("names only the reachable ceiling for the GLDAS layers", () => {
    // Both GLDAS ramps also publish a "[-INF,0)" cap, but neither precipitation
    // rate nor soil moisture can be negative, so quoting a floor would invent a
    // shortfall explanation that cannot occur.
    const precip = climateInsightText(
      undefined,
      summaryFor("precipitation-rate", 8.64, 0.9, 86_400)
    ).detail;
    expect(precip).toContain(
      "the shortfall can include ground at or above the legend's 43.2 mm/day ceiling"
    );
    expect(precip).not.toContain("range");

    const soil = climateInsightText(
      undefined,
      summaryFor("soil-moisture", 7.8, 0.9)
    ).detail;
    expect(soil).toContain(
      "the shortfall can include ground at or above the legend's 50 kg/m² ceiling"
    );
  });

  it("stays silent when every sampled pixel inverted", () => {
    // With complete coverage no area was dropped, so there is nothing to
    // attribute and the caveat would be noise.
    const detail = climateInsightText(
      undefined,
      summaryFor("air-temperature-2m", 288.15, 1)
    ).detail;

    expect(detail).toContain("100% sampled coverage");
    expect(detail).not.toContain("the shortfall can include ground");
  });

  it("stays silent when the sampler supplied no coverage figure", () => {
    // No percentage means no shortfall to qualify; claiming one would assert a
    // gap the sampler never reported.
    const detail = climateInsightText(
      undefined,
      summarizeRenderedClimateSample(
        {
          metricId: "air-temperature-2m",
          months: [{ year: 2026, month: 1 }],
          sampledValues: [288.15],
          nativeToSampledValueFactor: 1,
        },
        { year: 2026, month: 1 }
      )[0]
    ).detail;

    expect(detail).toContain("sampled coverage not supplied");
    expect(detail).not.toContain("the shortfall can include ground");
  });

  it("qualifies the coverage figure rather than the reported difference", () => {
    // The caveat is about which ground the mean covers. It must not be read as
    // a bound on the month-over-month change, which keeps its own coverage
    // statement.
    const months = summarizeRenderedClimateSample(
      {
        metricId: "air-temperature-2m",
        months: [
          { year: 2025, month: 12 },
          { year: 2026, month: 1 },
        ],
        sampledValues: [286.15, 288.15],
        nativeToSampledValueFactor: 1,
        validFractions: [0.8, 0.62],
      },
      { year: 2026, month: 1 }
    );
    const detail = climateInsightText(months[0], months[1]).detail;

    expect(detail).toContain("+2 °C vs 2025-12");
    expect(detail.indexOf("62% sampled coverage")).toBeLessThan(
      detail.indexOf("the shortfall can include ground")
    );
  });

  describe("the earlier mean in a difference is censored on its own terms", () => {
    const pair = (
      metricId: Parameters<
        typeof summarizeRenderedClimateSample
      >[0]["metricId"],
      sampledValues: [number, number],
      validFractions: [number, number],
      factor = 1
    ) =>
      summarizeRenderedClimateSample(
        {
          metricId,
          months: [
            { year: 2025, month: 12 },
            { year: 2026, month: 1 },
          ],
          sampledValues,
          nativeToSampledValueFactor: factor,
          validFractions,
        },
        { year: 2026, month: 1 }
      );

    it("discloses the earlier month's censoring when this month is complete", () => {
      // The case the card read most confidently and disclosed least: with full
      // coverage now, the shortfall caveat is silent, so a bare difference was
      // shown against a mean that had dropped its own extreme tail.
      const months = pair("air-temperature-2m", [286.15, 288.15], [0.72, 1]);
      const detail = climateInsightText(months[0], months[1]).detail;

      expect(detail).toContain("+2 °C vs 2025-12");
      expect(detail).toContain("100% sampled coverage");
      expect(detail).not.toContain("the shortfall can include ground");
      expect(detail).toContain(
        "the 2025-12 mean it is differenced against is itself a mean over representable ground only"
      );
    });

    it("states it alongside this month's own shortfall when both are thin", () => {
      // Two caveats, not one: each month's mean is pulled toward the ramp's
      // interior by its own dropped area, and the two areas differ.
      const months = pair(
        "precipitation-rate",
        [4.32, 8.64],
        [0.8, 0.9],
        86_400
      );
      const detail = climateInsightText(months[0], months[1]).detail;

      expect(detail).toContain(
        "the shortfall can include ground at or above the legend's 43.2 mm/day ceiling"
      );
      expect(detail.indexOf("the shortfall can include ground")).toBeLessThan(
        detail.indexOf("the 2025-12 mean it is differenced against")
      );
    });

    it("stays silent when the earlier month was fully covered", () => {
      // Nothing was dropped then, so there is no second censoring to disclose.
      const months = pair("soil-moisture", [7.8, 8.4], [1, 0.9]);
      const detail = climateInsightText(months[0], months[1]).detail;

      expect(detail).toContain("the shortfall can include ground");
      expect(detail).not.toContain("it is differenced against");
    });

    it("stays silent when no difference is reported", () => {
      // With no earlier month there is no difference to qualify, and the
      // caveat would describe a comparison the card never made.
      const detail = climateInsightText(
        undefined,
        pair("air-temperature-2m", [286.15, 288.15], [0.72, 0.9])[1]
      ).detail;

      expect(detail).not.toContain("it is differenced against");
    });

    it("stays silent when the earlier month supplied no coverage figure", () => {
      // A point sample reports no fraction; asserting a shortfall it never
      // reported would invent one.
      const months = summarizeRenderedClimateSample(
        {
          metricId: "air-temperature-2m",
          months: [
            { year: 2025, month: 12 },
            { year: 2026, month: 1 },
          ],
          sampledValues: [286.15, 288.15],
          nativeToSampledValueFactor: 1,
        },
        { year: 2026, month: 1 }
      );
      const detail = climateInsightText(months[0], months[1]).detail;

      expect(detail).toContain("+2 °C vs 2025-12");
      expect(detail).not.toContain("it is differenced against");
    });
  });

  describe("unavailable months distinguish thin coverage from absent data", () => {
    const withCoverage = (validFraction: number) =>
      summarizeRenderedClimateSample(
        {
          metricId: "precipitation-rate",
          months: [
            { year: 2026, month: 2 },
            { year: 2026, month: 3 },
          ],
          sampledValues: [4.32, null],
          nativeToSampledValueFactor: 86_400,
          validFractions: [0.9, validFraction],
          sourceImageDimensions: { width: 512, height: 512 },
          geometrySamplingStrategy: "boundary-grid",
        },
        { year: 2026, month: 3 }
      );

    it("blames the sampler's admission rule, not the source, for a thinly covered month", () => {
      // `weightedMeanValid` withholds the region mean below its usable-share
      // threshold, so a mostly-marine boundary yields no value beside a real,
      // positive coverage share. Saying "missing-value" there would report the
      // source as having published nothing for ground it did publish.
      const summaries = withCoverage(0.18);

      expect(summaries[1].coverage.reason).toBe("missing-value");
      const { value, detail } = climateInsightText(summaries[0], summaries[1]);
      expect(value).toBe("Unavailable");
      expect(detail).toContain("(insufficient-valid-coverage)");
      expect(detail).not.toContain("missing-value");
      // The share that made it insufficient stays on the line beside the reason.
      expect(detail).toContain("18% sampled coverage");
    });

    it("agrees with the exported record on the same month", () => {
      const summaries = withCoverage(0.18);
      const exported = exportObservationsFromRenderedClimateSample(
        {
          metricId: "precipitation-rate",
          months: [
            { year: 2026, month: 2 },
            { year: 2026, month: 3 },
          ],
          sampledValues: [4.32, null],
          nativeToSampledValueFactor: 86_400,
          validFractions: [0.9, 0.18],
        },
        { year: 2026, month: 3 }
      );

      expect(exported[1].unavailableReason).toBe("insufficient-valid-coverage");
      expect(climateInsightText(summaries[0], summaries[1]).detail).toContain(
        `(${exported[1].unavailableReason})`
      );
    });

    it("keeps the contract's own wording when no ground was covered at all", () => {
      // Zero coverage is genuinely "nothing came back"; it gains no sharper
      // reason than the climate contract already supplies.
      const summaries = withCoverage(0);
      const { detail } = climateInsightText(summaries[0], summaries[1]);
      expect(detail).toContain("(missing-value)");
      expect(detail).toContain("0% sampled coverage");
    });

    it("keeps the contract's own wording when coverage was never supplied", () => {
      // No share means no evidence either way, so the card must not claim the
      // shortfall was thin coverage.
      const summaries = summarizeRenderedClimateSample(
        {
          metricId: "precipitation-rate",
          months: [
            { year: 2026, month: 2 },
            { year: 2026, month: 3 },
          ],
          sampledValues: [4.32, null],
          nativeToSampledValueFactor: 86_400,
          geometrySamplingStrategy: "boundary-grid",
        },
        { year: 2026, month: 3 }
      );

      const { detail } = climateInsightText(summaries[0], summaries[1]);
      expect(detail).toContain("(missing-value)");
      expect(detail).toContain("sampled coverage not supplied");
    });
  });
});

describe("place metric unavailable attribution", () => {
  it("blames the published document only when the colormap itself failed", () => {
    expect(placeMetricUnavailableDetail("source-colormap-unavailable")).toBe(
      "Metric could not be sampled from the published source colormap"
    );
  });

  it("does not blame the published source for a failure after the colormap resolved", () => {
    const detail = placeMetricUnavailableDetail("boundary-sampling-failed");
    expect(detail).toBe(
      "Metric could not be sampled for the searched boundary"
    );
    expect(detail).not.toContain("colormap");
    expect(detail).not.toContain("source");
  });

  it("names no single cause for the sampling step, which covers several", () => {
    // Geometry planning, the decode canvas, and tile transport all throw into
    // one catch, so the card must not report an unrepresentable boundary as the
    // established cause of a stalled tile request.
    const detail = placeMetricUnavailableDetail("boundary-sampling-failed");
    expect(detail).not.toContain("grid");
    expect(detail).not.toContain("represented");
  });

  it("never reports either failure as a measured value", () => {
    for (const reason of [
      "source-colormap-unavailable",
      "boundary-sampling-failed",
    ] as const) {
      expect(placeMetricUnavailableDetail(reason)).toMatch(
        /^Metric could not be sampled /
      );
    }
  });
});
