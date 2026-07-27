import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import { summarizeSourceIndependence } from "./briefSourceIndependence";

function value(
  year: number,
  month: number,
  v: number | null,
  validFraction = 0.9
): EnvironmentObservation {
  return { dataMonth: { year, month }, value: v, validFraction };
}

/** A four-signal brief input, all signals usable by default; tweak per case. */
function briefInput(
  overrides: Partial<EnvironmentBriefInput> = {}
): EnvironmentBriefInput {
  return {
    vegetation: value(2026, 3, 0.5),
    rainfall: value(2026, 3, 2),
    soilMoisture: value(2026, 3, 20),
    airTemperature: value(2026, 3, 290),
    availableThrough: { year: 2026, month: 6 },
    ...overrides,
  };
}

function signalsFor(input: EnvironmentBriefInput) {
  return composeEnvironmentBrief(input).signals;
}

describe("summarizeSourceIndependence", () => {
  it("flags the two GLDAS signals as co-sourced in a full four-signal brief", () => {
    // Vegetation (MOD13A3), rainfall + soil moisture (both GLDAS, one DOI),
    // and air temperature (a third product) => three distinct source datasets.
    const summary = summarizeSourceIndependence(signalsFor(briefInput()));

    expect(summary.kind).toBe("brief-source-independence");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.distinctSourceCount).toBe(3);
    expect(summary.fullyIndependent).toBe(false);
    expect(summary.sharedSourceGroups).toHaveLength(1);
    expect(summary.sharedSourceGroups[0].signalIds).toEqual([
      "rainfall",
      "soil-moisture",
    ]);
    expect(summary.sharedSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.statement).toContain("3 distinct source datasets");
    expect(summary.statement).toContain(
      "rainfall, soil-moisture share GLDAS_NOAH025_M v2.1"
    );
    expect(summary.statement).toContain("not independent confirmation");
  });

  it("groups every signal separately when all sources are distinct", () => {
    // Drop the two GLDAS signals so only vegetation and air temperature — two
    // genuinely different products — remain.
    const summary = summarizeSourceIndependence(
      signalsFor(briefInput({ rainfall: null, soilMoisture: null }))
    );

    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "air-temperature",
    ]);
    expect(summary.distinctSourceCount).toBe(2);
    expect(summary.groups).toHaveLength(2);
    expect(summary.sharedSourceGroups).toEqual([]);
    expect(summary.sharedSignalIds).toEqual([]);
    expect(summary.fullyIndependent).toBe(true);
    expect(summary.statement).toBe(
      "2 usable observations from 2 distinct source datasets; no two signals share a source dataset."
    );
  });

  it("considers only usable signals, ignoring no-data and unavailable ones", () => {
    // Rainfall carries no value (no-data) and air temperature is unpublished
    // (dropped as unavailable): only vegetation and soil moisture remain, and
    // they are distinct products, so the usable set is fully independent.
    const summary = summarizeSourceIndependence(
      signalsFor(
        briefInput({
          rainfall: value(2026, 3, null),
          availableThrough: { year: 2026, month: 6 },
          availableThroughBySignal: {
            "air-temperature": { year: 2026, month: 1 },
          },
          airTemperature: value(2026, 3, 290),
        })
      )
    );

    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "soil-moisture",
    ]);
    expect(summary.distinctSourceCount).toBe(2);
    expect(summary.fullyIndependent).toBe(true);
    expect(summary.sharedSignalIds).toEqual([]);
  });

  it("returns an empty, honest summary when no signal is usable", () => {
    const summary = summarizeSourceIndependence(
      signalsFor(
        briefInput({
          vegetation: null,
          rainfall: null,
          soilMoisture: null,
          airTemperature: null,
        })
      )
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.groups).toEqual([]);
    expect(summary.distinctSourceCount).toBe(0);
    expect(summary.sharedSourceGroups).toEqual([]);
    expect(summary.fullyIndependent).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to assess for source independence."
    );
  });

  it("does not treat a single usable signal as independent evidence", () => {
    const summary = summarizeSourceIndependence(
      signalsFor(
        briefInput({
          vegetation: value(2026, 3, 0.5),
          rainfall: null,
          soilMoisture: null,
          airTemperature: null,
        })
      )
    );

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.distinctSourceCount).toBe(1);
    // A lone signal has nothing to be independent of.
    expect(summary.fullyIndependent).toBe(false);
    expect(summary.sharedSourceGroups).toEqual([]);
    expect(summary.statement).toContain(
      "source independence is not applicable to a single signal"
    );
  });

  it("keeps a source DatasetRef on every group (never drops provenance)", () => {
    const summary = summarizeSourceIndependence(signalsFor(briefInput()));

    for (const group of summary.groups) {
      expect(group.source.doi).toMatch(/^10\./);
      expect(group.source.shortName.length).toBeGreaterThan(0);
      expect(group.source.version.length).toBeGreaterThan(0);
    }
    // The GLDAS group's DOI is shared by exactly the two water-balance signals.
    const gldas = summary.groups.find((g) => g.signalIds.length === 2);
    expect(gldas?.signalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.limits.length).toBeGreaterThan(0);
  });

  it("falls back to shortName|version identity when a DOI is blank", () => {
    // Two synthetic signals with blank DOIs but the same shortName/version must
    // group together; a distinct shortName must stay separate — so a lost DOI
    // never silently merges unrelated sources nor wrongly splits one product.
    const base = {
      layerId: "ndvi" as const,
      nativeUnit: "NDVI",
      dataMonth: { year: 2026, month: 3 },
      coverage: {
        status: "available" as const,
        validFraction: 0.9,
        reason: null,
      },
      status: "available" as const,
      observedValue: 0.5,
      statement: "",
    };
    const signals: EnvironmentSignalBrief[] = [
      {
        ...base,
        id: "vegetation",
        label: "A",
        source: { shortName: "PROD_X", version: "1", doi: "  ", title: "X" },
      },
      {
        ...base,
        id: "rainfall",
        label: "B",
        source: { shortName: "PROD_X", version: "1", doi: "", title: "X" },
      },
      {
        ...base,
        id: "soil-moisture",
        label: "C",
        source: { shortName: "PROD_Y", version: "1", doi: "", title: "Y" },
      },
    ];

    const summary = summarizeSourceIndependence(signals);

    expect(summary.distinctSourceCount).toBe(2);
    expect(summary.sharedSourceGroups).toHaveLength(1);
    expect(summary.sharedSourceGroups[0].signalIds).toEqual([
      "vegetation",
      "rainfall",
    ]);
  });
});
