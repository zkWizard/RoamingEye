import { describe, expect, it } from "vitest";
import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import { summarizeOceanConditionChange } from "./oceanConditionChange";

const waterMonth = (
  month: number,
  value: number | null,
  validFraction?: number
): SeaSurfaceTemperatureObservation => ({
  dataMonth: { year: 2026, month },
  value,
  validFraction,
  footprint: "water",
});

describe("ocean condition change", () => {
  it("differences two usable months in the source unit without inferring a trend", () => {
    const summary = summarizeOceanConditionChange({
      earlier: waterMonth(2, 18.0, 0.9),
      later: waterMonth(3, 20.1, 0.8),
    });

    expect(summary).toMatchObject({
      kind: "observed-sea-surface-temperature-change",
      isForecast: false,
      isTrend: false,
      claimScope: "descriptive-difference-between-two-observations-only",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      status: "available",
      monthSpan: 1,
      direction: "warmer",
      minValidFraction: 0.8,
      changeUnit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
      reason: null,
    });
    expect(summary.change).toBeCloseTo(2.1, 10);
  });

  it("reports cooling and exact-equality directions honestly", () => {
    const cooler = summarizeOceanConditionChange({
      earlier: waterMonth(1, 12.4, 0.95),
      later: waterMonth(6, 9.4, 0.95),
    });
    const unchanged = summarizeOceanConditionChange({
      earlier: waterMonth(1, 15, 0.95),
      later: waterMonth(2, 15, 0.95),
    });

    expect(cooler).toMatchObject({ direction: "cooler", monthSpan: 5 });
    expect(cooler.change).toBeCloseTo(-3.0, 10);
    expect(unchanged).toMatchObject({ direction: "unchanged", change: 0 });
  });

  it("spans multiple calendar years for the month gap", () => {
    const summary = summarizeOceanConditionChange({
      earlier: {
        dataMonth: { year: 2024, month: 11 },
        value: 21,
        footprint: "water",
      },
      later: {
        dataMonth: { year: 2026, month: 2 },
        value: 19,
        footprint: "water",
      },
    });

    expect(summary).toMatchObject({ status: "available", monthSpan: 15 });
  });

  it("withholds minValidFraction when either month omits coverage", () => {
    const summary = summarizeOceanConditionChange({
      earlier: waterMonth(2, 18.0),
      later: waterMonth(3, 19.0, 0.5),
    });

    expect(summary.status).toBe("available");
    expect(summary.minValidFraction).toBeNull();
  });

  it("does not difference a month against itself or a reversed pair", () => {
    const same = summarizeOceanConditionChange({
      earlier: waterMonth(3, 18, 0.9),
      later: waterMonth(3, 22, 0.9),
    });
    const reversed = summarizeOceanConditionChange({
      earlier: waterMonth(6, 18, 0.9),
      later: waterMonth(3, 22, 0.9),
    });

    expect(same).toMatchObject({
      status: "non-chronological",
      reason: "same-month",
      monthSpan: 0,
      change: null,
      direction: null,
    });
    expect(reversed).toMatchObject({
      status: "non-chronological",
      reason: "reversed-order",
      monthSpan: -3,
      change: null,
    });
  });

  it("surfaces which month is not usable instead of inventing a change", () => {
    const earlierLand = summarizeOceanConditionChange({
      earlier: {
        dataMonth: { year: 2026, month: 2 },
        value: null,
        footprint: "land",
      },
      later: waterMonth(3, 19, 0.9),
    });
    const laterMissing = summarizeOceanConditionChange({
      earlier: waterMonth(2, 18, 0.9),
      later: {
        dataMonth: { year: 2026, month: 3 },
        value: null,
        footprint: "water",
      },
    });
    const bothOut = summarizeOceanConditionChange({
      earlier: {
        dataMonth: { year: 2026, month: 2 },
        value: null,
        footprint: "land",
      },
      later: {
        dataMonth: { year: 2026, month: 3 },
        value: null,
        footprint: "unknown",
      },
    });

    expect(earlierLand).toMatchObject({
      status: "earlier-not-usable",
      reason: "land-footprint",
      change: null,
    });
    expect(laterMissing).toMatchObject({
      status: "later-not-usable",
      reason: "missing-sst-value",
      change: null,
    });
    expect(bothOut).toMatchObject({
      status: "both-not-usable",
      reason: "both-months-not-usable",
      change: null,
    });
  });

  it("treats out-of-range SST values as not usable", () => {
    const summary = summarizeOceanConditionChange({
      earlier: waterMonth(2, 99, 0.9),
      later: waterMonth(3, 19, 0.9),
    });

    expect(summary).toMatchObject({
      status: "earlier-not-usable",
      reason: "invalid-value",
      change: null,
    });
  });

  it("flags an invalid calendar month before differencing", () => {
    const summary = summarizeOceanConditionChange({
      earlier: {
        dataMonth: { year: 2026, month: 0 },
        value: 18,
        footprint: "water",
      },
      later: waterMonth(3, 19, 0.9),
    });

    expect(summary).toMatchObject({
      status: "invalid",
      reason: "invalid-month",
      monthSpan: null,
      change: null,
      direction: null,
    });
  });
});
