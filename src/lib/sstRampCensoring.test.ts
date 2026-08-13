import { describe, expect, it } from "vitest";
import { invertColormapEntries } from "./probe";
import {
  SEAWATER_FREEZING_POINT_C,
  SST_PUBLISHED_RAMP,
  describeSstDifferenceCensoring,
  summarizeSstRampCensoring,
} from "./sstRampCensoring";

/**
 * The published MODIS_Sea_Surface_Temperature ramp's dark and warm ends, plus
 * the two OPEN end caps either side of it, copied from the live colormap
 * document (read 2026-08-11). The caps carry no finite range, so the app's
 * colormap parser drops them — these fixtures exist to show what the parser
 * dropping them costs.
 */
const RAMP_ENDS = [
  { rgb: { r: 45, g: 0, b: 28 }, value: 0.075 }, // 0.00 – 0.15 °C
  { rgb: { r: 48, g: 0, b: 31 }, value: 0.225 }, // 0.15 – 0.30 °C
  { rgb: { r: 232, g: 76, b: 0 }, value: 27.375 }, // 27.30 – 27.45 °C
  { rgb: { r: 115, g: 5, b: 0 }, value: 31.725 }, // 31.65 – 31.80 °C
  { rgb: { r: 110, g: 3, b: 0 }, value: 31.9 }, // 31.80 – 32.00 °C
];
const BELOW_RAMP_CAP_RGB = { r: 43, g: 0, b: 26 }; // "< 0.00"
const ABOVE_RAMP_CAP_RGB = { r: 107, g: 2, b: 0 }; // "≥ 32.00"

describe("SST end-cap censoring", () => {
  it("shows why a censored pixel is indistinguishable from ramp-floor water", () => {
    // The regression this qualifies: sub-zero polar water is rendered in the
    // open cap colour, which inverts to the ramp's lowest finite bin. Nothing
    // downstream can tell it apart from genuine 0.1 °C water.
    expect(invertColormapEntries(BELOW_RAMP_CAP_RGB, RAMP_ENDS)).toBe(0.075);
    expect(invertColormapEntries(ABOVE_RAMP_CAP_RGB, RAMP_ENDS)).toBe(31.9);
  });

  it("reports a ramp-floor value as an upper bound", () => {
    const summary = summarizeSstRampCensoring(0.075);
    expect(summary.status).toBe("at-ramp-floor");
    expect(summary.possiblyCensored).toBe(true);
    expect(summary.boundDirection).toBe("upper");
    expect(summary.valueText).toBe("≤ 0.1 °C");
    expect(summary.qualifier).toContain("upper bound");
    expect(summary.qualifier).toContain(String(SEAWATER_FREEZING_POINT_C));
  });

  it("reports a ramp-ceiling value as a lower bound", () => {
    const summary = summarizeSstRampCensoring(31.9);
    expect(summary.status).toBe("at-ramp-ceiling");
    expect(summary.boundDirection).toBe("lower");
    expect(summary.valueText).toBe("≥ 31.9 °C");
    expect(summary.qualifier).toContain("lower bound");
  });

  it("leaves values inside the ramp unqualified", () => {
    for (const value of [SST_PUBLISHED_RAMP.floorBin.hi, 12.4, 31.79]) {
      const summary = summarizeSstRampCensoring(value);
      expect(summary.status).toBe("within-published-ramp");
      expect(summary.possiblyCensored).toBe(false);
      expect(summary.boundDirection).toBeNull();
      expect(summary.qualifier).toBeNull();
    }
    expect(summarizeSstRampCensoring(12.44).valueText).toBe("12.4 °C");
  });

  it("uses the terminal bin edges, not a rounded display value", () => {
    // 0.149 prints as "0.1" like 0.075 does, but only one of the two is a
    // decodable ramp-floor value; both are censoring-suspect, and 0.15 (the
    // next bin's floor) must not be.
    expect(summarizeSstRampCensoring(0.149).possiblyCensored).toBe(true);
    expect(summarizeSstRampCensoring(0.15).possiblyCensored).toBe(false);
    expect(summarizeSstRampCensoring(31.799).possiblyCensored).toBe(false);
    expect(summarizeSstRampCensoring(31.8).possiblyCensored).toBe(true);
    // 32.00 is the open cap's own lower bound, and PROBE_SCALES.sst admits it,
    // so it is censored rather than impossible.
    expect(summarizeSstRampCensoring(32).status).toBe("at-ramp-ceiling");
  });

  it("separates a value this ramp cannot have produced from a censored one", () => {
    for (const value of [-1.8, 32.01, 40]) {
      const summary = summarizeSstRampCensoring(value);
      expect(summary.status).toBe("outside-published-ramp");
      // Out-of-ramp is a provenance problem, not a bound on a real reading.
      expect(summary.possiblyCensored).toBe(false);
      expect(summary.boundDirection).toBeNull();
      expect(summary.qualifier).toContain("cannot have been decoded");
    }
  });

  it("keeps no value distinct from a censored value", () => {
    for (const value of [
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const summary = summarizeSstRampCensoring(value);
      expect(summary.status).toBe("no-value");
      expect(summary.observedValue).toBeNull();
      expect(summary.valueText).toBeNull();
      expect(summary.qualifier).toBeNull();
      expect(summary.possiblyCensored).toBe(false);
    }
  });

  it("stays a colour-ramp statement and cites the document it reads", () => {
    const summary = summarizeSstRampCensoring(0.075);
    expect(summary.marineBiologyObservation).toBe(false);
    expect(summary.isForecast).toBe(false);
    expect(summary.colormapUrl).toBe(
      "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Sea_Surface_Temperature.xml"
    );
  });
});

describe("censoring of a DIFFERENCE between two SST endpoints", () => {
  it("leaves an uncensored pair unbounded", () => {
    const censoring = describeSstDifferenceCensoring(12.4, 14.1);
    expect(censoring.bound).toBe("none");
    expect(censoring.eitherCensored).toBe(false);
    expect(censoring.boundPrefix).toBe("");
    expect(censoring.qualifier).toBeNull();
  });

  it("withholds any bound when BOTH endpoints saturate the warm cap", () => {
    // A tropical warm pool sampled twice: both months decode to the ceiling bin,
    // so the arithmetic difference is 0.0 °C while the true change is unknown.
    const censoring = describeSstDifferenceCensoring(31.9, 31.9);
    expect(censoring.bound).toBe("indeterminate");
    expect(censoring.eitherCensored).toBe(true);
    expect(censoring.qualifier).toMatch(/unbounded in both directions/);
  });

  it("withholds any bound when BOTH endpoints sit on the cold cap", () => {
    const censoring = describeSstDifferenceCensoring(0.1, 0.05);
    expect(censoring.bound).toBe("indeterminate");
  });

  it("treats a censored LATER ceiling endpoint as a lower bound on the change", () => {
    // True later ≥ decoded later, so the true change can only be larger.
    const censoring = describeSstDifferenceCensoring(20, 31.9);
    expect(censoring.bound).toBe("lower");
    expect(censoring.boundPrefix).toBe("≥ ");
  });

  it("inverts the EARLIER endpoint's bound, because it is subtracted", () => {
    // Earlier sits on the cold cap (true ≤ decoded), so the true change is larger.
    const censoring = describeSstDifferenceCensoring(0.1, 20);
    expect(censoring.bound).toBe("lower");
    // Earlier on the warm cap (true ≥ decoded) bounds the change from above.
    expect(describeSstDifferenceCensoring(31.9, 20).bound).toBe("upper");
  });

  it("agrees on a bound when the two caps point the same way", () => {
    // Cold month then warm month: both censorings say the change is understated.
    expect(describeSstDifferenceCensoring(0.1, 31.9).bound).toBe("lower");
    expect(describeSstDifferenceCensoring(31.9, 0.1).bound).toBe("upper");
  });

  it("never makes a biological or predictive claim", () => {
    const censoring = describeSstDifferenceCensoring(31.9, 31.9);
    expect(censoring.marineBiologyObservation).toBe(false);
    expect(censoring.isForecast).toBe(false);
    expect(censoring.qualifier).not.toMatch(
      /habitat|species|bleach|heatwave|forecast|will/i
    );
  });
});
