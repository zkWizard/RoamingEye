import { describe, expect, it } from "vitest";
import { classifyCoverage } from "./coverageAdequacy";
import {
  MARINE_AVERAGED_SST_SUPPORT_LIMITATIONS,
  marineAveragedSstSupportClause,
  summarizeMarineAveragedSstSupport,
} from "./marineAveragedSstSupport";

describe("marine averaged SST spatial support", () => {
  it("reports the range of usable shares and scopes the mean to those pixels", () => {
    const summary = summarizeMarineAveragedSstSupport(
      "drawn-region",
      [0.12, 0.38, 0.31]
    );

    expect(summary).toMatchObject({
      kind: "sea-surface-temperature-averaged-support",
      marineBiologyObservation: false,
      isForecast: false,
      claimScope: "descriptive-spatial-support-only",
      footprint: "drawn-region",
      status: "usable-sample",
      classifiedMonthCount: 3,
      usableMonthCount: 3,
      minFraction: 0.12,
      maxFraction: 0.38,
      lowestTier: "sparse",
      highestTier: "sparse",
      meanScope: "usable-sampled-pixels",
      representsWholeFootprint: false,
      reason: null,
    });
    expect(marineAveragedSstSupportClause(summary)).toBe(
      "usable SST over 12%–38% of the drawn region (sparse); the mean covers only those pixels"
    );
  });

  it("names both tiers when the months span more than one band", () => {
    const summary = summarizeMarineAveragedSstSupport(
      "sampled-area",
      [0.3, 0.8]
    );

    expect(summary.lowestTier).toBe("sparse");
    expect(summary.highestTier).toBe("substantial");
    expect(marineAveragedSstSupportClause(summary)).toBe(
      "usable SST over 30%–80% of the sampled area (sparse to substantial); the mean covers only those pixels"
    );
  });

  it("collapses the range when every month returned the same share", () => {
    const summary = summarizeMarineAveragedSstSupport(
      "drawn-region",
      [0.5, 0.5]
    );

    expect(summary.minFraction).toBe(0.5);
    expect(summary.maxFraction).toBe(0.5);
    expect(marineAveragedSstSupportClause(summary)).toBe(
      "usable SST over 50% of the drawn region (partial); the mean covers only those pixels"
    );
  });

  it("stays silent when every sampled month covered the whole footprint", () => {
    // An open-ocean box needs no caveat: the mean really does cover it, so the
    // readout must be byte-identical to what it was before this clause existed.
    const summary = summarizeMarineAveragedSstSupport(
      "drawn-region",
      [1, 0.995, 1]
    );

    expect(summary.status).toBe("usable-sample");
    expect(summary.lowestTier).toBe("full");
    expect(marineAveragedSstSupportClause(summary)).toBeNull();
  });

  it("speaks up as soon as one month falls out of the full band", () => {
    const summary = summarizeMarineAveragedSstSupport("drawn-region", [1, 0.9]);

    expect(summary.lowestTier).toBe("substantial");
    expect(marineAveragedSstSupportClause(summary)).toContain(
      "the mean covers only those pixels"
    );
  });

  it("explains an entirely empty footprint without blaming land for it", () => {
    const summary = summarizeMarineAveragedSstSupport(
      "drawn-region",
      [0, 0, 0]
    );

    expect(summary).toMatchObject({
      status: "no-usable-sample",
      classifiedMonthCount: 3,
      usableMonthCount: 0,
      minFraction: 0,
      maxFraction: 0,
      meanScope: null,
      reason: "zero-usable-share",
    });
    const clause = marineAveragedSstSupportClause(summary);
    expect(clause).toBe(
      "no usable SST anywhere in the drawn region in any sampled month — SST is undefined over land, and cloud, ice, or source gaps also leave a footprint empty"
    );
    // The domain is named, never asserted as the cause of this record.
    expect(clause).not.toMatch(/because|caused|due to/);
  });

  it("reports a genuine zero as 0% but a sliver of water as <1%", () => {
    const empty = summarizeMarineAveragedSstSupport("drawn-region", [0, 0.004]);

    // A positive share must never print as "0%" beside a stated temperature,
    // and the real zero at the other end must never inflate to "<1%".
    expect(empty.sampledSharePhrase).toBe(
      "usable SST over 0%–<1% of the drawn region"
    );
    expect(empty.usableMonthCount).toBe(1);
    expect(empty.status).toBe("usable-sample");
  });

  it("leaves absent and out-of-range shares out of the tally", () => {
    const summary = summarizeMarineAveragedSstSupport("drawn-region", [
      null,
      undefined,
      1.4,
      -0.2,
      Number.NaN,
      0.6,
    ]);

    expect(summary.status).toBe("usable-sample");
    expect(summary.classifiedMonthCount).toBe(1);
    expect(summary.minFraction).toBe(0.6);
    expect(summary.maxFraction).toBe(0.6);
  });

  it("stays quiet rather than inventing a share for a point probe", () => {
    const none = summarizeMarineAveragedSstSupport("sampled-area", []);
    expect(none).toMatchObject({
      status: "unreported",
      classifiedMonthCount: 0,
      minFraction: null,
      lowestTier: null,
      reason: "coverage-not-supplied",
    });
    expect(marineAveragedSstSupportClause(none)).toBeNull();

    const bad = summarizeMarineAveragedSstSupport("sampled-area", [2, -1]);
    expect(bad).toMatchObject({
      status: "unclassifiable",
      classifiedMonthCount: 0,
      reason: "invalid-coverage-fractions",
    });
    expect(marineAveragedSstSupportClause(bad)).toBeNull();
  });

  it("takes the extremes over values, not over their order in the series", () => {
    // Colormap-inverted coverage ties are ordinary, so a reversed series with
    // the same shares must summarize identically.
    const forward = summarizeMarineAveragedSstSupport(
      "drawn-region",
      [0.2, 0.7, 0.7, 0.2]
    );
    const reversed = summarizeMarineAveragedSstSupport(
      "drawn-region",
      [0.7, 0.2, 0.2, 0.7]
    );

    expect(reversed.minFraction).toBe(forward.minFraction);
    expect(reversed.maxFraction).toBe(forward.maxFraction);
    expect(marineAveragedSstSupportClause(reversed)).toBe(
      marineAveragedSstSupportClause(forward)
    );
  });

  it("reuses the app-wide coverage bands rather than defining new ones", () => {
    for (const fraction of [0.05, 0.4, 0.75, 0.99]) {
      const summary = summarizeMarineAveragedSstSupport("drawn-region", [
        fraction,
      ]);
      expect(summary.lowestTier).toBe(classifyCoverage(fraction));
    }
  });

  it("never claims a footprint-representative mean and keeps its limits", () => {
    const summary = summarizeMarineAveragedSstSupport("drawn-region", [1]);

    expect(summary.representsWholeFootprint).toBe(false);
    expect(summary.isForecast).toBe(false);
    expect(summary.marineBiologyObservation).toBe(false);
    expect(summary.limitations).toBe(MARINE_AVERAGED_SST_SUPPORT_LIMITATIONS);
    expect(
      MARINE_AVERAGED_SST_SUPPORT_LIMITATIONS.some((limit) =>
        limit.includes("never a marine-biological measurement")
      )
    ).toBe(true);
  });
});
