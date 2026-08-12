import { describe, it, expect } from "vitest";
import {
  formatReportedMagnitude,
  magnitudeRangeState,
  magnitudeScale,
  MAGNITUDE_SCALES,
  MAGNITUDE_SCALE_LIMITATIONS,
  MAGNITUDE_SCALE_SOURCE,
} from "./magnitudeScale";

describe("magnitudeScale", () => {
  it("resolves a feed code to its published method and range", () => {
    const scale = magnitudeScale("mww");
    expect(scale?.label).toBe("Mww");
    expect(scale?.family).toBe("moment");
    expect(scale?.method).toBe("moment magnitude (W-phase)");
    expect(scale?.applicableRange).toEqual({ min: 5.0, max: null });
  });

  it("matches codes case-insensitively and ignores surrounding whitespace", () => {
    expect(magnitudeScale("  MB ")?.code).toBe("mb");
    expect(magnitudeScale("Mwr")?.code).toBe("mwr");
  });

  it("folds documented alternate spellings onto one canonical scale", () => {
    for (const alias of ["ms", "ms20", "Ms_20"]) {
      expect(magnitudeScale(alias)?.code).toBe("ms_20");
    }
    for (const alias of ["mb_lg", "mblg", "MLg"]) {
      expect(magnitudeScale(alias)?.code).toBe("mb_lg");
    }
    expect(magnitudeScale("mi")?.code).toBe("mwp");
  });

  it("leaves absent, blank, and unrecognized codes unresolved", () => {
    expect(magnitudeScale(null)).toBeNull();
    expect(magnitudeScale(undefined)).toBeNull();
    expect(magnitudeScale("   ")).toBeNull();
    // Not a documented USGS equivalence, so it must not fold onto md.
    expect(magnitudeScale("mdl")).toBeNull();
    expect(magnitudeScale("not-a-scale")).toBeNull();
  });

  it("records the saturating scales USGS publishes a threshold for", () => {
    expect(magnitudeScale("mb")?.saturationMagnitude).toBe(6.5);
    expect(magnitudeScale("ms_20")?.saturationMagnitude).toBe(8.3);
  });

  it("keeps applicability limits distinct from saturation", () => {
    const mwb = magnitudeScale("mwb");
    expect(mwb?.saturationMagnitude).toBeNull();
    expect(mwb?.applicabilityLimitMagnitude).toBe(7.5);
    expect(magnitudeScale("mwr")?.applicabilityLimitMagnitude).toBe(7.0);
  });

  it("publishes no invented range for the unqualified moment code", () => {
    expect(magnitudeScale("mw")?.applicableRange).toEqual({
      min: null,
      max: null,
    });
  });

  it("exposes a unique, lower-cased vocabulary with a cited source", () => {
    const codes = MAGNITUDE_SCALES.map((scale) => scale.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const scale of MAGNITUDE_SCALES) {
      expect(scale.code).toBe(scale.code.toLowerCase());
      expect(scale.method.length).toBeGreaterThan(0);
    }
    expect(MAGNITUDE_SCALE_SOURCE.url).toContain("usgs.gov");
  });

  it("ships limitations that disclaim comparability and conversion", () => {
    const text = MAGNITUDE_SCALE_LIMITATIONS.join(" ").toLowerCase();
    expect(MAGNITUDE_SCALE_LIMITATIONS.length).toBeGreaterThan(0);
    expect(text).toContain("not directly comparable");
    expect(text).toContain("converts nothing between scales");
  });

  it("keeps every published range and threshold internally consistent", () => {
    for (const scale of MAGNITUDE_SCALES) {
      const { min, max } = scale.applicableRange;
      if (min !== null && max !== null) expect(min).toBeLessThanOrEqual(max);
      // A saturation point inside the range is what makes the upper part of
      // that range a lower bound; it must never sit below the range floor.
      if (scale.saturationMagnitude !== null && min !== null) {
        expect(scale.saturationMagnitude).toBeGreaterThan(min);
      }
      if (scale.applicabilityLimitMagnitude !== null && min !== null) {
        expect(scale.applicabilityLimitMagnitude).toBeGreaterThan(min);
      }
    }
  });
});

describe("magnitudeRangeState", () => {
  const mb = magnitudeScale("mb");
  const mwb = magnitudeScale("mwb");

  it("reports a value inside the calibrated range as within range", () => {
    expect(magnitudeRangeState(5.2, mb)).toBe("within-published-range");
  });

  it("flags a value at or above the published saturation point", () => {
    expect(magnitudeRangeState(6.5, mb)).toBe("at-or-above-saturation");
    expect(magnitudeRangeState(6.9, mb)).toBe("at-or-above-saturation");
    expect(magnitudeRangeState(8.3, magnitudeScale("ms"))).toBe(
      "at-or-above-saturation"
    );
  });

  it("reports an applicability limit when no saturation point applies", () => {
    expect(magnitudeRangeState(7.6, mwb)).toBe("above-published-applicability");
    // Between the range top (7.0) and the applicability limit (7.5) the value
    // is merely outside the calibrated range.
    expect(magnitudeRangeState(7.2, mwb)).toBe("above-published-range");
  });

  it("flags values below the calibrated floor", () => {
    expect(magnitudeRangeState(3.1, mb)).toBe("below-published-range");
  });

  it("distinguishes an unbounded scale from an in-range value", () => {
    expect(magnitudeRangeState(6.0, magnitudeScale("mw"))).toBe(
      "no-published-range"
    );
  });

  it("has no state without a resolved scale or a finite magnitude", () => {
    expect(magnitudeRangeState(6.0, null)).toBeNull();
    expect(magnitudeRangeState(Number.NaN, mb)).toBeNull();
    expect(magnitudeRangeState(Number.POSITIVE_INFINITY, mb)).toBeNull();
  });
});

describe("formatReportedMagnitude", () => {
  it("attributes the value to the scale that measured it", () => {
    expect(formatReportedMagnitude(6.1, "mww")).toBe("M 6.1 (Mww, reported)");
  });

  it("marks a saturated value as a lower bound rather than a measurement", () => {
    expect(formatReportedMagnitude(6.7, "mb")).toBe(
      "M 6.7 (mb, reported; mb saturates at this size — a lower bound)"
    );
  });

  it("does not claim a lower bound below the saturation point", () => {
    expect(formatReportedMagnitude(5.4, "mb")).toBe("M 5.4 (mb, reported)");
  });

  it("falls back to the bare reported value when the scale is unavailable", () => {
    expect(formatReportedMagnitude(4.8, null)).toBe("M 4.8 (reported)");
    expect(formatReportedMagnitude(4.8, "mystery")).toBe("M 4.8 (reported)");
  });
});
