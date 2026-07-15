import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
} from "./environmentBrief";
import { MEASURED_INVERSION } from "./validation";
import {
  calibratedLayerWithRmse,
  inversionUncertaintyForLayer,
  summarizeBriefValueUncertainty,
} from "./briefValueUncertainty";

const AVAILABLE_THROUGH = { year: 2026, month: 3 };

/** Precipitation RMSE 20.36 mm/day converted to native kg/m²/s (÷ 86 400 s/day). */
const PRECIP_NATIVE_RMSE = 20.36 / 86_400;

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

describe("calibratedLayerWithRmse", () => {
  it("resolves calibrated layers with a measured RMSE", () => {
    expect(calibratedLayerWithRmse("soil")).toBe("soil");
    expect(calibratedLayerWithRmse("airtemp")).toBe("airtemp");
    expect(calibratedLayerWithRmse("precip")).toBe("precip");
  });

  it("returns null for uncharacterized or all-null layers", () => {
    // NDVI is a satellite-derived index, not a calibrated colormap-inverted layer.
    expect(calibratedLayerWithRmse("ndvi")).toBeNull();
    // LST inverts to no value at all (rmse === null), so it bounds nothing.
    expect(MEASURED_INVERSION.lst.rmse).toBeNull();
    expect(calibratedLayerWithRmse("lst")).toBeNull();
  });
});

describe("inversionUncertaintyForLayer", () => {
  it("returns the measured RMSE in native units when no conversion applies", () => {
    const soil = inversionUncertaintyForLayer("soil", "kg/m²");
    expect(soil).not.toBeNull();
    expect(soil!.reportedRmse).toBe(8.23);
    expect(soil!.reportedUnit).toBe("kg/m²");
    expect(soil!.nativeRmse).toBe(8.23);
    // 50 total colormap steps, 29 rejected as no-data → 21 recovered.
    expect(soil!.recoveredSteps).toBe(21);
    expect(soil!.totalSteps).toBe(50);
  });

  it("converts the reported-unit RMSE back into the native unit for precipitation", () => {
    const precip = inversionUncertaintyForLayer("precip", "kg/m²/s");
    expect(precip).not.toBeNull();
    // Published figure stays in the probe's reported unit.
    expect(precip!.reportedRmse).toBe(20.36);
    expect(precip!.reportedUnit).toBe("mm/day");
    // Band is dimensionally matched to the brief's native kg/m²/s value.
    expect(precip!.nativeRmse).toBeCloseTo(PRECIP_NATIVE_RMSE, 12);
    expect(precip!.recoveredSteps).toBe(27);
  });

  it("never invents an uncertainty for an uncharacterized layer", () => {
    expect(inversionUncertaintyForLayer("ndvi", "NDVI")).toBeNull();
  });
});

describe("summarizeBriefValueUncertainty", () => {
  it("attaches a native-unit band to each characterized signal's value", () => {
    const brief = briefWith({
      soilMoisture: obs(24),
      airTemperature: obs(290),
    });

    const summary = summarizeBriefValueUncertainty(brief.signals);
    expect(summary.characterizedCount).toBe(2);
    expect(summary.uncharacterizedCount).toBe(0);

    const soil = summary.signals.find((s) => s.id === "soil-moisture")!;
    expect(soil.status).toBe("characterized");
    expect(soil.observedValue).toBe(24);
    expect(soil.nativeRmse).toBe(8.23);
    expect(soil.lower).toBeCloseTo(24 - 8.23, 6);
    expect(soil.upper).toBeCloseTo(24 + 8.23, 6);
    expect(soil.statement).toContain("± 8.23 kg/m²");

    const air = summary.signals.find((s) => s.id === "air-temperature")!;
    expect(air.nativeRmse).toBe(18.95);
    expect(air.statement).toContain("290 ± 18.95 K");
  });

  it("surfaces the published reported-unit figure when the native unit differs", () => {
    const brief = briefWith({ rainfall: obs(0.00003) });
    const summary = summarizeBriefValueUncertainty(brief.signals);

    const precip = summary.signals.find((s) => s.id === "rainfall")!;
    expect(precip.reportedRmse).toBe(20.36);
    expect(precip.reportedUnit).toBe("mm/day");
    expect(precip.nativeRmse).toBeCloseTo(PRECIP_NATIVE_RMSE, 12);
    // Native band qualifies the kg/m²/s value; the mm/day figure stays traceable.
    expect(precip.statement).toContain("kg/m²/s");
    expect(precip.statement).toContain("published RMSE 20.36 mm/day");
  });

  it("reports NDVI as uncharacterized and never bounds it", () => {
    const brief = briefWith({ vegetation: obs(0.6) });
    const summary = summarizeBriefValueUncertainty(brief.signals);

    const veg = summary.signals.find((s) => s.id === "vegetation")!;
    expect(veg.status).toBe("uncharacterized");
    expect(veg.nativeRmse).toBeNull();
    expect(veg.lower).toBeNull();
    expect(veg.upper).toBeNull();
    expect(veg.statement).toContain("no characterized end-to-end");
    expect(summary.characterizedCount).toBe(0);
    expect(summary.uncharacterizedCount).toBe(1);
  });

  it("considers only available signals by default", () => {
    const brief = briefWith({
      soilMoisture: obs(24),
      airTemperature: obs(-5), // invalid Kelvin → not available
    });

    const summary = summarizeBriefValueUncertainty(brief.signals);
    expect(summary.consideredSignalIds).toEqual(["soil-moisture"]);
    expect(summary.characterizedCount).toBe(1);
  });

  it("classifies a characterized layer with no usable value under include:all", () => {
    // soilMoisture omitted → an unavailable soil signal (layer 'soil' is
    // characterized, but there is no value to bound).
    const brief = briefWith({ airTemperature: obs(290) });

    const all = summarizeBriefValueUncertainty(brief.signals, {
      include: "all",
    });
    const soil = all.signals.find((s) => s.id === "soil-moisture")!;
    expect(soil.status).toBe("characterized");
    expect(soil.observedValue).toBeNull();
    expect(soil.lower).toBeNull();
    expect(soil.reportedRmse).toBe(8.23);
    expect(soil.statement).toContain("no usable value to bound");
  });

  it("returns an honest empty summary when nothing is usable", () => {
    const summary = summarizeBriefValueUncertainty(briefWith({}).signals);
    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.characterizedCount).toBe(0);
    expect(summary.statement).toContain("No usable observations");
  });

  it("keeps every characterized band consistent with the measured table", () => {
    const brief = briefWith({
      rainfall: obs(0.00004),
      soilMoisture: obs(30),
      airTemperature: obs(285),
    });
    const summary = summarizeBriefValueUncertainty(brief.signals);

    for (const signal of summary.signals) {
      if (signal.status !== "characterized") continue;
      const cal = calibratedLayerWithRmse(signal.layerId)!;
      expect(signal.reportedRmse).toBe(MEASURED_INVERSION[cal].rmse);
      expect(signal.recoveredSteps).toBe(
        MEASURED_INVERSION[cal].total - MEASURED_INVERSION[cal].nulls
      );
    }
  });
});
