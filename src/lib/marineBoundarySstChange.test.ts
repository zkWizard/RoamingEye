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
    expect(line).toBe(
      "no month-over-month SST change stated for Feb 2026 vs Jan 2026 (coverage-disparity)"
    );
    expect(line).not.toMatch(/[0-9]+\.[0-9]\s*°C/);
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
