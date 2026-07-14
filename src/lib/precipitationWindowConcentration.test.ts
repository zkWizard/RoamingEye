import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import { precipitationAccumulation } from "./precipitationAccumulation";
import {
  PRECIP_WINDOW_CONCENTRATION_LIMITATIONS,
  precipitationWindowConcentration,
} from "./precipitationWindowConcentration";
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

describe("precipitation window concentration", () => {
  it("identifies the wettest and driest month and their shares", () => {
    // A strictly consecutive run; Mar carries the highest rate (wettest) and
    // May the lowest (driest), independent of month-length differences here.
    const run = [
      accum(0.0004, { year: 2026, month: 3 }), // 31 days, wettest
      accum(0.0002, { year: 2026, month: 4 }), // 30 days
      accum(0.0001, { year: 2026, month: 5 }), // 31 days, driest
    ];

    const conc = precipitationWindowConcentration(run);
    expect(conc).not.toBeNull();

    const total = run.reduce((sum, m) => sum + m.totalMm, 0);
    expect(conc).toMatchObject({
      kind: "derived-precip-window-concentration",
      isForecast: false,
      wettestMonth: { year: 2026, month: 3 },
      driestMonth: { year: 2026, month: 5 },
      monthCount: 3,
    });
    expect(conc?.wettestMonthMm).toBeCloseTo(run[0].totalMm, 9);
    expect(conc?.driestMonthMm).toBeCloseTo(run[2].totalMm, 9);
    expect(conc?.totalMm).toBeCloseTo(total, 9);
    expect(conc?.wettestMonthShare).toBeCloseTo(run[0].totalMm / total, 9);
    expect(conc?.driestMonthShare).toBeCloseTo(run[2].totalMm / total, 9);
    // Shares are ordered and bounded.
    expect(conc!.wettestMonthShare).toBeGreaterThan(conc!.driestMonthShare);
    expect(conc!.wettestMonthShare).toBeLessThanOrEqual(1);
    expect(conc!.driestMonthShare).toBeGreaterThan(0);
  });

  it("reports a single-month window as fully concentrated", () => {
    const conc = precipitationWindowConcentration([
      accum(0.0002, { year: 2026, month: 6 }),
    ]);

    expect(conc?.monthCount).toBe(1);
    expect(conc?.wettestMonthShare).toBeCloseTo(1, 9);
    expect(conc?.driestMonthShare).toBeCloseTo(1, 9);
    expect(conc?.wettestMonth).toEqual({ year: 2026, month: 6 });
    expect(conc?.driestMonth).toEqual({ year: 2026, month: 6 });
  });

  it("splits a perfectly even window into equal shares of 1/monthCount", () => {
    // Two 31-day months (Jul, Aug) at the same rate accumulate equal depths, so
    // each holds exactly half the window total.
    const conc = precipitationWindowConcentration([
      accum(0.0003, { year: 2026, month: 7 }), // 31 days
      accum(0.0003, { year: 2026, month: 8 }), // 31 days
    ]);

    expect(conc?.monthCount).toBe(2);
    expect(conc?.wettestMonthShare).toBeCloseTo(0.5, 9);
    expect(conc?.driestMonthShare).toBeCloseTo(0.5, 9);
    // Ties resolve to the earliest month for both extremes.
    expect(conc?.wettestMonth).toEqual({ year: 2026, month: 7 });
    expect(conc?.driestMonth).toEqual({ year: 2026, month: 7 });
  });

  it("accepts unsorted inputs and orders them before finding extremes", () => {
    const conc = precipitationWindowConcentration([
      accum(0.0001, { year: 2026, month: 5 }),
      accum(0.0004, { year: 2026, month: 3 }),
      accum(0.0002, { year: 2026, month: 4 }),
    ]);

    expect(conc?.wettestMonth).toEqual({ year: 2026, month: 3 });
    expect(conc?.driestMonth).toEqual({ year: 2026, month: 5 });
  });

  it("returns null for a bone-dry (zero-total) window (undefined shares)", () => {
    const conc = precipitationWindowConcentration([
      accum(0, { year: 2026, month: 1 }),
      accum(0, { year: 2026, month: 2 }),
    ]);

    expect(conc).toBeNull();
  });

  it("returns null when the underlying window is invalid (gap in the run)", () => {
    const conc = precipitationWindowConcentration([
      accum(0.0001, { year: 2026, month: 1 }),
      // February absent → no valid window → no concentration.
      accum(0.0002, { year: 2026, month: 3 }),
    ]);

    expect(conc).toBeNull();
  });

  it("returns null for an empty set (no window, not even)", () => {
    expect(precipitationWindowConcentration([])).toBeNull();
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
      precipitationWindowConcentration([january, februaryElsewhere])
    ).toBeNull();
  });

  it("preserves the shared cited precipitation dataset provenance", () => {
    const conc = precipitationWindowConcentration([
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 2 }),
    ]);

    expect(conc?.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("documents that shares are descriptive fractions, not inferences", () => {
    expect(PRECIP_WINDOW_CONCENTRATION_LIMITATIONS).toMatch(/1\/monthCount/i);
    expect(PRECIP_WINDOW_CONCENTRATION_LIMITATIONS).toMatch(
      /not a .*forecast/i
    );
  });
});
