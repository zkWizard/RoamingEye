import { describe, expect, it } from "vitest";
import {
  OPEN_OCEAN_SURFACE_SALINITY,
  SEAWATER_FREEZING_POINT_METHOD,
  SEAWATER_FREEZING_POINT_SALINITY_DOMAIN,
  SUB_ZERO_SST_CAP,
  SUB_ZERO_SST_CAP_LIMITATIONS,
  describeSeawaterFreezingPoint,
  formatSubZeroSstCapBound,
  seawaterFreezingPointC,
  subZeroSstCapBias,
  subZeroSstCapBound,
} from "./seawaterFreezingPoint";
import { parseColormapEntries } from "./colormap";
import { NO_DATA_DISTANCE, invertColormapEntries } from "./probe";

/**
 * The cold end of NASA's live MODIS_Sea_Surface_Temperature colormap, verbatim
 * (fetched 2026-08-11): the No Data swatch, the open cold cap, and the first
 * finite bins. Kept as raw XML so the repo's own parser is the oracle rather
 * than a hand-built fixture.
 */
const COLORMAP_COLD_END = `<?xml version="1.0" encoding="UTF-8"?>
<ColorMaps>
  <ColorMap title="No Data">
    <Legend type="classification">
      <LegendEntry rgb="0,0,0" tooltip="No Data" id="0"/>
    </Legend>
  </ColorMap>
  <ColorMap title="Sea Surface Temperature" units="°C">
    <Legend type="continuous" minLabel="&lt; 0.0" maxLabel="&#8805; 32.0">
      <LegendEntry rgb="43,0,26" tooltip="&lt; 0.00" id="1"/>
      <LegendEntry rgb="45,0,28" tooltip="0.00 – 0.15" id="2"/>
      <LegendEntry rgb="48,0,31" tooltip="0.15 – 0.30" id="3"/>
      <LegendEntry rgb="51,0,34" tooltip="0.30 – 0.45" id="4"/>
    </Legend>
  </ColorMap>
</ColorMaps>`;

describe("freezing point of seawater (UNESCO 1983)", () => {
  it("reproduces the published value at reference salinity", () => {
    // S = 35 PSU is the standard reference; the equation gives -1.922 degC.
    expect(seawaterFreezingPointC(35)).toBeCloseTo(-1.9223, 3);
  });

  it("is 0 degC for fresh water only in the limit, and falls with salinity", () => {
    const values = [30, 32, 34, 35, 36, 37].map((s) =>
      seawaterFreezingPointC(s)!
    );
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
    // Every open-ocean surface salinity freezes below 0 degC, which is the
    // whole reason the cold cap is not empty.
    for (const value of values) expect(value).toBeLessThan(0);
  });

  it("refuses salinities outside the equation's published domain", () => {
    expect(
      seawaterFreezingPointC(SEAWATER_FREEZING_POINT_SALINITY_DOMAIN.minPsu - 1)
    ).toBeNull();
    expect(
      seawaterFreezingPointC(SEAWATER_FREEZING_POINT_SALINITY_DOMAIN.maxPsu + 1)
    ).toBeNull();
    expect(seawaterFreezingPointC(Number.NaN)).toBeNull();
    // The bounds themselves stay inside the domain.
    expect(
      seawaterFreezingPointC(SEAWATER_FREEZING_POINT_SALINITY_DOMAIN.minPsu)
    ).not.toBeNull();
    expect(
      seawaterFreezingPointC(SEAWATER_FREEZING_POINT_SALINITY_DOMAIN.maxPsu)
    ).not.toBeNull();
  });

  it("keeps the open-ocean salinity range inside the equation's domain", () => {
    expect(OPEN_OCEAN_SURFACE_SALINITY.minPsu).toBeGreaterThanOrEqual(
      SEAWATER_FREEZING_POINT_SALINITY_DOMAIN.minPsu
    );
    expect(OPEN_OCEAN_SURFACE_SALINITY.maxPsu).toBeLessThanOrEqual(
      SEAWATER_FREEZING_POINT_SALINITY_DOMAIN.maxPsu
    );
  });

  it("carries its citation with the value", () => {
    const described = describeSeawaterFreezingPoint(35);
    expect(described?.method).toBe(SEAWATER_FREEZING_POINT_METHOD);
    expect(described?.freezingPointC).toBe(seawaterFreezingPointC(35));
    expect(describeSeawaterFreezingPoint(100)).toBeNull();
    // Cited as a numbered technical paper, not as a DOI it does not have.
    expect(SEAWATER_FREEZING_POINT_METHOD).not.toHaveProperty("doi");
  });
});

describe("the cold cap GIBS renders sub-zero SST with", () => {
  const entries = parseColormapEntries(COLORMAP_COLD_END);

  it("is dropped by the parser, so it has no value of its own", () => {
    // Every surviving entry comes from a finite "lo - hi" bin at or above 0.
    expect(entries.length).toBe(3);
    for (const entry of entries) expect(entry.value).toBeGreaterThan(0);
    expect(
      entries.some(
        (entry) =>
          entry.rgb.r === SUB_ZERO_SST_CAP.rgb.r &&
          entry.rgb.g === SUB_ZERO_SST_CAP.rgb.g &&
          entry.rgb.b === SUB_ZERO_SST_CAP.rgb.b
      )
    ).toBe(false);
  });

  it("decodes as warmer than the cap instead of failing to decode", () => {
    const decoded = invertColormapEntries(SUB_ZERO_SST_CAP.rgb, entries);
    // The cap colour sits ~2.8 RGB units from the floor bin, far inside the
    // no-data tolerance, so the collapse is silent rather than a rejection.
    expect(decoded).not.toBeNull();
    expect(decoded!).toBeGreaterThan(SUB_ZERO_SST_CAP.upperEdgeC);
    expect(
      Math.hypot(
        SUB_ZERO_SST_CAP.rgb.r - 45,
        SUB_ZERO_SST_CAP.rgb.g - 0,
        SUB_ZERO_SST_CAP.rgb.b - 28
      )
    ).toBeLessThan(NO_DATA_DISTANCE);
  });
});

describe("bounding the cold cap by the freezing point", () => {
  const bound = subZeroSstCapBound();

  it("closes the cap below instead of leaving it unbounded", () => {
    expect(bound.upperC).toBe(0);
    expect(bound.lowerC).toBeCloseTo(-2.0375, 3);
    expect(bound.widthC).toBeCloseTo(2.0375, 3);
    // Taken at the saltiest open-ocean surface water: the coldest freezing
    // point, and therefore the widest and most conservative bound.
    expect(bound.boundSalinityPsu).toBe(OPEN_OCEAN_SURFACE_SALINITY.maxPsu);
    expect(bound.lowerC).toBeLessThanOrEqual(
      seawaterFreezingPointC(OPEN_OCEAN_SURFACE_SALINITY.minPsu)!
    );
  });

  it("keeps the open-water assumption attached to the bound", () => {
    expect(bound.assumption).toBe("open-seawater");
    expect(bound.method).toBe(SEAWATER_FREEZING_POINT_METHOD);
    expect(bound.cap).toBe(SUB_ZERO_SST_CAP);
  });

  it("bounds the collapse error with a known sign", () => {
    // 0.075 degC is the floor bin's midpoint, the value the live colormap's
    // cold cap actually decodes to (measured against the full document).
    const bias = subZeroSstCapBias(0.075)!;
    expect(bias.direction).toBe("warm");
    expect(bias.minWarmBiasC).toBeCloseTo(0.075, 6);
    expect(bias.maxWarmBiasC).toBeCloseTo(2.1125, 3);
    expect(bias.maxWarmBiasC).toBeGreaterThan(bias.minWarmBiasC);
  });

  it("invents no bias for a value the cap cannot explain", () => {
    // At or below the cap edge there is nothing to correct: the reading is
    // already colder than the cap's warm-side collapse would produce.
    expect(subZeroSstCapBias(0)).toBeNull();
    expect(subZeroSstCapBias(-1.5)).toBeNull();
    expect(subZeroSstCapBias(Number.NaN)).toBeNull();
  });

  it("states its limits, including the sea-ice case that breaks the bound", () => {
    const joined = SUB_ZERO_SST_CAP_LIMITATIONS.join(" ");
    expect(SUB_ZERO_SST_CAP_LIMITATIONS.length).toBeGreaterThan(0);
    for (const limitation of SUB_ZERO_SST_CAP_LIMITATIONS) {
      expect(limitation.trim()).toBe(limitation);
    }
    expect(joined).toContain("sea ice");
    expect(joined).toContain("No correction is applied");
    // The caveats must not read as a correction that was already made.
    expect(joined).not.toMatch(/\d+(\.\d+)?\s*°?C/);
  });

  it("makes no biological, sea-ice-extent, or forecast claim", () => {
    const prose = [
      formatSubZeroSstCapBound(bound),
      ...SUB_ZERO_SST_CAP_LIMITATIONS,
    ].join(" ");
    expect(prose).not.toMatch(
      /habitat|species|bleach|abundance|ecosystem health|forecast|predict|ice extent|risk of/i
    );
    expect(formatSubZeroSstCapBound(bound)).toContain(
      "not a marine-biology observation"
    );
  });

  it("cites the method in the formatted statement", () => {
    const text = formatSubZeroSstCapBound(bound);
    expect(text).toContain("UNESCO");
    expect(text).toContain("-2.04");
    expect(text).toContain("37 PSU");
  });
});
