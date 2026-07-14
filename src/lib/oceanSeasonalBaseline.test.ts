import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import {
  compareSstToSeasonalBaseline,
  MINIMUM_OCEAN_SEASONAL_BASELINE_SAMPLES,
} from "./oceanSeasonalBaseline";

function waterMonth(
  year: number,
  value: number,
  validFraction = 0.95
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year, month: 8 },
    value,
    validFraction,
    footprint: "water",
  };
}

/** Ten prior Augusts of open-water SST, oldest to newest. */
function tenAugustWaterYears(
  startYear: number,
  value: number
): SeaSurfaceTemperatureObservation[] {
  return Array.from({ length: 10 }, (_unused, index) =>
    waterMonth(startYear + index, value)
  );
}

describe("SST same-calendar-month seasonal baseline", () => {
  it("reports the anomaly against same-month, same-footprint water samples", () => {
    const target = waterMonth(2026, 22);
    const baseline = tenAugustWaterYears(2016, 20);

    const comparison = compareSstToSeasonalBaseline(target, baseline);

    expect(comparison).toMatchObject({
      kind: "same-calendar-month-sst-baseline",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      status: "available",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      anomaly: 2,
      anomalyUnit: "°C",
      reason: null,
    });
    expect(comparison.baseline.mean).toBe(20);
    expect(comparison.baseline.sampleCount).toBe(10);
    expect(comparison.bounds).toMatchObject({
      calendarMonth: 8,
      endYear: 2025,
      footprint: "water",
    });
    // Samples retained oldest-to-newest for auditability.
    expect(comparison.samples.map((sample) => sample.month.year)).toEqual([
      2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
  });

  it("keeps the SST value in the source unit without display conversion", () => {
    const comparison = compareSstToSeasonalBaseline(
      waterMonth(2026, 18.5),
      tenAugustWaterYears(2016, 18.5)
    );

    expect(comparison.status).toBe("available");
    expect(comparison.anomaly).toBe(0);
    expect(comparison.anomalyUnit).toBe(
      SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit
    );
  });

  it("standardizes the anomaly only when the baseline spread is defined", () => {
    const spread = [18, 19, 20, 21, 22, 18, 19, 20, 21, 22].map(
      (value, index) => waterMonth(2016 + index, value)
    );
    const comparison = compareSstToSeasonalBaseline(
      waterMonth(2026, 24),
      spread
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.mean).toBe(20);
    expect(comparison.anomaly).toBe(4);
    // Sample SD of the spread is defined and non-zero, so a z-score exists.
    expect(comparison.standardizedAnomaly).not.toBeNull();
    expect(comparison.standardizedAnomaly).toBeGreaterThan(0);
  });

  it("returns a null z-score when every baseline sample is identical", () => {
    const comparison = compareSstToSeasonalBaseline(
      waterMonth(2026, 25),
      tenAugustWaterYears(2016, 20)
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.sampleStandardDeviation).toBe(0);
    expect(comparison.standardizedAnomaly).toBeNull();
  });

  it("never mixes open-water and land-mixed coastal footprints", () => {
    const target = waterMonth(2026, 21);
    // Nine usable water years plus one coastal year for the same month.
    const baseline: SeaSurfaceTemperatureObservation[] = [
      ...tenAugustWaterYears(2016, 20).slice(0, 9),
      {
        dataMonth: { year: 2025, month: 8 },
        value: 19,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
    ];

    const comparison = compareSstToSeasonalBaseline(target, baseline);

    expect(comparison.status).toBe("insufficient-samples");
    expect(comparison.baseline.sampleCount).toBe(9);
    expect(comparison.exclusions.footprintMismatch).toBe(1);
    expect(comparison.anomaly).toBeNull();
  });

  it("compares coastal targets against coastal baselines", () => {
    const target: SeaSurfaceTemperatureObservation = {
      dataMonth: { year: 2026, month: 8 },
      value: 17,
      validFraction: 0.8,
      footprint: "land-mixed-coastal",
    };
    const baseline = Array.from({ length: 10 }, (_unused, index) => ({
      dataMonth: { year: 2016 + index, month: 8 },
      value: 16,
      validFraction: 0.8,
      footprint: "land-mixed-coastal" as const,
    }));

    const comparison = compareSstToSeasonalBaseline(target, baseline);

    expect(comparison.status).toBe("available");
    expect(comparison.bounds.footprint).toBe("land-mixed-coastal");
    expect(comparison.anomaly).toBe(1);
  });

  it("excludes candidates from other calendar months and out-of-range years", () => {
    const baseline: SeaSurfaceTemperatureObservation[] = [
      ...tenAugustWaterYears(2016, 20),
      { dataMonth: { year: 2024, month: 7 }, value: 30, footprint: "water" },
      { dataMonth: { year: 2026, month: 8 }, value: 30, footprint: "water" },
    ];

    const comparison = compareSstToSeasonalBaseline(
      waterMonth(2026, 22),
      baseline
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.sampleCount).toBe(10);
    expect(comparison.exclusions.wrongCalendarMonth).toBe(1);
    // The 2026 August candidate is the target year, past the default end year.
    expect(comparison.exclusions.outOfBounds).toBe(1);
  });

  it("counts only the first candidate for a duplicated baseline year", () => {
    const baseline: SeaSurfaceTemperatureObservation[] = [
      ...tenAugustWaterYears(2016, 20),
      waterMonth(2020, 99),
    ];

    const comparison = compareSstToSeasonalBaseline(
      waterMonth(2026, 22),
      baseline
    );

    expect(comparison.exclusions.duplicateYear).toBe(1);
    expect(comparison.baseline.max).toBe(20);
  });

  it("flags insufficient coverage separately from insufficient samples", () => {
    const target = waterMonth(2026, 22);
    const baseline = Array.from({ length: 12 }, (_unused, index) =>
      waterMonth(2014 + index, 20, 0.2)
    );

    const comparison = compareSstToSeasonalBaseline(target, baseline);

    expect(comparison.status).toBe("insufficient-coverage");
    expect(comparison.reason).toBe("baseline-coverage-below-threshold");
    expect(comparison.exclusions.insufficientCoverage).toBeGreaterThanOrEqual(
      MINIMUM_OCEAN_SEASONAL_BASELINE_SAMPLES
    );
    expect(comparison.anomaly).toBeNull();
  });

  it("does not describe an SST anomaly over a land footprint", () => {
    const target: SeaSurfaceTemperatureObservation = {
      dataMonth: { year: 2026, month: 8 },
      value: null,
      validFraction: 0,
      footprint: "land",
    };

    const comparison = compareSstToSeasonalBaseline(
      target,
      tenAugustWaterYears(2016, 20)
    );

    expect(comparison.status).toBe("land");
    expect(comparison.reason).toBe("target-land-footprint");
    expect(comparison.samples).toEqual([]);
  });

  it("reports missing target SST as no-data rather than inventing a value", () => {
    const target: SeaSurfaceTemperatureObservation = {
      dataMonth: { year: 2026, month: 8 },
      value: null,
      footprint: "water",
    };

    const comparison = compareSstToSeasonalBaseline(
      target,
      tenAugustWaterYears(2016, 20)
    );

    expect(comparison.status).toBe("no-data");
    expect(comparison.anomaly).toBeNull();
  });

  it("rejects an out-of-range target SST as invalid", () => {
    const comparison = compareSstToSeasonalBaseline(
      waterMonth(2026, 99),
      tenAugustWaterYears(2016, 20)
    );

    expect(comparison.status).toBe("invalid");
    expect(comparison.anomaly).toBeNull();
  });

  it("rejects an invalid baseline window configuration", () => {
    const comparison = compareSstToSeasonalBaseline(
      waterMonth(2026, 22),
      tenAugustWaterYears(2016, 20),
      { baselineStartYear: 2025, baselineEndYear: 2015 }
    );

    expect(comparison.status).toBe("invalid");
    expect(comparison.reason).toBe("invalid-baseline-configuration");
  });

  it("honors an explicit baseline window and minimum sample override", () => {
    const baseline = tenAugustWaterYears(2010, 19);

    const comparison = compareSstToSeasonalBaseline(
      waterMonth(2026, 21),
      baseline,
      { minimumSamples: 5, baselineStartYear: 2015, baselineEndYear: 2019 }
    );

    expect(comparison.status).toBe("available");
    expect(comparison.bounds).toMatchObject({
      startYear: 2015,
      endYear: 2019,
    });
    expect(comparison.baseline.sampleCount).toBe(5);
    expect(comparison.samples.map((sample) => sample.month.year)).toEqual([
      2015, 2016, 2017, 2018, 2019,
    ]);
  });
});
