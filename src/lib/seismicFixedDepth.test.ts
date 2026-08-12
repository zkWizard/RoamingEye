import { describe, it, expect } from "vitest";
import {
  CONVENTIONAL_DEFAULT_DEPTHS_KM,
  reportedDepthBasis,
  reportedDepthBasisNote,
  seismicFixedDepthCoverage,
} from "./seismicFixedDepth";
import { SEISMICITY_SOURCE, SEISMICITY_UNITS } from "./earthquakes";
import type { Earthquake } from "./earthquakes";

const quake = (
  depthKm: number,
  extra: Partial<Earthquake> = {}
): Earthquake => ({
  lat: 0,
  lon: 0,
  depthKm,
  magnitude: 5,
  time: 1_750_000_000_000,
  place: "somewhere",
  ...extra,
});

describe("reportedDepthBasis", () => {
  it("recognizes each conventional default depth", () => {
    for (const depthKm of CONVENTIONAL_DEFAULT_DEPTHS_KM) {
      expect(reportedDepthBasis(depthKm)).toBe("conventional-default-value");
    }
  });

  it("treats a near miss as a free value rather than rounding it in", () => {
    // 9.9 km is a reported free value. Snapping it onto the 10 km convention
    // would invent the fixed-depth determination this module refuses to make.
    expect(reportedDepthBasis(9.9)).toBe("free-value");
    expect(reportedDepthBasis(10.001)).toBe("free-value");
    expect(reportedDepthBasis(34)).toBe("free-value");
  });

  it("reports free values for depths the convention set does not contain", () => {
    expect(reportedDepthBasis(2.283)).toBe("free-value");
    expect(reportedDepthBasis(655.67)).toBe("free-value");
  });

  it("treats a surface-fixed -0 km depth as the 0 km convention", () => {
    expect(reportedDepthBasis(-0)).toBe("conventional-default-value");
  });

  it("reports unavailable for non-finite and non-numeric depths", () => {
    expect(reportedDepthBasis(Number.NaN)).toBe("unavailable");
    expect(reportedDepthBasis(Number.POSITIVE_INFINITY)).toBe("unavailable");
    expect(reportedDepthBasis(null)).toBe("unavailable");
    expect(reportedDepthBasis(undefined)).toBe("unavailable");
    expect(reportedDepthBasis("10")).toBe("unavailable");
  });
});

describe("reportedDepthBasisNote", () => {
  it("qualifies a default-valued depth without asserting it was fixed", () => {
    const note = reportedDepthBasisNote(10);
    expect(note).toBe(
      "conventional default depth value; resolution not reported"
    );
    // The clause must not claim the depth *was* fixed, only that the feed is
    // silent on how it was arrived at.
    expect(note).not.toMatch(/\bwas fixed\b/);
  });

  it("adds nothing to a free-valued or unavailable depth", () => {
    expect(reportedDepthBasisNote(2.283)).toBeNull();
    expect(reportedDepthBasisNote(Number.NaN)).toBeNull();
  });
});

describe("seismicFixedDepthCoverage", () => {
  it("splits usable depths into default and free values", () => {
    const coverage = seismicFixedDepthCoverage([
      quake(10),
      quake(10),
      quake(35),
      quake(2.283),
      quake(655.67),
    ]);
    expect(coverage.suppliedEventCount).toBe(5);
    expect(coverage.usableEventCount).toBe(5);
    expect(coverage.conventionalDefaultValueCount).toBe(3);
    expect(coverage.freeValueCount).toBe(2);
    expect(coverage.conventionalDefaultValueFraction).toBeCloseTo(0.6, 10);
  });

  it("tallies each observed default depth in ascending order", () => {
    const coverage = seismicFixedDepthCoverage([
      quake(35),
      quake(10),
      quake(35),
      quake(0),
      quake(12.4),
    ]);
    expect(coverage.byDefaultDepth).toEqual([
      { depthKm: 0, eventCount: 1 },
      { depthKm: 10, eventCount: 1 },
      { depthKm: 35, eventCount: 2 },
    ]);
  });

  it("counts a -0 km depth under the 0 km convention, not a separate entry", () => {
    const coverage = seismicFixedDepthCoverage([quake(-0), quake(0)]);
    expect(coverage.byDefaultDepth).toEqual([{ depthKm: 0, eventCount: 2 }]);
    expect(Object.is(coverage.byDefaultDepth[0].depthKm, -0)).toBe(false);
  });

  it("splits the tally by conventional depth class", () => {
    // Every conventional default lies in the shallow band, so intermediate and
    // deep events can only ever contribute free values.
    const coverage = seismicFixedDepthCoverage([
      quake(10),
      quake(33),
      quake(45.2),
      quake(120),
      quake(410),
    ]);
    expect(coverage.byDepthClass).toEqual({
      shallow: { usableEventCount: 3, conventionalDefaultValueCount: 2 },
      intermediate: { usableEventCount: 1, conventionalDefaultValueCount: 0 },
      deep: { usableEventCount: 1, conventionalDefaultValueCount: 0 },
    });
  });

  it("excludes non-finite depths from the tallies but still counts them supplied", () => {
    const coverage = seismicFixedDepthCoverage([
      quake(10),
      quake(Number.NaN),
      quake(Number.POSITIVE_INFINITY),
    ]);
    expect(coverage.suppliedEventCount).toBe(3);
    expect(coverage.usableEventCount).toBe(1);
    expect(coverage.conventionalDefaultValueCount).toBe(1);
    expect(coverage.conventionalDefaultValueFraction).toBe(1);
  });

  it("reports a null fraction rather than an invented 0% for an empty basis", () => {
    const coverage = seismicFixedDepthCoverage([]);
    expect(coverage.usableEventCount).toBe(0);
    expect(coverage.conventionalDefaultValueFraction).toBeNull();
    expect(coverage.byDefaultDepth).toEqual([]);
  });

  it("retains source, units, the tested convention set, and limitations", () => {
    const coverage = seismicFixedDepthCoverage([quake(10)]);
    expect(coverage.kind).toBe("usgs-reported-depth-basis-coverage");
    expect(coverage.isForecast).toBe(false);
    expect(coverage.source).toBe(SEISMICITY_SOURCE);
    expect(coverage.units).toBe(SEISMICITY_UNITS);
    expect(coverage.defaultDepthsKm).toEqual(CONVENTIONAL_DEFAULT_DEPTHS_KM);
    expect(coverage.limitations.length).toBeGreaterThan(0);
    expect(coverage.limitations.join(" ")).toMatch(/not a determination/);
  });

  it("does not mutate the shared depth-class tallies between runs", () => {
    const first = seismicFixedDepthCoverage([quake(10)]);
    const second = seismicFixedDepthCoverage([quake(120)]);
    expect(first.byDepthClass.shallow.usableEventCount).toBe(1);
    expect(second.byDepthClass.shallow.usableEventCount).toBe(0);
  });
});
