import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import {
  OCEAN_CONDITION_SERIES_LIMITATIONS,
  summarizeOceanConditionSeries,
} from "./oceanConditionSeries";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";

function water(
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.95
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year, month },
    value,
    validFraction,
    footprint: "water",
  };
}

describe("ocean condition series summaries", () => {
  it("tallies coverage and preserves the metric and per-month provenance", () => {
    const summary = summarizeOceanConditionSeries([
      water(2026, 1, 12.0),
      water(2026, 2, null), // missing SST value
      { dataMonth: { year: 2026, month: 3 }, value: null, footprint: "land" },
      {
        dataMonth: { year: 2026, month: 4 },
        value: 5,
        footprint: "water",
        validFraction: 2,
      },
    ]);

    expect(summary.kind).toBe("observed-sea-surface-temperature-series");
    expect(summary.isForecast).toBe(false);
    expect(summary.claimScope).toBe(
      "descriptive-sea-surface-temperature-extent-only"
    );
    expect(summary.metric).toBe(SEA_SURFACE_TEMPERATURE_METRIC);
    expect(summary.status).toBe("available");
    expect(summary.monthCount).toBe(4);
    expect(summary.distinctMonthCount).toBe(4);
    expect(summary.duplicateMonths).toEqual([]);
    expect(summary.usableMonthCount).toBe(1);
    expect(summary.unusableMonthCount).toBe(3);
    expect(summary.coverageTally).toEqual({
      water: 1,
      "land-mixed-coastal": 0,
      land: 1,
      missing: 1,
      invalid: 1,
    });
    expect(summary.months).toHaveLength(4);
    expect(summary.months[0].metric.source.shortName).toBe(
      SEA_SURFACE_TEMPERATURE_METRIC.source.shortName
    );
  });

  it("reports warmest and coolest usable months with observed spread", () => {
    const summary = summarizeOceanConditionSeries([
      water(2026, 1, 8.0), // cool, coolest
      water(2026, 2, 24.0), // warm, warmest
      water(2026, 3, 15.5), // temperate
    ]);

    expect(summary.extremes.warmest).toEqual({
      dataMonth: { year: 2026, month: 2 },
      observedValue: 24.0,
      temperatureBand: "warm",
    });
    expect(summary.extremes.coolest).toEqual({
      dataMonth: { year: 2026, month: 1 },
      observedValue: 8.0,
      temperatureBand: "cool",
    });
    expect(summary.observedValueRange).toBeCloseTo(16.0, 10);
  });

  it("breaks value ties toward the earliest month and stays order-independent", () => {
    const forward = summarizeOceanConditionSeries([
      water(2026, 5, 20.0),
      water(2026, 2, 20.0),
      water(2026, 9, 20.0),
    ]);
    const shuffled = summarizeOceanConditionSeries([
      water(2026, 9, 20.0),
      water(2026, 5, 20.0),
      water(2026, 2, 20.0),
    ]);

    // All values equal: warmest and coolest both resolve to the earliest month.
    expect(forward.extremes.warmest?.dataMonth).toEqual({
      year: 2026,
      month: 2,
    });
    expect(forward.extremes.coolest?.dataMonth).toEqual({
      year: 2026,
      month: 2,
    });
    expect(shuffled.extremes.warmest).toEqual(forward.extremes.warmest);
    expect(shuffled.extremes.coolest).toEqual(forward.extremes.coolest);
    expect(forward.observedValueRange).toBe(0);
  });

  it("keeps coastal/land-mixed months usable in the extent", () => {
    const summary = summarizeOceanConditionSeries([
      {
        dataMonth: { year: 2026, month: 6 },
        value: 18.4,
        validFraction: 0.4,
        footprint: "land-mixed-coastal",
      },
      water(2026, 7, 26.0),
    ]);

    expect(summary.usableMonthCount).toBe(2);
    expect(summary.coverageTally["land-mixed-coastal"]).toBe(1);
    expect(summary.extremes.coolest?.dataMonth).toEqual({
      year: 2026,
      month: 6,
    });
  });

  it("returns null extremes and range when nothing is usable", () => {
    const summary = summarizeOceanConditionSeries([
      { dataMonth: { year: 2026, month: 3 }, value: null, footprint: "land" },
      water(2026, 4, null),
    ]);

    expect(summary.usableMonthCount).toBe(0);
    expect(summary.extremes.warmest).toBeNull();
    expect(summary.extremes.coolest).toBeNull();
    expect(summary.observedValueRange).toBeNull();
  });

  it("handles an empty series without inventing data", () => {
    const summary = summarizeOceanConditionSeries([]);

    expect(summary.monthCount).toBe(0);
    expect(summary.distinctMonthCount).toBe(0);
    expect(summary.usableMonthCount).toBe(0);
    expect(summary.coverageTally).toEqual({
      water: 0,
      "land-mixed-coastal": 0,
      land: 0,
      missing: 0,
      invalid: 0,
    });
    expect(summary.extremes.warmest).toBeNull();
    expect(summary.observedValueRange).toBeNull();
  });

  it("retains duplicate observations but withholds ambiguous extremes", () => {
    const summary = summarizeOceanConditionSeries([
      water(2026, 3, 12),
      water(2026, 3, 24),
      water(2026, 4, 18),
      water(2025, 12, 10),
      water(2025, 12, null),
    ]);

    expect(summary).toMatchObject({
      status: "duplicate-months",
      monthCount: 5,
      distinctMonthCount: 3,
      usableMonthCount: 4,
      unusableMonthCount: 1,
      duplicateMonths: [
        { year: 2025, month: 12 },
        { year: 2026, month: 3 },
      ],
      extremes: { warmest: null, coolest: null },
      observedValueRange: null,
    });
    expect(summary.months).toHaveLength(5);
  });

  it("does not treat repeated invalid calendar metadata as a duplicate month", () => {
    const invalid = {
      dataMonth: { year: 2026, month: 13 },
      value: 12,
      footprint: "water" as const,
    };
    const summary = summarizeOceanConditionSeries([invalid, invalid]);

    expect(summary.status).toBe("available");
    expect(summary.distinctMonthCount).toBe(0);
    expect(summary.duplicateMonths).toEqual([]);
    expect(summary.coverageTally.invalid).toBe(2);
  });

  it("does not derive a mean, trend, or forecast", () => {
    const summary = summarizeOceanConditionSeries([water(2026, 1, 10.0)]);

    expect(summary).not.toHaveProperty("mean");
    expect(summary).not.toHaveProperty("trend");
    expect(summary.isForecast).toBe(false);
    expect(summary.limitations).toBe(OCEAN_CONDITION_SERIES_LIMITATIONS);
  });
});
