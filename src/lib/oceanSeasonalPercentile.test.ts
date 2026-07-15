import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import { compareSstToSeasonalBaseline } from "./oceanSeasonalBaseline";
import {
  describeSstSeasonalPercentile,
  formatSstSeasonalPercentile,
  SST_SEASONAL_PERCENTILE_LIMITATIONS,
} from "./oceanSeasonalPercentile";

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

function coastalMonth(
  year: number,
  value: number,
  validFraction = 0.95
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year, month: 8 },
    value,
    validFraction,
    footprint: "land-mixed-coastal",
  };
}

/** Ten prior Augusts of open-water SST with strictly ascending values. */
function tenAscendingAugusts(
  startYear: number,
  startValue: number,
  step = 1
): SeaSurfaceTemperatureObservation[] {
  return Array.from({ length: 10 }, (_unused, index) =>
    waterMonth(startYear + index, startValue + index * step)
  );
}

describe("SST seasonal percentile-of-record", () => {
  it("ranks the target within the same-month, same-footprint record", () => {
    // Baseline Augusts 2016–2025 = 10,11,…,19; target August 2026 = 15.5.
    // Cooler: {10..15} = six years; warmer: {16..19} = four; tied: none.
    const result = describeSstSeasonalPercentile(
      waterMonth(2026, 15.5),
      tenAscendingAugusts(2016, 10)
    );

    expect(result).toMatchObject({
      kind: "sea-surface-temperature-percentile-of-record",
      isForecast: false,
      isTrend: false,
      claimScope:
        "empirical-rank-within-supplied-same-footprint-same-calendar-month-record-only",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      status: "available",
      calendarMonth: 8,
      footprint: "water",
      sampleCount: 10,
      coolerRecordCount: 6,
      warmerRecordCount: 4,
      tiedRecordCount: 0,
      isCoolestInRecord: false,
      isWarmestInRecord: false,
      reason: null,
    });
    // Mid-rank non-exceedance: (6 + 0/2) / 10 = 0.60.
    expect(result.percentileRank).toBe(60);
    expect(result.exceedanceProbability).toBeCloseTo(0.4, 10);
  });

  it("keeps non-exceedance and exceedance complementary by construction", () => {
    const result = describeSstSeasonalPercentile(
      waterMonth(2026, 13),
      tenAscendingAugusts(2016, 10)
    );

    expect(result.status).toBe("available");
    expect(
      (result.percentileRank as number) / 100 +
        (result.exceedanceProbability as number)
    ).toBeCloseTo(1, 10);
  });

  it("splits exact ties evenly with the mid-rank convention", () => {
    // Six years tie the target at 20, two are cooler (18,19), two warmer (21,22).
    const baseline: SeaSurfaceTemperatureObservation[] = [
      waterMonth(2016, 18),
      waterMonth(2017, 19),
      waterMonth(2018, 20),
      waterMonth(2019, 20),
      waterMonth(2020, 20),
      waterMonth(2021, 20),
      waterMonth(2022, 20),
      waterMonth(2023, 20),
      waterMonth(2024, 21),
      waterMonth(2025, 22),
    ];

    const result = describeSstSeasonalPercentile(
      waterMonth(2026, 20),
      baseline
    );

    expect(result).toMatchObject({
      coolerRecordCount: 2,
      tiedRecordCount: 6,
      warmerRecordCount: 2,
    });
    // (2 + 6/2) / 10 = 0.50.
    expect(result.percentileRank).toBe(50);
    expect(result.exceedanceProbability).toBeCloseTo(0.5, 10);
  });

  it("flags the warmest-in-record target at the 100th percentile", () => {
    const result = describeSstSeasonalPercentile(
      waterMonth(2026, 25),
      tenAscendingAugusts(2016, 10)
    );

    expect(result.isWarmestInRecord).toBe(true);
    expect(result.isCoolestInRecord).toBe(false);
    expect(result.warmerRecordCount).toBe(0);
    expect(result.percentileRank).toBe(100);
    expect(result.exceedanceProbability).toBe(0);
  });

  it("flags the coolest-in-record target at the 0th percentile", () => {
    const result = describeSstSeasonalPercentile(
      waterMonth(2026, 5),
      tenAscendingAugusts(2016, 10)
    );

    expect(result.isCoolestInRecord).toBe(true);
    expect(result.isWarmestInRecord).toBe(false);
    expect(result.coolerRecordCount).toBe(0);
    expect(result.percentileRank).toBe(0);
    expect(result.exceedanceProbability).toBe(1);
  });

  it("ranks a coastal (land-mixed) footprint against its own footprint record", () => {
    const baseline = Array.from({ length: 10 }, (_unused, index) =>
      coastalMonth(2016 + index, 12 + index)
    );

    const result = describeSstSeasonalPercentile(
      coastalMonth(2026, 14.5),
      baseline
    );

    expect(result.status).toBe("available");
    expect(result.footprint).toBe("land-mixed-coastal");
    // Cooler: {12,13,14} = three; warmer: {15..21} = seven.
    expect(result.coolerRecordCount).toBe(3);
    expect(result.warmerRecordCount).toBe(7);
    expect(result.percentileRank).toBe(30);
  });

  it("reports a rank even when the standardized anomaly is undefined (flat record)", () => {
    // A perfectly flat baseline has zero standard deviation, so the parametric
    // standardized anomaly is withheld — but the non-parametric rank is defined.
    const flat = Array.from({ length: 10 }, (_unused, index) =>
      waterMonth(2016 + index, 20)
    );
    const target = waterMonth(2026, 20);

    const baseline = compareSstToSeasonalBaseline(target, flat);
    expect(baseline.status).toBe("available");
    expect(baseline.standardizedAnomaly).toBeNull();

    const result = describeSstSeasonalPercentile(target, flat);
    expect(result.status).toBe("available");
    expect(result.tiedRecordCount).toBe(10);
    // Every year tied: (0 + 10/2) / 10 = 0.50, and both record edges are true.
    expect(result.percentileRank).toBe(50);
    expect(result.isCoolestInRecord).toBe(true);
    expect(result.isWarmestInRecord).toBe(true);
  });

  it("passes an unavailable baseline through with a null percentile and reason", () => {
    const landTarget: SeaSurfaceTemperatureObservation = {
      dataMonth: { year: 2026, month: 8 },
      value: null,
      footprint: "land",
    };

    const result = describeSstSeasonalPercentile(
      landTarget,
      tenAscendingAugusts(2016, 10)
    );

    expect(result.status).toBe("land");
    expect(result.percentileRank).toBeNull();
    expect(result.exceedanceProbability).toBeNull();
    expect(result.coolerRecordCount).toBeNull();
    expect(result.isWarmestInRecord).toBeNull();
    expect(result.reason).toBe("target-land-footprint");
  });

  it("withholds a rank when there are too few same-month samples", () => {
    const result = describeSstSeasonalPercentile(waterMonth(2026, 15), [
      waterMonth(2024, 14),
      waterMonth(2025, 16),
    ]);

    expect(result.status).toBe("insufficient-samples");
    expect(result.percentileRank).toBeNull();
    expect(result.sampleCount).toBe(2);
    expect(result.reason).toBe("too-few-same-calendar-month-samples");
  });

  it("never counts a mismatched-footprint year in the rank", () => {
    // Nine on-footprint water years plus one coastal year (dropped by the
    // baseline) leaves too few samples; no rank is fabricated from the mix.
    const mixed: SeaSurfaceTemperatureObservation[] = [
      ...Array.from({ length: 9 }, (_unused, index) =>
        waterMonth(2016 + index, 10 + index)
      ),
      coastalMonth(2025, 100),
    ];

    const result = describeSstSeasonalPercentile(waterMonth(2026, 15), mixed);

    expect(result.status).toBe("insufficient-samples");
    expect(result.baseline.exclusions.footprintMismatch).toBe(1);
    expect(result.sampleCount).toBe(9);
    expect(result.percentileRank).toBeNull();
  });

  it("retains provenance and limitations on every result", () => {
    const result = describeSstSeasonalPercentile(
      waterMonth(2026, 15),
      tenAscendingAugusts(2016, 10)
    );

    expect(result.metric.source).toBe(SEA_SURFACE_TEMPERATURE_METRIC.source);
    expect(result.limitations).toBe(SST_SEASONAL_PERCENTILE_LIMITATIONS);
    expect(result.limitations.length).toBeGreaterThan(0);
  });
});

describe("formatSstSeasonalPercentile", () => {
  it("states the percentile, position, footprint, and cited provenance", () => {
    const result = describeSstSeasonalPercentile(
      waterMonth(2026, 15.5),
      tenAscendingAugusts(2016, 10)
    );

    const line = formatSstSeasonalPercentile(result);

    expect(line).toContain("Sea-surface-temperature percentile-of-record");
    expect(line).toContain("60th percentile");
    expect(line).toContain("open-water");
    expect(line).toContain("10 same-calendar-month years");
    expect(line).toContain(SEA_SURFACE_TEMPERATURE_METRIC.source.shortName);
    // Honest scope disclaimer is always present.
    expect(line).toContain("not a climatological normal");
    expect(line).toContain("forecast claim");
  });

  it("phrases a warmest-in-record target without inventing a neighbour", () => {
    const line = formatSstSeasonalPercentile(
      describeSstSeasonalPercentile(
        waterMonth(2026, 25),
        tenAscendingAugusts(2016, 10)
      )
    );

    expect(line).toContain("100th percentile");
    expect(line).toContain("warmer than all");
  });

  it("reports an unavailable result plainly instead of as a number", () => {
    const landTarget: SeaSurfaceTemperatureObservation = {
      dataMonth: { year: 2026, month: 8 },
      value: null,
      footprint: "land",
    };
    const line = formatSstSeasonalPercentile(
      describeSstSeasonalPercentile(landTarget, tenAscendingAugusts(2016, 10))
    );

    expect(line).toContain("no percentile is reported");
    expect(line).toContain("target-land-footprint");
    expect(line).not.toMatch(/\bpercentile —/);
  });
});
