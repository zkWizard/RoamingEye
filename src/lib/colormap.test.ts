import { describe, it, expect } from "vitest";
import {
  parseColormap,
  linearityDeviation,
  SCALE_CONVERSIONS,
  COLORMAP_DOCS,
} from "./colormap";
import { PROBE_SCALES } from "./probe";

/**
 * Offline coverage for the GIBS colormap parser against a fixture mirroring
 * the live documents' shape (multiple ColorMap sections, DN sourceValues with
 * a physical-unit continuous Legend, open end caps, en-dash ranges). The
 * live-XML versions of these assertions run weekly in
 * contract/probe-scales.contract.test.ts.
 */

// Trimmed but structurally faithful: No Data section first, DN sourceValues,
// physical tooltips, "< " / "≥ " end caps, a showTick entry mid-ramp.
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<ColorMaps>
  <ColorMap title="No Data">
    <Entries>
      <ColorMapEntry rgb="0,0,0" transparent="true" sourceValue="[0,1)"/>
    </Entries>
    <Legend type="classification">
      <LegendEntry rgb="64,64,64" tooltip="Fill" id="0"/>
    </Legend>
  </ColorMap>
  <ColorMap title="Example Temperature" units="K">
    <Entries>
      <ColorMapEntry rgb="201,0,255" sourceValue="[1,10000)"/>
      <ColorMapEntry rgb="197,0,255" sourceValue="[10000,10030)"/>
      <ColorMapEntry rgb="193,0,255" sourceValue="[10030,10060)"/>
      <ColorMapEntry rgb="158,1,66" sourceValue="[10060,32600)"/>
    </Entries>
    <Legend type="continuous" minLabel="&lt; 200.0" maxLabel="&#8805; 350.0">
      <LegendEntry rgb="201,0,255" tooltip="&lt; 200.0" id="1"/>
      <LegendEntry rgb="197,0,255" tooltip="200.0 – 250.0" id="2"/>
      <LegendEntry rgb="193,0,255" tooltip="250.0 – 300.0" showTick="true" id="3"/>
      <LegendEntry rgb="189,0,255" tooltip="300.0 – 350.0" id="4"/>
      <LegendEntry rgb="158,1,66" tooltip="&#8805; 350.0" id="5"/>
    </Legend>
  </ColorMap>
</ColorMaps>`;

describe("parseColormap", () => {
  const ramp = parseColormap(FIXTURE);

  it("reads units from the data ColorMap section, not No Data", () => {
    expect(ramp.units).toBe("K");
  });

  it("reads physical bins from the continuous legend, skipping end caps", () => {
    expect(ramp.bins).toEqual([
      { lo: 200, hi: 250 },
      { lo: 250, hi: 300 },
      { lo: 300, hi: 350 },
    ]);
  });

  it("parses scientific-notation ranges (GLDAS style)", () => {
    const gldas = FIXTURE.replace(
      'tooltip="200.0 – 250.0"',
      'tooltip="1.0e-05 – 2.0e-05"'
    );
    const bins = parseColormap(gldas).bins;
    expect(bins[0]).toEqual({ lo: 1e-5, hi: 2e-5 });
  });

  it("returns an empty ramp for documents with no continuous legend", () => {
    expect(parseColormap("<ColorMaps></ColorMaps>").bins).toEqual([]);
  });
});

describe("linearityDeviation", () => {
  it("is zero for a uniform ramp", () => {
    expect(
      linearityDeviation([
        { lo: 0, hi: 1 },
        { lo: 1, hi: 2 },
        { lo: 2, hi: 3 },
      ])
    ).toBe(0);
  });

  it("measures the worst edge displacement for a non-uniform ramp", () => {
    // Bins 1 and 3 wide over a span of 4: the first edge sits at value
    // position 0.25 but uniform position 0.5 — deviation 0.25.
    expect(
      linearityDeviation([
        { lo: 0, hi: 1 },
        { lo: 1, hi: 4 },
      ])
    ).toBeCloseTo(0.25);
  });

  it("is Infinity for empty or degenerate ramps", () => {
    expect(linearityDeviation([])).toBe(Infinity);
    expect(linearityDeviation([{ lo: 2, hi: 2 }])).toBe(Infinity);
  });
});

describe("calibrated scales bookkeeping", () => {
  it("every colormap-calibrated layer is marked calibrated with real units", () => {
    for (const id of Object.keys(
      COLORMAP_DOCS
    ) as (keyof typeof COLORMAP_DOCS)[]) {
      expect(PROBE_SCALES[id].calibrated).toBe(true);
      expect(PROBE_SCALES[id].max).toBeGreaterThan(PROBE_SCALES[id].min);
    }
  });

  it("precip's mm/day conversion is the pinned factor times the GIBS span", () => {
    const conv = SCALE_CONVERSIONS.precip!;
    expect(conv.unit).toBe("mm/day");
    expect(PROBE_SCALES.precip.unit).toBe("mm/day");
    // 5.0e-4 kg/m²/s × 86 400 = 43.2 — the pinned max.
    expect(5e-4 * conv.factor).toBeCloseTo(PROBE_SCALES.precip.max);
  });
});
