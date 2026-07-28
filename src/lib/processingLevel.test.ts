import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
} from "./environmentBrief";
import {
  classifyProcessingLevel,
  summarizeProcessingLevel,
} from "./processingLevel";

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

describe("classifyProcessingLevel", () => {
  it("classifies the brief's products by their EOSDIS processing level", () => {
    const signals = signalsFor(USABLE_INPUT);
    const byId = Object.fromEntries(
      signals.map((s) => [s.id, classifyProcessingLevel(s.source)])
    );

    // NDVI is a gridded L3 index; the GLDAS and MERRA-2 fields are L4 output.
    expect(byId.vegetation).toBe("L3");
    expect(byId.rainfall).toBe("L4");
    expect(byId["soil-moisture"]).toBe("L4");
    expect(byId["air-temperature"]).toBe("L4");
  });

  it("returns unclassified for a product not in the processing-level table", () => {
    expect(
      classifyProcessingLevel({
        shortName: "SOME_UNKNOWN_PRODUCT",
        version: "1",
        doi: "10.0000/unknown",
        title: "Unknown",
      })
    ).toBe("unclassified");
  });
});

describe("summarizeProcessingLevel", () => {
  it("classifies every usable signal and counts the L4 fields", () => {
    const summary = summarizeProcessingLevel(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("processing-level");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.levelCounts).toEqual({ L3: 1, L4: 3, unclassified: 0 });
    expect(summary.levelFourCount).toBe(3);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.distinctLevels).toBe(2);
    expect(summary.homogeneous).toBe(false);
    expect(summary.spansMultipleLevels).toBe(true);
  });

  it("carries the numeric rung and the L4 flag per signal", () => {
    const summary = summarizeProcessingLevel(signalsFor(USABLE_INPUT));
    const byId = Object.fromEntries(summary.signals.map((s) => [s.id, s]));

    expect(byId.vegetation.numericLevel).toBe(3);
    expect(byId.vegetation.modelOrAnalysisOutput).toBe(false);
    expect(byId.rainfall.numericLevel).toBe(4);
    expect(byId.rainfall.modelOrAnalysisOutput).toBe(true);
    expect(byId["air-temperature"].modelOrAnalysisOutput).toBe(true);
  });

  it("flags a multi-tier brief as spanning more than one processing level", () => {
    const summary = summarizeProcessingLevel(signalsFor(USABLE_INPUT));

    expect(summary.spansMultipleLevels).toBe(true);
    expect(summary.statement).toContain("span more than one processing level");
    // Descriptor only: it must not smuggle a quality or condition verdict in.
    expect(unsupportedBriefLanguageHits(summary.statement)).toEqual([]);
    for (const signal of summary.signals) {
      expect(unsupportedBriefLanguageHits(signal.statement)).toEqual([]);
    }
  });

  it("reports homogeneity when every usable signal shares one level", () => {
    // Only the two GLDAS signals are usable — both L4, so the brief is single-tier.
    const summary = summarizeProcessingLevel(
      signalsFor({
        ...USABLE_INPUT,
        vegetation: null,
        airTemperature: null,
      })
    );

    expect(summary.consideredSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.levelCounts).toEqual({ L3: 0, L4: 2, unclassified: 0 });
    expect(summary.distinctLevels).toBe(1);
    expect(summary.homogeneous).toBe(true);
    expect(summary.spansMultipleLevels).toBe(false);
    expect(summary.statement).toContain("share one processing level");
  });

  it("excludes non-usable signals by default but includes them with include:'all'", () => {
    // A vegetation observation outside sampled bounds is dropped from "available".
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      vegetation: {
        dataMonth: { year: 2026, month: 1 },
        value: 2, // out of NDVI's [-1, 1] range -> invalid, not "available"
        validFraction: 0.5,
      },
    };
    const signals = signalsFor(input);

    const available = summarizeProcessingLevel(signals);
    expect(available.consideredSignalIds).not.toContain("vegetation");

    const all = summarizeProcessingLevel(signals, { include: "all" });
    expect(all.consideredSignalIds).toContain("vegetation");
    expect(all.levelCounts.L3).toBe(1);
  });

  it("handles a brief with no usable observations", () => {
    const summary = summarizeProcessingLevel(
      signalsFor({
        vegetation: null,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
        availableThrough: { year: 2026, month: 3 },
      })
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.distinctLevels).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.spansMultipleLevels).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to classify by processing level."
    );
  });

  it("reports unclassified products without asserting a tier", () => {
    const summary = summarizeProcessingLevel([
      {
        id: "vegetation",
        label: "Mystery product",
        layerId: "ndvi",
        source: {
          shortName: "MYSTERY",
          version: "1",
          doi: "10.0000/mystery",
          title: "Mystery",
        },
        nativeUnit: "unitless",
        dataMonth: { year: 2026, month: 1 },
        coverage: { status: "available", validFraction: 1, reason: null },
        status: "available",
        observedValue: 0.5,
        statement: "Mystery product.",
      },
    ]);

    expect(summary.levelCounts.unclassified).toBe(1);
    expect(summary.unclassifiedCount).toBe(1);
    expect(summary.distinctLevels).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.statement).toContain("tier is not asserted");
    expect(summary.statement).toContain("1 unclassified product not asserted");
  });
});
