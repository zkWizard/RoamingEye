import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
} from "./environmentBrief";
import {
  classifyMeasurementScale,
  summarizeMeasurementScale,
} from "./measurementScale";

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

/** Only the two GLDAS signals usable; both are ratio-scaled. */
const GLDAS_ONLY_INPUT: EnvironmentBriefInput = {
  vegetation: null,
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
  airTemperature: null,
  availableThrough: { year: 2026, month: 3 },
};

function signalsFor(input: EnvironmentBriefInput) {
  return composeEnvironmentBrief(input).signals;
}

describe("classifyMeasurementScale", () => {
  it("classifies the brief's layers by level of measurement", () => {
    // NDVI is a dimensionless bounded index with no ratio origin.
    expect(classifyMeasurementScale("ndvi", "NDVI (unitless)")).toBe(
      "bounded-index"
    );
    // Precipitation-rate flux and soil-moisture mass have true zeros.
    expect(classifyMeasurementScale("precip", "kg/m²/s")).toBe("ratio");
    expect(classifyMeasurementScale("soil", "kg/m²")).toBe("ratio");
    // Air temperature in kelvin is ratio-scaled (absolute zero).
    expect(classifyMeasurementScale("airtemp", "K")).toBe("ratio");
  });

  it("reads temperature's scale from its reported unit, not the layer", () => {
    // The identical quantity in a relative unit is interval-scaled.
    expect(classifyMeasurementScale("airtemp", "°C")).toBe("interval");
    expect(classifyMeasurementScale("airtemp", "°F")).toBe("interval");
    // An unrecognized temperature unit is never guessed.
    expect(classifyMeasurementScale("airtemp", "widgets")).toBe("unclassified");
  });

  it("returns unclassified for a layer not in the scale table", () => {
    expect(classifyMeasurementScale("snow", "%")).toBe("unclassified");
    expect(classifyMeasurementScale("sst", "K")).toBe("unclassified");
  });
});

describe("summarizeMeasurementScale", () => {
  it("classifies every usable signal and flags the non-ratio NDVI", () => {
    const summary = summarizeMeasurementScale(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("measurement-scale");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.scaleCounts).toEqual({
      ratio: 3,
      interval: 0,
      "bounded-index": 1,
      unclassified: 0,
    });
    expect(summary.unclassifiedCount).toBe(0);
    // NDVI is not ratio-scaled, so the set is not uniformly ratio-scaled.
    expect(summary.uniformlyRatioScaled).toBe(false);
    expect(summary.ratioScaledSignalIds).toEqual([
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.statement).toBe(
      "4 usable observations: 3 ratio, 1 bounded-index; 3 of 4 classified are ratio-scaled (ratios/percentage changes valid); the rest admit differences only, so a blanket percentage change across signals is not valid."
    );
  });

  it("reports each signal's scale with source-carrying statements", () => {
    const summary = summarizeMeasurementScale(signalsFor(USABLE_INPUT));
    const veg = summary.signals.find((s) => s.id === "vegetation");
    const rain = summary.signals.find((s) => s.id === "rainfall");

    expect(veg).toMatchObject({
      scale: "bounded-index",
      ratioMeaningful: false,
      differenceMeaningful: true,
    });
    expect(veg?.statement).toBe(
      "Vegetation (NDVI): bounded normalized index (no ratio origin), unit NDVI (unitless) (bounded-index); differences valid, ratios/percentage changes not; source MOD13A3 v061."
    );
    expect(rain).toMatchObject({
      scale: "ratio",
      ratioMeaningful: true,
      differenceMeaningful: true,
    });
    expect(rain?.statement).toBe(
      "Rainfall (precipitation rate): ratio scale (true zero), unit kg/m²/s (ratio); differences and ratios/percentage changes valid; source GLDAS_NOAH025_M v2.1."
    );
  });

  it("is uniformly ratio-scaled when every classified signal has a true zero", () => {
    const summary = summarizeMeasurementScale(signalsFor(GLDAS_ONLY_INPUT));

    expect(summary.consideredSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.scaleCounts).toEqual({
      ratio: 2,
      interval: 0,
      "bounded-index": 0,
      unclassified: 0,
    });
    expect(summary.uniformlyRatioScaled).toBe(true);
    expect(summary.ratioScaledSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.statement).toBe(
      "2 usable observations: 2 ratio; all 2 classified are ratio-scaled, so differences and ratios/percentage changes are valid for each."
    );
  });

  it("considers only usable signals by default and all with include:all", () => {
    // Air temperature dated far in the future is unpublished → not available.
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      airTemperature: {
        dataMonth: { year: 2027, month: 6 },
        value: 289.4,
        validFraction: 0.93,
      },
    };
    const signals = signalsFor(input);

    const usable = summarizeMeasurementScale(signals);
    expect(usable.consideredSignalIds).not.toContain("air-temperature");
    expect(usable.scaleCounts.ratio).toBe(2);

    const all = summarizeMeasurementScale(signals, { include: "all" });
    expect(all.consideredSignalIds).toContain("air-temperature");
    expect(all.scaleCounts.ratio).toBe(3);
  });

  it("does not assert a scale for an unclassified signal", () => {
    // A temperature carrying an unrecognized unit is never scaled.
    const veg = signalsFor(USABLE_INPUT)[0];
    const oddUnitSignal = {
      ...veg,
      layerId: "airtemp" as const,
      nativeUnit: "??",
    };
    const summary = summarizeMeasurementScale([oddUnitSignal]);

    expect(summary.unclassifiedCount).toBe(1);
    expect(summary.uniformlyRatioScaled).toBe(false);
    expect(summary.ratioScaledSignalIds).toEqual([]);
    expect(summary.signals[0].differenceMeaningful).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation: 1 unclassified; no considered signal has an asserted scale, so which arithmetic is valid is not stated. 1 unclassified signal not asserted."
    );
  });

  it("says ratios are invalid when no classified signal is ratio-scaled", () => {
    // A lone NDVI signal: a bounded index, so only differences are valid.
    const summary = summarizeMeasurementScale([signalsFor(USABLE_INPUT)[0]]);

    expect(summary.scaleCounts["bounded-index"]).toBe(1);
    expect(summary.uniformlyRatioScaled).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation: 1 bounded-index; no classified signal is ratio-scaled, so ratios/percentage changes are not valid for any — only differences."
    );
  });

  it("returns an empty, honest summary when no signals are usable", () => {
    const summary = summarizeMeasurementScale([]);

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.uniformlyRatioScaled).toBe(false);
    expect(summary.ratioScaledSignalIds).toEqual([]);
    expect(summary.statement).toBe(
      "No usable observations to classify by measurement scale."
    );
  });

  it("keeps every statement free of unsupported inference language", () => {
    const summary = summarizeMeasurementScale(signalsFor(USABLE_INPUT));
    const text = [
      summary.statement,
      ...summary.signals.map((s) => s.statement),
      ...summary.limits,
    ].join(" ");

    expect(unsupportedBriefLanguageHits(text)).toEqual([]);
  });
});
