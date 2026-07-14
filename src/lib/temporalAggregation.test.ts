import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
} from "./environmentBrief";
import {
  classifyTemporalAggregation,
  summarizeTemporalAggregation,
} from "./temporalAggregation";

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

/** Only the two GLDAS signals usable; both are monthly time-averages. */
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

describe("classifyTemporalAggregation", () => {
  it("classifies the brief's products by how each reduces a month", () => {
    const signals = signalsFor(USABLE_INPUT);
    const byId = Object.fromEntries(
      signals.map((s) => [s.id, classifyTemporalAggregation(s.source)])
    );

    // NDVI is a within-month best-value composite, not a monthly mean.
    expect(byId.vegetation).toBe("within-month-composite");
    // GLDAS and MERRA-2 monthly fields are time-averages over the month.
    expect(byId.rainfall).toBe("monthly-time-average");
    expect(byId["soil-moisture"]).toBe("monthly-time-average");
    expect(byId["air-temperature"]).toBe("monthly-time-average");
  });

  it("returns unclassified for a product not in the aggregation table", () => {
    expect(
      classifyTemporalAggregation({
        shortName: "SOME_UNKNOWN_PRODUCT",
        version: "1",
        doi: "10.0000/unknown",
        title: "Unknown",
      })
    ).toBe("unclassified");
  });
});

describe("summarizeTemporalAggregation", () => {
  it("classifies every usable signal and flags mixed aggregation", () => {
    const summary = summarizeTemporalAggregation(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("temporal-aggregation");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.aggregationCounts).toEqual({
      "within-month-composite": 1,
      "monthly-time-average": 3,
      unclassified: 0,
    });
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    // A composite mixed with time-averages is not temporally commensurate.
    expect(summary.temporallyCommensurable).toBe(false);
    expect(summary.statement).toBe(
      "4 usable observations: 1 within-month-composite, 3 monthly-time-average; classified signals mix within-month composites with monthly time-averages, so values dated the same month are not temporally commensurate — a composite is a selected within-month state, a time-average is a whole-month mean."
    );
  });

  it("reports each signal's aggregation with source-carrying statements", () => {
    const summary = summarizeTemporalAggregation(signalsFor(USABLE_INPUT));
    const veg = summary.signals.find((s) => s.id === "vegetation");
    const rain = summary.signals.find((s) => s.id === "rainfall");

    expect(veg).toMatchObject({
      aggregation: "within-month-composite",
      wholeMonthMean: false,
    });
    expect(veg?.statement).toBe(
      "Vegetation (NDVI): within-month composite (within-month-composite); source MOD13A3 v061."
    );
    expect(rain).toMatchObject({
      aggregation: "monthly-time-average",
      wholeMonthMean: true,
    });
    expect(rain?.statement).toBe(
      "Rainfall (precipitation rate): monthly time-average (monthly-time-average); source GLDAS_NOAH025_M v2.1."
    );
  });

  it("is temporally commensurable when all classified share one aggregation", () => {
    const summary = summarizeTemporalAggregation(signalsFor(GLDAS_ONLY_INPUT));

    expect(summary.consideredSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.aggregationCounts).toEqual({
      "within-month-composite": 0,
      "monthly-time-average": 2,
      unclassified: 0,
    });
    expect(summary.homogeneous).toBe(true);
    expect(summary.temporallyCommensurable).toBe(true);
    expect(summary.statement).toBe(
      "2 usable observations: 2 monthly-time-average; all 2 classified are monthly time-averages over the whole month."
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

    const usable = summarizeTemporalAggregation(signals);
    expect(usable.consideredSignalIds).not.toContain("air-temperature");

    const all = summarizeTemporalAggregation(signals, { include: "all" });
    expect(all.consideredSignalIds).toContain("air-temperature");
    expect(all.aggregationCounts["monthly-time-average"]).toBe(3);
  });

  it("does not assert an aggregation for an unclassified product", () => {
    const unknownSignal = {
      ...signalsFor(USABLE_INPUT)[0],
      source: {
        shortName: "SOME_UNKNOWN_PRODUCT",
        version: "1",
        doi: "10.0000/unknown",
        title: "Unknown",
      },
    };
    const summary = summarizeTemporalAggregation([unknownSignal]);

    expect(summary.unclassifiedCount).toBe(1);
    expect(summary.temporallyCommensurable).toBe(false);
    expect(summary.homogeneous).toBe(true);
    expect(summary.statement).toBe(
      "1 usable observation: 1 unclassified; no considered signal is in the aggregation table, so their within-month aggregation is not asserted. 1 unclassified product not asserted."
    );
  });

  it("returns an empty, honest summary when no signals are usable", () => {
    const summary = summarizeTemporalAggregation([]);

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(false);
    expect(summary.temporallyCommensurable).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to classify by within-month aggregation."
    );
  });

  it("keeps every statement free of unsupported inference language", () => {
    const summary = summarizeTemporalAggregation(signalsFor(USABLE_INPUT));
    const text = [
      summary.statement,
      ...summary.signals.map((s) => s.statement),
      ...summary.limits,
    ].join(" ");

    expect(unsupportedBriefLanguageHits(text)).toEqual([]);
  });
});
