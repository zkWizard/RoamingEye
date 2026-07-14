import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
} from "./environmentBrief";
import { summarizeSourceIndependence } from "./sourceIndependence";

/** A fully-usable four-signal brief, all observations within availability. */
const USABLE_INPUT: EnvironmentBriefInput = {
  vegetation: {
    dataMonth: { year: 2026, month: 1 },
    value: 0.61,
    validFraction: 0.82,
  },
  rainfall: {
    dataMonth: { year: 2026, month: 1 },
    value: 0.00012,
    validFraction: 0.74,
  },
  soilMoisture: {
    dataMonth: { year: 2026, month: 1 },
    value: 6.4,
    validFraction: 0.67,
  },
  airTemperature: {
    dataMonth: { year: 2026, month: 1 },
    value: 289.4,
    validFraction: 0.93,
  },
  availableThrough: { year: 2026, month: 3 },
};

function signalsFor(input: EnvironmentBriefInput) {
  return composeEnvironmentBrief(input).signals;
}

describe("summarizeSourceIndependence", () => {
  it("flags rainfall and soil moisture as sharing the GLDAS product", () => {
    const summary = summarizeSourceIndependence(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("source-independence");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    // Four signals, but rainfall and soil moisture are both GLDAS_NOAH025_M.
    expect(summary.distinctSources).toBe(3);
    expect(summary.allIndependent).toBe(false);
    expect(summary.sharedGroups).toHaveLength(1);
    expect(summary.sharedGroups[0]).toMatchObject({
      product: "GLDAS_NOAH025_M v2.1",
      signalIds: ["rainfall", "soil-moisture"],
    });
    expect(summary.statement).toBe(
      "4 usable observations drawn from 3 distinct source products; rainfall, soil-moisture share GLDAS_NOAH025_M v2.1 — signals sharing a source are not independent evidence."
    );
  });

  it("groups every considered signal and never drops a source reference", () => {
    const summary = summarizeSourceIndependence(signalsFor(USABLE_INPUT));

    // Every considered signal appears in exactly one group, with provenance kept.
    const grouped = summary.groups.flatMap((group) => group.signalIds);
    expect(grouped.sort()).toEqual(
      ["air-temperature", "rainfall", "soil-moisture", "vegetation"].sort()
    );
    for (const group of summary.groups) {
      expect(group.source.doi.length).toBeGreaterThan(0);
      expect(group.product).toContain(group.source.shortName);
    }
  });

  it("reports full independence when no two usable signals share a source", () => {
    // Drop soil moisture so the remaining GLDAS user (rainfall) is alone.
    const summary = summarizeSourceIndependence(
      signalsFor({ ...USABLE_INPUT, soilMoisture: null })
    );

    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "air-temperature",
    ]);
    expect(summary.distinctSources).toBe(3);
    expect(summary.allIndependent).toBe(true);
    expect(summary.sharedGroups).toHaveLength(0);
    expect(summary.statement).toBe(
      "3 usable observations drawn from 3 distinct source products; each signal is independent provenance."
    );
  });

  it("considers only usable observations by default", () => {
    // Soil moisture present but not-yet-published => not usable; independence holds.
    const summary = summarizeSourceIndependence(
      signalsFor({
        ...USABLE_INPUT,
        soilMoisture: { dataMonth: { year: 2026, month: 9 }, value: 6.4 },
      })
    );

    expect(summary.consideredSignalIds).not.toContain("soil-moisture");
    expect(summary.allIndependent).toBe(true);
  });

  it("can describe the whole source basis with include: all", () => {
    const summary = summarizeSourceIndependence(
      signalsFor({ ...USABLE_INPUT, soilMoisture: null }),
      { include: "all" }
    );

    // soil-moisture is unavailable but still cites GLDAS, re-sharing with rainfall.
    expect(summary.consideredSignalIds).toContain("soil-moisture");
    expect(summary.distinctSources).toBe(3);
    expect(summary.sharedGroups[0].signalIds).toEqual([
      "rainfall",
      "soil-moisture",
    ]);
  });

  it("is not applicable to a single usable signal", () => {
    const summary = summarizeSourceIndependence(
      signalsFor({
        ...USABLE_INPUT,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
      })
    );

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.allIndependent).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation from MOD13A3 v061; source independence is not applicable to a single signal."
    );
  });

  it("handles a brief with no usable observations", () => {
    const summary = summarizeSourceIndependence(
      signalsFor({
        vegetation: null,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
        availableThrough: { year: 2026, month: 3 },
      })
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.distinctSources).toBe(0);
    expect(summary.allIndependent).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to assess for source independence."
    );
  });

  it("keeps statements free of forecast, risk, and causal language", () => {
    for (const input of [
      USABLE_INPUT,
      { ...USABLE_INPUT, soilMoisture: null },
    ]) {
      const summary = summarizeSourceIndependence(signalsFor(input));
      expect(unsupportedBriefLanguageHits(summary.statement)).toEqual([]);
    }
  });
});
