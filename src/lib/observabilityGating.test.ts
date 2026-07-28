import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import {
  classifyGapMechanism,
  classifyNoDataExpectedness,
  summarizeObservabilityGating,
} from "./observabilityGating";

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

/** A minimal usable signal citing a product outside the mechanism table. */
const UNKNOWN_SIGNAL: EnvironmentSignalBrief = {
  id: "vegetation",
  label: "Mystery signal",
  layerId: "ndvi",
  source: {
    shortName: "SOME_UNKNOWN_PRODUCT",
    version: "1",
    doi: "10.0000/unknown",
    title: "Unknown",
  },
  nativeUnit: "1",
  dataMonth: { year: 2026, month: 1 },
  coverage: { status: "available", validFraction: null, reason: null },
  status: "available",
  observedValue: 0.5,
  statement:
    "Mystery signal: 0.5 1 observed for 2026-01; coverage not supplied.",
};

describe("classifyGapMechanism", () => {
  it("classifies the brief's products by whether a value needs a clear-sky view", () => {
    const signals = signalsFor(USABLE_INPUT);
    const byId = Object.fromEntries(
      signals.map((s) => [s.id, classifyGapMechanism(s.source)])
    );

    // Optical NDVI depends on a clear, sunlit, snow-free view.
    expect(byId.vegetation).toBe("observation-gated");
    // GLDAS and MERRA-2 fields are integrated for every land cell every month.
    expect(byId.rainfall).toBe("model-continuous");
    expect(byId["soil-moisture"]).toBe("model-continuous");
    expect(byId["air-temperature"]).toBe("model-continuous");
  });

  it("returns unclassified for a product not in the mechanism table", () => {
    expect(classifyGapMechanism(UNKNOWN_SIGNAL.source)).toBe("unclassified");
  });
});

describe("classifyNoDataExpectedness", () => {
  it("reads a no-data gap as expected for an observation-gated product", () => {
    expect(classifyNoDataExpectedness("no-data", "observation-gated")).toBe(
      "expected"
    );
  });

  it("reads a no-data gap as anomalous for a model-continuous field", () => {
    expect(classifyNoDataExpectedness("no-data", "model-continuous")).toBe(
      "anomalous"
    );
  });

  it("does not assert expectedness for an unclassified product", () => {
    expect(classifyNoDataExpectedness("no-data", "unclassified")).toBe(
      "unassessed"
    );
  });

  it("is not-applicable for any status that is not a data gap", () => {
    for (const status of ["available", "invalid", "unavailable"] as const) {
      expect(classifyNoDataExpectedness(status, "observation-gated")).toBe(
        "not-applicable"
      );
      expect(classifyNoDataExpectedness(status, "model-continuous")).toBe(
        "not-applicable"
      );
    }
  });
});

describe("summarizeObservabilityGating", () => {
  it("classifies every signal and separates gated from gap-free products", () => {
    const summary = summarizeObservabilityGating(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("observability-gating");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.mechanismCounts).toEqual({
      "observation-gated": 1,
      "model-continuous": 3,
      unclassified: 0,
    });
    expect(summary.observationGatedCount).toBe(1);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.anomalousGapSignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(false);
    expect(summary.statement).toBe(
      "4 signals: 1 observation-gated, 3 model-continuous; 1 is an observation-gated optical product whose data gaps and reduced coverage are expected consequences of cloud, sun angle, or snow, not product defects, and 3 are model-continuous fields gap-free by construction over their domain."
    );
  });

  it("keeps each signal's mechanism, gap-proneness, and source provenance", () => {
    const summary = summarizeObservabilityGating(signalsFor(USABLE_INPUT));

    const veg = summary.signals.find((s) => s.id === "vegetation")!;
    expect(veg.mechanism).toBe("observation-gated");
    expect(veg.gapProne).toBe(true);
    expect(veg.noDataExpectedness).toBe("not-applicable");
    expect(veg.statement).toBe(
      "Vegetation (NDVI): observation-gated optical product (observation-gated); data gaps and reduced coverage are expected (typically cloud, aerosol, low solar elevation, or snow); source MOD13A3 v061."
    );

    const soil = summary.signals.find((s) => s.id === "soil-moisture")!;
    expect(soil.mechanism).toBe("model-continuous");
    expect(soil.gapProne).toBe(false);
    expect(soil.statement).toBe(
      "Soil moisture: gap-free model/reanalysis field (model-continuous); gap-free by construction over its domain (a gap would point to the land/ocean mask or an ingestion failure); source GLDAS_NOAH025_M v2.1."
    );

    // Provenance is never dropped: every classified signal keeps its DatasetRef.
    for (const signal of summary.signals) {
      expect(signal.source.doi.length).toBeGreaterThan(0);
    }
  });

  it("flags a no-data gap in an optical product as routine and expected", () => {
    const summary = summarizeObservabilityGating(
      signalsFor({
        ...USABLE_INPUT,
        vegetation: { dataMonth: { year: 2026, month: 1 }, value: null },
      })
    );

    const veg = summary.signals.find((s) => s.id === "vegetation")!;
    expect(veg.status).toBe("no-data");
    expect(veg.noDataExpectedness).toBe("expected");
    expect(veg.statement).toBe(
      "Vegetation (NDVI): observation-gated optical product (observation-gated); currently no-data — a routine, expected observability gap (cloud, aerosol, low solar elevation, or snow); source MOD13A3 v061."
    );
    // An expected optical gap is not surfaced as an anomaly.
    expect(summary.anomalousGapSignalIds).toEqual([]);
  });

  it("flags a no-data gap in a model-continuous field as anomalous", () => {
    const summary = summarizeObservabilityGating(
      signalsFor({
        ...USABLE_INPUT,
        // GLDAS is published for this month but returns no value: a gap-free
        // field should resolve over land, so this is worth checking.
        soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: null },
      })
    );

    const soil = summary.signals.find((s) => s.id === "soil-moisture")!;
    expect(soil.status).toBe("no-data");
    expect(soil.noDataExpectedness).toBe("anomalous");
    expect(soil.statement).toBe(
      "Soil moisture: gap-free model/reanalysis field (model-continuous); currently no-data — anomalous for a gap-free field, pointing to the land/ocean mask or an ingestion failure, worth checking; source GLDAS_NOAH025_M v2.1."
    );
    expect(summary.anomalousGapSignalIds).toEqual(["soil-moisture"]);
    expect(summary.statement).toBe(
      "4 signals: 1 observation-gated, 3 model-continuous; 1 is an observation-gated optical product whose data gaps and reduced coverage are expected consequences of cloud, sun angle, or snow, not product defects, and 3 are model-continuous fields gap-free by construction over their domain. 1 model-continuous signal is currently no-data (soil-moisture) — anomalous for a gap-free field and worth checking."
    );
  });

  it("considers every signal by default, including unavailable ones", () => {
    // Air temperature not yet published => unavailable, but still cites MERRA-2.
    const summary = summarizeObservabilityGating(
      signalsFor({
        ...USABLE_INPUT,
        airTemperature: { dataMonth: { year: 2026, month: 9 }, value: 289.4 },
      })
    );

    const air = summary.signals.find((s) => s.id === "air-temperature")!;
    expect(air.status).toBe("unavailable");
    expect(air.mechanism).toBe("model-continuous");
    // Unavailable is a publication-lag state, not a data gap.
    expect(air.noDataExpectedness).toBe("not-applicable");
    expect(summary.mechanismCounts["model-continuous"]).toBe(3);
  });

  it("can restrict to usable observations with include: available", () => {
    const summary = summarizeObservabilityGating(
      signalsFor({
        ...USABLE_INPUT,
        airTemperature: { dataMonth: { year: 2026, month: 9 }, value: 289.4 },
      }),
      { include: "available" }
    );

    expect(summary.consideredSignalIds).not.toContain("air-temperature");
    expect(summary.mechanismCounts["model-continuous"]).toBe(2);
  });

  it("reports a homogeneous set when only model fields remain", () => {
    const summary = summarizeObservabilityGating(
      signalsFor({ ...USABLE_INPUT, vegetation: null }),
      { include: "available" }
    );

    expect(summary.consideredSignalIds).toEqual([
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.observationGatedCount).toBe(0);
    expect(summary.homogeneous).toBe(true);
    expect(summary.statement).toBe(
      "3 signals: 3 model-continuous; 3 are model-continuous fields gap-free by construction over their domain."
    );
  });

  it("does not assert a mechanism for a product outside the table", () => {
    const summary = summarizeObservabilityGating([UNKNOWN_SIGNAL]);

    expect(summary.mechanismCounts.unclassified).toBe(1);
    expect(summary.unclassifiedCount).toBe(1);
    expect(summary.signals[0].mechanism).toBe("unclassified");
    expect(summary.signals[0].gapProne).toBe(false);
    expect(summary.signals[0].statement).toBe(
      "Mystery signal: unclassified product (unclassified); gap mechanism not asserted; source SOME_UNKNOWN_PRODUCT v1."
    );
    expect(summary.statement).toBe(
      "1 signal: 1 unclassified; no considered signal is in the mechanism table, so their gap mechanism is not asserted. 1 unclassified product not asserted."
    );
  });

  it("handles a brief with no signals", () => {
    const summary = summarizeObservabilityGating([]);

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.observationGatedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.anomalousGapSignalIds).toEqual([]);
    expect(summary.statement).toBe(
      "No signals to classify by data-gap mechanism."
    );
  });

  it("keeps statements free of forecast, risk, and causal language", () => {
    const inputs: EnvironmentBriefInput[] = [
      USABLE_INPUT,
      {
        ...USABLE_INPUT,
        vegetation: { dataMonth: { year: 2026, month: 1 }, value: null },
      },
      {
        ...USABLE_INPUT,
        soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: null },
      },
      { ...USABLE_INPUT, vegetation: null },
    ];
    for (const input of inputs) {
      const summary = summarizeObservabilityGating(signalsFor(input));
      expect(unsupportedBriefLanguageHits(summary.statement)).toEqual([]);
      for (const signal of summary.signals) {
        expect(unsupportedBriefLanguageHits(signal.statement)).toEqual([]);
      }
    }
  });
});
