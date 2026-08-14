import { describe, it, expect } from "vitest";
import {
  inversionAccuracyClause,
  inversionAccuracyCsvHeaders,
  probeInversionAccuracy,
} from "./probeInversionAccuracy";
import { MEASURED_INVERSION } from "./validation";
import { PROBE_SCALES, quantizationStep } from "./probe";
import { COLORMAP_DOCS, type CalibratedLayerId } from "./colormap";

const CALIBRATED = Object.keys(COLORMAP_DOCS) as CalibratedLayerId[];

describe("probeInversionAccuracy", () => {
  it("reports sea-surface temperature's committed figure in °C", () => {
    const a = probeInversionAccuracy("sst");
    expect(a.status).toBe("characterized");
    expect(a.rmse).toBe(MEASURED_INVERSION.sst.rmse);
    expect(a.unit).toBe("°C");
    // Recalibrated 2026-08-11 (#736): the rebuilt legend reads the whole ramp.
    expect(a.rejectedColours).toBe(0);
    expect(a.totalColours).toBe(213);
    expect(a.rejectedFraction).toBe(0);
  });

  /**
   * The reason this module exists: the panel's quantization figure is a floor,
   * not an error bar. Even after the SST recalibration the measured RMSE is
   * an order of magnitude above the half-step, so the extra clause still
   * carries information — pin the gap rather than assume it.
   */
  it("SST inversion error dwarfs the quantization step the panel quotes", () => {
    const half = quantizationStep(PROBE_SCALES.sst) / 2;
    const rmse = MEASURED_INVERSION.sst.rmse as number;
    expect(half).toBeCloseTo(0.0627, 3);
    expect(rmse / half).toBeGreaterThan(10);
  });

  it("every calibrated layer resolves to a measured figure", () => {
    for (const layer of CALIBRATED) {
      const a = probeInversionAccuracy(layer);
      expect(a.status, layer).not.toBe("uncharacterized");
      expect(a.totalColours, layer).toBe(MEASURED_INVERSION[layer].total);
    }
  });

  it("never invents a figure for an unvalidated layer", () => {
    // EVI is read by inverting the display gradient like NDVI, but GIBS's
    // MODIS_L3_EVI ramp contains pure black — also an undrawn tile pixel — so
    // it cannot be calibrated; absence of a measurement must not render as
    // accuracy.
    const a = probeInversionAccuracy("evi");
    expect(a.status).toBe("uncharacterized");
    expect(a.rmse).toBeNull();
    expect(a.rejectedColours).toBeNull();
    expect(a.rejectedFraction).toBeNull();
    expect(inversionAccuracyClause(a)).toBe("");
    expect(inversionAccuracyCsvHeaders(a)).toEqual([]);
  });

  it("reports an all-rejected ramp as its own state, not a small error", () => {
    // LST held this state — its hand-drawn gradient missed GIBS's rainbow so
    // completely that none of the 250 colours inverted — until the legend was
    // rebuilt on 2026-08-13. No live layer rejects a ramp now, so synthesize
    // the state to keep the "no RMSE is not RMSE 0" contract covered.
    const a = {
      layerId: "lst" as const,
      status: "all-colours-rejected" as const,
      rmse: null,
      unit: "K",
      rejectedColours: 250,
      totalColours: 250,
      rejectedFraction: 1,
      quantizationText: "",
    };
    expect(inversionAccuracyClause(a)).toContain("unvalidated");
    expect(inversionAccuracyClause(a)).not.toMatch(/±/);
    expect(inversionAccuracyCsvHeaders(a).join(" ")).not.toMatch(/RMSE ±/);
  });

  it("reports LST's rebuilt ramp as a measured figure in kelvin", () => {
    // The regression guard for the 2026-08-13 recalibration: LST is the layer
    // that used to recover nothing, so a silent revert would show up here.
    const a = probeInversionAccuracy("lst");
    expect(a.status).toBe("characterized");
    expect(a.rmse).toBe(MEASURED_INVERSION.lst.rmse);
    expect(a.unit).toBe("K");
    expect(a.rejectedColours).toBe(0);
    expect(a.totalColours).toBe(250);
    expect(inversionAccuracyClause(a)).toContain("K");
    expect(inversionAccuracyClause(a)).not.toContain("unreadable");
  });
});

describe("inversionAccuracyClause", () => {
  it("states the SST band without an unreadable share now the ramp inverts", () => {
    const clause = inversionAccuracyClause(probeInversionAccuracy("sst"));
    expect(clause).toBe("±1.0 °C vs GIBS colormap");
    expect(clause).not.toContain("unreadable");
  });

  it("states the unreadable share when a ramp rejects colours", () => {
    // Soil moisture inverted only 21 of 50 colours before its 2026-08-12
    // recalibration; synthesize that state to keep the clause shape covered
    // now that no live layer rejects a partial ramp.
    const clause = inversionAccuracyClause({
      layerId: "soil",
      status: "characterized",
      rmse: 8.23,
      unit: "kg/m²",
      rejectedColours: 29,
      totalColours: 50,
      rejectedFraction: 29 / 50,
      quantizationText: "",
    });
    expect(clause).toBe("±8.2 kg/m² vs GIBS colormap, 58% of ramp unreadable");
  });

  it("omits the unreadable share when the ramp fully inverts", () => {
    // Aerosol rejects nothing; a "0% unreadable" clause would be noise.
    const clause = inversionAccuracyClause(probeInversionAccuracy("aerosol"));
    expect(clause).toBe("±0.13 vs GIBS colormap");
    expect(clause).not.toContain("unreadable");
  });

  it("carries the layer's reported unit, not the source unit", () => {
    // Precipitation's RMSE is already stored post-conversion (mm/day). A
    // second conversion here would scale the error twice.
    const a = probeInversionAccuracy("precip");
    expect(a.rmse).toBe(0.27);
    expect(inversionAccuracyClause(a)).toContain("mm/day");
  });
});

describe("inversionAccuracyCsvHeaders", () => {
  it("emits comment lines that carry no CSV delimiter or newline", () => {
    // Naive consumers read `#` lines as rows; the repo's header discipline is
    // that a header line never contains a delimiter, quote, or line break.
    for (const layer of CALIBRATED) {
      for (const line of inversionAccuracyCsvHeaders(
        probeInversionAccuracy(layer)
      )) {
        expect(line.startsWith("# "), `${layer}: ${line}`).toBe(true);
        expect(line, layer).not.toMatch(/[,"\r\n]/);
      }
    }
  });

  it("cites where the figure comes from and bounds what it covers", () => {
    const headers = inversionAccuracyCsvHeaders(probeInversionAccuracy("sst"));
    expect(headers).toHaveLength(3);
    expect(headers[0]).toContain("RMSE ±1.0 °C");
    expect(headers[0]).toContain("0 of 213 ramp colours rejected");
    expect(headers[0]).toContain("docs/validation.md");
    // The scope line is load-bearing: this is rendering-inversion error, not
    // the L3 product's accuracy against in-situ measurement.
    expect(headers[1]).toContain("rendering-inversion error only");
    expect(headers[1]).toContain("in-situ");
  });

  /**
   * `validateInversion` feeds GIBS's published `entry.rgb` straight into the
   * production inversion, so `MEASURED_INVERSION` is a transport-free figure —
   * while the probe samples imagery GIBS serves as JPEG. The compression
   * therefore adds error on top of the RMSE rather than being contained by it,
   * and `probe.accuracy.test.ts` bounds that component separately. The CSV
   * already tells the reader compression sits on top of the much smaller
   * quantization figure; the RMSE is the number an analysis will actually use
   * as an error bar, so it must not be left reading as end-to-end.
   */
  it("says the measured RMSE excludes the JPEG transport it is sampled over", () => {
    for (const layer of CALIBRATED) {
      const accuracy = probeInversionAccuracy(layer);
      if (accuracy.status !== "characterized") continue;
      const transport = inversionAccuracyCsvHeaders(accuracy).find((line) =>
        line.startsWith("# inversion_validation_transport:")
      );
      expect(transport, layer).toBeDefined();
      expect(transport, layer).toContain("JPEG");
      // "on top of" not "within": the two components add, and a reader must
      // not take the RMSE as already absorbing the compression.
      expect(transport, layer).toContain("on top of this figure");
    }
  });

  it("claims no transport-excluded RMSE for a ramp that inverted nothing", () => {
    // No RMSE exists in that state, so there is no figure for the transport
    // caveat to qualify — emitting one would imply a measurement.
    const rejected = {
      layerId: "lst" as const,
      status: "all-colours-rejected" as const,
      rmse: null,
      unit: "K",
      rejectedColours: 250,
      totalColours: 250,
      rejectedFraction: 1,
      quantizationText: "",
    };
    expect(inversionAccuracyCsvHeaders(rejected).join(" ")).not.toContain(
      "inversion_validation_transport"
    );
  });
});
