import { describe, expect, it } from "vitest";
import {
  SEAWATER_FREEZING_POINT_REFERENCE_C,
  SST_RAMP_COLORMAP_DOC,
  SST_RAMP_SCALE_ANCHOR,
  SST_RAMP_TERMINALS,
  readSstRampTerminal,
  sstRampTerminalLimitations,
  sstRampTerminalPosition,
} from "./sstRampTerminals";
import { NO_DATA_DISTANCE, invertColormapEntries, PROBE_SCALES } from "./probe";
import { parseColormapEntries } from "./colormap";

/**
 * A verbatim excerpt of the live `MODIS_Sea_Surface_Temperature` colormap
 * (fetched 2026-08-11): the No Data swatch, both open end caps, the finite
 * bins adjacent to each cap, and one mid-ramp bin. Kept as raw XML so the
 * production parser — not a hand-built object — decides which entries survive.
 */
const COLORMAP_EXCERPT = `
<ColorMap units="°C">
  <Legend type="continuous">
    <LegendEntry rgb="0,0,0" tooltip="No Data" id="0"/>
    <LegendEntry rgb="43,0,26" tooltip="&lt; 0.00" id="1"/>
    <LegendEntry rgb="45,0,28" tooltip="0.00 – 0.15" id="2"/>
    <LegendEntry rgb="48,0,31" tooltip="0.15 – 0.30" id="3"/>
    <LegendEntry rgb="51,0,34" tooltip="0.30 – 0.45" id="4"/>
    <LegendEntry rgb="42,136,215" tooltip="14.70 – 14.85" id="100"/>
    <LegendEntry rgb="115,5,0" tooltip="31.65 – 31.80" id="213"/>
    <LegendEntry rgb="110,3,0" tooltip="31.80 – 32.00" id="214"/>
    <LegendEntry rgb="107,2,0" tooltip="&#8805; 32.00" id="215"/>
  </Legend>
</ColorMap>`;

const BLACK = { r: 0, g: 0, b: 0 };

function distance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

describe("the published SST ramp's open end caps", () => {
  const entries = parseColormapEntries(COLORMAP_EXCERPT);

  it("drops both open caps and the No Data swatch, keeping only finite bins", () => {
    // The caps carry no "lo – hi" range, so they never enter the inversion
    // table — which is why MEASURED_INVERSION.sst counts 213 of 216 entries.
    expect(entries).toHaveLength(6);
    const expected = [0.075, 0.225, 0.375, 14.775, 31.725, 31.9];
    entries.forEach((entry, i) =>
      expect(entry.value).toBeCloseTo(expected[i], 6)
    );
  });

  it("collapses the low cap onto the floor bin's midpoint", () => {
    // Sub-zero water renders as one open "< 0.00" swatch. Nearest-entry
    // inversion does not reject it; it reports it as ABOVE freezing.
    const recovered = invertColormapEntries(
      SST_RAMP_TERMINALS.openLowCapRgb,
      entries
    );
    expect(recovered).toBe(SST_RAMP_TERMINALS.floorBinMidpoint);
    expect(recovered as number).toBeGreaterThan(0);
  });

  it("collapses the high cap onto the ceiling bin's midpoint", () => {
    expect(
      invertColormapEntries(SST_RAMP_TERMINALS.openHighCapRgb, entries)
    ).toBe(SST_RAMP_TERMINALS.ceilingBinMidpoint);
  });

  it("cannot separate the floor bin from an undrawn (black) pixel", () => {
    // GIBS transparency flattened into a JPEG tile leaves undrawn pixels black.
    // The floor bin sits inside NO_DATA_DISTANCE of black, so black inverts to
    // a value instead of being rejected as no-data.
    const floorBinRgb = { r: 45, g: 0, b: 28 };
    expect(distance(floorBinRgb, BLACK)).toBeCloseTo(
      SST_RAMP_TERMINALS.floorBinDistanceFromBlack,
      0
    );
    expect(distance(floorBinRgb, BLACK)).toBeLessThan(NO_DATA_DISTANCE);
    expect(invertColormapEntries(BLACK, entries)).toBe(
      SST_RAMP_TERMINALS.floorBinMidpoint
    );
  });

  it("keeps the ceiling bin clear of black, so only the floor is ambiguous", () => {
    expect(distance({ r: 110, g: 3, b: 0 }, BLACK)).toBeGreaterThan(
      NO_DATA_DISTANCE
    );
  });
});

describe("sstRampTerminalPosition", () => {
  it("places values in the floor bin up to one bin width above the floor", () => {
    expect(sstRampTerminalPosition(SST_RAMP_TERMINALS.floor)).toBe("floor-bin");
    expect(sstRampTerminalPosition(SST_RAMP_TERMINALS.floorBinMidpoint)).toBe(
      "floor-bin"
    );
    expect(sstRampTerminalPosition(SST_RAMP_TERMINALS.binWidth)).toBe(
      "floor-bin"
    );
  });

  it("places values in the ceiling bin from one bin width below the ceiling", () => {
    expect(sstRampTerminalPosition(SST_RAMP_TERMINALS.ceiling)).toBe(
      "ceiling-bin"
    );
    expect(sstRampTerminalPosition(SST_RAMP_TERMINALS.ceilingBinMidpoint)).toBe(
      "ceiling-bin"
    );
  });

  it("places ordinary open-ocean values in the interior", () => {
    for (const value of [0.3, 14.775, 25, 31.5]) {
      expect(sstRampTerminalPosition(value)).toBe("interior");
    }
  });

  it("reports values the ramp cannot represent instead of clamping them", () => {
    for (const value of [
      -0.1,
      SEAWATER_FREEZING_POINT_REFERENCE_C,
      32.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      null,
    ]) {
      expect(sstRampTerminalPosition(value)).toBe("unresolvable");
    }
  });
});

describe("readSstRampTerminal", () => {
  it("reads a floor-bin value as an upper bound that may be sub-zero", () => {
    const reading = readSstRampTerminal(SST_RAMP_TERMINALS.floorBinMidpoint);
    expect(reading.position).toBe("floor-bin");
    expect(reading.reading).toBe("upper-bound");
    expect(reading.saturated).toBe(true);
    expect(reading.bound).toBe(SST_RAMP_TERMINALS.binWidth);
    expect(reading.mayBeSubZero).toBe(true);
    expect(reading.ambiguousWithNoData).toBe(true);
    expect(reading.value).toBe(SST_RAMP_TERMINALS.floorBinMidpoint);
    expect(reading.statement).toContain("upper bound");
    expect(reading.statement).toContain(SST_RAMP_COLORMAP_DOC);
  });

  it("reads a ceiling-bin value as a lower bound with no no-data ambiguity", () => {
    const reading = readSstRampTerminal(SST_RAMP_TERMINALS.ceilingBinMidpoint);
    expect(reading.position).toBe("ceiling-bin");
    expect(reading.reading).toBe("lower-bound");
    expect(reading.saturated).toBe(true);
    expect(reading.bound).toBe(
      SST_RAMP_TERMINALS.ceiling - SST_RAMP_TERMINALS.binWidth
    );
    expect(reading.mayBeSubZero).toBe(false);
    expect(reading.ambiguousWithNoData).toBe(false);
    expect(reading.statement).toContain("lower bound");
  });

  it("reads an interior value as a two-sided measurement", () => {
    const reading = readSstRampTerminal(14.775);
    expect(reading.position).toBe("interior");
    expect(reading.reading).toBe("measurement");
    expect(reading.saturated).toBe(false);
    expect(reading.bound).toBeNull();
    expect(reading.ambiguousWithNoData).toBe(false);
    expect(reading.mayBeSubZero).toBe(false);
  });

  it("claims nothing for a value the ramp cannot represent", () => {
    const reading = readSstRampTerminal(SEAWATER_FREEZING_POINT_REFERENCE_C);
    expect(reading.position).toBe("unresolvable");
    expect(reading.reading).toBe("not-representable");
    expect(reading.value).toBeNull();
    expect(reading.bound).toBeNull();
    expect(reading.saturated).toBe(false);
    expect(readSstRampTerminal(null).position).toBe("unresolvable");
  });

  it("never infers marine-biological, sea-ice, or forecast state", () => {
    for (const value of [
      SST_RAMP_TERMINALS.floorBinMidpoint,
      14.775,
      SST_RAMP_TERMINALS.ceilingBinMidpoint,
      null,
    ]) {
      const reading = readSstRampTerminal(value);
      const text = [reading.statement, ...sstRampTerminalLimitations(reading)]
        .join(" ")
        .toLowerCase();
      // "sea-ice" and "forecast" appear only inside explicit disclaimers.
      expect(text).not.toMatch(
        /\b(ice cover|habitat|bleaching|species|ecosystem|abundance|will be|expected to)\b/
      );
    }
  });
});

describe("sstRampTerminalLimitations", () => {
  it("names the freezing point and the no-data collision at the floor", () => {
    const limits = sstRampTerminalLimitations(
      readSstRampTerminal(SST_RAMP_TERMINALS.floorBinMidpoint)
    );
    expect(limits.join(" ")).toContain(
      String(SEAWATER_FREEZING_POINT_REFERENCE_C)
    );
    expect(limits.join(" ")).toContain("undrawn pixel");
  });

  it("names the censoring of warm pools at the ceiling", () => {
    const limits = sstRampTerminalLimitations(
      readSstRampTerminal(SST_RAMP_TERMINALS.ceilingBinMidpoint)
    );
    expect(limits.join(" ")).toContain("lower bound");
    expect(limits.join(" ")).toContain("censored");
  });

  it("adds no terminal caveat to interior or unresolvable readings", () => {
    expect(sstRampTerminalLimitations(readSstRampTerminal(20))).toEqual([]);
    expect(sstRampTerminalLimitations(readSstRampTerminal(null))).toEqual([]);
  });
});

describe("drift guards", () => {
  it("keeps the described ramp edges identical to the probe's SST scale", () => {
    // If the SST scale is recalibrated, this description must be re-read
    // against the live colormap rather than silently kept.
    expect(SST_RAMP_SCALE_ANCHOR.min).toBe(SST_RAMP_TERMINALS.floor);
    expect(SST_RAMP_SCALE_ANCHOR.max).toBe(SST_RAMP_TERMINALS.ceiling);
    expect(SST_RAMP_SCALE_ANCHOR.unit).toBe(SST_RAMP_TERMINALS.unit);
    expect(PROBE_SCALES.sst.calibrated).toBe(true);
  });

  it("keeps the committed terminal midpoints consistent with the bin width", () => {
    expect(SST_RAMP_TERMINALS.floorBinMidpoint).toBeCloseTo(
      SST_RAMP_TERMINALS.floor + SST_RAMP_TERMINALS.binWidth / 2,
      6
    );
    // The final bin is 0.20 °C wide (31.80–32.00), not 0.15 — so its midpoint
    // is asserted against the published range, not derived from binWidth.
    expect(SST_RAMP_TERMINALS.ceilingBinMidpoint).toBeCloseTo(
      (31.8 + SST_RAMP_TERMINALS.ceiling) / 2,
      6
    );
  });

  it("keeps the freezing-point reference below the ramp floor", () => {
    // The whole point of the floor caveat: the ramp cannot reach the
    // temperature at which the ocean it depicts actually freezes.
    expect(SEAWATER_FREEZING_POINT_REFERENCE_C).toBeLessThan(
      SST_RAMP_TERMINALS.floor
    );
  });
});
