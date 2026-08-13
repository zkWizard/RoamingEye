import { describe, expect, it } from "vitest";
import {
  MARINE_BOUNDARY_SST_CHANGE_LIMITATIONS,
  MARINE_BOUNDARY_SST_CHANGE_THRESHOLD_C,
  MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT,
  describeMarineBoundarySstChange,
  formatMarineBoundarySstChange,
} from "./marineBoundarySstChange";
import {
  marineBoundarySstReading,
  unavailableMarineBoundarySstReading,
} from "./marinePlaceInsight";
import type { YearMonth } from "./timeline";

const IMAGE = { width: 512, height: 512 };

/**
 * Build endpoints through the production place-panel formatter rather than by
 * hand, so the change helper is exercised against the exact reading shape
 * `main.ts` sets on the SST card.
 */
function reading(
  dataMonth: YearMonth,
  observedValue: number | null,
  validFraction: number,
  geographyLabel = "Bay of Biscay"
) {
  return marineBoundarySstReading({
    geographyLabel,
    dataMonth,
    observedValue,
    validFraction,
    sourceImageDimensions: IMAGE,
  });
}

const JAN = { year: 2026, month: 1 };
const FEB = { year: 2026, month: 2 };
const MAR = { year: 2026, month: 3 };

describe("month-over-month boundary SST change", () => {
  it("reports a signed warming between consecutive months of the same place", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(FEB, 14.1, 0.75)
    );
    expect(change.status).toBe("available");
    expect(change.changeValue).toBeCloseTo(1.7, 6);
    expect(change.trend).toBe("warmer");
    expect(change.geographyLabel).toBe("Bay of Biscay");
    expect(change.reason).toBeNull();
  });

  it("reports cooling with the same signed convention", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 14.1, 0.8),
      reading(FEB, 12.4, 0.8)
    );
    expect(change.trend).toBe("cooler");
    expect(change.changeValue).toBeCloseTo(-1.7, 6);
  });

  it("bins a sub-threshold difference as little-change without hiding the number", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(FEB, 12.7, 0.8)
    );
    expect(change.trend).toBe("little-change");
    // The continuous difference is retained; only the label is binned.
    expect(change.changeValue).toBeCloseTo(0.3, 6);
    expect(change.thresholdValue).toBe(MARINE_BOUNDARY_SST_CHANGE_THRESHOLD_C);
  });

  it("never claims to be a forecast or a marine-biology observation", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(FEB, 14.1, 0.8)
    );
    expect(change.isForecast).toBe(false);
    expect(change.marineBiologyObservation).toBe(false);
    expect(change.claimScope).toBe(
      "descriptive-boundary-sea-surface-temperature-change-only"
    );
  });

  it("carries the cited SST product forward from the endpoints", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(FEB, 14.1, 0.8)
    );
    expect(change.source.source.doi).toBe("10.5067/MODSA-MO9D9");
    expect(change.limitations).toBe(MARINE_BOUNDARY_SST_CHANGE_LIMITATIONS);
  });
});

describe("the rules that withhold a change", () => {
  it("withholds when an endpoint carried no usable SST", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, null, 0),
      reading(FEB, 14.1, 0.8)
    );
    expect(change.status).toBe("endpoint-unavailable");
    expect(change.changeValue).toBeNull();
    expect(change.trend).toBeNull();
  });

  it("withholds when an endpoint is a sampling failure rather than a reading", () => {
    const change = describeMarineBoundarySstChange(
      unavailableMarineBoundarySstReading(JAN, "Bay of Biscay"),
      reading(FEB, 14.1, 0.8)
    );
    expect(change.status).toBe("endpoint-unavailable");
    expect(change.changeValue).toBeNull();
  });

  it("refuses to span a month gap", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(MAR, 14.1, 0.8)
    );
    expect(change.status).toBe("non-adjacent-months");
    expect(change.reason).toBe("months-not-consecutive");
  });

  it("refuses a reversed pair rather than reordering it", () => {
    const change = describeMarineBoundarySstChange(
      reading(FEB, 14.1, 0.8),
      reading(JAN, 12.4, 0.8)
    );
    expect(change.status).toBe("non-adjacent-months");
  });

  it("refuses to difference two different searched places", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8, "Bay of Biscay"),
      reading(FEB, 14.1, 0.8, "Gulf of Alaska")
    );
    expect(change.status).toBe("different-geography");
    expect(change.geographyLabel).toBeNull();
  });
});

describe("cloud-driven spatial support", () => {
  it("withholds a change when the usable boundary shares differ grossly", () => {
    // A thermal-IR retrieval needs clear sky: 82% of the boundary one month and
    // 14% the next are not means over the same water, whatever the values say.
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.82),
      reading(FEB, 14.1, 0.14)
    );
    expect(change.status).toBe("incomparable-coverage");
    expect(change.reason).toBe("coverage-disparity");
    expect(change.changeValue).toBeNull();
    expect(change.spatialSupport.comparability).toBe("gross-disparity");
    expect(change.spatialSupport.disparity).toBeCloseTo(0.68, 6);
  });

  it("retains both endpoint shares even when it withholds the change", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.82),
      reading(FEB, 14.1, 0.14)
    );
    expect(change.spatialSupport.earlierValidFraction).toBeCloseTo(0.82, 6);
    expect(change.spatialSupport.laterValidFraction).toBeCloseTo(0.14, 6);
  });

  it("allows a difference exactly at the stated disparity limit", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(FEB, 14.1, 0.8 - MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT)
    );
    expect(change.status).toBe("available");
    expect(change.spatialSupport.comparability).toBe("within-convention");
  });

  it("honours a caller-supplied disparity limit", () => {
    const strict = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(FEB, 14.1, 0.65),
      { disparityLimit: 0.05 }
    );
    expect(strict.status).toBe("incomparable-coverage");
    expect(strict.disparityLimit).toBe(0.05);
  });

  it("rejects a nonsensical convention instead of silently substituting one", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(FEB, 14.1, 0.8),
      { thresholdC: Number.NaN }
    );
    expect(change.status).toBe("endpoint-unavailable");
    expect(change.reason).toBe("invalid-convention");
    expect(change.thresholdValue).toBe(MARINE_BOUNDARY_SST_CHANGE_THRESHOLD_C);
  });
});

describe("the one-line readout", () => {
  it("states direction, magnitude, and both months", () => {
    const line = formatMarineBoundarySstChange(
      describeMarineBoundarySstChange(
        reading(JAN, 12.4, 0.8),
        reading(FEB, 14.1, 0.8)
      )
    );
    expect(line).toBe("Feb 2026 vs Jan 2026: warmer (+1.7 °C)");
  });

  it("signs a cooling difference", () => {
    const line = formatMarineBoundarySstChange(
      describeMarineBoundarySstChange(
        reading(JAN, 14.1, 0.8),
        reading(FEB, 12.4, 0.8)
      )
    );
    expect(line).toBe("Feb 2026 vs Jan 2026: cooler (-1.7 °C)");
  });

  it("says plainly that no change is stated, without inventing a number", () => {
    const line = formatMarineBoundarySstChange(
      describeMarineBoundarySstChange(
        reading(JAN, 12.4, 0.82),
        reading(FEB, 14.1, 0.14)
      )
    );
    // The reader is told which rule the pair failed and how far apart the two
    // sampled shares were, in the same terms the card's year-over-year sibling
    // already uses — not the machine `reason` slug.
    expect(line).toBe(
      "no month-over-month SST change stated for Feb 2026 vs Jan 2026 — Jan 2026 sampled 82% of the boundary and Feb 2026 sampled 14%, 68 points apart, so the two means may differ in which water was sampled rather than in temperature"
    );
    expect(line).not.toMatch(/[0-9]+\.[0-9]\s*°C/);
  });

  it("never prints a machine reason slug to the reader", () => {
    const pairs: [number, number, number | null, number][] = [
      // coverage disparity, both endpoints censored, and an unusable endpoint.
      [12.4, 0.82, 14.1, 0.14],
      [31.9, 0.8, 31.9, 0.8],
      [12.4, 0.8, null, 0.8],
    ];
    for (const [earlierValue, earlierShare, laterValue, laterShare] of pairs) {
      const line = formatMarineBoundarySstChange(
        describeMarineBoundarySstChange(
          reading(JAN, earlierValue, earlierShare),
          reading(FEB, laterValue, laterShare)
        )
      );
      expect(line).toContain("no month-over-month SST change stated");
      expect(line).not.toMatch(
        /coverage-disparity|coverage-not-supplied|both-endpoints-censored|endpoint-not-available|invalid-convention|geography-mismatch|months-not-consecutive/
      );
    }
  });

  it("explains a censored pair as destroyed information, not missing data", () => {
    const line = formatMarineBoundarySstChange(
      describeMarineBoundarySstChange(
        reading(JAN, 31.9, 0.8),
        reading(FEB, 31.9, 0.8)
      )
    );
    expect(line).toContain("open end caps");
    expect(line).toContain("unbounded both ways");
    // Never rendered as an observed absence of change.
    expect(line).not.toMatch(/little change|unchanged|no change occurred/i);
  });

  it("names an unusable endpoint without blaming coverage", () => {
    const line = formatMarineBoundarySstChange(
      describeMarineBoundarySstChange(
        reading(JAN, 12.4, 0.8),
        reading(FEB, null, 0.8)
      )
    );
    expect(line).toBe(
      "no month-over-month SST change stated for Feb 2026 vs Jan 2026 — one of the two months carries no usable boundary-mean SST observation"
    );
  });

  it("says non-consecutive months are not a month-over-month pair", () => {
    const line = formatMarineBoundarySstChange(
      describeMarineBoundarySstChange(
        reading({ year: 2025, month: 11 }, 12.4, 0.8),
        reading(FEB, 14.1, 0.8)
      )
    );
    expect(line).toContain("not consecutive");
  });

  it("reads as a difference, never as a forecast or an ecosystem claim", () => {
    const line = formatMarineBoundarySstChange(
      describeMarineBoundarySstChange(
        reading(JAN, 12.4, 0.8),
        reading(FEB, 14.1, 0.8)
      )
    );
    expect(line).not.toMatch(/forecast|expect|will|habitat|bleach|species/i);
  });
});

describe("open colormap end caps constrain the reported change", () => {
  it("states no change when both months saturate the same cap", () => {
    // Two months of a tropical warm pool both decode into the ceiling bin. The
    // plain difference is 0.0 °C, which would read as "little change" about
    // water whose true change the colormap destroyed.
    const change = describeMarineBoundarySstChange(
      reading(JAN, 31.9, 0.8),
      reading(FEB, 31.9, 0.8)
    );
    expect(change.status).toBe("incomparable-censoring");
    expect(change.reason).toBe("both-endpoints-censored");
    expect(change.changeValue).toBeNull();
    expect(change.trend).toBeNull();
    expect(change.censoring.bound).toBe("indeterminate");
    expect(formatMarineBoundarySstChange(change)).not.toMatch(/little change/i);
  });

  it("states no change when both months sit on the cold cap", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 0.1, 0.6),
      reading(FEB, 0.05, 0.6)
    );
    expect(change.status).toBe("incomparable-censoring");
    expect(change.trend).toBeNull();
  });

  it("reports a one-sided bound when only the later month is censored", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 20, 0.8),
      reading(FEB, 31.9, 0.8)
    );
    expect(change.status).toBe("available");
    expect(change.censoring.bound).toBe("lower");
    expect(change.changeValue).toBeCloseTo(11.9, 6);
    // The bound already clears the direction threshold, so warmer is certain.
    expect(change.trend).toBe("warmer");
    expect(formatMarineBoundarySstChange(change)).toContain("≥ +11.9 °C");
  });

  it("withholds the direction when a one-sided bound cannot prove it", () => {
    // Earlier on the warm cap bounds the change from ABOVE: the true change is
    // at most -0.2 °C... but -0.2 °C does not reach the 0.5 °C threshold, so
    // "cooler" is unproven and "little change" is flatly unavailable.
    const change = describeMarineBoundarySstChange(
      reading(JAN, 31.9, 0.8),
      reading(FEB, 31.7, 0.8)
    );
    expect(change.status).toBe("available");
    expect(change.censoring.bound).toBe("upper");
    expect(change.trend).toBeNull();
    const line = formatMarineBoundarySstChange(change);
    expect(line).toContain("direction not established");
    expect(line).toContain("≤ -0.2 °C");
    expect(line).not.toMatch(/little change/i);
  });

  it("still proves cooling when the upper bound clears the threshold", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 31.9, 0.8),
      reading(FEB, 25, 0.8)
    );
    expect(change.censoring.bound).toBe("upper");
    expect(change.trend).toBe("cooler");
    expect(formatMarineBoundarySstChange(change)).toContain("≤ -6.9 °C");
  });

  it("leaves an uncensored pair reporting little change as before", () => {
    const change = describeMarineBoundarySstChange(
      reading(JAN, 12.4, 0.8),
      reading(FEB, 12.6, 0.8)
    );
    expect(change.censoring.bound).toBe("none");
    expect(change.trend).toBe("little-change");
    expect(formatMarineBoundarySstChange(change)).toContain("little change");
  });

  it("discloses the censoring rule in its limitations", () => {
    expect(
      MARINE_BOUNDARY_SST_CHANGE_LIMITATIONS.some((l) =>
        /terminal bins/i.test(l)
      )
    ).toBe(true);
  });
});
