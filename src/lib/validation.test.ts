import { describe, it, expect } from "vitest";
import { validateInversion, MEASURED_INVERSION } from "./validation";
import { parseColormapEntries } from "./colormap";
import { buildColormapLut } from "./probe";
import { LEGENDS, type GradientLegendSpec } from "./legend";

describe("parseColormapEntries", () => {
  const xml = `<ColorMaps>
    <ColorMap title="No Data"><Entries>
      <ColorMapEntry rgb="0,0,0" transparent="true" sourceValue="[0,1)"/>
    </Entries></ColorMap>
    <ColorMap title="T" units="K">
      <Legend type="continuous" minLabel="&lt; 200" maxLabel="&#8805; 350">
        <LegendEntry rgb="201,0,255" tooltip="&lt; 200.0" id="1"/>
        <LegendEntry rgb="120,0,255" tooltip="200.0 – 250.0" id="2"/>
        <LegendEntry rgb="0,255,120" tooltip="250.0 – 300.0" showTick="true" id="3"/>
        <LegendEntry rgb="255,40,0" tooltip="300.0 – 350.0" id="4"/>
        <LegendEntry rgb="158,1,66" tooltip="&#8805; 350.0" id="5"/>
      </Legend>
    </ColorMap>
  </ColorMaps>`;

  it("pairs each finite legend entry's RGB with its value midpoint", () => {
    const entries = parseColormapEntries(xml);
    expect(entries).toEqual([
      { rgb: { r: 120, g: 0, b: 255 }, value: 225 },
      { rgb: { r: 0, g: 255, b: 120 }, value: 275 },
      { rgb: { r: 255, g: 40, b: 0 }, value: 325 },
    ]);
  });

  it("skips the open end caps and returns [] with no continuous legend", () => {
    expect(parseColormapEntries("<ColorMaps></ColorMaps>")).toEqual([]);
  });
});

describe("validateInversion", () => {
  it("recovers near-zero error when the truth colours ARE our gradient", () => {
    // Feed our own LUT's colours back with matching values: inversion is
    // near-exact, so RMSE collapses to the quantization floor. (This proves
    // the harness measures the inversion, not noise.)
    const spec = LEGENDS.aerosol as GradientLegendSpec;
    const lut = buildColormapLut(spec.stops);
    const entries = lut.map((rgb, i) => ({
      rgb,
      value: (i / (lut.length - 1)) * 0.9, // aerosol scale 0..0.9, factor 1
    }));
    const stats = validateInversion("aerosol", entries);
    expect(stats.n).toBe(entries.length);
    expect(stats.nulls).toBe(0);
    expect(stats.rmse).not.toBeNull();
    expect(stats.rmse!).toBeLessThan(0.02);
  });

  it("counts colours our gradient rejects as no-data", () => {
    // Magenta is far off every earth-tone gradient → all null.
    const entries = [
      { rgb: { r: 255, g: 0, b: 255 }, value: 250 },
      { rgb: { r: 254, g: 0, b: 254 }, value: 260 },
    ];
    const stats = validateInversion("lst", entries);
    expect(stats.nulls).toBe(2);
    expect(stats.n).toBe(0);
    expect(stats.rmse).toBeNull();
  });
});

describe("MEASURED_INVERSION reference figures", () => {
  it("covers every calibrated layer with a plausible entry", () => {
    for (const [layer, m] of Object.entries(MEASURED_INVERSION)) {
      expect(m.total, layer).toBeGreaterThan(0);
      expect(m.nulls, layer).toBeLessThanOrEqual(m.total);
      if (m.rmse !== null) expect(m.rmse, layer).toBeGreaterThan(0);
    }
  });

  it("records aerosol as the tight one and LST as all-null (honest limits)", () => {
    expect(MEASURED_INVERSION.aerosol.rmse).toBeLessThan(0.2);
    expect(MEASURED_INVERSION.lst.rmse).toBeNull();
    expect(MEASURED_INVERSION.lst.nulls).toBe(MEASURED_INVERSION.lst.total);
  });
});
