import { describe, expect, it } from "vitest";
import {
  SNOW_AVERAGED_SUPPORT_LIMITATIONS,
  snowAveragedSupportClause,
  snowAveragedSupportNote,
  summarizeSnowAveragedSupport,
} from "./snowAveragedSupport";

/** A charted series: every month plotted a mean. */
const charted = (n: number): number[] => Array.from({ length: n }, () => 40);

describe("summarizeSnowAveragedSupport", () => {
  it("reports nothing when no shares are supplied — the point probe's case", () => {
    const summary = summarizeSnowAveragedSupport(
      "sampled-area",
      charted(3),
      null
    );
    expect(summary.status).toBe("unreported");
    expect(snowAveragedSupportClause(summary)).toBeNull();
  });

  it("stays silent when every charted month covered the whole footprint", () => {
    const summary = summarizeSnowAveragedSupport(
      "drawn-region",
      charted(3),
      [1, 1, 1]
    );
    expect(summary.status).toBe("fully-drawn");
    expect(summary.classifiedMonths).toBe(3);
    expect(snowAveragedSupportClause(summary)).toBeNull();
  });

  it("treats a share just short of whole as partly drawn, not as 100%", () => {
    const summary = summarizeSnowAveragedSupport(
      "drawn-region",
      charted(2),
      [0.999, 1]
    );
    expect(summary.status).toBe("partly-drawn");
    // Only the minimum decides the clause fires, so an exact 1 can still sit at
    // the top of the range; there the completeness is real and is not hedged.
    expect(snowAveragedSupportClause(summary)).toContain(">99%–100%");
  });

  it("ignores months that charted nothing when reading shares", () => {
    // The middle month failed to load: its zero share is a transport failure,
    // not an undrawn footprint, and must not widen the reported range.
    const summary = summarizeSnowAveragedSupport(
      "sampled-area",
      [40, null, 60],
      [0.5, 0, 0.8]
    );
    expect(summary.chartedMonths).toBe(2);
    expect(summary.classifiedMonths).toBe(2);
    expect(summary.minFraction).toBe(0.5);
    expect(summary.maxFraction).toBe(0.8);
  });

  it("skips shares that are not fractions rather than treating them as whole", () => {
    const summary = summarizeSnowAveragedSupport("sampled-area", charted(4), [
      Number.NaN,
      -0.2,
      1.4,
      0.25,
    ]);
    expect(summary.classifiedMonths).toBe(1);
    expect(summary.minFraction).toBe(0.25);
    expect(summary.maxFraction).toBe(0.25);
  });

  it("reports an unclassifiable record when no charted month carried a share", () => {
    const summary = summarizeSnowAveragedSupport("sampled-area", charted(2), [
      Number.NaN,
      null,
    ]);
    expect(summary.status).toBe("unclassifiable");
    expect(summary.chartedMonths).toBe(2);
    expect(snowAveragedSupportClause(summary)).toBeNull();
  });

  it("reports a record where nothing charted at all", () => {
    const summary = summarizeSnowAveragedSupport(
      "sampled-area",
      [null, null, null],
      [0, 0, 0]
    );
    expect(summary.status).toBe("no-charted-month");
    expect(summary.chartedMonths).toBe(0);
  });
});

describe("snowAveragedSupportClause", () => {
  it("names the mechanism and the damped seasonal swing on a partly drawn footprint", () => {
    const clause = snowAveragedSupportClause(
      summarizeSnowAveragedSupport(
        "sampled-area",
        charted(3),
        [0.12, 0.5, 0.88]
      )
    );
    expect(clause).toContain("12%–88% of the sampled area");
    expect(clause).toContain("GIBS draws no colour for 0% snow");
    expect(clause).toContain("snow-free and unobserved ground");
    expect(clause).toContain("melt season");
    expect(clause).toContain("damped rather than offset");
  });

  it("prints one share when every classified month drew the same", () => {
    const clause = snowAveragedSupportClause(
      summarizeSnowAveragedSupport("drawn-region", charted(2), [0.4, 0.4])
    );
    expect(clause).toContain("40% of the drawn region");
    expect(clause).not.toContain("–");
  });

  it("reads a near-whole share as >99% rather than a contradictory 100%", () => {
    // One undrawn pixel in a full 28x28 drawn-region grid (lib/probe.ts
    // regionGridSize). The minimum is the meltiest charted month, so a rounded
    // "100%" there would assert perennial complete cover in the same sentence
    // that says the undrawn share grows through the melt season.
    const clause = snowAveragedSupportClause(
      summarizeSnowAveragedSupport("drawn-region", charted(2), [
        783 / 784,
        783 / 784,
      ])
    );
    expect(clause).toContain(">99% of the drawn region");
    expect(clause).not.toContain("100%");
  });

  it("collapses a range whose ends round to the same printed share", () => {
    // 0.990 and 0.994 both print "99%", and a clause reading "99%–99%" would
    // announce a spread it cannot show.
    const clause = snowAveragedSupportClause(
      summarizeSnowAveragedSupport("sampled-area", charted(2), [0.99, 0.994])
    );
    expect(clause).toContain("99% of the sampled area");
    expect(clause).not.toContain("99%–99%");
  });

  it("reads a positive sliver as <1% rather than a 0% that contradicts the mean", () => {
    const clause = snowAveragedSupportClause(
      summarizeSnowAveragedSupport("sampled-area", charted(2), [0.001, 0.3])
    );
    expect(clause).toContain("<1%–30%");
  });

  it("says an all-undrawn record is not distinguishable from an unobserved one", () => {
    const clause = snowAveragedSupportClause(
      summarizeSnowAveragedSupport("sampled-area", [null, null], [0, 0])
    );
    expect(clause).toContain("no month charted a drawn snow mean");
    expect(clause).toContain("snow-free all record");
    expect(clause).toContain("never observed");
  });

  it("claims no depth, melt rate, runoff, cause, or forecast", () => {
    const clauses = [
      snowAveragedSupportClause(
        summarizeSnowAveragedSupport("sampled-area", charted(2), [0.2, 0.6])
      ),
      snowAveragedSupportClause(
        summarizeSnowAveragedSupport("drawn-region", [null], [0])
      ),
    ];
    for (const clause of clauses) {
      expect(clause).not.toMatch(
        /depth|water equivalent|runoff|because|caused|will |forecast|expect/i
      );
    }
  });
});

describe("snowAveragedSupportNote", () => {
  it("speaks only for the snow layer", () => {
    for (const layerId of ["ndvi", "precip", "soil", "sst", null] as const) {
      expect(
        snowAveragedSupportNote(layerId, "sampled-area", charted(2), [0.3, 0.4])
      ).toBeNull();
    }
    expect(
      snowAveragedSupportNote("snow", "sampled-area", charted(2), [0.3, 0.4])
    ).toContain("snow drawn over");
  });

  it("stays silent for a point probe, which supplies no shares", () => {
    expect(
      snowAveragedSupportNote("snow", "sampled-area", charted(3), null)
    ).toBeNull();
  });
});

describe("SNOW_AVERAGED_SUPPORT_LIMITATIONS", () => {
  it("states that the mean covers only drawn pixels and is not a footprint mean", () => {
    expect(
      SNOW_AVERAGED_SUPPORT_LIMITATIONS.some((limitation) =>
        limitation.includes("never a mean of the drawn or sampled footprint")
      )
    ).toBe(true);
  });
});
