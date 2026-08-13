import { describe, expect, it } from "vitest";
import {
  probeSstExtremeCensoring,
  sstExtremeBoundPrefix,
  sstExtremeCensoringClause,
} from "./probeSstExtremeCensoring";
import { SST_PUBLISHED_RAMP } from "./sstRampCensoring";
import { PROBE_SCALES } from "./probe";

/** An interior SST that no cap can claim. */
const INTERIOR = 18.4;
/** What the inversion returns for the ramp's open low cap. */
const FLOOR = 0.075;
/** What the inversion returns for the ramp's open high cap. */
const CEILING = 31.9;

describe("probeSstExtremeCensoring", () => {
  it("is inapplicable for every layer but SST", () => {
    for (const layerId of ["ndvi", "lst", "airtemp", "precip"] as const) {
      const censoring = probeSstExtremeCensoring(layerId, [FLOOR, CEILING]);
      expect(censoring.applicable).toBe(false);
      expect(censoring.minBound).toBeNull();
      expect(censoring.maxBound).toBeNull();
      expect(censoring.meanBound).toBeNull();
    }
  });

  it("is inapplicable when no month returned a usable value", () => {
    expect(probeSstExtremeCensoring("sst", []).applicable).toBe(false);
    expect(probeSstExtremeCensoring("sst", [null, null]).applicable).toBe(
      false
    );
    expect(probeSstExtremeCensoring("sst", [Number.NaN, null]).applicable).toBe(
      false
    );
  });

  it("leaves an interior record entirely unqualified", () => {
    const censoring = probeSstExtremeCensoring("sst", [17.2, INTERIOR, 21.9]);
    expect(censoring.applicable).toBe(true);
    expect(censoring.minBound).toBeNull();
    expect(censoring.maxBound).toBeNull();
    expect(censoring.meanBound).toBeNull();
    expect(censoring.floorMonthCount).toBe(0);
    expect(censoring.ceilingMonthCount).toBe(0);
    expect(sstExtremeCensoringClause(censoring)).toBeNull();
    expect(sstExtremeBoundPrefix(censoring, "min")).toBe("");
    expect(sstExtremeBoundPrefix(censoring, "max")).toBe("");
  });

  it("reads a floor-bin minimum as an upper bound, and the mean with it", () => {
    const censoring = probeSstExtremeCensoring("sst", [FLOOR, 4.5, INTERIOR]);
    expect(censoring.minBound).toBe("upper");
    expect(censoring.maxBound).toBeNull();
    expect(censoring.meanBound).toBe("upper");
    expect(censoring.floorMonthCount).toBe(1);
    expect(censoring.observedMonthCount).toBe(3);
    expect(sstExtremeBoundPrefix(censoring, "min")).toBe("≤ ");
    expect(sstExtremeBoundPrefix(censoring, "max")).toBe("");
    const clause = sstExtremeCensoringClause(censoring);
    expect(clause).toContain("1 of 3 sampled months");
    expect(clause).toContain("open low cap");
    expect(clause).toContain("upper bounds on possibly colder water");
    expect(clause).toContain(SST_PUBLISHED_RAMP.colormapDoc);
  });

  it("reads a ceiling-bin maximum as a lower bound, and the mean with it", () => {
    const censoring = probeSstExtremeCensoring("sst", [INTERIOR, CEILING]);
    expect(censoring.minBound).toBeNull();
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("lower");
    expect(censoring.ceilingMonthCount).toBe(1);
    expect(sstExtremeBoundPrefix(censoring, "max")).toBe("≥ ");
    const clause = sstExtremeCensoringClause(censoring);
    expect(clause).toContain("open high cap");
    expect(clause).toContain("lower bounds on possibly warmer water");
  });

  // The failure this guards against is a doubly censored record reading as an
  // ordinary one: both statistics are bounds, and the mean's two biases oppose,
  // so no direction may be claimed for it.
  it("withholds a mean direction when both caps are hit", () => {
    const censoring = probeSstExtremeCensoring("sst", [
      FLOOR,
      INTERIOR,
      CEILING,
      CEILING,
    ]);
    expect(censoring.minBound).toBe("upper");
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("indeterminate");
    expect(censoring.floorMonthCount).toBe(1);
    expect(censoring.ceilingMonthCount).toBe(2);
    const clause = sstExtremeCensoringClause(censoring);
    expect(clause).toContain("3 of 4 sampled months");
    expect(clause).toContain("open end caps");
    expect(clause).toContain("bounded in neither direction");
    expect(clause).not.toContain("little change");
  });

  it("counts a single sampled month in the singular", () => {
    const clause = sstExtremeCensoringClause(
      probeSstExtremeCensoring("sst", [CEILING])
    );
    expect(clause).toContain("1 of 1 sampled month ");
  });

  it("ignores nulls and non-finite values when locating the extremes", () => {
    const censoring = probeSstExtremeCensoring("sst", [
      null,
      Number.NaN,
      INTERIOR,
      null,
      CEILING,
    ]);
    expect(censoring.observedMonthCount).toBe(2);
    expect(censoring.min?.observedValue).toBe(INTERIOR);
    expect(censoring.max?.observedValue).toBe(CEILING);
  });

  // The probe's scale maps gradient position 0 and 1 onto exactly these values,
  // so both ends of the chart are reachable in practice.
  it("censors the probe scale's own endpoints", () => {
    const censoring = probeSstExtremeCensoring("sst", [
      PROBE_SCALES.sst.min,
      PROBE_SCALES.sst.max,
    ]);
    expect(censoring.minBound).toBe("upper");
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("indeterminate");
  });

  // A bound that pointed the wrong way would invert the claim, so pin the
  // direction to the ramp's published geometry rather than to a literal.
  it("bounds each extreme in the direction its cap allows", () => {
    const floorOnly = probeSstExtremeCensoring("sst", [
      SST_PUBLISHED_RAMP.floorBin.lo,
      INTERIOR,
    ]);
    expect(floorOnly.min?.boundDirection).toBe("upper");
    const ceilingOnly = probeSstExtremeCensoring("sst", [
      INTERIOR,
      SST_PUBLISHED_RAMP.ceilingBin.lo,
    ]);
    expect(ceilingOnly.max?.boundDirection).toBe("lower");
  });
});
