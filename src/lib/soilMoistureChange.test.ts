import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import {
  SOIL_MOISTURE_CHANGE_LIMITATIONS,
  SOIL_MOISTURE_CHANGE_METRIC,
  summarizeSoilMoistureChange,
  type SoilMoistureChangeObservation,
} from "./soilMoistureChange";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };
const TEST_GEOGRAPHY = { id: "point:-121.5000,38.5000", label: "Test point" };

const soilMonth = (
  year: number,
  month: number,
  value: number | null,
  validFraction?: number
): SoilMoistureChangeObservation => ({
  dataMonth: { year, month },
  value,
  validFraction,
  geography: TEST_GEOGRAPHY,
});

describe("soil moisture change", () => {
  it("differences two usable months in native kg/m² without inferring a trend", () => {
    const summary = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 8, 120.0, 0.9),
      later: soilMonth(2025, 11, 148.5, 0.8),
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(summary).toMatchObject({
      kind: "observed-soil-moisture-change",
      isForecast: false,
      isTrend: false,
      claimScope: "descriptive-difference-between-two-observations-only",
      metric: SOIL_MOISTURE_CHANGE_METRIC,
      status: "available",
      monthSpan: 3,
      direction: "wetter",
      minValidFraction: 0.8,
      changeUnit: "kg/m²",
      reason: null,
    });
    expect(summary.change).toBeCloseTo(28.5, 10);
    expect(summary.metric).toBe(CLIMATE_METRICS["soil-moisture"]);
    expect(summary.limitations).toBe(SOIL_MOISTURE_CHANGE_LIMITATIONS);
  });

  it("reports drying and exact-equality directions honestly", () => {
    const drier = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 4, 160.0, 0.95),
      later: soilMonth(2025, 9, 121.0, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });
    const unchanged = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 4, 150, 0.95),
      later: soilMonth(2025, 5, 150, 0.95),
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(drier).toMatchObject({ direction: "drier", monthSpan: 5 });
    expect(drier.change).toBeCloseTo(-39.0, 10);
    expect(unchanged).toMatchObject({ direction: "unchanged", change: 0 });
  });

  it("spans multiple calendar years for the month gap", () => {
    const summary = summarizeSoilMoistureChange({
      earlier: soilMonth(2024, 11, 130, 0.9),
      later: soilMonth(2026, 1, 145, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(summary).toMatchObject({ status: "available", monthSpan: 14 });
    expect(summary.change).toBeCloseTo(15, 10);
  });

  it("carries the weakest coverage and null when a month omits coverage", () => {
    const bothCovered = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 6, 120, 0.6),
      later: soilMonth(2025, 7, 130, 0.95),
      availableThrough: AVAILABLE_THROUGH,
    });
    const missingCoverage = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 6, 120),
      later: soilMonth(2025, 7, 130, 0.95),
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(bothCovered.minValidFraction).toBe(0.6);
    expect(missingCoverage.status).toBe("available");
    expect(missingCoverage.minValidFraction).toBeNull();
  });

  it("refuses reversed or equal month order as non-chronological", () => {
    const reversed = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 9, 140, 0.9),
      later: soilMonth(2025, 6, 120, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });
    const sameMonth = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 6, 120, 0.9),
      later: soilMonth(2025, 6, 130, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(reversed).toMatchObject({
      status: "non-chronological",
      monthSpan: -3,
      change: null,
      direction: null,
      reason: "reversed-order",
    });
    expect(sameMonth).toMatchObject({
      status: "non-chronological",
      monthSpan: 0,
      reason: "same-month",
    });
  });

  it("withholds a difference when a month is not yet published", () => {
    const summary = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 12, 140, 0.9),
      later: soilMonth(2026, 3, 150, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(summary).toMatchObject({
      status: "later-not-usable",
      change: null,
      direction: null,
      reason: "not-yet-published",
    });
  });

  it("surfaces per-month non-usability without differencing", () => {
    const earlierMissing = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 6, null, 0.9),
      later: soilMonth(2025, 8, 140, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });
    const laterZeroCoverage = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 6, 130, 0.9),
      later: soilMonth(2025, 8, 140, 0),
      availableThrough: AVAILABLE_THROUGH,
    });
    const bothBad = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 6, null, 0.9),
      later: soilMonth(2025, 8, -5, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(earlierMissing).toMatchObject({
      status: "earlier-not-usable",
      change: null,
      reason: "missing-value",
    });
    expect(laterZeroCoverage).toMatchObject({
      status: "later-not-usable",
      change: null,
      reason: "zero-coverage",
    });
    expect(bothBad).toMatchObject({
      status: "both-not-usable",
      change: null,
      reason: "both-months-not-usable",
    });
  });

  it("rejects invalid calendar months before differencing", () => {
    const badMonth = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 13, 130, 0.9),
      later: soilMonth(2025, 8, 140, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });
    const badAvailability = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 6, 130, 0.9),
      later: soilMonth(2025, 8, 140, 0.9),
      availableThrough: { year: 2026, month: 0 },
    });

    expect(badMonth).toMatchObject({
      status: "invalid",
      monthSpan: null,
      change: null,
      reason: "invalid-month",
    });
    expect(badAvailability).toMatchObject({
      status: "invalid",
      reason: "invalid-month",
    });
  });

  it("retains both per-month summaries for auditability", () => {
    const summary = summarizeSoilMoistureChange({
      earlier: soilMonth(2025, 6, 120, 0.9),
      later: soilMonth(2025, 7, 130, 0.9),
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(summary.earlier.observedValue).toBe(120);
    expect(summary.later.observedValue).toBe(130);
    expect(summary.earlier.metric.id).toBe("soil-moisture");
    expect(summary.metric.source.doi).toBe("10.5067/SXAVCZFAQLNO");
    expect(summary.earlierGeography).toEqual(TEST_GEOGRAPHY);
    expect(summary.laterGeography).toEqual(TEST_GEOGRAPHY);
  });

  it("withholds a change across different sampling geographies", () => {
    const earlier = soilMonth(2025, 6, 120, 0.9);
    const later = {
      ...soilMonth(2025, 7, 130, 0.9),
      geography: { id: "point:-120.0000,39.0000", label: "Other point" },
    };

    const summary = summarizeSoilMoistureChange({
      earlier,
      later,
      availableThrough: AVAILABLE_THROUGH,
    });

    expect(summary).toMatchObject({
      status: "different-geography",
      monthSpan: 1,
      change: null,
      direction: null,
      minValidFraction: null,
      reason: "different-geography",
      earlierGeography: TEST_GEOGRAPHY,
      laterGeography: later.geography,
    });
  });

  it("rejects missing geography identities and blank labels", () => {
    const blankId = {
      ...soilMonth(2025, 6, 120, 0.9),
      geography: { id: " " },
    };
    const blankLabel = {
      ...soilMonth(2025, 7, 130, 0.9),
      geography: { id: TEST_GEOGRAPHY.id, label: "" },
    };

    expect(
      summarizeSoilMoistureChange({
        earlier: blankId,
        later: soilMonth(2025, 7, 130, 0.9),
        availableThrough: AVAILABLE_THROUGH,
      })
    ).toMatchObject({
      status: "invalid",
      change: null,
      reason: "invalid-geography",
    });
    expect(
      summarizeSoilMoistureChange({
        earlier: soilMonth(2025, 6, 120, 0.9),
        later: blankLabel,
        availableThrough: AVAILABLE_THROUGH,
      })
    ).toMatchObject({
      status: "invalid",
      change: null,
      reason: "invalid-geography",
    });
  });
});
