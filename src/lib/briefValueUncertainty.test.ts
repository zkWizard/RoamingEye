import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
} from "./environmentBrief";
import { MEASURED_INVERSION } from "./validation";
import {
  calibratedLayerWithRmse,
  characterizeLayerInversion,
  inversionUncertaintyForLayer,
  summarizeBriefValueUncertainty,
} from "./briefValueUncertainty";
import { COLORMAP_DOCS } from "./colormap";
import { LEGENDS } from "./legend";
import { PROBE_SCALES } from "./probe";
import { LAYERS, type LayerId } from "./timeline";

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
    // NDVI *is* colormap-inverted, but GIBS publishes no colormap document for
    // it, so there is no measured figure to bound with.
    expect(calibratedLayerWithRmse("ndvi")).toBeNull();
    expect(COLORMAP_DOCS).not.toHaveProperty("ndvi");
    // LST inverts to no value at all (rmse === null), so it bounds nothing.
    expect(MEASURED_INVERSION.lst.rmse).toBeNull();
    expect(calibratedLayerWithRmse("lst")).toBeNull();
  });
});

describe("characterizeLayerInversion", () => {
  it("characterizes the layers with a measured, non-null RMSE", () => {
    for (const layer of [
      "soil",
      "airtemp",
      "precip",
      "sst",
      "aerosol",
    ] as const) {
      const c = characterizeLayerInversion(layer);
      expect(c.status).toBe("characterized");
      expect(c.reason).toBeNull();
      expect(c.totalSteps).toBe(MEASURED_INVERSION[layer].total);
    }
  });

  it("separates a measured-but-unrecoverable layer from an unmeasured one", () => {
    // The defect this guards: LST and NDVI are epistemically opposite yet both
    // came out simply "uncharacterized" with the evidence discarded.
    const lst = characterizeLayerInversion("lst");
    expect(lst.reason).toBe("inversion-recovers-nothing");
    // The finding is retained rather than nulled out: 0 of 250 steps recovered.
    expect(lst.recoveredSteps).toBe(0);
    expect(lst.totalSteps).toBe(250);

    const ndvi = characterizeLayerInversion("ndvi");
    expect(ndvi.reason).toBe("unvalidated-inversion");
    // Never measured, so there is no recovery count to report.
    expect(ndvi.recoveredSteps).toBeNull();
    expect(ndvi.totalSteps).toBeNull();

    expect(lst.reason).not.toBe(ndvi.reason);
  });

  it("labels the ramp-inverted-but-unvalidated layers by that reason", () => {
    // Each is a gradient legend with a physically calibrated probe scale, so its
    // value is inverted exactly like soil moisture — only never validated.
    for (const layer of ["ndvi", "evi", "snow"] as const) {
      expect(LEGENDS[layer].kind).not.toBe("classes");
      expect(PROBE_SCALES[layer].calibrated).toBe(true);
      expect(COLORMAP_DOCS).not.toHaveProperty(layer);
      expect(characterizeLayerInversion(layer).reason).toBe(
        "unvalidated-inversion"
      );
    }
  });

  it("reads categorical and fraction-of-scale layers off their own evidence", () => {
    // Land cover has no ramp to invert at all.
    expect(LEGENDS.landcover.kind).toBe("classes");
    expect(characterizeLayerInversion("landcover").reason).toBe(
      "categorical-layer"
    );
    // Terrain inverts a ramp, but its scale carries no physical units.
    expect(PROBE_SCALES.terrain.calibrated).toBe(false);
    expect(characterizeLayerInversion("terrain").reason).toBe(
      "uncalibrated-scale"
    );
  });

  it("classifies every layer, and agrees with calibratedLayerWithRmse", () => {
    for (const layer of Object.keys(LAYERS) as LayerId[]) {
      const c = characterizeLayerInversion(layer);
      expect(c.status === "characterized").toBe(
        calibratedLayerWithRmse(layer) !== null
      );
      // reason is null exactly when characterized — no third state leaks out.
      expect(c.reason === null).toBe(c.status === "characterized");
    }
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

  it("says vegetation is unmeasured, not exempt from inversion error", () => {
    const brief = briefWith({ vegetation: obs(0.6) });
    const summary = summarizeBriefValueUncertainty(brief.signals);
    const veg = summary.signals.find((s) => s.id === "vegetation")!;

    expect(veg.uncharacterizedReason).toBe("unvalidated-inversion");
    // The statement must name the mechanism, so the reader cannot conclude the
    // value dodges the inversion error the bounded signals disclose.
    expect(veg.statement).toContain("inverting a sampled colour");
    expect(veg.statement).toContain("unmeasured, not absent");
    // Provenance still travels with it.
    expect(veg.statement).toContain(veg.source.shortName);

    // Counted as unbounded *and* as still-inverted, and the summary says so.
    expect(summary.unquantifiedInversionCount).toBe(1);
    expect(summary.statement).toContain("unquantified rather than absent");
  });

  it("never claims greater precision for an unbounded signal", () => {
    const brief = briefWith({ vegetation: obs(0.6), soilMoisture: obs(24) });
    const summary = summarizeBriefValueUncertainty(brief.signals);

    expect(summary.characterizedCount).toBe(1);
    expect(summary.unquantifiedInversionCount).toBe(1);
    expect(summary.statement).toContain("not a sign of greater precision");
    // The corrected limits must retire the "derived index" exemption wording and
    // keep the LST all-null finding on the record.
    const limits = summary.limits.join(" ");
    expect(limits).toContain("not exempt by virtue of being a derived index");
    expect(limits).toContain("0 of 250 colormap steps");
  });

  it("keeps a characterized signal's reason null", () => {
    const brief = briefWith({ soilMoisture: obs(24) });
    const summary = summarizeBriefValueUncertainty(brief.signals);
    const soil = summary.signals.find((s) => s.id === "soil-moisture")!;

    expect(soil.status).toBe("characterized");
    expect(soil.uncharacterizedReason).toBeNull();
    expect(summary.unquantifiedInversionCount).toBe(0);
    expect(summary.statement).not.toContain("unquantified rather than absent");
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
