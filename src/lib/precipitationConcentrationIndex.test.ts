import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import { precipitationAccumulation } from "./precipitationAccumulation";
import {
  PRECIP_CONCENTRATION_INDEX_LIMITATIONS,
  precipitationConcentrationIndex,
} from "./precipitationConcentrationIndex";
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

describe("precipitation concentration index (PCI)", () => {
  it("reports the even-split floor for a perfectly uniform window", () => {
    // Two 31-day months (Jul, Aug) at the same rate accumulate equal depths, so
    // the window is perfectly even: PCI = 100 / monthCount and effectiveMonths
    // equals the month count.
    const pci = precipitationConcentrationIndex([
      accum(0.0003, { year: 2026, month: 7 }), // 31 days
      accum(0.0003, { year: 2026, month: 8 }), // 31 days
    ]);

    expect(pci).not.toBeNull();
    expect(pci).toMatchObject({
      kind: "derived-precip-concentration-index",
      isForecast: false,
      monthCount: 2,
      startMonth: { year: 2026, month: 7 },
      endMonth: { year: 2026, month: 8 },
    });
    expect(pci?.pci).toBeCloseTo(50, 9); // 100 / 2
    expect(pci?.uniformValue).toBeCloseTo(50, 9);
    expect(pci?.effectiveMonths).toBeCloseTo(2, 9);
    // A 2-month window is not annual, so no class label is asserted.
    expect(pci?.classification).toBeNull();
    expect(pci?.classLabel).toBeNull();
  });

  it("gives an even calendar year the theoretical PCI floor of 100/12", () => {
    const pci = precipitationConcentrationIndex(evenYear(0.0002, 2026));

    expect(pci?.monthCount).toBe(12);
    // Note: months differ in length (28–31 days) so equal *rates* do not give
    // exactly equal *depths*; PCI sits just above the 8.33 even-split floor.
    expect(pci?.uniformValue).toBeCloseTo(100 / 12, 9);
    expect(pci!.pci).toBeGreaterThanOrEqual(pci!.uniformValue);
    expect(pci!.pci).toBeLessThan(8.4);
    // An even year is classified "uniform" (PCI < 10) on the annual scale.
    expect(pci?.classification).toBe("uniform");
    expect(pci?.classLabel).toMatch(/uniform/i);
  });

  it("reports PCI ~100 and effectiveMonths ~1 when one month dominates", () => {
    const pci = precipitationConcentrationIndex([
      accum(0.00001, { year: 2026, month: 1 }),
      accum(0.00001, { year: 2026, month: 2 }),
      accum(0.005, { year: 2026, month: 3 }), // overwhelmingly the wettest
    ]);

    expect(pci!.pci).toBeGreaterThan(90);
    expect(pci!.pci).toBeLessThanOrEqual(100);
    expect(pci!.effectiveMonths).toBeGreaterThan(1);
    expect(pci!.effectiveMonths).toBeLessThan(1.3);
  });

  it("keeps pci and effectiveMonths reciprocal: effectiveMonths = 100/pci", () => {
    const pci = precipitationConcentrationIndex([
      accum(0.0004, { year: 2026, month: 3 }),
      accum(0.0002, { year: 2026, month: 4 }),
      accum(0.0001, { year: 2026, month: 5 }),
    ]);

    expect(pci?.effectiveMonths).toBeCloseTo(100 / pci!.pci, 9);
    // effectiveMonths is bounded by (1, monthCount].
    expect(pci!.effectiveMonths).toBeGreaterThan(1);
    expect(pci!.effectiveMonths).toBeLessThanOrEqual(pci!.monthCount);
    // pci is bounded by [uniformValue, 100].
    expect(pci!.pci).toBeGreaterThanOrEqual(pci!.uniformValue);
    expect(pci!.pci).toBeLessThanOrEqual(100);
  });

  it("matches the closed-form PCI for a hand-computable window", () => {
    // Use whole-month deltas by feeding equal-length months (Jan, Mar, May are
    // all 31 days) so depths are directly proportional to the rates 1:2:3.
    const run = [
      accum(0.0001, { year: 2026, month: 1 }), // 31 days
      accum(0.0002, { year: 2026, month: 2 }), // 28 days
      accum(0.0003, { year: 2026, month: 3 }), // 31 days
    ];
    const p = run.map((m) => m.totalMm);
    const sum = p[0] + p[1] + p[2];
    const sumSq = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    const expected = (100 * sumSq) / (sum * sum);

    const pci = precipitationConcentrationIndex(run);
    expect(pci?.pci).toBeCloseTo(expected, 9);
    expect(pci?.totalMm).toBeCloseTo(sum, 9);
  });

  it("only classifies a 12-month window; longer/shorter stays unclassified", () => {
    const eleven = precipitationConcentrationIndex(
      Array.from({ length: 11 }, (_, i) =>
        accum(0.0002, { year: 2026, month: i + 1 })
      )
    );
    expect(eleven?.monthCount).toBe(11);
    expect(eleven?.classification).toBeNull();
    expect(eleven?.classLabel).toBeNull();

    const twelve = precipitationConcentrationIndex(evenYear(0.0002, 2025));
    expect(twelve?.classification).not.toBeNull();
  });

  it("assigns the strongly-irregular class to a concentrated calendar year", () => {
    // Eleven near-dry months plus one very wet month → annual PCI well above 20.
    const months = Array.from({ length: 12 }, (_, i) =>
      accum(i === 6 ? 0.005 : 0.000001, { year: 2026, month: i + 1 })
    );
    const pci = precipitationConcentrationIndex(months);

    expect(pci?.monthCount).toBe(12);
    expect(pci!.pci).toBeGreaterThan(20);
    expect(pci?.classification).toBe("strongly-irregular");
    expect(pci?.classLabel).toMatch(/strongly irregular/i);
  });

  it("accepts unsorted inputs and orders them before computing", () => {
    const pci = precipitationConcentrationIndex([
      accum(0.0001, { year: 2026, month: 5 }),
      accum(0.0004, { year: 2026, month: 3 }),
      accum(0.0002, { year: 2026, month: 4 }),
    ]);

    expect(pci?.startMonth).toEqual({ year: 2026, month: 3 });
    expect(pci?.endMonth).toEqual({ year: 2026, month: 5 });
    expect(pci?.monthCount).toBe(3);
  });

  it("treats a single-month window as fully concentrated (PCI 100)", () => {
    const pci = precipitationConcentrationIndex([
      accum(0.0002, { year: 2026, month: 6 }),
    ]);

    expect(pci?.monthCount).toBe(1);
    expect(pci?.pci).toBeCloseTo(100, 9);
    expect(pci?.uniformValue).toBeCloseTo(100, 9);
    expect(pci?.effectiveMonths).toBeCloseTo(1, 9);
    expect(pci?.classification).toBeNull();
  });

  it("returns null for a bone-dry (zero-total) window (index undefined)", () => {
    const pci = precipitationConcentrationIndex([
      accum(0, { year: 2026, month: 1 }),
      accum(0, { year: 2026, month: 2 }),
    ]);

    expect(pci).toBeNull();
  });

  it("returns null when the run has a gap (missing month)", () => {
    const pci = precipitationConcentrationIndex([
      accum(0.0001, { year: 2026, month: 1 }),
      // February absent → no valid window → no index.
      accum(0.0002, { year: 2026, month: 3 }),
    ]);

    expect(pci).toBeNull();
  });

  it("returns null for a duplicate/overlapping month", () => {
    const pci = precipitationConcentrationIndex([
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 1 }),
    ]);

    expect(pci).toBeNull();
  });

  it("returns null for an empty set", () => {
    expect(precipitationConcentrationIndex([])).toBeNull();
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
      precipitationConcentrationIndex([january, februaryElsewhere])
    ).toBeNull();
  });

  it("preserves the shared cited precipitation dataset provenance", () => {
    const pci = precipitationConcentrationIndex([
      accum(0.0001, { year: 2026, month: 1 }),
      accum(0.0002, { year: 2026, month: 2 }),
    ]);

    expect(pci?.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("documents that the index is descriptive, not an inference or forecast", () => {
    expect(PRECIP_CONCENTRATION_INDEX_LIMITATIONS).toMatch(/Oliver 1980/i);
    expect(PRECIP_CONCENTRATION_INDEX_LIMITATIONS).toMatch(/not a .*forecast/i);
    expect(PRECIP_CONCENTRATION_INDEX_LIMITATIONS).toMatch(/12-month/i);
  });
});
