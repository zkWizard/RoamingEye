import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import {
  classifySpatialExtensivity,
  summarizeSpatialExtensivity,
} from "./spatialExtensivity";

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

describe("classifySpatialExtensivity", () => {
  it("classifies each brief signal by whether it integrates over area", () => {
    // NDVI (unitless index) and 2 m air temperature (K) are intensive.
    expect(classifySpatialExtensivity("vegetation")).toBe("intensive");
    expect(classifySpatialExtensivity("air-temperature")).toBe("intensive");
    // Precipitation rate (kg/m²/s) and soil moisture (kg/m²) are per-area
    // densities and are therefore area-integrable.
    expect(classifySpatialExtensivity("rainfall")).toBe("areal-density");
    expect(classifySpatialExtensivity("soil-moisture")).toBe("areal-density");
  });

  it("returns unclassified for a signal id not in the table", () => {
    // The four-way union is exhaustive at compile time; the runtime guard still
    // covers a degenerate signal whose id escaped the union.
    expect(
      classifySpatialExtensivity(
        "evapotranspiration" as EnvironmentSignalBrief["id"]
      )
    ).toBe("unclassified");
  });
});

describe("summarizeSpatialExtensivity", () => {
  it("classifies every usable signal and flags the density/intensive mix", () => {
    const summary = summarizeSpatialExtensivity(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("spatial-extensivity");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.extensivityCounts).toEqual({
      "areal-density": 2,
      intensive: 2,
      unclassified: 0,
    });
    expect(summary.integrableSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesDensityAndIntensive).toBe(true);
    expect(summary.statement).toBe(
      "4 usable observations: 2 areal-density, 2 intensive; only rainfall, soil-moisture are area-integrable per-unit-area densities; the remaining intensive signals must be area-averaged, not summed over area."
    );
  });

  it("reports each signal's extensivity with source-carrying statements", () => {
    const summary = summarizeSpatialExtensivity(signalsFor(USABLE_INPUT));
    const byId = Object.fromEntries(summary.signals.map((s) => [s.id, s]));

    expect(byId.rainfall).toMatchObject({
      extensivity: "areal-density",
      areaIntegrable: true,
    });
    expect(byId.rainfall.statement).toBe(
      "Rainfall (precipitation rate): per-unit-area density (areal-density), area-integrable; source GLDAS_NOAH025_M v2.1."
    );
    expect(byId["soil-moisture"]).toMatchObject({
      extensivity: "areal-density",
      areaIntegrable: true,
    });
    expect(byId["soil-moisture"].statement).toBe(
      "Soil moisture: per-unit-area density (areal-density), area-integrable; source GLDAS_NOAH025_M v2.1."
    );
    expect(byId.vegetation.statement).toBe(
      "Vegetation (NDVI): intensive quantity (no per-area factor) (intensive), not area-integrable; source MOD13A3 v061."
    );
    expect(byId["air-temperature"].statement).toBe(
      "Air temperature: intensive quantity (no per-area factor) (intensive), not area-integrable; source M2TMNXSLV v5.12.4."
    );
  });

  it("keeps the two GLDAS fields as the same (area-integrable) extensivity", () => {
    // Both GLDAS fields are per-m² densities even though quantity kind splits
    // them into a flux and a state — the spatial axis is independent of time.
    const summary = summarizeSpatialExtensivity(
      only(USABLE_INPUT, ["rainfall", "soil-moisture"])
    );

    expect(summary.consideredSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.extensivityCounts).toMatchObject({ "areal-density": 2 });
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesDensityAndIntensive).toBe(false);
    expect(summary.statement).toBe(
      "2 usable observations: 2 areal-density; all 2 classified are per-unit-area densities, area-integrable over a region to an extensive total."
    );
  });

  it("reports a lone density as fully area-integrable", () => {
    const summary = summarizeSpatialExtensivity(
      only(USABLE_INPUT, ["rainfall"])
    );

    expect(summary.integrableSignalIds).toEqual(["rainfall"]);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesDensityAndIntensive).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation: 1 areal-density; all 1 classified is a per-unit-area density, area-integrable over a region to an extensive total."
    );
  });

  it("says none is area-integrable when only intensive signals are present", () => {
    const summary = summarizeSpatialExtensivity(
      only(USABLE_INPUT, ["vegetation", "air-temperature"])
    );

    expect(summary.integrableSignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesDensityAndIntensive).toBe(false);
    expect(summary.statement).toBe(
      "2 usable observations: 2 intensive; none is a per-unit-area density, so no value is area-integrable to a regional total; these intensive quantities must be area-averaged, not summed over area."
    );
  });

  it("considers only usable signals by default and all with include:all", () => {
    // Soil moisture dated far in the future is unpublished → not available.
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      soilMoisture: {
        dataMonth: { year: 2027, month: 6 },
        value: 6.4,
        validFraction: 0.67,
      },
    };
    const signals = signalsFor(input);

    const usable = summarizeSpatialExtensivity(signals);
    expect(usable.consideredSignalIds).not.toContain("soil-moisture");
    expect(usable.integrableSignalIds).toEqual(["rainfall"]);

    const all = summarizeSpatialExtensivity(signals, { include: "all" });
    expect(all.consideredSignalIds).toContain("soil-moisture");
    expect(all.integrableSignalIds).toEqual(["rainfall", "soil-moisture"]);
  });

  it("does not assert an extensivity for a signal absent from the table", () => {
    const unknownSignal: EnvironmentSignalBrief = {
      ...signalsFor(USABLE_INPUT)[0],
      id: "evapotranspiration" as EnvironmentSignalBrief["id"],
    };
    const summary = summarizeSpatialExtensivity([unknownSignal]);

    expect(summary.unclassifiedCount).toBe(1);
    expect(summary.integrableSignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesDensityAndIntensive).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation: 1 unclassified; no considered signal is in the spatial-extensivity table, so their extensivity is not asserted. 1 unclassified signal not asserted."
    );
  });

  it("returns an empty, honest summary when no signals are usable", () => {
    const summary = summarizeSpatialExtensivity([]);

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.integrableSignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesDensityAndIntensive).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to classify by spatial extensivity."
    );
  });

  it("keeps every statement free of unsupported inference language", () => {
    const summary = summarizeSpatialExtensivity(signalsFor(USABLE_INPUT));
    const text = [
      summary.statement,
      ...summary.signals.map((s) => s.statement),
      ...summary.limits,
    ].join(" ");

    expect(unsupportedBriefLanguageHits(text)).toEqual([]);
  });
});
