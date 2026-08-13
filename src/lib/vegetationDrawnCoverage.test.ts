import { describe, expect, it } from "vitest";

import {
  VEGETATION_DRAWN_COVERAGE_CAVEAT,
  classifyVegetationDrawnCoverage,
  vegetationDrawnCoverageCaveat,
} from "./vegetationDrawnCoverage";

const regional = { isRegionalMean: true };

describe("classifyVegetationDrawnCoverage", () => {
  it("treats only an exact full fraction as complete", () => {
    expect(classifyVegetationDrawnCoverage(1)).toBe("complete");
    expect(classifyVegetationDrawnCoverage(0.999)).toBe("incomplete");
    expect(classifyVegetationDrawnCoverage(0.6)).toBe("incomplete");
    expect(classifyVegetationDrawnCoverage(0)).toBe("incomplete");
  });

  it("reports a missing or unusable fraction as unknown, never complete", () => {
    expect(classifyVegetationDrawnCoverage(undefined)).toBe("unknown");
    expect(classifyVegetationDrawnCoverage(null)).toBe("unknown");
    expect(classifyVegetationDrawnCoverage(Number.NaN)).toBe("unknown");
    expect(classifyVegetationDrawnCoverage(Number.POSITIVE_INFINITY)).toBe(
      "unknown"
    );
    expect(classifyVegetationDrawnCoverage(1.2)).toBe("unknown");
    expect(classifyVegetationDrawnCoverage(-0.1)).toBe("unknown");
  });
});

describe("vegetationDrawnCoverageCaveat", () => {
  it("stays silent when every sampled pixel carried a drawn value", () => {
    expect(vegetationDrawnCoverageCaveat(1, regional)).toBeNull();
  });

  it("states the exclusion and its direction whenever coverage is short", () => {
    expect(vegetationDrawnCoverageCaveat(0.6, regional)).toBe(
      VEGETATION_DRAWN_COVERAGE_CAVEAT
    );
    expect(VEGETATION_DRAWN_COVERAGE_CAVEAT).toContain(
      "not a whole-boundary mean"
    );
  });

  it("fires on a fraction that rounds to a full-coverage percentage", () => {
    // The card prints Math.round(fraction * 100), so 0.999 reads as "100%
    // sampled coverage" while undrawn pixels are still excluded from the mean.
    expect(Math.round(0.999 * 100)).toBe(100);
    expect(vegetationDrawnCoverageCaveat(0.999, regional)).toBe(
      VEGETATION_DRAWN_COVERAGE_CAVEAT
    );
  });

  it("states the caveat when the drawn fraction is not supplied", () => {
    // Unknown coverage cannot rule out undrawn pixels, so the mechanism is
    // disclosed rather than assumed away.
    expect(vegetationDrawnCoverageCaveat(undefined, regional)).toBe(
      VEGETATION_DRAWN_COVERAGE_CAVEAT
    );
    expect(vegetationDrawnCoverageCaveat(null, regional)).toBe(
      VEGETATION_DRAWN_COVERAGE_CAVEAT
    );
  });

  it("never claims a whole-boundary mean for a single boundary point", () => {
    expect(
      vegetationDrawnCoverageCaveat(0.6, { isRegionalMean: false })
    ).toBeNull();
    expect(
      vegetationDrawnCoverageCaveat(undefined, { isRegionalMean: false })
    ).toBeNull();
  });

  it("does not attribute the shortfall to cloud alone or infer bare ground", () => {
    const caveat = VEGETATION_DRAWN_COVERAGE_CAVEAT;
    expect(caveat).toContain("cannot be told apart from unobserved ground");
    expect(caveat).not.toMatch(/bare|barren|dead|degrad|unhealth/i);
  });
});
