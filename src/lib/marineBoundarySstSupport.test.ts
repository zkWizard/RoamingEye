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
    expect(summary.sampledSharePhrase).toBe(
      "no usable SST anywhere in the searched boundary"
    );
    expect(describeMarineBoundarySstSupport(summary)).toBe(
      "no usable SST anywhere in the searched boundary — SST is undefined over " +
        "land, and cloud, ice, or source gaps also leave a searched boundary empty"
    );
  });

  it("explains an empty boundary by the ocean domain instead of asserting it bare", () => {
    // The place card's only other statement for this case is the value text
    // "No usable SST observation", so a bare share phrase left the reader with
    // two assertions of absence and no statement that the cited product is an
    // ocean field at all. `marineAveragedSstSupport` — this module's documented
    // series counterpart, over the same product and the same zero share — has
    // always qualified it; the searched-boundary path had not.
    const clause = describeMarineBoundarySstSupport(
      summarizeMarineBoundarySstSupport(0)
    );

    expect(clause).toContain("SST is undefined over land");
    // Two-sided: naming land as the usual reason must not become a claim that
    // this boundary was land. `sstNoData` forbids reading a surface class out
    // of a missing value, so the other emptying causes are named too.
    expect(clause).toContain("cloud, ice, or source gaps");
    // Never a retrieval-failure reading, and never a biological one.
    expect(clause).not.toMatch(/failed|error|unavailable/i);
    expect(clause).not.toMatch(/habitat|species|ecosystem|heatwave/i);
  });

  it("withholds the domain explanation when no zero share was ever reported", () => {
    // An unsupplied or invalid share is not a report that the boundary held no
    // water, so attributing it to the ocean domain would state a cause the
    // sampler never observed.
    for (const share of [null, undefined, Number.NaN, -0.1, 1.5]) {
      expect(
        describeMarineBoundarySstSupport(
          summarizeMarineBoundarySstSupport(share)
        )
      ).not.toContain("SST is undefined over land");
    }
  });

  it("keeps the domain explanation off every share that did return water", () => {
    for (const share of [0.002, 0.2, 0.5, 0.9, 1]) {
      const clause = describeMarineBoundarySstSupport(
        summarizeMarineBoundarySstSupport(share)
      );

      expect(clause).toContain("mean covers only those pixels");
      expect(clause).not.toContain("SST is undefined over land");
    }
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

  it("prints a near-whole boundary share as >99%, never a bare 100%", () => {
    // One rejected pixel in a boundary of 784. SST is undefined over land, so
    // "100% of the searched boundary" reports an entire administrative area as
    // water that returned usable SST — and this clause has no full-coverage
    // case where it falls silent, so the rounded claim always reaches the card.
    const summary = summarizeMarineBoundarySstSupport(783 / 784);

    expect(summary.tier).toBe("full");
    expect(summary.sampledSharePhrase).toBe(
      "usable SST over >99% of the searched boundary (full)"
    );
    expect(describeMarineBoundarySstSupport(summary)).not.toContain("100%");
  });

  it("still prints 100% for a boundary that really was wholly sampled", () => {
    const summary = summarizeMarineBoundarySstSupport(1);

    expect(summary.sampledSharePhrase).toBe(
      "usable SST over 100% of the searched boundary (full)"
    );
  });
});
