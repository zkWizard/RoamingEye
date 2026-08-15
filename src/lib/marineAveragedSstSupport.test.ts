import { describe, expect, it } from "vitest";
import { classifyCoverage } from "./coverageAdequacy";
import {
  MARINE_AVERAGED_SST_SUPPORT_LIMITATIONS,
  averagedSstSupportNote,
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

  it("ranges over the months the mean averages, not the ones it never saw", () => {
    // An ice-covered winter returns a zero share and charts nothing; the mean
    // is taken over the summers alone, so the range must be theirs.
    const values = [null, 12.4, 13.1, null];
    const fractions = [0, 0.6, 0.7, 0];

    const summary = summarizeMarineAveragedSstSupport(
      "sampled-area",
      fractions,
      values
    );

    expect(summary.status).toBe("usable-sample");
    expect(summary.classifiedMonthCount).toBe(4);
    expect(summary.chartedMonthCount).toBe(2);
    expect(summary.minFraction).toBe(0.6);
    expect(summary.maxFraction).toBe(0.7);
    expect(marineAveragedSstSupportClause(summary)).toBe(
      "usable SST over 60%–70% of the sampled area (partial); the mean covers only those pixels"
    );
  });

  it("qualifies only the SST layer, and only where shares were supplied", () => {
    const values = [null, 12.4, 13.1, null];
    const fractions = [0, 0.6, 0.7, 0];

    expect(
      averagedSstSupportNote("sst", "sampled-area", values, fractions)
    ).toBe(
      "usable SST over 60%–70% of the sampled area (partial); the mean covers only those pixels"
    );
    // A land layer's shares mean something else; a point probe supplies none.
    expect(
      averagedSstSupportNote("lst", "sampled-area", values, fractions)
    ).toBeNull();
    expect(
      averagedSstSupportNote("sst", "sampled-area", values, null)
    ).toBeNull();
  });

  it("re-reads the tiers from the charted extremes, not the classified ones", () => {
    // The dropped month sits in a lower band, so an inherited tier would name
    // a completeness the mean never rested on.
    const summary = summarizeMarineAveragedSstSupport(
      "drawn-region",
      [0.05, 0.9, 0.95],
      [null, 11, 11.5]
    );

    expect(summary.lowestTier).toBe(classifyCoverage(0.9));
    expect(summary.highestTier).toBe(classifyCoverage(0.95));
    expect(marineAveragedSstSupportClause(summary)).not.toContain("sparse");
  });

  it("still explains a footprint that never returned usable SST", () => {
    // The empty-chart explanation is the whole value of this clause on a land
    // or fully ice-covered box; filtering to charted months must not mute it.
    const summary = summarizeMarineAveragedSstSupport(
      "sampled-area",
      [0, 0, 0],
      [null, null, null]
    );

    expect(summary.status).toBe("no-usable-sample");
    expect(summary.chartedMonthCount).toBe(0);
    expect(marineAveragedSstSupportClause(summary)).toBe(
      "no usable SST anywhere in the sampled area in any sampled month — SST is undefined over land, and cloud, ice, or source gaps also leave a footprint empty"
    );
  });

  it("stays silent when a positive share charted no value at all", () => {
    // Share and value are inverted from the same pixels, so this is defensive
    // — but "no usable SST anywhere" would deny a share the sampler reported.
    const summary = summarizeMarineAveragedSstSupport(
      "drawn-region",
      [0.4, 0.5],
      [null, null]
    );

    expect(summary.status).toBe("no-charted-month");
    expect(summary.reason).toBe("no-charted-value");
    expect(summary.meanScope).toBeNull();
    expect(marineAveragedSstSupportClause(summary)).toBeNull();
  });

  it("grades every classified share when no series is supplied", () => {
    // A caller holding shares alone keeps the earlier whole-series behaviour
    // rather than being told there is nothing to report.
    const withoutSeries = summarizeMarineAveragedSstSupport(
      "sampled-area",
      [0.2, 0.9]
    );

    expect(withoutSeries.chartedMonthCount).toBe(2);
    expect(withoutSeries.minFraction).toBe(0.2);
    expect(marineAveragedSstSupportClause(withoutSeries)).toBe(
      marineAveragedSstSupportClause(
        summarizeMarineAveragedSstSupport("sampled-area", [0.2, 0.9], [4, 9])
      )
    );
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
