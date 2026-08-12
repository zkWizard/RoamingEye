import { describe, it, expect } from "vitest";
import {
  GLDAS_RAMP_SATURATION,
  GLDAS_RAMP_SATURATION_LIMITATIONS,
  classifyGldasRampSample,
  summarizeGldasRampSaturation,
  type GldasRampLayerId,
  type GldasRampSamplePosition,
} from "./gldasRampSaturation";
import { COLORMAP_DOCS, type ColormapEntry } from "./colormap";
import { invertColormapEntries, NO_DATA_DISTANCE, PROBE_SCALES } from "./probe";

/**
 * The 50 finite swatches GIBS publishes on the continuous legend of both GLDAS
 * water-cycle colormaps, in ramp order (read from the live documents,
 * 2026-08-11). The two layers share this palette; only the values differ, and
 * classification reads colour alone. Pinning the whole ramp — not a sample of it
 * — is what makes the "the caps are out of reach" guard below exact.
 */
const RETAINED_RGB: readonly (readonly [number, number, number])[] = [
  [213, 62, 79],
  [217, 68, 77],
  [221, 75, 75],
  [226, 82, 73],
  [230, 88, 72],
  [235, 95, 70],
  [239, 102, 68],
  [244, 109, 67],
  [245, 118, 71],
  [246, 127, 75],
  [247, 136, 79],
  [249, 146, 84],
  [250, 155, 88],
  [251, 164, 92],
  [253, 174, 97],
  [253, 181, 103],
  [253, 188, 108],
  [253, 195, 114],
  [253, 202, 121],
  [253, 209, 126],
  [253, 216, 132],
  [254, 224, 139],
  [250, 227, 140],
  [247, 229, 142],
  [243, 233, 144],
  [240, 236, 146],
  [236, 239, 148],
  [233, 242, 150],
  [230, 245, 152],
  [221, 241, 153],
  [213, 238, 155],
  [204, 234, 157],
  [196, 231, 158],
  [187, 227, 160],
  [179, 224, 162],
  [171, 221, 164],
  [161, 217, 164],
  [151, 213, 164],
  [141, 209, 164],
  [131, 205, 164],
  [121, 201, 164],
  [111, 197, 164],
  [102, 194, 165],
  [94, 185, 168],
  [87, 177, 171],
  [79, 169, 175],
  [72, 160, 178],
  [64, 152, 182],
  [57, 144, 185],
  [50, 136, 189],
];

/** The retained entries as the place panel loads them, valued by bin midpoint. */
function retainedEntries(binWidth: number): ColormapEntry[] {
  return RETAINED_RGB.map(([r, g, b], index) => ({
    rgb: { r, g, b },
    value: (index + 0.5) * binWidth,
  }));
}

const SOIL_ENTRIES = retainedEntries(1);
const PRECIP_ENTRIES = retainedEntries(1e-5);

const LAYERS: readonly [GldasRampLayerId, ColormapEntry[]][] = [
  ["precip", PRECIP_ENTRIES],
  ["soil", SOIL_ENTRIES],
];

function distance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

describe("GLDAS ramp saturation facts", () => {
  it("keeps each layer pinned to its own GIBS colormap document", () => {
    expect(GLDAS_RAMP_SATURATION.precip.colormapDocument).toBe(
      COLORMAP_DOCS.precip
    );
    expect(GLDAS_RAMP_SATURATION.soil.colormapDocument).toBe(
      COLORMAP_DOCS.soil
    );
  });

  it("matches the retained ramp the parser actually yields", () => {
    for (const [layerId, entries] of LAYERS) {
      const facts = GLDAS_RAMP_SATURATION[layerId];
      expect(entries).toHaveLength(facts.retainedSwatchCount);
      // The two dropped caps are exactly the difference.
      expect(facts.publishedSwatchCount - facts.retainedSwatchCount).toBe(2);
    }
  });

  it("agrees with the probe scale on the representable window", () => {
    for (const [layerId] of LAYERS) {
      const facts = GLDAS_RAMP_SATURATION[layerId];
      const scale = PROBE_SCALES[layerId];
      expect(facts.closedSpanReported.min).toBeCloseTo(scale.min, 6);
      expect(facts.closedSpanReported.max).toBeCloseTo(scale.max, 6);
      expect(facts.reportedUnit).toBe(scale.unit);
    }
  });

  it("puts the ceiling bound at the top of the representable window", () => {
    // The saturating cap opens exactly where the closed ramp ends: a ceiling
    // sample is at or above the maximum the legend can represent.
    for (const [layerId] of LAYERS) {
      const facts = GLDAS_RAMP_SATURATION[layerId];
      expect(facts.ceiling.boundReported).toBeCloseTo(
        facts.closedSpanReported.max,
        6
      );
    }
  });

  it("converts the precipitation bound from the cited native rate", () => {
    // 5.0e-04 kg/m²/s × 86 400 s/day = 43.2 mm/day (1 kg/m² ≡ 1 mm depth).
    const { ceiling } = GLDAS_RAMP_SATURATION.precip;
    expect(ceiling.boundNative * 86_400).toBeCloseTo(ceiling.boundReported, 6);
  });
});

describe("the dropped caps are unreachable by the inversion", () => {
  // This is the defect the module exists to describe, pinned as a guard: both
  // cap colours sit further from every retained swatch than NO_DATA_DISTANCE
  // allows, so invertColormapEntries answers null for each. If the no-data
  // tolerance is ever widened past these distances, a cap would start inverting
  // to a neighbouring swatch's value — a saturated pixel silently reported as a
  // precise measurement — and this test names it.
  it.each(LAYERS)(
    "%s: neither cap can be matched to a retained swatch",
    (layerId, entries) => {
      const facts = GLDAS_RAMP_SATURATION[layerId];
      for (const cap of [facts.ceiling, facts.belowZeroFill]) {
        const nearest = Math.min(
          ...entries.map((entry) => distance(cap.rgb, entry.rgb))
        );
        expect(nearest).toBeGreaterThan(NO_DATA_DISTANCE);
        expect(invertColormapEntries(cap.rgb, entries)).toBeNull();
      }
    }
  );

  it("pins the measured distances the guard rests on", () => {
    const { ceiling, belowZeroFill } = GLDAS_RAMP_SATURATION.soil;
    const nearestTo = (rgb: { r: number; g: number; b: number }) =>
      Math.min(...SOIL_ENTRIES.map((entry) => distance(rgb, entry.rgb)));
    expect(nearestTo(ceiling.rgb)).toBeCloseTo(76.9, 1);
    expect(nearestTo(belowZeroFill.rgb)).toBeCloseTo(83.2, 1);
  });
});

describe("classifyGldasRampSample", () => {
  it.each(LAYERS)("%s: names the saturating top cap", (layerId, entries) => {
    const { ceiling } = GLDAS_RAMP_SATURATION[layerId];
    expect(classifyGldasRampSample(layerId, ceiling.rgb, entries)).toBe(
      "at-or-above-ceiling"
    );
  });

  it.each(LAYERS)("%s: names the sub-zero fill cap", (layerId, entries) => {
    const { belowZeroFill } = GLDAS_RAMP_SATURATION[layerId];
    expect(classifyGldasRampSample(layerId, belowZeroFill.rgb, entries)).toBe(
      "below-zero-fill"
    );
  });

  it.each(LAYERS)(
    "%s: names an ordinary in-ramp colour",
    (layerId, entries) => {
      expect(
        classifyGldasRampSample(layerId, { r: 253, g: 174, b: 97 }, entries)
      ).toBe("interior");
    }
  );

  it.each(LAYERS)(
    "%s: names a colour off the ramp entirely",
    (layerId, entries) => {
      // Black background / ocean fill: far from every swatch and from both caps.
      expect(
        classifyGldasRampSample(layerId, { r: 0, g: 0, b: 0 }, entries)
      ).toBe("off-ramp");
    }
  );

  it("absorbs JPEG noise on a cap without losing the saturation call", () => {
    const { ceiling } = GLDAS_RAMP_SATURATION.soil;
    const noisy = {
      r: ceiling.rgb.r + 8,
      g: ceiling.rgb.g - 7,
      b: ceiling.rgb.b + 6,
    };
    expect(classifyGldasRampSample("soil", noisy, SOIL_ENTRIES)).toBe(
      "at-or-above-ceiling"
    );
  });

  it("never promotes a noisy in-ramp colour to a saturation claim", () => {
    // The last retained swatch, jittered: still nearer its own swatch than the
    // cap, so it stays a measurement rather than becoming a bound.
    const last = SOIL_ENTRIES[SOIL_ENTRIES.length - 1].rgb;
    const noisy = { r: last.r + 9, g: last.g - 9, b: last.b + 9 };
    expect(classifyGldasRampSample("soil", noisy, SOIL_ENTRIES)).toBe(
      "interior"
    );
  });

  it("honours a caller-supplied tolerance", () => {
    const { ceiling } = GLDAS_RAMP_SATURATION.soil;
    const noisy = {
      r: ceiling.rgb.r + 8,
      g: ceiling.rgb.g - 7,
      b: ceiling.rgb.b + 6,
    };
    // The default tolerance absorbs that jitter as the cap…
    expect(classifyGldasRampSample("soil", noisy, SOIL_ENTRIES)).toBe(
      "at-or-above-ceiling"
    );
    // …while a tolerance tighter than the jitter withholds it as a gap rather
    // than claiming a saturation the colour no longer supports.
    expect(classifyGldasRampSample("soil", noisy, SOIL_ENTRIES, 1)).toBe(
      "off-ramp"
    );
  });
});

describe("summarizeGldasRampSaturation", () => {
  const positions = (
    counts: Partial<Record<GldasRampSamplePosition, number>>
  ): GldasRampSamplePosition[] =>
    (Object.entries(counts) as [GldasRampSamplePosition, number][]).flatMap(
      ([position, n]) => Array.from({ length: n }, () => position)
    );

  it("tallies every position and flags the dry bias", () => {
    const summary = summarizeGldasRampSaturation(
      "precip",
      positions({
        interior: 6,
        "at-or-above-ceiling": 2,
        "below-zero-fill": 1,
        "off-ramp": 3,
      })
    );
    expect(summary.kind).toBe("gldas-ramp-saturation");
    expect(summary.isForecast).toBe(false);
    expect(summary.consideredSamples).toBe(12);
    expect(summary.interiorCount).toBe(6);
    expect(summary.ceilingCount).toBe(2);
    expect(summary.belowZeroFillCount).toBe(1);
    expect(summary.offRampCount).toBe(3);
    // Saturation is a share of the *valued* samples, not of the whole grid:
    // off-ramp gaps and fill carry no value to be biased.
    expect(summary.saturatedFraction).toBeCloseTo(2 / 8, 12);
    expect(summary.meanIsDryBiased).toBe(true);
    expect(summary.ceilingBoundReported).toBe(43.2);
    expect(summary.reportedUnit).toBe("mm/day");
    expect(summary.statement).toContain("43.2 mm/day");
    expect(summary.statement).toContain("lower bound");
    expect(summary.limits).toBe(GLDAS_RAMP_SATURATION_LIMITATIONS);
  });

  it("reports an unsaturated footprint without claiming a bias", () => {
    const summary = summarizeGldasRampSaturation(
      "soil",
      positions({ interior: 5, "off-ramp": 2 })
    );
    expect(summary.saturatedFraction).toBe(0);
    expect(summary.meanIsDryBiased).toBe(false);
    expect(summary.statement).toContain("none saturated");
    expect(summary.statement).not.toContain("lower bound");
  });

  it("withholds a share when nothing carried a value", () => {
    const summary = summarizeGldasRampSaturation(
      "soil",
      positions({ "off-ramp": 4, "below-zero-fill": 1 })
    );
    // Null is "no basis to state a share", never "zero saturation".
    expect(summary.saturatedFraction).toBeNull();
    expect(summary.meanIsDryBiased).toBe(false);
    expect(summary.statement).toContain("sub-zero fill cap");
  });

  it("has nothing to assess without samples", () => {
    const summary = summarizeGldasRampSaturation("precip", []);
    expect(summary.consideredSamples).toBe(0);
    expect(summary.saturatedFraction).toBeNull();
    expect(summary.meanIsDryBiased).toBe(false);
    expect(summary.statement).toContain("cannot be assessed");
  });

  it("keeps the limits provenance-first and forecast-free", () => {
    const joined = GLDAS_RAMP_SATURATION_LIMITATIONS.join(" ");
    expect(joined).toContain("GIBS colormap document");
    expect(joined).toContain("lower bound");
    expect(joined).toContain("never infers");
  });
});
