import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import { precipitationAccumulation } from "./precipitationAccumulation";
import {
  PRECIP_SEASONALITY_INDEX_LIMITATIONS,
  precipitationSeasonalityIndex,
} from "./precipitationSeasonalityIndex";
import type { DatasetRef, YearMonth } from "./timeline";

/** Build a usable monthly accumulation for a given rate and month. */
function accum(rate: number, dataMonth: YearMonth) {
  const summary = summarizeMonthlyClimate(
    { metricId: "precipitation-rate", dataMonth, value: rate },
    { year: dataMonth.year + 2, month: dataMonth.month }
  );
  const result = precipitationAccumulation(summary);
  if (result === null)
    throw new Error("expected a usable monthly accumulation");
  return result;
}

/** A full calendar year of accumulations, all at the same rate, from `year`. */
function evenYear(rate: number, year: number) {
  return Array.from({ length: 12 }, (_, i) =>
    accum(rate, { year, month: i + 1 })
  );
}

describe("precipitation seasonality index (Walsh & Lawler SI)", () => {
  it("reports SI 0 for a perfectly even (equal-depth) window", () => {
    // Two 31-day months (Jul, Aug) at the same rate accumulate equal depths, so
    // the window is perfectly even: every deviation from the mean is 0.
    const si = precipitationSeasonalityIndex([
      accum(0.0003, { year: 2026, month: 7 }), // 31 days
      accum(0.0003, { year: 2026, month: 8 }), // 31 days
    ]);

    expect(si).not.toBeNull();
    expect(si).toMatchObject({
      kind: "derived-precip-seasonality-index",
      isForecast: false,
      monthCount: 2,
      startMonth: { year: 2026, month: 7 },
      endMonth: { year: 2026, month: 8 },
    });
    expect(si?.si).toBeCloseTo(0, 9);
    expect(si?.maxPossible).toBeCloseTo(1, 9); // 2·(2 − 1) / 2
    // A 2-month window is not annual, so no class label is asserted.
    expect(si?.classification).toBeNull();
    expect(si?.classLabel).toBeNull();
  });

  it("gives an even calendar year an SI near the 0 floor and the 1.83 ceiling", () => {
    const si = precipitationSeasonalityIndex(evenYear(0.0002, 2026));

    expect(si?.monthCount).toBe(12);
    // Note: months differ in length (28–31 days) so equal *rates* do not give
    // exactly equal *depths*; SI sits just above the 0 even-split floor.
    expect(si!.si).toBeGreaterThanOrEqual(0);
    expect(si!.si).toBeLessThan(0.05);
    expect(si?.maxPossible).toBeCloseTo((2 * 11) / 12, 9); // ≈1.8333
    // An even year is classified "very-equable" (SI < 0.20) on the annual scale.
    expect(si?.classification).toBe("very-equable");
    expect(si?.classLabel).toMatch(/equable/i);
  });

  it("approaches the ceiling when one month dominates the calendar year", () => {
    // Eleven near-dry months plus one very wet month → SI close to its ceiling.
    const months = Array.from({ length: 12 }, (_, i) =>
      accum(i === 6 ? 0.005 : 0.000001, { year: 2026, month: i + 1 })
    );
    const si = precipitationSeasonalityIndex(months);

    expect(si?.monthCount).toBe(12);
    expect(si!.si).toBeGreaterThan(1.2);
    expect(si!.si).toBeLessThanOrEqual(si!.maxPossible);
    expect(si?.classification).toBe("extreme");
    expect(si?.classLabel).toMatch(/extreme/i);
  });

  it("matches the closed-form SI for a hand-computable window", () => {
    // A consecutive Jan–Mar run at rising rates; assert against the actual
    // integrated depths (month lengths differ, so we compute from them directly).
    const run = [
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 2 }),
      accum(0.0003, { year: 2026, month: 3 }),
    ];
    const p = run.map((m) => m.totalMm);
    const total = p[0] + p[1] + p[2];
    const mean = total / 3;
    const expected =
      (Math.abs(p[0] - mean) + Math.abs(p[1] - mean) + Math.abs(p[2] - mean)) /
      total;

    const si = precipitationSeasonalityIndex(run);
    expect(si?.si).toBeCloseTo(expected, 9);
    expect(si?.totalMm).toBeCloseTo(total, 9);
    expect(si?.uniformValue).toBeCloseTo(mean, 9);
  });

  it("keeps si within [0, maxPossible] and uniformValue = total / monthCount", () => {
    const si = precipitationSeasonalityIndex([
      accum(0.0004, { year: 2026, month: 3 }),
      accum(0.0002, { year: 2026, month: 4 }),
      accum(0.0001, { year: 2026, month: 5 }),
    ]);

    expect(si!.si).toBeGreaterThanOrEqual(0);
    expect(si!.si).toBeLessThanOrEqual(si!.maxPossible);
    expect(si?.uniformValue).toBeCloseTo(si!.totalMm / si!.monthCount, 9);
    expect(si?.maxPossible).toBeCloseTo((2 * (3 - 1)) / 3, 9);
  });

  it("only classifies a 12-month window; longer/shorter stays unclassified", () => {
    const eleven = precipitationSeasonalityIndex(
      Array.from({ length: 11 }, (_, i) =>
        accum(0.0002, { year: 2026, month: i + 1 })
      )
    );
    expect(eleven?.monthCount).toBe(11);
    expect(eleven?.classification).toBeNull();
    expect(eleven?.classLabel).toBeNull();

    const twelve = precipitationSeasonalityIndex(evenYear(0.0002, 2025));
    expect(twelve?.classification).not.toBeNull();
  });

  it("assigns a mid-range regime class to a moderately seasonal year", () => {
    // A gentle sinusoidal-ish annual march: a wetter half and a drier half, but
    // no single dominating month → a mid-range SI and regime class.
    const rates = [
      0.00005, 0.00006, 0.0001, 0.00015, 0.0002, 0.00025, 0.00025, 0.0002,
      0.00015, 0.0001, 0.00006, 0.00005,
    ];
    const months = rates.map((rate, i) =>
      accum(rate, { year: 2026, month: i + 1 })
    );
    const si = precipitationSeasonalityIndex(months);

    expect(si?.monthCount).toBe(12);
    expect(si!.si).toBeGreaterThan(0.2);
    expect(si!.si).toBeLessThan(0.8);
    expect(si?.classification).not.toBeNull();
    expect([
      "equable-with-wetter-season",
      "rather-seasonal",
      "seasonal",
    ]).toContain(si?.classification);
  });

  it("accepts unsorted inputs and orders them before computing", () => {
    const si = precipitationSeasonalityIndex([
      accum(0.0001, { year: 2026, month: 5 }),
      accum(0.0004, { year: 2026, month: 3 }),
      accum(0.0002, { year: 2026, month: 4 }),
    ]);

    expect(si?.startMonth).toEqual({ year: 2026, month: 3 });
    expect(si?.endMonth).toEqual({ year: 2026, month: 5 });
    expect(si?.monthCount).toBe(3);
  });

  it("returns null for a single-month window (spread is undefined)", () => {
    // Unlike PCI (which reads a lone month as fully concentrated), an SI of 0
    // for one month would misleadingly read as 'even', so this reports null.
    const si = precipitationSeasonalityIndex([
      accum(0.0002, { year: 2026, month: 6 }),
    ]);

    expect(si).toBeNull();
  });

  it("returns null for a bone-dry (zero-total) window (index undefined)", () => {
    const si = precipitationSeasonalityIndex([
      accum(0, { year: 2026, month: 1 }),
      accum(0, { year: 2026, month: 2 }),
    ]);

    expect(si).toBeNull();
  });

  it("returns null when the run has a gap (missing month)", () => {
    const si = precipitationSeasonalityIndex([
      accum(0.0001, { year: 2026, month: 1 }),
      // February absent → no valid window → no index.
      accum(0.0002, { year: 2026, month: 3 }),
    ]);

    expect(si).toBeNull();
  });

  it("returns null for a duplicate/overlapping month", () => {
    const si = precipitationSeasonalityIndex([
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 1 }),
    ]);

    expect(si).toBeNull();
  });

  it("returns null for an empty set", () => {
    expect(precipitationSeasonalityIndex([])).toBeNull();
  });

  it("refuses to describe a window that mixes provenance", () => {
    const january = accum(0.0001, { year: 2026, month: 1 });
    const foreignSource: DatasetRef = {
      shortName: "OTHER",
      version: "001",
      doi: "10.0000/other",
      title: "A different product",
    };
    const februaryElsewhere = {
      ...accum(0.0002, { year: 2026, month: 2 }),
      source: foreignSource,
    };

    expect(
      precipitationSeasonalityIndex([january, februaryElsewhere])
    ).toBeNull();
  });

  it("preserves the shared cited precipitation dataset provenance", () => {
    const si = precipitationSeasonalityIndex([
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 2 }),
    ]);

    expect(si?.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("documents that the index is descriptive, not an inference or forecast", () => {
    expect(PRECIP_SEASONALITY_INDEX_LIMITATIONS).toMatch(
      /Walsh & Lawler 1981/i
    );
    expect(PRECIP_SEASONALITY_INDEX_LIMITATIONS).toMatch(/not a .*forecast/i);
    expect(PRECIP_SEASONALITY_INDEX_LIMITATIONS).toMatch(/12-month/i);
  });
});
