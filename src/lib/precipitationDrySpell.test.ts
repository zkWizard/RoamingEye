import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import { precipitationAccumulation } from "./precipitationAccumulation";
import {
  KOPPEN_DRY_MONTH_MM,
  PRECIP_DRY_SPELL_LIMITATIONS,
  precipitationDrySpell,
} from "./precipitationDrySpell";
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

// A rate that accumulates well below 60 mm in any month (≈13 mm over 31 days),
// so it is a dry month against the default Köppen threshold at any month length.
const DRY_RATE = 0.000005;
// A rate that accumulates well above 60 mm in any month (≈259 mm over 30 days).
const WET_RATE = 0.0001;

/** A calendar year (from `year`) whose months are dry/wet per `dryMonths`. */
function yearWithDryMonths(year: number, dryMonths: readonly number[]) {
  const dry = new Set(dryMonths);
  return Array.from({ length: 12 }, (_, i) =>
    accum(dry.has(i + 1) ? DRY_RATE : WET_RATE, { year, month: i + 1 })
  );
}

describe("precipitation dry-/wet-spell (Köppen dry-month sequencing)", () => {
  it("describes one contiguous dry season as a single spell", () => {
    // Months 1–4 dry, 5–12 wet: the dry months form one block.
    const spell = precipitationDrySpell(yearWithDryMonths(2026, [1, 2, 3, 4]));

    expect(spell).not.toBeNull();
    expect(spell).toMatchObject({
      kind: "derived-precip-dry-spell",
      isForecast: false,
      dryMonthThresholdMm: KOPPEN_DRY_MONTH_MM,
      monthCount: 12,
      dryMonthCount: 4,
      wetMonthCount: 8,
      longestDryRun: 4,
      longestWetRun: 8,
      drySpellCount: 1,
      isAnnualWindow: true,
    });
    expect(spell?.longestDryRunStart).toEqual({ year: 2026, month: 1 });
    expect(spell?.longestDryRunEnd).toEqual({ year: 2026, month: 4 });
  });

  it("distinguishes scattered dry months from a contiguous dry season", () => {
    // Same dry-month COUNT (4) as the contiguous case, but split into two spells.
    // A permutation-invariant index (PCI, SI) would read these two years alike;
    // the run structure is exactly what separates them.
    const spell = precipitationDrySpell(yearWithDryMonths(2026, [1, 2, 7, 8]));

    expect(spell?.dryMonthCount).toBe(4);
    expect(spell?.longestDryRun).toBe(2);
    expect(spell?.drySpellCount).toBe(2);
    expect(spell?.longestWetRun).toBe(4); // months 3–6 (also 9–12)
    // The earliest of the two equal-length dry runs is reported.
    expect(spell?.longestDryRunStart).toEqual({ year: 2026, month: 1 });
    expect(spell?.longestDryRunEnd).toEqual({ year: 2026, month: 2 });
  });

  it("describes a bone-dry window as maximally dry rather than returning null", () => {
    // Unlike the concentration/seasonality indices (undefined at zero total),
    // an all-dry window is a valid maximally-dry description.
    const spell = precipitationDrySpell([
      accum(0, { year: 2026, month: 1 }),
      accum(0, { year: 2026, month: 2 }),
      accum(0, { year: 2026, month: 3 }),
    ]);

    expect(spell).not.toBeNull();
    expect(spell?.dryMonthCount).toBe(3);
    expect(spell?.wetMonthCount).toBe(0);
    expect(spell?.longestDryRun).toBe(3);
    expect(spell?.longestWetRun).toBe(0);
    expect(spell?.drySpellCount).toBe(1);
    expect(spell?.longestDryRunStart).toEqual({ year: 2026, month: 1 });
    expect(spell?.longestDryRunEnd).toEqual({ year: 2026, month: 3 });
  });

  it("reports no dry months and null run bounds for an all-wet window", () => {
    const spell = precipitationDrySpell([
      accum(WET_RATE, { year: 2026, month: 6 }),
      accum(WET_RATE, { year: 2026, month: 7 }),
      accum(WET_RATE, { year: 2026, month: 8 }),
    ]);

    expect(spell?.dryMonthCount).toBe(0);
    expect(spell?.wetMonthCount).toBe(3);
    expect(spell?.longestDryRun).toBe(0);
    expect(spell?.longestWetRun).toBe(3);
    expect(spell?.drySpellCount).toBe(0);
    expect(spell?.longestDryRunStart).toBeNull();
    expect(spell?.longestDryRunEnd).toBeNull();
  });

  it("describes a single month (unlike the seasonality index, which is null)", () => {
    const dry = precipitationDrySpell([
      accum(DRY_RATE, { year: 2026, month: 5 }),
    ]);
    expect(dry?.monthCount).toBe(1);
    expect(dry?.dryMonthCount).toBe(1);
    expect(dry?.longestDryRun).toBe(1);
    expect(dry?.drySpellCount).toBe(1);
    expect(dry?.isAnnualWindow).toBe(false);
  });

  it("keeps the earliest run when two dry runs tie for longest", () => {
    // Jan–Feb dry, Mar wet, Apr–May dry: two dry runs of length 2 tie.
    const spell = precipitationDrySpell([
      accum(DRY_RATE, { year: 2026, month: 1 }),
      accum(DRY_RATE, { year: 2026, month: 2 }),
      accum(WET_RATE, { year: 2026, month: 3 }),
      accum(DRY_RATE, { year: 2026, month: 4 }),
      accum(DRY_RATE, { year: 2026, month: 5 }),
    ]);

    expect(spell?.dryMonthCount).toBe(4);
    expect(spell?.longestDryRun).toBe(2);
    expect(spell?.drySpellCount).toBe(2);
    expect(spell?.longestDryRunStart).toEqual({ year: 2026, month: 1 });
    expect(spell?.longestDryRunEnd).toEqual({ year: 2026, month: 2 });
  });

  it("honours a custom dry-month threshold", () => {
    // Jul ≈13 mm, Aug ≈80 mm (rate 0.00003 over 31 days). At the default 60 mm
    // Jul is dry and Aug wet; raising the threshold above both makes both dry.
    const run = [
      accum(DRY_RATE, { year: 2026, month: 7 }),
      accum(0.00003, { year: 2026, month: 8 }),
    ];

    const dflt = precipitationDrySpell(run);
    expect(dflt?.dryMonthCount).toBe(1);
    expect(dflt?.wetMonthCount).toBe(1);

    const raised = precipitationDrySpell(run, { dryMonthThresholdMm: 100 });
    expect(raised?.dryMonthThresholdMm).toBe(100);
    expect(raised?.dryMonthCount).toBe(2);
    expect(raised?.wetMonthCount).toBe(0);
    expect(raised?.longestDryRun).toBe(2);
  });

  it("only flags a 12-month window as annual", () => {
    const eleven = precipitationDrySpell(
      Array.from({ length: 11 }, (_, i) =>
        accum(WET_RATE, { year: 2026, month: i + 1 })
      )
    );
    expect(eleven?.monthCount).toBe(11);
    expect(eleven?.isAnnualWindow).toBe(false);

    const twelve = precipitationDrySpell(yearWithDryMonths(2025, [12]));
    expect(twelve?.isAnnualWindow).toBe(true);
  });

  it("accepts unsorted inputs and orders them before counting runs", () => {
    const spell = precipitationDrySpell([
      accum(DRY_RATE, { year: 2026, month: 5 }),
      accum(WET_RATE, { year: 2026, month: 3 }),
      accum(DRY_RATE, { year: 2026, month: 4 }),
    ]);

    expect(spell?.startMonth).toEqual({ year: 2026, month: 3 });
    expect(spell?.endMonth).toEqual({ year: 2026, month: 5 });
    // Ordered Mar(wet) Apr(dry) May(dry) → a single trailing dry run of 2.
    expect(spell?.longestDryRun).toBe(2);
    expect(spell?.drySpellCount).toBe(1);
    expect(spell?.longestDryRunStart).toEqual({ year: 2026, month: 4 });
    expect(spell?.longestDryRunEnd).toEqual({ year: 2026, month: 5 });
  });

  it("returns null for an empty set", () => {
    expect(precipitationDrySpell([])).toBeNull();
  });

  it("returns null for an invalid threshold", () => {
    const run = [accum(DRY_RATE, { year: 2026, month: 1 })];
    expect(precipitationDrySpell(run, { dryMonthThresholdMm: 0 })).toBeNull();
    expect(precipitationDrySpell(run, { dryMonthThresholdMm: -5 })).toBeNull();
    expect(
      precipitationDrySpell(run, { dryMonthThresholdMm: Number.NaN })
    ).toBeNull();
  });

  it("returns null when the run has a gap (missing month)", () => {
    const spell = precipitationDrySpell([
      accum(DRY_RATE, { year: 2026, month: 1 }),
      // February absent → no valid window → no description.
      accum(WET_RATE, { year: 2026, month: 3 }),
    ]);

    expect(spell).toBeNull();
  });

  it("returns null for a duplicate/overlapping month", () => {
    const spell = precipitationDrySpell([
      accum(DRY_RATE, { year: 2026, month: 1 }),
      accum(WET_RATE, { year: 2026, month: 1 }),
    ]);

    expect(spell).toBeNull();
  });

  it("refuses to describe a window that mixes provenance", () => {
    const january = accum(DRY_RATE, { year: 2026, month: 1 });
    const foreignSource: DatasetRef = {
      shortName: "OTHER",
      version: "001",
      doi: "10.0000/other",
      title: "A different product",
    };
    const februaryElsewhere = {
      ...accum(WET_RATE, { year: 2026, month: 2 }),
      source: foreignSource,
    };

    expect(precipitationDrySpell([january, februaryElsewhere])).toBeNull();
  });

  it("preserves the shared cited precipitation dataset provenance", () => {
    const spell = precipitationDrySpell([
      accum(DRY_RATE, { year: 2026, month: 1 }),
      accum(WET_RATE, { year: 2026, month: 2 }),
    ]);

    expect(spell?.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("documents that the descriptor is descriptive, not an inference or forecast", () => {
    expect(PRECIP_DRY_SPELL_LIMITATIONS).toMatch(/Köppen/);
    expect(PRECIP_DRY_SPELL_LIMITATIONS).toMatch(/60 mm/);
    expect(PRECIP_DRY_SPELL_LIMITATIONS).toMatch(/not a .*forecast/i);
    expect(PRECIP_DRY_SPELL_LIMITATIONS).toMatch(/12-month/);
  });
});
