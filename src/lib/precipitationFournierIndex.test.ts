import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import { precipitationAccumulation } from "./precipitationAccumulation";
import {
  PRECIP_FOURNIER_INDEX_LIMITATIONS,
  precipitationFournierIndex,
} from "./precipitationFournierIndex";
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

describe("precipitation Modified Fournier Index (MFI)", () => {
  it("gives an even calendar year the P/12 floor and a very-low class", () => {
    // Equal rates across the year make the monthly depths nearly equal (months
    // differ only by 28–31 days), so MFI sits just above the even-year floor of
    // P/12. A low-rate even year (~27 mm/month) is not aggressive.
    const mfi = precipitationFournierIndex(evenYear(0.00001, 2026));

    expect(mfi).not.toBeNull();
    expect(mfi).toMatchObject({
      kind: "derived-precip-fournier-index",
      isForecast: false,
      monthCount: 12,
      startMonth: { year: 2026, month: 1 },
      endMonth: { year: 2026, month: 12 },
    });
    // MFI is bounded below by P/12 (the even-year value) and the near-even year
    // sits just above it.
    expect(mfi!.evenYearValueMm).toBeCloseTo(mfi!.totalMm / 12, 9);
    expect(mfi!.mfiMm).toBeGreaterThanOrEqual(mfi!.evenYearValueMm);
    expect(mfi!.mfiMm - mfi!.evenYearValueMm).toBeLessThan(1);
    expect(mfi!.classification).toBe("very-low");
    expect(mfi!.classLabel).toMatch(/very low/i);
  });

  it("matches the closed-form MFI Σ(pᵢ²)/P for a hand-computable year", () => {
    // A concentrated year: one wet month, eleven near-dry ones.
    const months = Array.from({ length: 12 }, (_, i) =>
      accum(i === 6 ? 0.0006 : 0.00001, { year: 2025, month: i + 1 })
    );
    const p = months.map((m) => m.totalMm);
    const sum = p.reduce((acc, value) => acc + value, 0);
    const sumSq = p.reduce((acc, value) => acc + value * value, 0);
    const expected = sumSq / sum;

    const mfi = precipitationFournierIndex(months);
    expect(mfi?.mfiMm).toBeCloseTo(expected, 6);
    expect(mfi?.totalMm).toBeCloseTo(sum, 6);
  });

  it("bounds MFI within [P/12, P] and equals P when one month holds the year", () => {
    // A single wet month with the other eleven bone-dry (a real observation):
    // Σ(pᵢ²) = p² and P = p, so MFI collapses exactly onto the annual total.
    const months = Array.from({ length: 12 }, (_, i) =>
      accum(i === 0 ? 0.005 : 0, { year: 2026, month: i + 1 })
    );
    const mfi = precipitationFournierIndex(months);

    expect(mfi!.mfiMm).toBeGreaterThanOrEqual(mfi!.evenYearValueMm);
    expect(mfi!.mfiMm).toBeLessThanOrEqual(mfi!.totalMm);
    expect(mfi!.mfiMm).toBeCloseTo(mfi!.totalMm, 9);
  });

  it("keeps the identity MFI = P · PCI / 100 against the sibling index", () => {
    // MFI and PCI describe the same monthly distribution; MFI just re-scales the
    // dimensionless PCI by the annual total. Verify the two agree in closed form.
    const months = Array.from({ length: 12 }, (_, i) =>
      accum(0.0001 * (i + 1), { year: 2024, month: i + 1 })
    );
    const p = months.map((m) => m.totalMm);
    const sum = p.reduce((acc, value) => acc + value, 0);
    const sumSq = p.reduce((acc, value) => acc + value * value, 0);
    const pci = (100 * sumSq) / (sum * sum);

    const mfi = precipitationFournierIndex(months);
    expect(mfi!.mfiMm).toBeCloseTo((sum * pci) / 100, 6);
  });

  it("classifies a moderately concentrated wet year above the low band", () => {
    // A wetter year concentrated into a few months should climb past very-low.
    const months = Array.from({ length: 12 }, (_, i) =>
      accum(i >= 5 && i <= 7 ? 0.0004 : 0.00002, { year: 2026, month: i + 1 })
    );
    const mfi = precipitationFournierIndex(months);

    expect(mfi?.monthCount).toBe(12);
    expect(mfi!.mfiMm).toBeGreaterThan(60);
    expect(["low", "moderate", "high", "very-high"]).toContain(
      mfi!.classification
    );
  });

  it("accepts unsorted inputs and orders them before computing", () => {
    const forward = evenYear(0.00005, 2026);
    const shuffled = [...forward].reverse();
    const mfi = precipitationFournierIndex(shuffled);

    expect(mfi?.startMonth).toEqual({ year: 2026, month: 1 });
    expect(mfi?.endMonth).toEqual({ year: 2026, month: 12 });
    expect(mfi?.monthCount).toBe(12);
  });

  it("returns null for a bone-dry (zero-total) year (index undefined)", () => {
    const mfi = precipitationFournierIndex(
      Array.from({ length: 12 }, (_, i) =>
        accum(0, { year: 2026, month: i + 1 })
      )
    );

    expect(mfi).toBeNull();
  });

  it("returns null when the run is not exactly twelve months", () => {
    const eleven = precipitationFournierIndex(
      Array.from({ length: 11 }, (_, i) =>
        accum(0.0002, { year: 2026, month: i + 1 })
      )
    );
    expect(eleven).toBeNull();

    const thirteen = precipitationFournierIndex([
      ...evenYear(0.0002, 2026),
      accum(0.0002, { year: 2027, month: 1 }),
    ]);
    expect(thirteen).toBeNull();
  });

  it("returns null when the twelve months have a gap (non-consecutive)", () => {
    // Eleven months of 2026 plus a January from the next year: twelve entries,
    // but December→next-January is fine while the missing month breaks the run.
    const withGap = [
      ...Array.from({ length: 11 }, (_, i) =>
        accum(0.0002, { year: 2026, month: i + 1 })
      ),
      // Skip December 2026, jump to February 2027 → a gap in the run.
      accum(0.0002, { year: 2027, month: 2 }),
    ];
    expect(precipitationFournierIndex(withGap)).toBeNull();
  });

  it("returns null for a duplicate/overlapping month", () => {
    const withDuplicate = [
      ...Array.from({ length: 11 }, (_, i) =>
        accum(0.0002, { year: 2026, month: i + 1 })
      ),
      // Repeat November instead of covering December.
      accum(0.0003, { year: 2026, month: 11 }),
    ];
    expect(precipitationFournierIndex(withDuplicate)).toBeNull();
  });

  it("returns null for an empty set", () => {
    expect(precipitationFournierIndex([])).toBeNull();
  });

  it("refuses to describe a year that mixes provenance", () => {
    const foreignSource: DatasetRef = {
      shortName: "OTHER",
      version: "001",
      doi: "10.0000/other",
      title: "A different product",
    };
    const months = evenYear(0.0002, 2026);
    const mixed = months.map((month, i) =>
      i === 5 ? { ...month, source: foreignSource } : month
    );

    expect(precipitationFournierIndex(mixed)).toBeNull();
  });

  it("preserves the shared cited precipitation dataset provenance", () => {
    const mfi = precipitationFournierIndex(evenYear(0.0002, 2026));

    expect(mfi?.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("documents that the index is descriptive, not an inference or forecast", () => {
    expect(PRECIP_FOURNIER_INDEX_LIMITATIONS).toMatch(/Arnoldus 1980/i);
    expect(PRECIP_FOURNIER_INDEX_LIMITATIONS).toMatch(/not a .*forecast/i);
    expect(PRECIP_FOURNIER_INDEX_LIMITATIONS).toMatch(/twelve/i);
    expect(PRECIP_FOURNIER_INDEX_LIMITATIONS).toMatch(/erosion-hazard/i);
  });
});
