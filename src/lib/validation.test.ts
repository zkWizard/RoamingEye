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

  /**
   * The MERRA-2 2 m air-temperature shape: a ramp stepping finer than the
   * precision GIBS prints its tooltips at, so half the entries show a
   * zero-width range. They name a value perfectly well and must survive —
   * dropping them halved the ramp available to the place panel's lookup and to
   * the inversion validation.
   */
  it("keeps an entry whose printed range is narrower than the tooltip's precision", () => {
    const rounded = `<ColorMaps><ColorMap title="T" units="K">
      <Legend type="continuous">
        <LegendEntry rgb="10,20,30" tooltip="220 – 220" id="1"/>
        <LegendEntry rgb="11,21,31" tooltip="220 – 221" id="2"/>
        <LegendEntry rgb="12,22,32" tooltip="221 – 221" id="3"/>
      </Legend>
    </ColorMap></ColorMaps>`;
    expect(parseColormapEntries(rounded)).toEqual([
      { rgb: { r: 10, g: 20, b: 30 }, value: 220 },
      { rgb: { r: 11, g: 21, b: 31 }, value: 220.5 },
      { rgb: { r: 12, g: 22, b: 32 }, value: 221 },
    ]);
  });

  it("still rejects an inverted range, which no rounding can produce", () => {
    const inverted = `<ColorMaps><ColorMap title="T" units="K">
      <Legend type="continuous">
        <LegendEntry rgb="10,20,30" tooltip="250 – 240" id="1"/>
        <LegendEntry rgb="11,21,31" tooltip="250 – 260" id="2"/>
      </Legend>
    </ColorMap></ColorMaps>`;
    expect(parseColormapEntries(inverted)).toEqual([
      { rgb: { r: 11, g: 21, b: 31 }, value: 255 },
    ]);
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

  it("records aerosol as the tight one and every ramp as fully inverting", () => {
    expect(MEASURED_INVERSION.aerosol.rmse).toBeLessThan(0.2);
    // LST was the last all-null layer (0 of 250 colours recovered) until its
    // legend was rebuilt from GIBS's own rainbow on 2026-08-13. No calibrated
    // layer rejects a colour now; a regression here means a legend edit
    // reintroduced a blind spot.
    for (const [layer, m] of Object.entries(MEASURED_INVERSION)) {
      expect(m.nulls, `${layer} rejects ramp colours`).toBe(0);
      expect(m.rmse, `${layer} has no measured RMSE`).not.toBeNull();
    }
    expect(MEASURED_INVERSION.lst.rmse).toBeCloseTo(0.3174, 3);
    expect(MEASURED_INVERSION.lst.total).toBe(250);
  });
});
