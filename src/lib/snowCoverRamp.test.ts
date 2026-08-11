import { describe, it, expect } from "vitest";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { buildColormapLut, invertColormap, PROBE_SCALES } from "./probe";
import { parseColormap, parseColormapEntries } from "./colormap";
import { validateInversion, MEASURED_INVERSION } from "./validation";

/**
 * The snow layer's legend, measured against the ramp GIBS actually renders.
 *
 * GIBS draws MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct with the
 * MODIS_NDSI_Snow_Cover colormap (the layer's own ows:Metadata colormap link
 * in the live WMTS capabilities). That ramp is 100 *integer percent classes*
 * running pale yellow → orange → salmon → pure red. The app's legend used to
 * be a hand-drawn dark-blue → white gradient, which shares no hue with it.
 *
 * PAINTED_RAMP below is not a reconstruction: it is the PLTE palette of a
 * real tile (2024-01, EPSG:4326 2km/3/1/9, northern Eurasia), indices 1-100,
 * every one of which the tile's tRNS chunk marks fully opaque. Index 0 (0%
 * snow) and every classification index — cloud, night, inland water, ocean,
 * missing, fill — carry alpha 0, so they are never sampled as colour; a
 * canvas returns premultiplied zeros for them, which the gradient must keep
 * rejecting as no-data.
 *
 * This is the offline half of the accuracy check; the live re-measurement is
 * contract/inversion-validation.contract.test.ts.
 */

/** Concatenated RGB hex for snow-cover classes 1%…100%, from a real tile. */
const PAINTED_RAMP =
  "f0f080f0f081f0f082f0f083f0f084f0f085f0f086f0f087f0f088f0f089" +
  "f0f08af0f08bf0f08cf0f08df0f08ef0f08ff0f090f0f091f0f092f0f093" +
  "f0d280f0d281f0d282f0d283f0d284f0d285f0d286f0d287f0d288f0d289" +
  "f0d28af0d28bf0d28cf0d28df0d28ef0d28ff0d290f0d291f0d292f0d293" +
  "f0b480f0b481f0b482f0b483f0b484f0b485f0b486f0b487f0b488f0b489" +
  "f0b48af0b48bf0b48cf0b48df0b48ef0b48ff0b490f0b491f0b492f0b493" +
  "f09680f09681f09682f09683f09684f09685f09686f09687f09688f09689" +
  "f0968af0968bf0968cf0968df0968ef0968ff09690f09691f09692f09693" +
  "f07880f07980f07a80f07b80f07c80f07d80f07e80f07f80f08080f08081" +
  "f08181f08182f08282f08283f08383f08384f08484f08485f08585ff0000";

const RAMP = Array.from({ length: 100 }, (_, i) => ({
  value: i + 1,
  rgb: {
    r: parseInt(PAINTED_RAMP.slice(i * 6, i * 6 + 2), 16),
    g: parseInt(PAINTED_RAMP.slice(i * 6 + 2, i * 6 + 4), 16),
    b: parseInt(PAINTED_RAMP.slice(i * 6 + 4, i * 6 + 6), 16),
  },
}));

/** What a canvas yields for the alpha-0 classes (premultiplied). */
const TRANSPARENT = { r: 0, g: 0, b: 0 };

/** The legend this PR replaced, kept as the measured before-state. */
const HAND_DRAWN_STOPS = [
  { color: "#274a6d", at: 0 },
  { color: "#5b87ad", at: 0.35 },
  { color: "#a8c8dd", at: 0.7 },
  { color: "#ffffff", at: 1 },
];

function recover(stops: { color: string; at: number }[]) {
  const lut = buildColormapLut(stops);
  const scale = PROBE_SCALES.snow;
  const span = scale.max - scale.min;
  const errors: number[] = [];
  let nulls = 0;
  for (const entry of RAMP) {
    const pos = invertColormap(entry.rgb, lut);
    if (pos === null) {
      nulls++;
      continue;
    }
    errors.push(scale.min + pos * span - entry.value);
  }
  const n = errors.length;
  return {
    n,
    nulls,
    rmse: n ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n) : null,
    rejectsTransparent: invertColormap(TRANSPARENT, lut) === null,
  };
}

describe("snow-cover legend vs the ramp GIBS renders", () => {
  it("the hand-drawn blue→white gradient recovered no painted colour at all", () => {
    const before = recover(HAND_DRAWN_STOPS);
    // Not "inaccurate" — blind. Every colour a snow-covered pixel can be was
    // read as no-data, so the probe reported an empty record wherever there
    // was snow to measure.
    expect(before.n).toBe(0);
    expect(before.nulls).toBe(100);
  });

  it("the NDSI-anchored legend recovers every painted colour", () => {
    const after = recover((LEGENDS.snow as GradientLegendSpec).stops);
    expect(after.nulls).toBe(0);
    expect(after.n).toBe(100);
    expect(after.rmse).not.toBeNull();
    // Percentage points. The residual is the width of the palette's own
    // within-band quantization, not a gradient approximation error.
    expect(after.rmse!).toBeLessThan(1);
  });

  it("still rejects the transparent classes as no-data", () => {
    // Cloud, polar night, water, fill and 0% snow are all alpha 0. If the
    // gradient accepted premultiplied black, an unobserved month would read
    // as a snow measurement.
    expect(recover(HAND_DRAWN_STOPS).rejectsTransparent).toBe(true);
    expect(
      recover((LEGENDS.snow as GradientLegendSpec).stops).rejectsTransparent
    ).toBe(true);
  });

  it("matches the committed inversion figure", () => {
    const stats = validateInversion("snow", RAMP);
    const ref = MEASURED_INVERSION.snow;
    expect(stats.total).toBe(ref.total);
    expect(stats.nulls).toBe(ref.nulls);
    expect(stats.rmse).toBeCloseTo(ref.rmse!, 2);
  });
});

/**
 * MODIS_NDSI_Snow_Cover is a *discrete* legend, the first the parser meets:
 * single-value tooltips instead of "lo – hi" ranges, plus entries GIBS marks
 * transparent and never paints.
 */
const DISCRETE_DOC = `<?xml version="1.0" encoding="UTF-8"?>
<ColorMaps>
  <ColorMap title="Normalized Difference Snow Index">
    <Entries>
      <ColorMapEntry rgb="0,255,0" transparent="true" sourceValue="[0]" value="[0]" ref="0"/>
      <ColorMapEntry rgb="240,240,128" transparent="false" sourceValue="[1]" value="[1]" ref="1"/>
      <ColorMapEntry rgb="240,240,129" transparent="false" sourceValue="[2]" value="[2]" ref="2"/>
      <ColorMapEntry rgb="255,0,0" transparent="false" sourceValue="[3]" value="[3]" ref="3"/>
    </Entries>
    <Legend type="discrete" minLabel="1" maxLabel="3">
      <LegendEntry rgb="0,255,0" tooltip="0" id="0"/>
      <LegendEntry rgb="240,240,128" tooltip="1" id="1"/>
      <LegendEntry rgb="240,240,129" tooltip="2" id="2"/>
      <LegendEntry rgb="255,0,0" tooltip="3" id="3"/>
    </Legend>
  </ColorMap>
  <ColorMap title="Classifications">
    <Entries>
      <ColorMapEntry rgb="0,191,255" transparent="true" sourceValue="[250]" ref="106"/>
    </Entries>
    <Legend type="classification">
      <LegendEntry rgb="0,191,255" tooltip="Cloud" id="106"/>
    </Legend>
  </ColorMap>
</ColorMaps>`;

describe("discrete GIBS colormaps", () => {
  it("reads one entry per painted class, skipping the transparent ones", () => {
    const entries = parseColormapEntries(DISCRETE_DOC);
    expect(entries.map((e) => e.value)).toEqual([1, 2, 3]);
    expect(entries[0].rgb).toEqual({ r: 240, g: 240, b: 128 });
  });

  it("never mistakes a classification colour for a ramp value", () => {
    // "Cloud" lives in a second section whose ids overlap nothing here; the
    // parser must stay inside the section that owns the discrete legend.
    const entries = parseColormapEntries(DISCRETE_DOC);
    expect(entries.some((e) => e.rgb.b === 255 && e.rgb.g === 191)).toBe(false);
  });

  it("spans each class over one quantization step", () => {
    const ramp = parseColormap(DISCRETE_DOC);
    expect(ramp.bins[0].lo).toBe(0);
    expect(ramp.bins[ramp.bins.length - 1].hi).toBe(3);
  });
});
