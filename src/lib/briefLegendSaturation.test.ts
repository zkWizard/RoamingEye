import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import {
  LEGEND_STEP,
  assessRangePosition,
  summarizeBriefLegendSaturation,
} from "./briefLegendSaturation";

const AVAILABLE_THROUGH = { year: 2026, month: 3 };

function obs(value: number, validFraction = 0.9): EnvironmentObservation {
  return { dataMonth: { year: 2026, month: 1 }, value, validFraction };
}

/** A brief where every supplied signal is dated 2026-01 (published, in-range). */
function briefWith(
  overrides: Partial<EnvironmentBriefInput>
): ReturnType<typeof composeEnvironmentBrief> {
  return composeEnvironmentBrief({
    vegetation: null,
    rainfall: null,
    soilMoisture: null,
    airTemperature: null,
    availableThrough: AVAILABLE_THROUGH,
    ...overrides,
  });
}

function signalOf(
  brief: ReturnType<typeof composeEnvironmentBrief>,
  id: EnvironmentSignalBrief["id"]
): EnvironmentSignalBrief {
  return brief.signals.find((s) => s.id === id)!;
}

describe("LEGEND_STEP", () => {
  it("is one 256-entry lookup-table step", () => {
    expect(LEGEND_STEP).toBeCloseTo(1 / 255, 12);
  });
});

describe("assessRangePosition", () => {
  it("places a mid-scale value in the interior with both bounds resolvable", () => {
    const soil = assessRangePosition(
      signalOf(briefWith({ soilMoisture: obs(24) }), "soil-moisture")
    );
    expect(soil.position).toBe("interior");
    expect(soil.saturated).toBe(false);
    expect(soil.scaleMin).toBe(0);
    expect(soil.scaleMax).toBe(50);
    expect(soil.reportedUnit).toBe("kg/m²");
    expect(soil.reportedValue).toBe(24);
    expect(soil.positionInScale).toBeCloseTo(24 / 50, 12);
    expect(soil.statement).toContain("inside the 0–50 kg/m² legend range");
  });

  it("flags a value pinned at the legend ceiling as a one-sided ceiling bound", () => {
    const soil = assessRangePosition(
      signalOf(briefWith({ soilMoisture: obs(50) }), "soil-moisture")
    );
    expect(soil.position).toBe("at-ceiling");
    expect(soil.saturated).toBe(true);
    expect(soil.positionInScale).toBe(1);
    expect(soil.statement).toContain("at the legend ceiling");
    expect(soil.statement).toContain("a ceiling");
    expect(soil.statement).toContain("may lie at or beyond");
  });

  it("flags a value pinned at the legend floor as a one-sided floor bound", () => {
    // A true soil-moisture zero sits at the bottom of the 0–50 kg/m² ramp.
    const soil = assessRangePosition(
      signalOf(briefWith({ soilMoisture: obs(0) }), "soil-moisture")
    );
    expect(soil.position).toBe("at-floor");
    expect(soil.saturated).toBe(true);
    expect(soil.positionInScale).toBe(0);
    expect(soil.statement).toContain("at the legend floor");
    expect(soil.statement).toContain("a floor");
  });

  it("reports a value above the ramp as above-range (outside the legend)", () => {
    // 320 K is a valid Kelvin but sits above the 220–310 K air-temp legend.
    const air = assessRangePosition(
      signalOf(briefWith({ airTemperature: obs(320) }), "air-temperature")
    );
    expect(air.position).toBe("above-range");
    expect(air.saturated).toBe(true);
    expect(air.positionInScale).toBeGreaterThan(1);
    expect(air.statement).toContain("above the legend's maximum");
  });

  it("converts a native-unit rate into the reported unit before placing it", () => {
    // 5.0e-4 kg/m²/s × 86 400 s/day = 43.2 mm/day → the top of the precip ramp.
    const precip = assessRangePosition(
      signalOf(briefWith({ rainfall: obs(5.0e-4) }), "rainfall")
    );
    expect(precip.reportedUnit).toBe("mm/day");
    expect(precip.scaleMax).toBe(43.2);
    expect(precip.reportedValue).toBeCloseTo(43.2, 9);
    expect(precip.positionInScale).toBeCloseTo(1, 9);
    expect(precip.position).toBe("at-ceiling");
  });

  it("keeps a mid-scale rate in the interior after conversion", () => {
    // 3.0e-5 kg/m²/s × 86 400 = 2.592 mm/day → interior of 0–43.2 mm/day.
    const precip = assessRangePosition(
      signalOf(briefWith({ rainfall: obs(3.0e-5) }), "rainfall")
    );
    expect(precip.reportedValue).toBeCloseTo(2.592, 9);
    expect(precip.position).toBe("interior");
    expect(precip.saturated).toBe(false);
  });

  it("range-characterizes NDVI even though value-uncertainty cannot bound it", () => {
    // A negative NDVI (water/snow) is valid [-1,1] but sits below the 0–1
    // vegetation legend — representable-range position keys off PROBE_SCALES,
    // which carries NDVI's calibrated range, unlike MEASURED_INVERSION.
    const veg = assessRangePosition(
      signalOf(briefWith({ vegetation: obs(-0.3) }), "vegetation")
    );
    expect(veg.position).toBe("below-range");
    expect(veg.saturated).toBe(true);
    expect(veg.scaleMin).toBe(0);
    expect(veg.scaleMax).toBe(1);
    expect(veg.positionInScale).toBeCloseTo(-0.3, 12);
    expect(veg.statement).toContain("below the legend's minimum");
    expect(veg.statement).toContain("a floor");
  });

  it("reports a considered signal with no usable value as no-value", () => {
    const air = assessRangePosition({
      id: "air-temperature",
      label: "Air temperature",
      layerId: "airtemp",
      source: signalOf(
        briefWith({ airTemperature: obs(290) }),
        "air-temperature"
      ).source,
      nativeUnit: "K",
      dataMonth: { year: 2026, month: 1 },
      coverage: {
        status: "no-data",
        validFraction: null,
        reason: "missing-value",
      },
      status: "no-data",
      observedValue: null,
      statement: "",
    });
    expect(air.position).toBe("no-value");
    expect(air.saturated).toBe(false);
    // The range is still surfaced even without a value to place.
    expect(air.scaleMin).toBe(220);
    expect(air.scaleMax).toBe(310);
    expect(air.reportedValue).toBeNull();
    expect(air.positionInScale).toBeNull();
    expect(air.statement).toContain("no usable value to place");
  });

  it("reports an uncalibrated layer as uncharacterized and never invents a range", () => {
    // 'terrain' is a fraction-of-scale layer (PROBE_SCALES.terrain.calibrated
    // === false), so it carries no trusted physical range.
    const base = signalOf(
      briefWith({ soilMoisture: obs(24) }),
      "soil-moisture"
    );
    const terrain = assessRangePosition({
      ...base,
      layerId: "terrain",
      observedValue: 0.5,
    });
    expect(terrain.position).toBe("uncharacterized");
    expect(terrain.saturated).toBe(false);
    expect(terrain.scaleMin).toBeNull();
    expect(terrain.scaleMax).toBeNull();
    expect(terrain.reportedUnit).toBeNull();
    expect(terrain.positionInScale).toBeNull();
    expect(terrain.statement).toContain("no trusted physical range");
  });
});

describe("summarizeBriefLegendSaturation", () => {
  it("counts saturated versus interior usable values", () => {
    const brief = briefWith({
      vegetation: obs(-0.3), // below-range (saturated)
      rainfall: obs(3.0e-5), // interior
      soilMoisture: obs(50), // at-ceiling (saturated)
      airTemperature: obs(290), // interior
    });

    const summary = summarizeBriefLegendSaturation(brief.signals);
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.saturatedCount).toBe(2);
    expect(summary.interiorCount).toBe(2);
    expect(summary.uncharacterizedCount).toBe(0);
    expect(summary.statement).toContain(
      "2 of 4 usable values sit at or beyond a legend extreme"
    );
  });

  it("states an all-interior brief plainly", () => {
    const brief = briefWith({
      soilMoisture: obs(24),
      airTemperature: obs(290),
    });
    const summary = summarizeBriefLegendSaturation(brief.signals);
    expect(summary.saturatedCount).toBe(0);
    expect(summary.statement).toContain(
      "All 2 usable values sit inside their legend's representable range"
    );
  });

  it("considers only available signals by default", () => {
    const brief = briefWith({
      soilMoisture: obs(24),
      airTemperature: obs(-5), // invalid Kelvin → not available
    });
    const summary = summarizeBriefLegendSaturation(brief.signals);
    expect(summary.consideredSignalIds).toEqual(["soil-moisture"]);
    expect(summary.signals).toHaveLength(1);
  });

  it("under include:all places every signal and marks unavailable ones no-value", () => {
    // Only air temperature is supplied; the other three are unavailable but
    // still described (they are all on calibrated layers).
    const brief = briefWith({ airTemperature: obs(290) });
    const summary = summarizeBriefLegendSaturation(brief.signals, {
      include: "all",
    });
    expect(summary.signals).toHaveLength(4);
    const soil = summary.signals.find((s) => s.id === "soil-moisture")!;
    expect(soil.position).toBe("no-value");
    expect(soil.scaleMax).toBe(50);
    const air = summary.signals.find((s) => s.id === "air-temperature")!;
    expect(air.position).toBe("interior");
  });

  it("returns an honest empty summary when nothing is usable", () => {
    const summary = summarizeBriefLegendSaturation(briefWith({}).signals);
    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.saturatedCount).toBe(0);
    expect(summary.interiorCount).toBe(0);
    expect(summary.statement).toBe(
      "No usable observations to place within a legend range."
    );
  });

  it("carries the honest method limits", () => {
    const summary = summarizeBriefLegendSaturation(
      briefWith({ soilMoisture: obs(24) }).signals
    );
    expect(summary.limits.length).toBeGreaterThanOrEqual(3);
    expect(summary.limits.join(" ")).toContain("one-sided bound");
    expect(summary.limits.join(" ")).toContain("PROBE_SCALES");
  });
});
