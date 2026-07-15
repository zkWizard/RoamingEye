import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import {
  classifyReferenceFrame,
  summarizeReferenceFrames,
} from "./signalReferenceFrame";

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

/** Keep only the named signals from a composed brief, preserving order. */
function only(
  input: EnvironmentBriefInput,
  ids: EnvironmentSignalBrief["id"][]
): EnvironmentSignalBrief[] {
  return signalsFor(input).filter((s) => ids.includes(s.id));
}

describe("classifyReferenceFrame", () => {
  it("classifies every brief signal as an absolute observation", () => {
    // The brief reports one monthly value per signal with no baseline attached,
    // so each is an absolute observation — never an anomaly.
    expect(classifyReferenceFrame("vegetation")).toBe("absolute-observation");
    expect(classifyReferenceFrame("rainfall")).toBe("absolute-observation");
    expect(classifyReferenceFrame("soil-moisture")).toBe(
      "absolute-observation"
    );
    expect(classifyReferenceFrame("air-temperature")).toBe(
      "absolute-observation"
    );
  });

  it("returns unclassified for a signal id not in the table", () => {
    // The four-way union is exhaustive at compile time; the runtime guard still
    // covers a degenerate signal whose id escaped the union.
    expect(
      classifyReferenceFrame(
        "evapotranspiration" as EnvironmentSignalBrief["id"]
      )
    ).toBe("unclassified");
  });
});

describe("summarizeReferenceFrames", () => {
  it("classifies every usable signal and flags the missing baseline", () => {
    const summary = summarizeReferenceFrames(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("measurement-reference-frame");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.frameCounts).toEqual({
      "absolute-observation": 4,
      anomaly: 0,
      unclassified: 0,
    });
    expect(summary.absoluteSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.anomalySignalIds).toEqual([]);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesAbsoluteAndAnomaly).toBe(false);
    expect(summary.hasAbsoluteWithoutBaseline).toBe(true);
    expect(summary.statement).toBe(
      "4 usable observations: 4 absolute-observation; all are absolute observations in native units; the brief attaches no climatological baseline, so a value cannot be read as above or below normal for the place or season."
    );
  });

  it("reports each signal's frame with source-carrying statements", () => {
    const summary = summarizeReferenceFrames(signalsFor(USABLE_INPUT));
    const byId = Object.fromEntries(summary.signals.map((s) => [s.id, s]));

    expect(byId.vegetation).toMatchObject({
      referenceFrame: "absolute-observation",
      isAbsolute: true,
    });
    expect(byId.vegetation.statement).toBe(
      "Vegetation (NDVI): absolute observation (a measured value in native units, not a departure from a climatological baseline); source MOD13A3 v061."
    );
    expect(byId.rainfall.statement).toBe(
      "Rainfall (precipitation rate): absolute observation (a measured value in native units, not a departure from a climatological baseline); source GLDAS_NOAH025_M v2.1."
    );
    expect(byId["air-temperature"].statement).toBe(
      "Air temperature: absolute observation (a measured value in native units, not a departure from a climatological baseline); source M2TMNXSLV v5.12.4."
    );
  });

  it("keeps rainfall and soil moisture (one GLDAS product) on the same frame", () => {
    // Reference frame is a property of the reported value, not the product: both
    // GLDAS fields report absolute observations.
    const summary = summarizeReferenceFrames(
      only(USABLE_INPUT, ["rainfall", "soil-moisture"])
    );

    expect(summary.consideredSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.frameCounts).toMatchObject({ "absolute-observation": 2 });
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesAbsoluteAndAnomaly).toBe(false);
  });

  it("considers only usable signals by default and all with include:all", () => {
    // Rainfall dated far in the future is unpublished → not available.
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      rainfall: {
        dataMonth: { year: 2027, month: 6 },
        value: 0.00012,
        validFraction: 0.74,
      },
    };
    const signals = signalsFor(input);

    const usable = summarizeReferenceFrames(signals);
    expect(usable.consideredSignalIds).not.toContain("rainfall");
    expect(usable.absoluteSignalIds).toEqual([
      "vegetation",
      "soil-moisture",
      "air-temperature",
    ]);

    const all = summarizeReferenceFrames(signals, { include: "all" });
    expect(all.consideredSignalIds).toContain("rainfall");
    expect(all.absoluteSignalIds).toContain("rainfall");
  });

  it("does not assert a frame for a signal absent from the table", () => {
    const unknownSignal: EnvironmentSignalBrief = {
      ...signalsFor(USABLE_INPUT)[0],
      id: "evapotranspiration" as EnvironmentSignalBrief["id"],
    };
    const summary = summarizeReferenceFrames([unknownSignal]);

    expect(summary.unclassifiedCount).toBe(1);
    expect(summary.absoluteSignalIds).toEqual([]);
    expect(summary.hasAbsoluteWithoutBaseline).toBe(false);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesAbsoluteAndAnomaly).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation: 1 unclassified; no considered signal is in the reference-frame table, so their frame is not asserted. 1 unclassified signal not asserted."
    );
  });

  it("returns an empty, honest summary when no signals are usable", () => {
    const summary = summarizeReferenceFrames([]);

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.absoluteSignalIds).toEqual([]);
    expect(summary.anomalySignalIds).toEqual([]);
    expect(summary.hasAbsoluteWithoutBaseline).toBe(false);
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesAbsoluteAndAnomaly).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to classify by measurement reference frame."
    );
  });

  it("keeps every statement free of unsupported inference language", () => {
    const summary = summarizeReferenceFrames(signalsFor(USABLE_INPUT));
    const text = [
      summary.statement,
      ...summary.signals.map((s) => s.statement),
      ...summary.limits,
    ].join(" ");

    expect(unsupportedBriefLanguageHits(text)).toEqual([]);
  });
});
