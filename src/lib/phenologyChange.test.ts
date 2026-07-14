import { describe, expect, it } from "vitest";
import { NDVI_SOURCE, NDVI_UNIT } from "./phenology";
import {
  DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD,
  summarizeNdviMonthlyChange,
} from "./phenologyChange";

describe("monthly NDVI change summaries", () => {
  it("labels consecutive-month transitions, extrema, units, and provenance", () => {
    const summary = summarizeNdviMonthlyChange(
      [
        { month: { year: 2025, month: 3 }, ndvi: 0.2, validFraction: 0.9 },
        { month: { year: 2025, month: 4 }, ndvi: 0.5, validFraction: 0.8 },
        { month: { year: 2025, month: 5 }, ndvi: 0.52, validFraction: 0.7 },
        { month: { year: 2025, month: 6 }, ndvi: 0.3, validFraction: 0.6 },
      ],
      48.8
    );

    expect(summary).toMatchObject({
      kind: "observed-monthly-ndvi-change",
      isForecast: false,
      hemisphere: "northern",
      stabilityThreshold: DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD,
      greeningCount: 1,
      browningCount: 1,
      littleChangeCount: 1,
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
    });
    expect(summary.coverage).toMatchObject({
      observationCount: 4,
      usableMonthCount: 4,
      transitionCount: 3,
      gapCount: 0,
      missingMonthCount: 0,
      invalidRecordCount: 0,
    });

    const [first, second, third] = summary.changes;
    expect(first).toMatchObject({
      from: { year: 2025, month: 3 },
      to: { year: 2025, month: 4 },
      direction: "greening",
      toSeason: "spring",
      minimumValidFraction: 0.8,
    });
    expect(first.delta).toBeCloseTo(0.3, 10);
    expect(second.direction).toBe("little-change");
    expect(third).toMatchObject({ direction: "browning", toSeason: "summer" });

    expect(summary.steepestGreening?.to).toEqual({ year: 2025, month: 4 });
    expect(summary.steepestBrowning?.to).toEqual({ year: 2025, month: 6 });
    expect(summary.steepestBrowning?.delta).toBeCloseTo(-0.22, 10);
  });

  it("never bridges a missing month; the gap breaks the chain", () => {
    const summary = summarizeNdviMonthlyChange(
      [
        { month: { year: 2025, month: 1 }, ndvi: 0.2 },
        // February missing entirely — no April-vs-January transition allowed.
        { month: { year: 2025, month: 3 }, ndvi: 0.9 },
        { month: { year: 2025, month: 4 }, ndvi: 0.95 },
      ],
      10
    );

    expect(summary.coverage.transitionCount).toBe(1);
    expect(summary.coverage.gapCount).toBe(1);
    expect(summary.changes).toHaveLength(1);
    expect(summary.changes[0]).toMatchObject({
      from: { year: 2025, month: 3 },
      to: { year: 2025, month: 4 },
      direction: "little-change",
    });
  });

  it("treats a zero-coverage or missing value as a gap, not a change", () => {
    const summary = summarizeNdviMonthlyChange(
      [
        { month: { year: 2024, month: 11 }, ndvi: 0.4, validFraction: 0.9 },
        { month: { year: 2024, month: 12 }, ndvi: 0.7, validFraction: 0 },
        { month: { year: 2025, month: 1 }, ndvi: null },
        { month: { year: 2025, month: 2 }, ndvi: 0.6, validFraction: 0.9 },
      ],
      45
    );

    expect(summary.coverage.missingMonthCount).toBe(2);
    expect(summary.coverage.usableMonthCount).toBe(2);
    expect(summary.coverage.transitionCount).toBe(0);
    expect(summary.coverage.gapCount).toBe(1);
    expect(summary.changes).toHaveLength(0);
  });

  it("spans a December-to-January boundary as one consecutive transition", () => {
    const summary = summarizeNdviMonthlyChange(
      [
        { month: { year: 2024, month: 12 }, ndvi: 0.3 },
        { month: { year: 2025, month: 1 }, ndvi: 0.42 },
      ],
      52
    );

    expect(summary.coverage.transitionCount).toBe(1);
    expect(summary.coverage.gapCount).toBe(0);
    expect(summary.changes[0]).toMatchObject({
      from: { year: 2024, month: 12 },
      to: { year: 2025, month: 1 },
      direction: "greening",
      toSeason: "winter",
    });
  });

  it("rejects duplicate months and out-of-range values without averaging", () => {
    const summary = summarizeNdviMonthlyChange(
      [
        { month: { year: 2025, month: 5 }, ndvi: 0.5 },
        { month: { year: 2025, month: 5 }, ndvi: 0.9 },
        { month: { year: 2025, month: 6 }, ndvi: 1.4 },
        { month: { year: 2025, month: 13 }, ndvi: 0.5 },
        { month: { year: 2025, month: 7 }, ndvi: 0.55, validFraction: 1.2 },
      ],
      0
    );

    expect(summary.coverage).toMatchObject({
      usableMonthCount: 1,
      invalidRecordCount: 4,
      transitionCount: 0,
    });
    // First May value is retained unchanged, not blended with the duplicate.
    expect(summary.changes).toHaveLength(0);
  });

  it("honors a caller coverage floor and a custom stability threshold", () => {
    const summary = summarizeNdviMonthlyChange(
      [
        { month: { year: 2025, month: 6 }, ndvi: 0.5, validFraction: 0.5 },
        { month: { year: 2025, month: 7 }, ndvi: 0.58, validFraction: 0.9 },
        { month: { year: 2025, month: 8 }, ndvi: 0.66, validFraction: 0.9 },
      ],
      40,
      { minimumValidFraction: 0.6, stabilityThreshold: 0.1 }
    );

    expect(summary.coverage.lowCoverageMonthCount).toBe(1);
    expect(summary.coverage.usableMonthCount).toBe(2);
    expect(summary.requiredValidFraction).toBe(0.6);
    expect(summary.stabilityThreshold).toBe(0.1);
    // The July→August delta of 0.08 is within the 0.1 threshold.
    expect(summary.changes).toHaveLength(1);
    expect(summary.changes[0].direction).toBe("little-change");
  });

  it("falls back to defaults for an invalid threshold or coverage floor", () => {
    const summary = summarizeNdviMonthlyChange([], 0, {
      stabilityThreshold: -1,
      minimumValidFraction: 5,
    });

    expect(summary.stabilityThreshold).toBe(
      DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD
    );
    expect(summary.requiredValidFraction).toBe(1);
    expect(summary.steepestGreening).toBeNull();
    expect(summary.steepestBrowning).toBeNull();
  });
});
