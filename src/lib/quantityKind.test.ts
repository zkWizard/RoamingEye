import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import { classifyQuantityKind, summarizeQuantityKinds } from "./quantityKind";

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

describe("classifyQuantityKind", () => {
  it("classifies each brief signal by its kinematic nature", () => {
    // NDVI is a bounded reflectance ratio — a dimensionless index.
    expect(classifyQuantityKind("vegetation")).toBe("dimensionless-index");
    // Precipitation rate (kg/m²/s) is a per-unit-time flux.
    expect(classifyQuantityKind("rainfall")).toBe("flux");
    // Soil-moisture storage and 2 m air temperature are physical states.
    expect(classifyQuantityKind("soil-moisture")).toBe("state");
    expect(classifyQuantityKind("air-temperature")).toBe("state");
  });

  it("returns unclassified for a signal id not in the table", () => {
    // The four-way union is exhaustive at compile time; the runtime guard still
    // covers a degenerate signal whose id escaped the union.
    expect(
      classifyQuantityKind("evapotranspiration" as EnvironmentSignalBrief["id"])
    ).toBe("unclassified");
  });
});

describe("summarizeQuantityKinds", () => {
  it("classifies every usable signal and flags the flux/state mix", () => {
    const summary = summarizeQuantityKinds(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("quantity-kind");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.kindCounts).toEqual({
      flux: 1,
      state: 2,
      "dimensionless-index": 1,
      unclassified: 0,
    });
    expect(summary.integrableSignalIds).toEqual(["rainfall"]);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesFluxAndState).toBe(true);
    expect(summary.statement).toBe(
      "4 usable observations: 1 flux, 2 state, 1 dimensionless-index; only rainfall is a time-integrable flux; the remaining state and index signals must not be summed or integrated over time."
    );
  });

  it("reports each signal's kind with source-carrying statements", () => {
    const summary = summarizeQuantityKinds(signalsFor(USABLE_INPUT));
    const byId = Object.fromEntries(summary.signals.map((s) => [s.id, s]));

    expect(byId.rainfall).toMatchObject({
      quantityKind: "flux",
      timeIntegrable: true,
    });
    expect(byId.rainfall.statement).toBe(
      "Rainfall (precipitation rate): per-unit-time flux (rate) (flux), time-integrable; source GLDAS_NOAH025_M v2.1."
    );
    expect(byId["soil-moisture"]).toMatchObject({
      quantityKind: "state",
      timeIntegrable: false,
    });
    expect(byId["soil-moisture"].statement).toBe(
      "Soil moisture: physical state (a level, not a rate) (state), not time-integrable; source GLDAS_NOAH025_M v2.1."
    );
    expect(byId.vegetation.statement).toBe(
      "Vegetation (NDVI): dimensionless index (dimensionless-index), not time-integrable; source MOD13A3 v061."
    );
    expect(byId["air-temperature"].statement).toBe(
      "Air temperature: physical state (a level, not a rate) (state), not time-integrable; source M2TMNXSLV v5.12.4."
    );
  });

  it("keeps rainfall and soil moisture (one GLDAS product) as different kinds", () => {
    // Quantity kind is a property of the variable, not the product: the two
    // GLDAS fields share a DOI yet split into flux and state.
    const summary = summarizeQuantityKinds(
      only(USABLE_INPUT, ["rainfall", "soil-moisture"])
    );

    expect(summary.consideredSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.kindCounts).toMatchObject({ flux: 1, state: 1 });
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesFluxAndState).toBe(true);
    expect(summary.statement).toBe(
      "2 usable observations: 1 flux, 1 state; only rainfall is a time-integrable flux; the remaining state and index signals must not be summed or integrated over time."
    );
  });

  it("reports a lone flux as fully time-integrable", () => {
    const summary = summarizeQuantityKinds(only(USABLE_INPUT, ["rainfall"]));

    expect(summary.integrableSignalIds).toEqual(["rainfall"]);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesFluxAndState).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation: 1 flux; all 1 classified is a per-unit-time flux, time-integrable to a period total."
    );
  });

  it("says none is time-integrable when no flux is present", () => {
    const summary = summarizeQuantityKinds(
      only(USABLE_INPUT, ["vegetation", "soil-moisture", "air-temperature"])
    );

    expect(summary.integrableSignalIds).toEqual([]);
    expect(summary.mixesFluxAndState).toBe(false);
    expect(summary.statement).toBe(
      "3 usable observations: 2 state, 1 dimensionless-index; none is a per-unit-time rate, so no value is time-integrable to a period total; these states and indices must not be summed over time."
    );
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

    const usable = summarizeQuantityKinds(signals);
    expect(usable.consideredSignalIds).not.toContain("rainfall");
    expect(usable.integrableSignalIds).toEqual([]);

    const all = summarizeQuantityKinds(signals, { include: "all" });
    expect(all.consideredSignalIds).toContain("rainfall");
    expect(all.integrableSignalIds).toEqual(["rainfall"]);
  });

  it("does not assert a kind for a signal absent from the table", () => {
    const unknownSignal: EnvironmentSignalBrief = {
      ...signalsFor(USABLE_INPUT)[0],
      id: "evapotranspiration" as EnvironmentSignalBrief["id"],
    };
    const summary = summarizeQuantityKinds([unknownSignal]);

    expect(summary.unclassifiedCount).toBe(1);
    expect(summary.integrableSignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesFluxAndState).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation: 1 unclassified; no considered signal is in the quantity-kind table, so their kind is not asserted. 1 unclassified signal not asserted."
    );
  });

  it("returns an empty, honest summary when no signals are usable", () => {
    const summary = summarizeQuantityKinds([]);

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.integrableSignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesFluxAndState).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to classify by quantity kind."
    );
  });

  it("keeps every statement free of unsupported inference language", () => {
    const summary = summarizeQuantityKinds(signalsFor(USABLE_INPUT));
    const text = [
      summary.statement,
      ...summary.signals.map((s) => s.statement),
      ...summary.limits,
    ].join(" ");

    expect(unsupportedBriefLanguageHits(text)).toEqual([]);
  });
});
