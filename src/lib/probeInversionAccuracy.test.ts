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
    expect(a.rejectedColours).toBe(85);
    expect(a.totalColours).toBe(213);
    expect(a.rejectedFraction).toBeCloseTo(85 / 213, 6);
  });

  /**
   * The reason this module exists: the panel's quantization figure is a floor,
   * not an error bar. If the two ever converge, the extra clause is noise and
   * the wiring should be revisited — so pin the gap rather than assume it.
   */
  it("SST inversion error dwarfs the quantization step the panel quotes", () => {
    const half = quantizationStep(PROBE_SCALES.sst) / 2;
    const rmse = MEASURED_INVERSION.sst.rmse as number;
    expect(half).toBeCloseTo(0.0627, 3);
    expect(rmse / half).toBeGreaterThan(50);
  });

  it("every calibrated layer resolves to a measured figure", () => {
    for (const layer of CALIBRATED) {
      const a = probeInversionAccuracy(layer);
      expect(a.status, layer).not.toBe("uncharacterized");
      expect(a.totalColours, layer).toBe(MEASURED_INVERSION[layer].total);
    }
  });

  it("never invents a figure for an unvalidated layer", () => {
    // NDVI is a satellite-derived index, not one of the colormap-validated
    // layers; absence of a measurement must not render as accuracy.
    const a = probeInversionAccuracy("ndvi");
    expect(a.status).toBe("uncharacterized");
    expect(a.rmse).toBeNull();
    expect(a.rejectedColours).toBeNull();
    expect(a.rejectedFraction).toBeNull();
    expect(inversionAccuracyClause(a)).toBe("");
    expect(inversionAccuracyCsvHeaders(a)).toEqual([]);
  });

  it("reports an all-rejected ramp as its own state, not a small error", () => {
    // LST's display gradient misses GIBS's cold-end hues entirely, so no
    // colour inverts. "No RMSE" must never be shown as "RMSE 0".
    const a = probeInversionAccuracy("lst");
    expect(a.status).toBe("all-colours-rejected");
    expect(a.rmse).toBeNull();
    expect(inversionAccuracyClause(a)).toContain("unvalidated");
    expect(inversionAccuracyClause(a)).not.toMatch(/±/);
    expect(inversionAccuracyCsvHeaders(a).join(" ")).not.toMatch(/RMSE ±/);
  });
});

describe("inversionAccuracyClause", () => {
  it("states the SST band and the unreadable share", () => {
    const clause = inversionAccuracyClause(probeInversionAccuracy("sst"));
    expect(clause).toBe("±5.1 °C vs GIBS colormap, 40% of ramp unreadable");
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
    expect(a.rmse).toBe(20.36);
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
    expect(headers).toHaveLength(2);
    expect(headers[0]).toContain("RMSE ±5.1 °C");
    expect(headers[0]).toContain("85 of 213 ramp colours rejected");
    expect(headers[0]).toContain("docs/validation.md");
    // The scope line is load-bearing: this is rendering-inversion error, not
    // the L3 product's accuracy against in-situ measurement.
    expect(headers[1]).toContain("rendering-inversion error only");
    expect(headers[1]).toContain("in-situ");
  });
});
