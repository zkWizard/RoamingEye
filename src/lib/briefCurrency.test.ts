import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
} from "./environmentBrief";
import {
  classifyCurrency,
  summarizeBriefCurrency,
  type BriefAvailability,
} from "./briefCurrency";

function value(
  year: number,
  month: number,
  v: number | null,
  validFraction = 0.9
): EnvironmentObservation {
  return { dataMonth: { year, month }, value: v, validFraction };
}

/** A fully-populated brief input, tweakable per case. */
function briefInput(
  overrides: Partial<EnvironmentBriefInput> = {}
): EnvironmentBriefInput {
  return {
    vegetation: value(2026, 3, 0.5),
    rainfall: value(2026, 3, 2),
    soilMoisture: value(2026, 3, 20),
    airTemperature: value(2025, 8, 290),
    availableThrough: { year: 2026, month: 3 },
    availableThroughBySignal: {
      rainfall: { year: 2026, month: 3 },
      "soil-moisture": { year: 2026, month: 5 },
      "air-temperature": { year: 2026, month: 3 },
    },
    ...overrides,
  };
}

function availabilityOf(input: EnvironmentBriefInput): BriefAvailability {
  return {
    availableThrough: input.availableThrough,
    availableThroughBySignal: input.availableThroughBySignal,
  };
}

describe("classifyCurrency", () => {
  it("buckets whole-month gaps behind the horizon into neutral tiers", () => {
    expect(classifyCurrency(0)).toBe("at-latest");
    expect(classifyCurrency(1)).toBe("one-behind");
    expect(classifyCurrency(2)).toBe("recent");
    expect(classifyCurrency(3)).toBe("recent");
    expect(classifyCurrency(4)).toBe("lagging");
    expect(classifyCurrency(6)).toBe("lagging");
    expect(classifyCurrency(7)).toBe("well-behind");
    expect(classifyCurrency(-1)).toBe("ahead-of-horizon");
  });
});

describe("summarizeBriefCurrency", () => {
  it("measures each signal against its own product horizon, not the others", () => {
    const input = briefInput();
    const brief = composeEnvironmentBrief(input);
    const summary = summarizeBriefCurrency(
      brief.signals,
      availabilityOf(input)
    );

    // Rainfall and soil moisture share a data month (2026-03) but different
    // horizons, so currency separates them: rainfall is at its latest while
    // soil moisture has two newer published months. Recency against a single
    // "now" could never draw this distinction.
    expect(
      summary.observations.map((o) => [o.id, o.monthsBehindLatest, o.tier])
    ).toEqual([
      ["vegetation", 0, "at-latest"],
      ["rainfall", 0, "at-latest"],
      ["soil-moisture", 2, "recent"],
      ["air-temperature", 7, "well-behind"],
    ]);
    expect(summary.atLatestSignalIds).toEqual(["vegetation", "rainfall"]);
    expect(summary.behindSignalIds).toEqual([
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.maxMonthsBehind).toBe(7);
    expect(summary.allAtLatest).toBe(false);
    expect(summary.statement).toBe(
      "4 signals assessed; 2 signals have newer published data available (up to 7 months). Currency reflects the selected month versus each product's published horizon, not data fitness."
    );
  });

  it("reports every signal at its latest confirmed-available month", () => {
    const input = briefInput({
      airTemperature: value(2026, 3, 290),
      availableThroughBySignal: {
        rainfall: { year: 2026, month: 3 },
        "soil-moisture": { year: 2026, month: 3 },
        "air-temperature": { year: 2026, month: 3 },
      },
    });
    const brief = composeEnvironmentBrief(input);
    const summary = summarizeBriefCurrency(
      brief.signals,
      availabilityOf(input)
    );

    expect(summary.behindSignalIds).toEqual([]);
    expect(summary.maxMonthsBehind).toBe(0);
    expect(summary.allAtLatest).toBe(true);
    expect(summary.statement).toBe(
      "4 signals show the latest confirmed-available month; no newer published data to step to. Currency reflects each product's publication schedule, not data fitness."
    );
  });

  it("preserves the data month and provenance even when the signal is unpublished", () => {
    // A data month later than its horizon is downgraded to unavailable in the
    // brief, but the month is still a provenance fact: currency reports it as
    // ahead of the confirmed horizon rather than dropping it.
    const input = briefInput({
      soilMoisture: value(2026, 6, 20),
      availableThroughBySignal: {
        rainfall: { year: 2026, month: 3 },
        "soil-moisture": { year: 2026, month: 5 },
        "air-temperature": { year: 2026, month: 3 },
      },
    });
    const brief = composeEnvironmentBrief(input);
    const soilSignal = brief.signals.find((s) => s.id === "soil-moisture");
    expect(soilSignal?.status).toBe("unavailable");

    const summary = summarizeBriefCurrency(
      brief.signals,
      availabilityOf(input)
    );
    const soil = summary.observations.find((o) => o.id === "soil-moisture");
    expect(soil?.monthsBehindLatest).toBe(-1);
    expect(soil?.tier).toBe("ahead-of-horizon");
    expect(soil?.statement).toBe(
      "Soil moisture: dated 2026-06, 1 month ahead of the 2026-05 confirmed availability horizon (not yet published); source GLDAS_NOAH025_M v2.1."
    );
  });

  it("uses the shared checkpoint for vegetation and carries its source", () => {
    const input = briefInput({
      vegetation: value(2026, 1, 0.5),
      availableThrough: { year: 2026, month: 3 },
    });
    const brief = composeEnvironmentBrief(input);
    const summary = summarizeBriefCurrency(
      brief.signals,
      availabilityOf(input)
    );

    const veg = summary.observations.find((o) => o.id === "vegetation");
    expect(veg?.availableThrough).toEqual({ year: 2026, month: 3 });
    expect(veg?.monthsBehindLatest).toBe(2);
    expect(veg?.tier).toBe("recent");
    expect(veg?.statement).toBe(
      "Vegetation (NDVI): dated 2026-01, 2 months behind the 2026-03 availability horizon; newer published data available; source MOD13A3 v061."
    );
  });

  it("drops signals with no supplied observation", () => {
    const input = briefInput({ soilMoisture: null, airTemperature: null });
    const brief = composeEnvironmentBrief(input);
    const summary = summarizeBriefCurrency(
      brief.signals,
      availabilityOf(input)
    );

    expect(summary.observations.map((o) => o.id)).toEqual([
      "vegetation",
      "rainfall",
    ]);
  });

  it("lists an invalid data month as undatable without dropping provenance", () => {
    const input = briefInput({ vegetation: value(2026, 13, 0.5) });
    const brief = composeEnvironmentBrief(input);
    const summary = summarizeBriefCurrency(
      brief.signals,
      availabilityOf(input)
    );

    const veg = summary.observations.find((o) => o.id === "vegetation");
    expect(veg?.monthsBehindLatest).toBeNull();
    expect(veg?.tier).toBe("undatable");
    expect(veg?.statement).toContain("currency cannot be assessed");
    expect(veg?.statement).toContain("source MOD13A3 v061.");
    // The undatable signal contributes no gap to the range statistics.
    expect(summary.atLatestSignalIds).not.toContain("vegetation");
  });

  it("marks every signal undatable when the shared horizon is invalid", () => {
    const input = briefInput({ availableThrough: { year: 2026, month: 0 } });
    const brief = composeEnvironmentBrief(input);
    const summary = summarizeBriefCurrency(
      brief.signals,
      availabilityOf(input)
    );

    // Only vegetation resolves to the shared horizon; the climate signals keep
    // their own valid per-signal horizons, so just vegetation goes undatable.
    const veg = summary.observations.find((o) => o.id === "vegetation");
    expect(veg?.tier).toBe("undatable");
    expect(summary.behindSignalIds).not.toContain("vegetation");
  });

  it("summarizes an empty signal set honestly", () => {
    const summary = summarizeBriefCurrency([], {
      availableThrough: { year: 2026, month: 3 },
    });
    expect(summary.observations).toEqual([]);
    expect(summary.atLatestSignalIds).toEqual([]);
    expect(summary.maxMonthsBehind).toBeNull();
    expect(summary.allAtLatest).toBe(false);
    expect(summary.statement).toBe(
      "No datable signals to assess for currency against the availability horizon."
    );
  });
});
