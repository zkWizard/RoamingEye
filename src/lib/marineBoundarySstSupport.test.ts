import { describe, expect, it } from "vitest";
import { classifyCoverage } from "./coverageAdequacy";
import {
  MARINE_BOUNDARY_SST_SUPPORT_LIMITATIONS,
  describeMarineBoundarySstSupport,
  summarizeMarineBoundarySstSupport,
} from "./marineBoundarySstSupport";

describe("marine boundary SST spatial support", () => {
  it("grades a usable share and scopes the mean to the sampled pixels", () => {
    const summary = summarizeMarineBoundarySstSupport(0.82);

    expect(summary).toMatchObject({
      kind: "sea-surface-temperature-boundary-support",
      marineBiologyObservation: false,
      isForecast: false,
      claimScope: "descriptive-spatial-support-only",
      status: "usable-sample",
      validFraction: 0.82,
      tier: "substantial",
      meanScope: "usable-sampled-pixels",
      representsSearchedBoundary: false,
      reason: null,
    });
    expect(summary.sampledSharePhrase).toBe(
      "usable SST over 82% of the searched boundary (substantial)"
    );
    expect(describeMarineBoundarySstSupport(summary)).toBe(
      "usable SST over 82% of the searched boundary (substantial); mean covers only those pixels"
    );
  });

  it("never claims a boundary-representative mean, even at full coverage", () => {
    const summary = summarizeMarineBoundarySstSupport(1);

    expect(summary.tier).toBe("full");
    expect(summary.representsSearchedBoundary).toBe(false);
    expect(summary.meanScope).toBe("usable-sampled-pixels");
    expect(describeMarineBoundarySstSupport(summary)).toContain(
      "mean covers only those pixels"
    );
  });

  it("reports a sliver of water as <1% rather than a contradictory 0%", () => {
    // A mostly-land searched boundary (a coastal city) is the normal case for
    // SST, not an error. Rounding its share down to "0%" would read as "no
    // data" beside a stated temperature.
    const summary = summarizeMarineBoundarySstSupport(0.002);

    expect(summary.status).toBe("usable-sample");
    expect(summary.validFraction).toBe(0.002);
    expect(summary.tier).toBe("sparse");
    expect(summary.sampledSharePhrase).toBe(
      "usable SST over <1% of the searched boundary (sparse)"
    );
    expect(summary.sampledSharePhrase).not.toContain("0%");
  });

  it("rounds a share at or above half a percent to whole percent", () => {
    expect(summarizeMarineBoundarySstSupport(0.005).sampledSharePhrase).toBe(
      "usable SST over 1% of the searched boundary (sparse)"
    );
    expect(summarizeMarineBoundarySstSupport(0.004).sampledSharePhrase).toBe(
      "usable SST over <1% of the searched boundary (sparse)"
    );
  });

  it("keeps a zero share distinct from a sparse one", () => {
    const summary = summarizeMarineBoundarySstSupport(0);

    expect(summary).toMatchObject({
      status: "no-usable-sample",
      validFraction: 0,
      tier: "sparse",
      meanScope: null,
      reason: "zero-usable-share",
    });
    expect(describeMarineBoundarySstSupport(summary)).toBe(
      "no usable SST anywhere in the searched boundary"
    );
  });

  it("keeps an unsupplied share explicitly absent instead of assuming zero", () => {
    for (const absent of [null, undefined]) {
      const summary = summarizeMarineBoundarySstSupport(absent);

      expect(summary).toMatchObject({
        status: "unreported",
        validFraction: null,
        tier: null,
        meanScope: null,
        reason: "coverage-not-supplied",
      });
      expect(describeMarineBoundarySstSupport(summary)).toBe(
        "sampled boundary share not supplied"
      );
    }
  });

  it("refuses to tier a coverage figure that is not a fraction", () => {
    for (const invalid of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const summary = summarizeMarineBoundarySstSupport(invalid);

      expect(summary).toMatchObject({
        status: "unclassifiable",
        validFraction: null,
        tier: null,
        meanScope: null,
        reason: "invalid-coverage-fraction",
      });
      expect(describeMarineBoundarySstSupport(summary)).toBe(
        "sampled boundary share invalid"
      );
    }
  });

  it("stays in step with the app-wide coverage tier vocabulary", () => {
    // Reusing `coverageAdequacy`'s bands keeps one definition of sampled
    // completeness; this guards against a divergent local copy.
    for (const fraction of [0, 0.2, 0.4, 0.5, 0.75, 0.9, 0.99, 1]) {
      expect(summarizeMarineBoundarySstSupport(fraction).tier).toBe(
        classifyCoverage(fraction)
      );
    }
  });

  it("states the land-vs-cloud and non-biological limits", () => {
    const summary = summarizeMarineBoundarySstSupport(0.5);

    expect(summary.limitations).toBe(MARINE_BOUNDARY_SST_SUPPORT_LIMITATIONS);
    expect(summary.limitations.join(" ")).toContain("undefined over land");
    expect(summary.limitations.join(" ")).toContain(
      "never a marine-biological measurement"
    );
  });
});
