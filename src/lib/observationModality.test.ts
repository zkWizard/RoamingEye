import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
} from "./environmentBrief";
import {
  classifyModality,
  summarizeObservationModality,
} from "./observationModality";

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

describe("classifyModality", () => {
  it("classifies the brief's products by how each value is produced", () => {
    const signals = signalsFor(USABLE_INPUT);
    const byId = Object.fromEntries(
      signals.map((s) => [s.id, classifyModality(s.source)])
    );

    expect(byId.vegetation).toBe("satellite-derived-index");
    expect(byId.rainfall).toBe("land-surface-model");
    expect(byId["soil-moisture"]).toBe("land-surface-model");
    expect(byId["air-temperature"]).toBe("atmospheric-reanalysis");
  });

  it("returns unclassified for a product not in the modality table", () => {
    expect(
      classifyModality({
        shortName: "SOME_UNKNOWN_PRODUCT",
        version: "1",
        doi: "10.0000/unknown",
        title: "Unknown",
      })
    ).toBe("unclassified");
  });
});

describe("summarizeObservationModality", () => {
  it("classifies every usable signal and counts the model-derived ones", () => {
    const summary = summarizeObservationModality(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("observation-modality");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.modalityCounts).toEqual({
      "satellite-derived-index": 1,
      "land-surface-model": 2,
      "atmospheric-reanalysis": 1,
      unclassified: 0,
    });
    // Rainfall, soil moisture (GLDAS) and air temperature (MERRA-2) are all
    // model/reanalysis fields; only NDVI is remotely sensed.
    expect(summary.modelDerivedCount).toBe(3);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.statement).toBe(
      "4 usable observations: 1 satellite-derived-index, 2 land-surface-model, 1 atmospheric-reanalysis; 3 of 4 classified are model or reanalysis fields, not direct measurements."
    );
  });

  it("keeps each signal's modality, basis, and source provenance", () => {
    const summary = summarizeObservationModality(signalsFor(USABLE_INPUT));

    const veg = summary.signals.find((s) => s.id === "vegetation")!;
    expect(veg.basis).toBe("remote-sensing");
    expect(veg.modelDerived).toBe(false);
    expect(veg.statement).toBe(
      "Vegetation (NDVI): satellite-derived spectral index (satellite-derived-index); source MOD13A3 v061."
    );

    const soil = summary.signals.find((s) => s.id === "soil-moisture")!;
    expect(soil.basis).toBe("model");
    expect(soil.modelDerived).toBe(true);
    expect(soil.statement).toBe(
      "Soil moisture: land-surface-model field (land-surface-model); source GLDAS_NOAH025_M v2.1."
    );

    // Provenance is never dropped: every classified signal keeps its DatasetRef.
    for (const signal of summary.signals) {
      expect(signal.source.doi.length).toBeGreaterThan(0);
    }
  });

  it("reports all model-derived when NDVI is not usable", () => {
    // Drop vegetation so only GLDAS + MERRA-2 model fields remain.
    const summary = summarizeObservationModality(
      signalsFor({ ...USABLE_INPUT, vegetation: null })
    );

    expect(summary.consideredSignalIds).toEqual([
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.modelDerivedCount).toBe(3);
    expect(summary.statement).toBe(
      "3 usable observations: 2 land-surface-model, 1 atmospheric-reanalysis; all 3 classified are model or reanalysis fields, not direct measurements — agreement across them is not independent measurement confirmation."
    );
  });

  it("reports a single remotely-sensed signal as not model-derived", () => {
    const summary = summarizeObservationModality(
      signalsFor({
        ...USABLE_INPUT,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
      })
    );

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.modelDerivedCount).toBe(0);
    expect(summary.homogeneous).toBe(true);
    expect(summary.statement).toBe(
      "1 usable observation: 1 satellite-derived-index; the classified signals are remotely sensed, not model-derived."
    );
  });

  it("considers only usable observations by default", () => {
    // Soil moisture present but not-yet-published => not usable, so not classified.
    const summary = summarizeObservationModality(
      signalsFor({
        ...USABLE_INPUT,
        soilMoisture: { dataMonth: { year: 2026, month: 9 }, value: 6.4 },
      })
    );

    expect(summary.consideredSignalIds).not.toContain("soil-moisture");
    expect(summary.modalityCounts["land-surface-model"]).toBe(1);
    expect(summary.modelDerivedCount).toBe(2);
  });

  it("can describe the whole modality basis with include: all", () => {
    const summary = summarizeObservationModality(
      signalsFor({ ...USABLE_INPUT, soilMoisture: null }),
      { include: "all" }
    );

    // soil-moisture is unavailable but still cites GLDAS, so it is classified.
    expect(summary.consideredSignalIds).toContain("soil-moisture");
    expect(summary.modalityCounts["land-surface-model"]).toBe(2);
  });

  it("handles a brief with no usable observations", () => {
    const summary = summarizeObservationModality(
      signalsFor({
        vegetation: null,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
        availableThrough: { year: 2026, month: 3 },
      })
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.modelDerivedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to classify by observation modality."
    );
  });

  it("keeps statements free of forecast, risk, and causal language", () => {
    for (const input of [
      USABLE_INPUT,
      { ...USABLE_INPUT, vegetation: null },
      { ...USABLE_INPUT, rainfall: null, soilMoisture: null },
    ]) {
      const summary = summarizeObservationModality(signalsFor(input));
      expect(unsupportedBriefLanguageHits(summary.statement)).toEqual([]);
      for (const signal of summary.signals) {
        expect(unsupportedBriefLanguageHits(signal.statement)).toEqual([]);
      }
    }
  });
});
