import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import { precipitationAccumulation } from "./precipitationAccumulation";
import {
  PRECIP_WINDOW_LIMITATIONS,
  formatPrecipitationWindowRange,
  precipitationWindow,
  type PrecipitationWindowAccumulation,
} from "./precipitationWindow";
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

describe("precipitation window accumulation", () => {
  it("sums a strictly consecutive run of monthly totals", () => {
    const months = [
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 2 }),
      accum(0.00015, { year: 2026, month: 3 }),
    ];
    const expectedTotal = months.reduce((sum, m) => sum + m.totalMm, 0);

    const window = precipitationWindow(months);

    expect(window).not.toBeNull();
    expect(window).toMatchObject({
      kind: "derived-precip-window-accumulation",
      isForecast: false,
      startMonth: { year: 2026, month: 1 },
      endMonth: { year: 2026, month: 3 },
      monthCount: 3,
      // Jan (31) + Feb 2026 (28, non-leap) + Mar (31).
      windowDays: 31 + 28 + 31,
    });
    expect(window?.totalMm).toBeCloseTo(expectedTotal, 9);
    expect(window?.meanMonthlyMm).toBeCloseTo(expectedTotal / 3, 9);
  });

  it("orders unsorted inputs before summing", () => {
    const inOrder = precipitationWindow([
      accum(0.0001, { year: 2025, month: 11 }),
      accum(0.0002, { year: 2025, month: 12 }),
      accum(0.0003, { year: 2026, month: 1 }),
    ]);
    const shuffled = precipitationWindow([
      accum(0.0003, { year: 2026, month: 1 }),
      accum(0.0001, { year: 2025, month: 11 }),
      accum(0.0002, { year: 2025, month: 12 }),
    ]);

    // The window spans a year boundary; ordering must be month-index based.
    expect(shuffled?.startMonth).toEqual({ year: 2025, month: 11 });
    expect(shuffled?.endMonth).toEqual({ year: 2026, month: 1 });
    expect(shuffled?.totalMm).toBeCloseTo(inOrder?.totalMm ?? NaN, 9);
  });

  it("accepts a single-month window as a degenerate sum", () => {
    const single = accum(0.0001, { year: 2026, month: 4 });
    const window = precipitationWindow([single]);

    expect(window?.monthCount).toBe(1);
    expect(window?.totalMm).toBeCloseTo(single.totalMm, 9);
    expect(window?.meanMonthlyMm).toBeCloseTo(single.totalMm, 9);
    expect(window?.startMonth).toEqual(window?.endMonth);
  });

  it("returns null for an empty set (no total, not zero)", () => {
    expect(precipitationWindow([])).toBeNull();
  });

  it("withholds a total when a month is missing from the run", () => {
    const gapped = precipitationWindow([
      accum(0.0001, { year: 2026, month: 1 }),
      // February is absent.
      accum(0.00015, { year: 2026, month: 3 }),
    ]);

    expect(gapped).toBeNull();
  });

  it("withholds a total when a month is duplicated or overlaps", () => {
    const duplicated = precipitationWindow([
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 1 }),
    ]);

    expect(duplicated).toBeNull();
  });

  it("refuses to mix provenance from different products", () => {
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

    expect(precipitationWindow([january, februaryElsewhere])).toBeNull();
  });

  it("preserves the shared cited precipitation dataset provenance", () => {
    const window = precipitationWindow([
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 2 }),
    ]);

    expect(window?.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("rejects a corrupt (non-finite or negative) monthly total", () => {
    const base = accum(0.0001, { year: 2026, month: 1 });
    const corrupt: PrecipitationWindowAccumulation | null = precipitationWindow(
      [
        base,
        { ...accum(0.0002, { year: 2026, month: 2 }), totalMm: Number.NaN },
      ]
    );

    expect(corrupt).toBeNull();
  });

  it("formats a multi-month range and a single month legibly", () => {
    const multi = precipitationWindow([
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 2 }),
    ]);
    const single = precipitationWindow([
      accum(0.0001, { year: 2026, month: 5 }),
    ]);

    expect(multi && formatPrecipitationWindowRange(multi)).toBe(
      "Jan 2026 – Feb 2026"
    );
    expect(single && formatPrecipitationWindowRange(single)).toBe("May 2026");
  });

  it("documents that the window total is a plain sum, not an inference", () => {
    expect(PRECIP_WINDOW_LIMITATIONS).toMatch(/consecutive/i);
    expect(PRECIP_WINDOW_LIMITATIONS).toMatch(/not a .*forecast/i);
  });
});
