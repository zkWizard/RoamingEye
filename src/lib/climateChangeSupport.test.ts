import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate, type ClimateMetricId } from "./climate";
import { monthOverMonthCoverageSupport } from "./climateChangeSupport";

const AVAILABLE_THROUGH = { year: 2026, month: 3 };

/** A usable published monthly observation with the given sampled coverage. */
function month(
  monthNumber: number,
  value: number | null,
  validFraction?: number,
  metricId: ClimateMetricId = "air-temperature-2m"
) {
  return summarizeMonthlyClimate(
    {
      metricId,
      dataMonth: { year: 2026, month: monthNumber },
      value,
      ...(validFraction === undefined ? {} : { validFraction }),
    },
    AVAILABLE_THROUGH
  );
}

describe("monthOverMonthCoverageSupport", () => {
  it("bounds the common area with the Fréchet inequalities", () => {
    // 0.9 + 0.85 − 1 = 0.75 guaranteed; the 0.85 month caps the overlap.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.9),
      month(2, 287.4, 0.85)
    );

    expect(support.status).toBe("bounded");
    expect(support.guaranteedSharedFraction).toBeCloseTo(0.75, 9);
    expect(support.maximumSharedFraction).toBe(0.85);
    expect(support.tier).toBe("substantial");
    expect(support.statement).toBe(
      "at least 75% and at most 85% of the sampled area is common to both months"
    );
    expect(support.reason).toBeNull();
  });

  it("warns that two available months may share no ground at all", () => {
    // Each month is individually "available", but 0.6 + 0.3 − 1 < 0: the two
    // monthly means can be aggregates of entirely different pixels, so their
    // difference is not a change over one place.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.6),
      month(2, 287.4, 0.3)
    );

    expect(support.status).toBe("possibly-disjoint");
    expect(support.guaranteedSharedFraction).toBe(0);
    expect(support.maximumSharedFraction).toBe(0.3);
    expect(support.tier).toBe("sparse");
    expect(support.statement).toBe(
      "the two months may share no common sampled area; at most 30% can overlap"
    );
  });

  it("does not present floating-point noise as a guaranteed overlap", () => {
    // 0.5 + 0.5 − 1 evaluates to ~1.1e-16, not 0. An exactly-touching pair
    // guarantees nothing and must read as the disjoint case.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.5),
      month(2, 287.4, 0.5)
    );

    expect(support.status).toBe("possibly-disjoint");
    expect(support.guaranteedSharedFraction).toBe(0);
    expect(support.statement).toContain("may share no common sampled area");
  });

  it("never rounds a positive guarantee down to a flat zero percent", () => {
    // 0.5 + 0.504 − 1 = 0.004: a real but tiny guarantee, distinct from none.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.5),
      month(2, 287.4, 0.504)
    );

    expect(support.status).toBe("bounded");
    expect(support.statement).toBe(
      "under 1% of the sampled area is guaranteed common to both months; at most 50% can overlap"
    );
  });

  it("never rounds a guarantee up into a claim of complete common ground", () => {
    // 0.998 + 0.998 − 1 = 0.996. Rounded to the nearest percent both bounds
    // read "100%", stating the complete overlap this module exists to refuse.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.998),
      month(2, 287.4, 0.998)
    );

    expect(support.guaranteedSharedFraction).toBeCloseTo(0.996, 9);
    expect(support.statement).toBe(
      "at least 99% and at most 100% of the sampled area is common to both months"
    );
  });

  it("keeps a bracketed overlap from collapsing onto a single percent", () => {
    // 0.897 guaranteed under a 0.9 ceiling: a real interval that nearest-percent
    // rounding flattens to "at least 90% and at most 90%", and whose lower bound
    // it inflates past what the coverage guarantees.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.9),
      month(2, 287.4, 0.997)
    );

    expect(support.guaranteedSharedFraction).toBeCloseTo(0.897, 9);
    expect(support.statement).toBe(
      "at least 89% and at most 90% of the sampled area is common to both months"
    );
  });

  it("does not inflate a sub-one-percent guarantee to a whole percent", () => {
    // 0.505 + 0.502 − 1 = 0.007. Nearest-percent rounding reported "at least
    // 1%", overstating the guarantee by nearly half, and capped the overlap at
    // "50%" when 50.2% is reachable.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.505),
      month(2, 287.4, 0.502)
    );

    expect(support.status).toBe("bounded");
    expect(support.statement).toBe(
      "under 1% of the sampled area is guaranteed common to both months; at most 51% can overlap"
    );
  });

  it("keeps the guarantee at or below the ceiling it sits under", () => {
    // 0.834 + 1 − 1 evaluates to 0.8340000000000001, floating just past the
    // min() ceiling. Unclamped, the bounds describe an empty interval and the
    // tight-bound wording never fires.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.834),
      month(2, 287.4, 1)
    );

    expect(support.guaranteedSharedFraction).toBe(0.834);
    expect(support.maximumSharedFraction).toBe(0.834);
    expect(support.statement).toBe(
      "exactly 83% of the sampled area is common to both months"
    );
  });

  it("does not state an incomplete tight bound as a flat 100%", () => {
    // One month fully covered, the other at 99.6%: the shared area is known
    // exactly, but it is not all of the sampled area.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.996),
      month(2, 287.4, 1)
    );

    expect(support.guaranteedSharedFraction).toBeCloseTo(0.996, 9);
    expect(support.statement).toBe(
      "all but under 1% of the sampled area is common to both months"
    );
  });

  it("states an exact overlap when both months are fully covered", () => {
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 1),
      month(2, 287.4, 1)
    );

    expect(support.guaranteedSharedFraction).toBe(1);
    expect(support.maximumSharedFraction).toBe(1);
    expect(support.tier).toBe("full");
    expect(support.statement).toBe(
      "exactly 100% of the sampled area is common to both months"
    );
  });

  it("leaves the overlap unbounded when a month supplied no coverage", () => {
    // A point sample carries no spatial coverage; absent coverage must not be
    // read as complete coverage.
    const support = monthOverMonthCoverageSupport(
      month(1, 286.2, 0.9),
      month(2, 287.4)
    );

    expect(support.status).toBe("unknown");
    expect(support.reason).toBe("coverage not supplied for both months");
    expect(support.guaranteedSharedFraction).toBeNull();
    expect(support.maximumSharedFraction).toBeNull();
    expect(support.statement).toBeNull();
    expect(support.earlierFraction).toBe(0.9);
    expect(support.laterFraction).toBeNull();
  });

  it("bounds nothing when either month is not a usable observation", () => {
    const noData = monthOverMonthCoverageSupport(
      month(1, null, 0),
      month(2, 287.4, 0.9)
    );
    expect(noData.status).toBe("unknown");
    expect(noData.reason).toBe("no usable pair of published observations");

    // A month beyond the availability checkpoint is never differenced either.
    const unpublished = monthOverMonthCoverageSupport(
      month(2, 286.2, 0.9),
      summarizeMonthlyClimate(
        {
          metricId: "air-temperature-2m",
          dataMonth: { year: 2026, month: 5 },
          value: 287.4,
          validFraction: 0.9,
        },
        AVAILABLE_THROUGH
      )
    );
    expect(unpublished.status).toBe("unknown");
    expect(unpublished.statement).toBeNull();
  });

  it("keeps its limitations attached to every verdict", () => {
    for (const support of [
      monthOverMonthCoverageSupport(month(1, 286.2, 0.9), month(2, 287.4, 0.9)),
      monthOverMonthCoverageSupport(month(1, 286.2, 0.9), month(2, 287.4)),
    ]) {
      expect(support.limitations.length).toBeGreaterThan(0);
      expect(support.limitations.join(" ")).toContain("pixel masks");
      // The bound is about sampled area only — it must never be sold as
      // accuracy, significance, or a trend.
      expect(support.limitations.join(" ")).toContain("not value accuracy");
      expect(support.limitations.join(" ")).toContain("anomaly, trend, cause");
    }
  });

  it("applies to precipitation as well as air temperature", () => {
    const support = monthOverMonthCoverageSupport(
      month(1, 0.00005, 0.8, "precipitation-rate"),
      month(2, 0.0001, 0.7, "precipitation-rate")
    );

    expect(support.status).toBe("bounded");
    expect(support.guaranteedSharedFraction).toBeCloseTo(0.5, 9);
    expect(support.maximumSharedFraction).toBe(0.7);
  });
});
