import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
} from "./environmentBrief";
import {
  classifyCompartment,
  summarizeSignalCompartments,
} from "./signalCompartment";

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

describe("classifyCompartment", () => {
  it("classifies each signal by the Earth-system compartment it describes", () => {
    expect(classifyCompartment("vegetation")).toBe("land-surface");
    expect(classifyCompartment("rainfall")).toBe("surface-flux");
    expect(classifyCompartment("soil-moisture")).toBe("subsurface-soil");
    expect(classifyCompartment("air-temperature")).toBe(
      "near-surface-atmosphere"
    );
  });

  it("separates the two GLDAS signals into different compartments", () => {
    // Rainfall and soil moisture share one product and DOI (GLDAS_NOAH025_M)
    // yet belong to different compartments: a compartment is a property of the
    // variable, not the product.
    const signals = signalsFor(USABLE_INPUT);
    const rainfall = signals.find((s) => s.id === "rainfall")!;
    const soil = signals.find((s) => s.id === "soil-moisture")!;
    expect(rainfall.source.doi).toBe(soil.source.doi);
    expect(classifyCompartment(rainfall.id)).not.toBe(
      classifyCompartment(soil.id)
    );
  });
});

describe("summarizeSignalCompartments", () => {
  it("classifies every usable signal and spreads them across the vertical column", () => {
    const summary = summarizeSignalCompartments(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("signal-compartment");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.compartmentCounts).toEqual({
      "near-surface-atmosphere": 1,
      "surface-flux": 1,
      "land-surface": 1,
      "subsurface-soil": 1,
      unclassified: 0,
    });
    expect(summary.verticalReferenceCounts).toEqual({
      "above-surface": 1,
      "at-surface": 2,
      "below-surface": 1,
      unknown: 0,
    });
    expect(summary.distinctCompartmentCount).toBe(4);
    expect(summary.distinctVerticalReferenceCount).toBe(3);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.spansFullColumn).toBe(true);
    expect(summary.statement).toBe(
      "4 usable observations across 4 Earth-system compartments (1 near-surface-atmosphere, 1 surface-flux, 1 land-surface, 1 subsurface-soil), spanning the full above-, at-, and below-surface column; the signals describe different physical media at different vertical references and are not a single point-state."
    );
  });

  it("keeps each signal's compartment, vertical reference, and provenance", () => {
    const summary = summarizeSignalCompartments(signalsFor(USABLE_INPUT));

    const veg = summary.signals.find((s) => s.id === "vegetation")!;
    expect(veg.compartment).toBe("land-surface");
    expect(veg.verticalReference).toBe("at-surface");
    expect(veg.statement).toBe(
      "Vegetation (NDVI): vegetated land surface (canopy) (land-surface, at-surface); source MOD13A3 v061."
    );

    const soil = summary.signals.find((s) => s.id === "soil-moisture")!;
    expect(soil.compartment).toBe("subsurface-soil");
    expect(soil.verticalReference).toBe("below-surface");
    expect(soil.statement).toBe(
      "Soil moisture: subsurface soil column (subsurface-soil, below-surface); source GLDAS_NOAH025_M v2.1."
    );

    // Provenance is never dropped: every classified signal keeps its DatasetRef.
    for (const signal of summary.signals) {
      expect(signal.source.doi.length).toBeGreaterThan(0);
    }
  });

  it("still spans the full column when only the three climate signals are usable", () => {
    // Drop vegetation: rainfall (at), soil moisture (below), air temp (above)
    // still occupy all three vertical references.
    const summary = summarizeSignalCompartments(
      signalsFor({ ...USABLE_INPUT, vegetation: null })
    );

    expect(summary.consideredSignalIds).toEqual([
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.distinctCompartmentCount).toBe(3);
    expect(summary.spansFullColumn).toBe(true);
    expect(summary.statement).toBe(
      "3 usable observations across 3 Earth-system compartments (1 near-surface-atmosphere, 1 surface-flux, 1 subsurface-soil), spanning the full above-, at-, and below-surface column; the signals describe different physical media at different vertical references and are not a single point-state."
    );
  });

  it("does not claim a full-column span when the signals share a vertical reference", () => {
    // Vegetation and rainfall are distinct compartments but both at-surface.
    const summary = summarizeSignalCompartments(
      signalsFor({ ...USABLE_INPUT, soilMoisture: null, airTemperature: null })
    );

    expect(summary.consideredSignalIds).toEqual(["vegetation", "rainfall"]);
    expect(summary.distinctCompartmentCount).toBe(2);
    expect(summary.distinctVerticalReferenceCount).toBe(1);
    expect(summary.spansFullColumn).toBe(false);
    expect(summary.statement).toBe(
      "2 usable observations across 2 Earth-system compartments (1 surface-flux, 1 land-surface); the signals describe different physical media at different vertical references and are not a single point-state."
    );
  });

  it("reports a single usable signal as one physical medium", () => {
    const summary = summarizeSignalCompartments(
      signalsFor({
        ...USABLE_INPUT,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
      })
    );

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.homogeneous).toBe(true);
    expect(summary.spansFullColumn).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation in 1 Earth-system compartment (1 land-surface); a single physical medium."
    );
  });

  it("considers only usable observations by default", () => {
    // Soil moisture present but not-yet-published => not usable, so not classified.
    const summary = summarizeSignalCompartments(
      signalsFor({
        ...USABLE_INPUT,
        soilMoisture: { dataMonth: { year: 2026, month: 9 }, value: 6.4 },
      })
    );

    expect(summary.consideredSignalIds).not.toContain("soil-moisture");
    expect(summary.compartmentCounts["subsurface-soil"]).toBe(0);
    expect(summary.spansFullColumn).toBe(false);
  });

  it("can describe the whole brief structure with include: all", () => {
    const summary = summarizeSignalCompartments(
      signalsFor({ ...USABLE_INPUT, soilMoisture: null }),
      { include: "all" }
    );

    // soil-moisture is unavailable but still carries its id, so it is classified.
    expect(summary.consideredSignalIds).toContain("soil-moisture");
    expect(summary.compartmentCounts["subsurface-soil"]).toBe(1);
    expect(summary.spansFullColumn).toBe(true);
  });

  it("handles a brief with no usable observations", () => {
    const summary = summarizeSignalCompartments(
      signalsFor({
        vegetation: null,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
        availableThrough: { year: 2026, month: 3 },
      })
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.distinctCompartmentCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.spansFullColumn).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to classify by Earth-system compartment."
    );
  });

  it("keeps statements free of forecast, risk, and causal language", () => {
    for (const input of [
      USABLE_INPUT,
      { ...USABLE_INPUT, vegetation: null },
      { ...USABLE_INPUT, rainfall: null, soilMoisture: null },
      {
        ...USABLE_INPUT,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
      },
    ]) {
      const summary = summarizeSignalCompartments(signalsFor(input));
      expect(unsupportedBriefLanguageHits(summary.statement)).toEqual([]);
      for (const signal of summary.signals) {
        expect(unsupportedBriefLanguageHits(signal.statement)).toEqual([]);
      }
      for (const limit of summary.limits) {
        expect(unsupportedBriefLanguageHits(limit)).toEqual([]);
      }
    }
  });
});
