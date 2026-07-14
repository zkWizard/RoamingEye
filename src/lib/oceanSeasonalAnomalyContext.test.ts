import { describe, expect, it } from "vitest";
import { compareSstToSeasonalBaseline } from "./oceanSeasonalBaseline";
import {
  contextualizeOceanSeasonalAnomaly,
  describeOceanSeasonalAnomaly,
} from "./oceanSeasonalAnomalyContext";
import type {
  SeaSurfaceTemperatureObservation,
  SstFootprint,
} from "./oceanConditions";

function sst(
  year: number,
  month: number,
  value: number | null,
  footprint: SstFootprint = "water",
  validFraction = 0.9
): SeaSurfaceTemperatureObservation {
  return { dataMonth: { year, month }, value, footprint, validFraction };
}

/** Ten same-calendar-month years (2010–2019) at the given footprint. */
function baselineYears(
  values: readonly number[],
  month = 6,
  footprint: SstFootprint = "water",
  validFraction = 0.9
): SeaSurfaceTemperatureObservation[] {
  return values.map((value, index) =>
    sst(2010 + index, month, value, footprint, validFraction)
  );
}

describe("contextualizeOceanSeasonalAnomaly", () => {
  it("labels a warmer departure beyond one but within two baseline SDs", () => {
    // Ten Junes, mean 20 °C; target 3 °C warmer against ~1.8 °C spread.
    const values = [17, 18, 19, 20, 20, 20, 21, 22, 23, 20];
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 23),
      baselineYears(values),
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    const context = contextualizeOceanSeasonalAnomaly(comparison);

    expect(context).toMatchObject({
      kind: "standardized-sea-surface-temperature-anomaly",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      status: "available",
      direction: "warmer",
      magnitudeBand: "beyond-typical-spread",
      footprint: "water",
      calendarMonth: 6,
      anomalyUnit: "°C",
      baselineSampleCount: 10,
      reason: null,
    });
    // The labelled value is exactly the comparison's own standardized anomaly.
    expect(context.standardizedAnomaly).toBe(comparison.standardizedAnomaly);
    expect(context.baselineStandardDeviation).toBe(
      comparison.baseline.sampleStandardDeviation
    );
    // Provenance travels with the context.
    expect(context.source).toBe(comparison.metric.source);
    expect(context.dataMonth).toEqual({ year: 2023, month: 6 });
  });

  it("classifies a small departure as within the typical year-to-year spread", () => {
    const values = [15, 17, 19, 21, 23, 15, 17, 19, 21, 23];
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 19.5), // baseline mean 19; +0.5 °C is a fraction of a SD
      baselineYears(values),
      { minimumSamples: 10 }
    );

    const context = contextualizeOceanSeasonalAnomaly(comparison);
    expect(context.status).toBe("available");
    expect(context.direction).toBe("warmer");
    expect(Math.abs(context.standardizedAnomaly!)).toBeLessThan(1);
    expect(context.magnitudeBand).toBe("within-typical-spread");
  });

  it("classifies a large cooler departure as well beyond the typical spread", () => {
    // Very tight baseline (mean 20 °C, SD ≈ 0.24); target 2 °C below it.
    const values = [19.5, 20, 20, 20, 20, 20, 20, 20, 20, 20.5];
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 18),
      baselineYears(values),
      { minimumSamples: 10 }
    );

    const context = contextualizeOceanSeasonalAnomaly(comparison);
    expect(context.status).toBe("available");
    expect(context.direction).toBe("cooler");
    expect(context.standardizedAnomaly!).toBeLessThan(-2);
    expect(context.magnitudeBand).toBe("well-beyond-typical-spread");
  });

  it("reports 'comparable' with a zero standardized value at the baseline mean", () => {
    const values = [18, 19, 20, 21, 22, 18, 19, 20, 21, 22]; // mean 20
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 20),
      baselineYears(values),
      { minimumSamples: 10 }
    );

    const context = contextualizeOceanSeasonalAnomaly(comparison);
    expect(comparison.anomaly).toBeCloseTo(0, 10);
    expect(context.status).toBe("available");
    expect(context.direction).toBe("comparable");
    expect(context.standardizedAnomaly).toBeCloseTo(0, 10);
    expect(context.magnitudeBand).toBe("within-typical-spread");
  });

  it("echoes the coastal footprint the baseline was built on", () => {
    const values = [17, 18, 19, 20, 20, 20, 21, 22, 23, 20];
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 22, "land-mixed-coastal"),
      baselineYears(values, 6, "land-mixed-coastal"),
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    const context = contextualizeOceanSeasonalAnomaly(comparison);
    expect(context.footprint).toBe("land-mixed-coastal");
    expect(describeOceanSeasonalAnomaly(context)).toContain(
      "coastal (land-mixed)"
    );
  });

  it("withholds when the baseline has too few same-calendar-month samples", () => {
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 21),
      baselineYears([19, 20]),
      { minimumSamples: 3 }
    );

    expect(comparison.status).toBe("insufficient-samples");
    const context = contextualizeOceanSeasonalAnomaly(comparison);
    expect(context).toMatchObject({
      status: "unavailable",
      standardizedAnomaly: null,
      magnitudeBand: null,
      direction: null,
      reason: "too-few-same-calendar-month-samples",
    });
    // The cited source is retained even when withholding.
    expect(context.source).toBe(comparison.metric.source);
  });

  it("withholds without dividing by zero when the baseline is flat", () => {
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 22),
      baselineYears([20, 20, 20, 20, 20, 20, 20, 20, 20, 20]),
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.sampleStandardDeviation).toBe(0);
    expect(comparison.standardizedAnomaly).toBeNull();

    const context = contextualizeOceanSeasonalAnomaly(comparison);
    expect(context).toMatchObject({
      status: "unavailable",
      standardizedAnomaly: null,
      magnitudeBand: null,
      direction: null,
      reason: "no-baseline-variability",
    });
    // The raw anomaly is still echoed for auditability.
    expect(context.anomaly).toBeCloseTo(2, 10);
    expect(context.baselineStandardDeviation).toBe(0);
  });

  it("withholds when the target footprint is land", () => {
    const values = [17, 18, 19, 20, 20, 20, 21, 22, 23, 20];
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 22, "land"),
      baselineYears(values),
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("land");
    const context = contextualizeOceanSeasonalAnomaly(comparison);
    expect(context.status).toBe("unavailable");
    expect(context.standardizedAnomaly).toBeNull();
    expect(context.reason).toBe(comparison.reason);
  });
});

describe("describeOceanSeasonalAnomaly", () => {
  it("states direction, magnitude, footprint and provenance for a usable anomaly", () => {
    const values = [17, 18, 19, 20, 20, 20, 21, 22, 23, 20];
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 23),
      baselineYears(values),
      { minimumSamples: 10 }
    );
    const sentence = describeOceanSeasonalAnomaly(
      contextualizeOceanSeasonalAnomaly(comparison)
    );

    expect(sentence).toContain("Jun 2023");
    expect(sentence).toContain("warmer than");
    expect(sentence).toContain("open-water baseline mean");
    expect(sentence).toContain("z = ");
    expect(sentence).toContain("10 same-calendar-month years");
    expect(sentence).toContain("prior Jun");
    expect(sentence).toContain(
      "MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0"
    );
    expect(sentence).toContain("not a probability");
  });

  it("states the withheld reason and keeps provenance when unavailable", () => {
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 21),
      baselineYears([19, 20]),
      { minimumSamples: 3 }
    );
    const sentence = describeOceanSeasonalAnomaly(
      contextualizeOceanSeasonalAnomaly(comparison)
    );

    expect(sentence).toContain("no standardized anomaly is reported");
    expect(sentence).toContain("too-few-same-calendar-month-samples");
    expect(sentence).toContain("v2019.0");
  });
});
