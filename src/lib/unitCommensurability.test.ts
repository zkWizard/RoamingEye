import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import { summarizeUnitCommensurability } from "./unitCommensurability";

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

describe("summarizeUnitCommensurability", () => {
  it("reports the four signals as fully incommensurable (all distinct units)", () => {
    const summary = summarizeUnitCommensurability(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("unit-commensurability");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    // NDVI (unitless), kg/m²/s, kg/m², K — every signal is its own unit.
    expect(summary.distinctUnits).toBe(4);
    expect(summary.comparableGroups).toHaveLength(0);
    expect(summary.allIncommensurable).toBe(true);
    expect(summary.groups.map((g) => g.unit)).toEqual([
      "NDVI (unitless)",
      "kg/m²/s",
      "kg/m²",
      "K",
    ]);
    expect(summary.statement).toBe(
      "4 usable observations in 4 distinct native units (NDVI (unitless), kg/m²/s, kg/m², K); no two signals share a unit, so none are dimensionally comparable and they must not be combined into a single index."
    );
  });

  it("only considers usable observations by default", () => {
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      soilMoisture: null,
      airTemperature: {
        dataMonth: { year: 2026, month: 1 },
        value: null,
        validFraction: 0.5,
      },
    };
    const summary = summarizeUnitCommensurability(signalsFor(input));

    // soil moisture is unavailable, air temperature is no-data → only two left.
    expect(summary.consideredSignalIds).toEqual(["vegetation", "rainfall"]);
    expect(summary.distinctUnits).toBe(2);
    expect(summary.allIncommensurable).toBe(true);
  });

  it("describes the whole unit basis when include is 'all'", () => {
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      soilMoisture: null,
    };
    const summary = summarizeUnitCommensurability(signalsFor(input), {
      include: "all",
    });

    // The unavailable soil-moisture signal still carries its native unit.
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.distinctUnits).toBe(4);
  });

  it("flags two signals that share a native unit as dimensionally comparable", () => {
    // Force two signals onto one unit to exercise the shared-unit branch,
    // which the four real products never trigger (all four units differ).
    const signals: EnvironmentSignalBrief[] = signalsFor(USABLE_INPUT).map(
      (signal) =>
        signal.id === "soil-moisture" ? { ...signal, nativeUnit: "K" } : signal
    );
    const summary = summarizeUnitCommensurability(signals);

    expect(summary.distinctUnits).toBe(3);
    expect(summary.allIncommensurable).toBe(false);
    expect(summary.comparableGroups).toHaveLength(1);
    expect(summary.comparableGroups[0]).toMatchObject({
      unit: "K",
      signalIds: ["soil-moisture", "air-temperature"],
    });
    expect(summary.statement).toBe(
      "4 usable observations in 3 distinct native units (NDVI (unitless), kg/m²/s, K); soil-moisture, air-temperature share K — only same-unit signals are dimensionally comparable, and even those are reported separately, not combined."
    );
  });

  it("trims surrounding whitespace so the same unit is never split", () => {
    const signals: EnvironmentSignalBrief[] = signalsFor(USABLE_INPUT).map(
      (signal) =>
        signal.id === "air-temperature"
          ? { ...signal, nativeUnit: "  K  " }
          : signal.id === "soil-moisture"
            ? { ...signal, nativeUnit: "K" }
            : signal
    );
    const summary = summarizeUnitCommensurability(signals);

    const kelvinGroup = summary.groups.find((g) => g.unit === "K");
    expect(kelvinGroup?.signalIds).toEqual([
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.distinctUnits).toBe(3);
  });

  it("is not applicable to a single usable signal", () => {
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      rainfall: null,
      soilMoisture: null,
      airTemperature: null,
    };
    const summary = summarizeUnitCommensurability(signalsFor(input));

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.allIncommensurable).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation in NDVI (unitless); unit commensurability is not applicable to a single signal."
    );
  });

  it("handles a brief with no usable observations", () => {
    const summary = summarizeUnitCommensurability(
      signalsFor({
        vegetation: null,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
        availableThrough: { year: 2026, month: 3 },
      })
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.groups).toEqual([]);
    expect(summary.allIncommensurable).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to assess for unit commensurability."
    );
  });

  it("keeps every considered signal — none silently dropped", () => {
    const summary = summarizeUnitCommensurability(signalsFor(USABLE_INPUT));
    const grouped = summary.groups.flatMap((g) => g.signalIds);
    expect(grouped).toHaveLength(summary.consideredSignalIds.length);
    expect(new Set(grouped)).toEqual(new Set(summary.consideredSignalIds));
  });
});
