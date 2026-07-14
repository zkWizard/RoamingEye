import { describe, expect, it } from "vitest";
import { composeEnvironmentBrief } from "./environmentBrief";
import {
  classifyRecency,
  recencyInputsFromSignals,
  summarizeObservationRecency,
  type DatedObservation,
} from "./observationRecency";
import type { DatasetRef } from "./timeline";

const SOURCE: DatasetRef = {
  shortName: "MOD13A3",
  version: "061",
  doi: "10.5067/MODIS/MOD13A3.061",
  title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1 km",
};

function obs(
  id: string,
  label: string,
  year: number,
  month: number
): DatedObservation {
  return { id, label, dataMonth: { year, month }, source: SOURCE };
}

describe("classifyRecency", () => {
  it("buckets whole-month lags into neutral temporal tiers", () => {
    expect(classifyRecency(0)).toBe("current-month");
    expect(classifyRecency(1)).toBe("past-quarter");
    expect(classifyRecency(3)).toBe("past-quarter");
    expect(classifyRecency(4)).toBe("past-half-year");
    expect(classifyRecency(6)).toBe("past-half-year");
    expect(classifyRecency(7)).toBe("older");
    expect(classifyRecency(-1)).toBe("after-reference");
  });
});

describe("summarizeObservationRecency", () => {
  it("dates each observation against the reference month and reports the lag range", () => {
    const reference = { year: 2026, month: 3 };
    const summary = summarizeObservationRecency(
      [
        obs("vegetation", "Vegetation (NDVI)", 2026, 3),
        obs("rainfall", "Rainfall (precipitation rate)", 2026, 1),
        obs("air-temperature", "Air temperature", 2025, 8),
      ],
      reference
    );

    expect(summary.referenceMonth).toEqual(reference);
    expect(summary.mostRecentMonth).toEqual({ year: 2026, month: 3 });
    expect(summary.oldestMonth).toEqual({ year: 2025, month: 8 });
    expect(summary.maxLagMonths).toBe(7);
    expect(summary.observations.map((o) => [o.tier, o.lagMonths])).toEqual([
      ["current-month", 0],
      ["past-quarter", 2],
      ["older", 7],
    ]);
    expect(summary.statement).toBe(
      "3 dated observations lag the 2026-03 reference by 0 to 7 months; recency reflects each product's publication schedule, not data fitness."
    );
  });

  it("keeps provenance in every observation statement", () => {
    const summary = summarizeObservationRecency(
      [obs("vegetation", "Vegetation (NDVI)", 2026, 1)],
      { year: 2026, month: 3 }
    );
    expect(summary.observations[0].statement).toBe(
      "Vegetation (NDVI): dated 2026-01, 2 months behind the 2026-03 reference (past-quarter); source MOD13A3 v061."
    );
    // A single lag collapses the range phrase to one figure, kept singular.
    const singular = summarizeObservationRecency(
      [obs("vegetation", "Vegetation (NDVI)", 2026, 2)],
      { year: 2026, month: 3 }
    );
    expect(singular.statement).toBe(
      "1 dated observation lag the 2026-03 reference by 1 month; recency reflects each product's publication schedule, not data fitness."
    );
  });

  it("marks a data month later than the reference as after-reference without negating provenance", () => {
    const summary = summarizeObservationRecency(
      [obs("air-temperature", "Air temperature", 2026, 5)],
      { year: 2026, month: 3 }
    );
    const only = summary.observations[0];
    expect(only.tier).toBe("after-reference");
    expect(only.lagMonths).toBe(-2);
    expect(only.statement).toBe(
      "Air temperature: dated 2026-05, 2 months after the 2026-03 reference month; source MOD13A3 v061."
    );
    // The newest month is the least-lagged, even when that lag is negative.
    expect(summary.mostRecentMonth).toEqual({ year: 2026, month: 5 });
  });

  it("lists an invalid data month but excludes it from the range statistics", () => {
    const summary = summarizeObservationRecency(
      [
        obs("vegetation", "Vegetation (NDVI)", 2026, 1),
        { ...obs("rainfall", "Rainfall", 2026, 13), source: SOURCE },
      ],
      { year: 2026, month: 3 }
    );
    const invalid = summary.observations[1];
    expect(invalid.tier).toBe("invalid-date");
    expect(invalid.lagMonths).toBeNull();
    expect(invalid.statement).toBe(
      "Rainfall: data month is not a valid year-month; recency cannot be dated; source MOD13A3 v061."
    );
    // Only the valid vegetation observation drives the range.
    expect(summary.maxLagMonths).toBe(2);
    expect(summary.mostRecentMonth).toEqual({ year: 2026, month: 1 });
    expect(summary.oldestMonth).toEqual({ year: 2026, month: 1 });
  });

  it("reports honestly when nothing is datable", () => {
    expect(
      summarizeObservationRecency([], { year: 2026, month: 3 })
    ).toMatchObject({
      observations: [],
      mostRecentMonth: null,
      oldestMonth: null,
      maxLagMonths: null,
      statement: "No datable observations to assess for recency.",
    });
  });

  it("refuses to assess against an invalid reference month", () => {
    const summary = summarizeObservationRecency(
      [obs("vegetation", "Vegetation (NDVI)", 2026, 1)],
      { year: 2026, month: 0 }
    );
    expect(summary.maxLagMonths).toBeNull();
    expect(summary.observations[0].tier).toBe("invalid-date");
    expect(summary.statement).toBe(
      "Reference month is invalid; observation recency cannot be assessed."
    );
  });
});

describe("recencyInputsFromSignals", () => {
  it("derives datable inputs from a composed brief and drops unsupplied signals", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
      // no-data value keeps a real sampled month, so it stays datable.
      rainfall: { dataMonth: { year: 2026, month: 3 }, value: null },
      soilMoisture: null,
      airTemperature: null,
      availableThrough: { year: 2026, month: 3 },
    });

    const inputs = recencyInputsFromSignals(brief.signals);
    // Unsupplied soil-moisture and air-temperature (null data month) are dropped.
    expect(inputs.map((i) => i.id)).toEqual(["vegetation", "rainfall"]);

    const summary = summarizeObservationRecency(inputs, {
      year: 2026,
      month: 3,
    });
    expect(summary.maxLagMonths).toBe(2);
    expect(summary.observations.map((o) => o.tier)).toEqual([
      "past-quarter",
      "current-month",
    ]);
  });
});
