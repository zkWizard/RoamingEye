import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  findInversionBlindSpots,
  MEASURED_BLIND_SPOTS,
  MIN_BLIND_SPAN_SHARE,
} from "./inversionBlindSpots";
import { MEASURED_INVERSION } from "./validation";
import { COLORMAP_DOCS, type CalibratedLayerId } from "./colormap";
import type { ColormapEntry } from "./colormap";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { buildColormapLut } from "./probe";

/**
 * Synthetic ramps are built from a layer's own legend LUT so "this colour
 * inverts" is true by construction, and rejected colours are a hue the gradient
 * cannot contain. Using `aerosol` (a full-range gradient with no scale
 * conversion) keeps values in the colormap's own units.
 */
const LUTS = new Map<CalibratedLayerId, ReturnType<typeof buildColormapLut>>();

/** A colour on `layer`'s own gradient, at position `t` along it. */
function onRamp(layer: CalibratedLayerId, t: number): ColormapEntry["rgb"] {
  let lut = LUTS.get(layer);
  if (!lut) {
    lut = buildColormapLut((LEGENDS[layer] as GradientLegendSpec).stops);
    LUTS.set(layer, lut);
  }
  return lut[Math.round(t * (lut.length - 1))];
}

/** Magenta: far from every stop on the aerosol ramp, so it inverts to null. */
const OFF_RAMP = { r: 255, g: 0, b: 255 };

/**
 * Build a ramp of `n` entries with values 0..n-1, where indices in `reject`
 * carry the off-ramp colour and every other entry carries a real ramp colour
 * from `layer`'s own gradient.
 */
function ramp(
  n: number,
  reject: number[],
  layer: CalibratedLayerId = "aerosol"
): ColormapEntry[] {
  const rejected = new Set(reject);
  return Array.from({ length: n }, (_, i) => ({
    value: i,
    rgb: rejected.has(i) ? OFF_RAMP : onRamp(layer, i / (n - 1)),
  }));
}

describe("findInversionBlindSpots", () => {
  it("reports no blind spot when every ramp colour inverts", () => {
    const result = findInversionBlindSpots("aerosol", ramp(20, []));

    expect(result.shape).toBe("none");
    expect(result.recovered).toBe(20);
    expect(result.rejected).toBe(0);
    expect(result.recoveredFraction).toBe(1);
    expect(result.spans).toEqual([]);
    expect(result.widest).toBeNull();
    expect(result.truncatesRange).toBe(false);
    expect(result.survivorOnlyRmse).toBe(false);
    expect(result.statement).toContain("speaks for the whole ramp");
  });

  it("reports a total blind spot when nothing inverts", () => {
    const result = findInversionBlindSpots(
      "aerosol",
      ramp(20, [...Array(20).keys()])
    );

    expect(result.shape).toBe("total");
    expect(result.recovered).toBe(0);
    expect(result.recoveredFraction).toBe(0);
    expect(result.spans).toHaveLength(1);
    // No RMSE exists to be survivor-only when nothing was recovered.
    expect(result.survivorOnlyRmse).toBe(false);
    expect(result.statement).toContain("whole value range is unreadable");
  });

  it("locates an interior hole in the layer's own units", () => {
    // Values 4..12 of a 0..19 ramp: 42% of the span, both ends readable.
    const reject = [4, 5, 6, 7, 8, 9, 10, 11, 12];
    const result = findInversionBlindSpots("aerosol", ramp(20, reject));

    expect(result.shape).toBe("interior");
    expect(result.truncatesRange).toBe(false);
    expect(result.survivorOnlyRmse).toBe(true);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({
      lo: 4,
      hi: 12,
      entries: 9,
      atLowEnd: false,
      atHighEnd: false,
    });
    expect(result.spans[0].valueShare).toBeCloseTo(8 / 19, 6);
    expect(result.statement).toContain("interior value range is unreadable");
  });

  it("flags a run reaching a ramp end as truncating the readable range", () => {
    const result = findInversionBlindSpots(
      "aerosol",
      ramp(20, [0, 1, 2, 3, 4])
    );

    expect(result.shape).toBe("end-truncated");
    expect(result.truncatesRange).toBe(true);
    expect(result.spans[0]).toMatchObject({ atLowEnd: true, atHighEnd: false });
    expect(result.statement).toContain("observed extreme is censored");
  });

  it("prefers end truncation over an interior hole when both are present", () => {
    // A wide interior hole (5..12) plus a narrow run at the high end.
    const result = findInversionBlindSpots(
      "aerosol",
      ramp(20, [5, 6, 7, 8, 9, 10, 11, 12, 17, 18, 19])
    );

    expect(result.spans).toHaveLength(2);
    expect(result.shape).toBe("end-truncated");
    // The widest span is still reported honestly — it is the interior one.
    expect(result.widest).toMatchObject({ lo: 5, hi: 12, atHighEnd: false });
  });

  it("calls sub-threshold rejections scattered rather than a span", () => {
    // Isolated single entries: each run has zero width, well under the floor.
    const result = findInversionBlindSpots("aerosol", ramp(40, [7, 19, 31]));

    expect(result.shape).toBe("scattered");
    expect(result.spans).toHaveLength(3);
    expect(result.spans.every((s) => s.valueShare < MIN_BLIND_SPAN_SHARE)).toBe(
      true
    );
    expect(result.truncatesRange).toBe(false);
    // Scatter still leaves the RMSE conditional on the colours that survived.
    expect(result.survivorOnlyRmse).toBe(true);
    expect(result.statement).toContain("scattered rather than banded");
  });

  it("orders spans by value even when entries arrive out of order", () => {
    const shuffled = [...ramp(20, [2, 3, 15, 16])].reverse();
    const result = findInversionBlindSpots("aerosol", shuffled);

    expect(result.spans.map((s) => [s.lo, s.hi])).toEqual([
      [2, 3],
      [15, 16],
    ]);
  });

  it("does not mutate the caller's entries", () => {
    const entries = ramp(8, [3]);
    const snapshot = entries.map((e) => e.value);

    findInversionBlindSpots("aerosol", entries);

    expect(entries.map((e) => e.value)).toEqual(snapshot);
  });

  it("converts spans into the probe's reported unit for precipitation", () => {
    // GLDAS stores kg/m²/s; the probe reports mm/day (× 86 400).
    const entries: ColormapEntry[] = [
      { value: 0, rgb: onRamp("precip", 0) },
      { value: 1e-5, rgb: OFF_RAMP },
      { value: 2e-5, rgb: OFF_RAMP },
      { value: 3e-5, rgb: onRamp("precip", 1) },
    ];
    const result = findInversionBlindSpots("precip", entries);

    expect(result.unit).toBe("mm/day");
    expect(result.spans[0].lo).toBeCloseTo(0.864, 6);
    expect(result.spans[0].hi).toBeCloseTo(1.728, 6);
    expect(result.statement).toContain("mm/day");
  });

  it("keeps the supplied unit only where no scale conversion applies", () => {
    const converted = findInversionBlindSpots(
      "precip",
      ramp(8, [3], "precip"),
      {
        unit: "kg/m²/s",
      }
    );
    const unconverted = findInversionBlindSpots("soil", ramp(8, [3], "soil"), {
      unit: "kg/m²",
    });

    // A converted layer must never be labelled with its storage unit.
    expect(converted.unit).toBe("mm/day");
    expect(unconverted.unit).toBe("kg/m²");
  });

  it("returns an explicitly unassessed result for an empty ramp", () => {
    const result = findInversionBlindSpots("aerosol", []);

    expect(result.total).toBe(0);
    expect(result.spans).toEqual([]);
    expect(result.widest).toBeNull();
    expect(result.survivorOnlyRmse).toBe(false);
    expect(result.statement).toContain("not characterized");
  });

  it("always carries its method limits", () => {
    const result = findInversionBlindSpots("aerosol", ramp(20, [4, 5, 6]));

    expect(result.limits.length).toBeGreaterThan(0);
    expect(result.limits.join(" ")).toContain("bin midpoints");
    expect(result.limits.join(" ")).toContain("legend gradient fails");
  });
});

describe("MEASURED_BLIND_SPOTS", () => {
  const layers = Object.keys(COLORMAP_DOCS) as CalibratedLayerId[];

  it("covers every calibrated layer", () => {
    expect(Object.keys(MEASURED_BLIND_SPOTS).sort()).toEqual(
      [...layers].sort()
    );
  });

  /**
   * The integrity check that keeps the two committed tables honest: a legend
   * recalibration changes both the RMSE and the recovered count, so updating
   * `MEASURED_INVERSION` alone must fail here rather than leave a stale
   * blind-spot figure in the docs.
   */
  it("agrees with MEASURED_INVERSION on how many colours invert", () => {
    for (const layer of layers) {
      const measured = MEASURED_INVERSION[layer];
      expect(
        MEASURED_BLIND_SPOTS[layer].total,
        `${layer} entry count disagrees with MEASURED_INVERSION`
      ).toBe(measured.total);
      expect(
        MEASURED_BLIND_SPOTS[layer].recovered,
        `${layer} recovered count disagrees with MEASURED_INVERSION (re-measure blind spots after a legend change)`
      ).toBe(measured.total - measured.nulls);
    }
  });

  it("declares a shape consistent with its own recovered count", () => {
    for (const layer of layers) {
      const { shape, recovered, total, widest } = MEASURED_BLIND_SPOTS[layer];
      if (shape === "none") {
        expect(recovered, `${layer}`).toBe(total);
        expect(widest, `${layer} has no blind span to bound`).toBeNull();
      } else if (shape === "total") {
        expect(recovered, `${layer}`).toBe(0);
      } else {
        expect(recovered, `${layer}`).toBeGreaterThan(0);
        expect(recovered, `${layer}`).toBeLessThan(total);
      }
      if (widest) expect(widest.hi, `${layer}`).toBeGreaterThan(widest.lo);
    }
  });

  /**
   * The point of the whole module: a layer whose RMSE is quoted in the docs and
   * attached to brief values must not be silently survivor-only.
   */
  it("marks every layer with a published RMSE and rejected colours", () => {
    const survivorOnly = layers.filter(
      (layer) =>
        MEASURED_INVERSION[layer].rmse !== null &&
        MEASURED_BLIND_SPOTS[layer].shape !== "none"
    );

    // Rebuilt from GIBS's own ramps (#717, #713, #736, #753), every layer
    // with a published RMSE now reads its whole ramp — nothing is
    // survivor-only. LST recovers nothing, so it publishes no RMSE at all.
    expect(survivorOnly).toEqual([]);
  });
});

/**
 * Drift guard for METHODS.md §3, in the same spirit as the RMSE table's guard
 * in methods-doc.test.ts: the handbook quotes the blind-span bounds measured
 * here, so a legend recalibration that moves a span fails until the handbook is
 * updated. Otherwise the published "where the probe is blind" figures rot away
 * from the code that measures them.
 */
describe("METHODS.md §3 blind-spot table", () => {
  const methods = readFileSync(
    new URL("../../METHODS.md", import.meta.url),
    "utf8"
  );

  /** How METHODS.md renders a span (kept identical to the §3 table). */
  function shownSpan(widest: { lo: number; hi: number; unit: string }): string {
    const dp = (n: number) => (Math.round(n * 10) / 10).toString();
    return `${dp(widest.lo)}–${dp(widest.hi)} ${widest.unit}`;
  }

  it("quotes every calibrated layer's measured shape and widest span", () => {
    for (const [layer, measured] of Object.entries(MEASURED_BLIND_SPOTS) as [
      CalibratedLayerId,
      (typeof MEASURED_BLIND_SPOTS)[CalibratedLayerId],
    ][]) {
      expect(
        methods.includes(measured.shape),
        `METHODS.md §3 is missing the ${layer} blind-spot shape "${measured.shape}"`
      ).toBe(true);
      if (!measured.widest) continue;
      expect(
        methods.includes(shownSpan(measured.widest)),
        `METHODS.md §3 is missing the ${layer} blind span "${shownSpan(measured.widest)}" — re-measure and update the table`
      ).toBe(true);
    }
  });

  it("states the survivor-only reading the shapes imply", () => {
    expect(methods).toContain("survivor-only");
    expect(methods).toContain("src/lib/inversionBlindSpots.ts");
    // The load-bearing honesty: a censored extreme is not an observation.
    expect(methods).toContain("censoring artefact");
  });
});
