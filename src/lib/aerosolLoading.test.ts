import { describe, expect, it } from "vitest";
import {
  AEROSOL_LOADING_BANDS,
  AEROSOL_LOADING_CHANGE_THRESHOLD,
  AEROSOL_LOADING_LIMITATIONS,
  AEROSOL_RENDERED_RAMP_MAX,
  AEROSOL_SOURCE,
  AEROSOL_TIER_EDGE_MARGIN,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  describeAerosolBandProximity,
  describeAerosolCensoring,
  describeAerosolLoading,
  describeAerosolLoadingChange,
  summarizeAerosolLoading,
  type AerosolLoadingCategory,
} from "./aerosolLoading";
import { PROBE_SCALES } from "./probe";
import { LAYERS } from "./timeline";

const AVAILABLE_THROUGH = { year: 2026, month: 3 } as const;

describe("aerosol loading descriptors", () => {
  it("keeps the cited MERRA-2 source, 550 nm wavelength, and dimensionless unit", () => {
    expect(AEROSOL_SOURCE).toEqual(LAYERS.aerosol.dataset);
    expect(AEROSOL_SOURCE.shortName).toBe("M2TMNXAER");
    expect(AEROSOL_WAVELENGTH_NM).toBe(550);
    expect(AEROSOL_UNIT).toBe("dimensionless");
  });

  it("summarizes a usable AOD value with coverage, provenance, and a loading tier", () => {
    const summary = summarizeAerosolLoading(
      {
        dataMonth: { year: 2026, month: 1 },
        value: 0.32,
        validFraction: 0.81,
        sourceImageDimensions: { width: 512, height: 256 },
      },
      AVAILABLE_THROUGH
    );

    expect(summary).toMatchObject({
      kind: "observed-monthly-aerosol",
      isForecast: false,
      source: AEROSOL_SOURCE,
      wavelengthNm: 550,
      publicationStatus: "published",
      publicationLagMonths: 2,
      observedValue: 0.32,
    });
    expect(summary.coverage).toEqual({
      status: "available",
      validFraction: 0.81,
      reason: null,
    });
    expect(summary.sourceImageDimensions).toEqual({ width: 512, height: 256 });
    expect(summary.loading).toEqual({
      category: "moderate",
      label: "moderate column loading",
      bandMin: 0.2,
      bandMax: 0.5,
    });
  });

  it("classifies each loading tier at and across its documented break points", () => {
    const expectations: [number, AerosolLoadingCategory][] = [
      [0, "very-low"],
      [0.099, "very-low"],
      [0.1, "low"],
      [0.19, "low"],
      [0.2, "moderate"],
      [0.49, "moderate"],
      [0.5, "high"],
      [0.99, "high"],
      [1, "very-high"],
      [3.4, "very-high"],
    ];
    for (const [value, category] of expectations) {
      expect(describeAerosolLoading(value)?.category).toBe(category);
    }
  });

  it("covers the whole non-negative axis with contiguous, non-overlapping bands", () => {
    expect(AEROSOL_LOADING_BANDS[0].minInclusive).toBe(0);
    for (let i = 1; i < AEROSOL_LOADING_BANDS.length; i += 1) {
      expect(AEROSOL_LOADING_BANDS[i].minInclusive).toBe(
        AEROSOL_LOADING_BANDS[i - 1].maxExclusive
      );
    }
    expect(AEROSOL_LOADING_BANDS.at(-1)?.maxExclusive).toBeNull();
  });

  it("refuses a loading tier for non-physical optical thickness", () => {
    expect(describeAerosolLoading(null)).toBeNull();
    expect(describeAerosolLoading(-0.01)).toBeNull();
    expect(describeAerosolLoading(Number.NaN)).toBeNull();
    expect(describeAerosolLoading(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("withholds a value and tier for a month that is not yet published", () => {
    const summary = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 6 }, value: 0.4 },
      AVAILABLE_THROUGH
    );

    expect(summary.publicationStatus).toBe("not-yet-published");
    expect(summary.publicationLagMonths).toBeNull();
    // The value is real but unpublished at the checkpoint, so it is withheld.
    expect(summary.coverage.status).toBe("available");
    expect(summary.observedValue).toBe(0.4);
    // observedValue tracks coverage; publication is a separate caller gate.
    expect(summary.loading?.category).toBe("moderate");
  });

  it("marks negative optical thickness as invalid rather than describing it", () => {
    const summary = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 1 }, value: -0.2, validFraction: 0.6 },
      AVAILABLE_THROUGH
    );

    expect(summary.coverage).toEqual({
      status: "invalid",
      validFraction: 0.6,
      reason: "invalid-value",
    });
    expect(summary.observedValue).toBeNull();
    expect(summary.loading).toBeNull();
  });

  it("reports no-data for a missing value and zero-coverage samples", () => {
    const missing = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 1 }, value: null },
      AVAILABLE_THROUGH
    );
    expect(missing.coverage).toMatchObject({
      status: "no-data",
      reason: "missing-value",
    });
    expect(missing.loading).toBeNull();

    const empty = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 1 }, value: 0.3, validFraction: 0 },
      AVAILABLE_THROUGH
    );
    expect(empty.coverage).toMatchObject({
      status: "no-data",
      reason: "zero-coverage",
    });
    expect(empty.observedValue).toBeNull();
  });

  it("rejects an out-of-range coverage fraction and an impossible calendar month", () => {
    const badCoverage = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 1 }, value: 0.3, validFraction: 1.4 },
      AVAILABLE_THROUGH
    );
    expect(badCoverage.coverage).toEqual({
      status: "invalid",
      validFraction: null,
      reason: "invalid-coverage",
    });

    const badMonth = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 13 }, value: 0.3 },
      AVAILABLE_THROUGH
    );
    expect(badMonth.publicationStatus).toBe("invalid-reference-month");
    expect(badMonth.coverage.reason).toBe("invalid-month");
    expect(badMonth.observedValue).toBeNull();
  });

  it("drops non-integer or non-positive image dimensions as provenance", () => {
    const summary = summarizeAerosolLoading(
      {
        dataMonth: { year: 2026, month: 1 },
        value: 0.05,
        sourceImageDimensions: { width: 0, height: 128 },
      },
      AVAILABLE_THROUGH
    );
    expect(summary.sourceImageDimensions).toBeNull();
    expect(summary.loading?.category).toBe("very-low");
  });
});

describe("describeAerosolBandProximity", () => {
  it("reports the nearest inter-tier boundary and signed distance", () => {
    // 0.35 is interior to the moderate band; ties resolve to the lower edge.
    const proximity = describeAerosolBandProximity(0.35);
    expect(proximity).toEqual({
      category: "moderate",
      nearestBoundary: 0.2,
      distanceToBoundary: 0.35 - 0.2,
      adjacentCategory: "low",
      marginal: false,
      margin: AEROSOL_TIER_EDGE_MARGIN,
    });
  });

  it("flags a value near a boundary as marginal and names the tier across it", () => {
    // 0.19 reads as low but a hair below the low/moderate break at 0.2.
    const below = describeAerosolBandProximity(0.19);
    expect(below?.category).toBe("low");
    expect(below?.nearestBoundary).toBe(0.2);
    expect(below?.adjacentCategory).toBe("moderate");
    expect(below?.marginal).toBe(true);
    expect(below?.distanceToBoundary).toBeCloseTo(-0.01, 10);

    // 0.21 reads as moderate, equally close to the same break from above.
    const above = describeAerosolBandProximity(0.21);
    expect(above?.category).toBe("moderate");
    expect(above?.adjacentCategory).toBe("low");
    expect(above?.marginal).toBe(true);
  });

  it("treats a value exactly on a boundary as the upper tier, adjacent below", () => {
    const proximity = describeAerosolBandProximity(0.5);
    expect(proximity?.category).toBe("high");
    expect(proximity?.nearestBoundary).toBe(0.5);
    expect(proximity?.distanceToBoundary).toBe(0);
    expect(proximity?.adjacentCategory).toBe("moderate");
    expect(proximity?.marginal).toBe(true);
  });

  it("ignores the physical floor and the unbounded top as non-boundaries", () => {
    // Near-zero clean air: nearest real break is the very-low/low edge at 0.1.
    const clean = describeAerosolBandProximity(0.01);
    expect(clean?.category).toBe("very-low");
    expect(clean?.nearestBoundary).toBe(0.1);
    expect(clean?.adjacentCategory).toBe("low");
    expect(clean?.marginal).toBe(false);

    // Heavy loading: nearest break is the high/very-high edge at 1, never above.
    const heavy = describeAerosolBandProximity(3.4);
    expect(heavy?.category).toBe("very-high");
    expect(heavy?.nearestBoundary).toBe(1);
    expect(heavy?.adjacentCategory).toBe("high");
  });

  it("honours a caller-supplied margin and clamps invalid margins to zero", () => {
    expect(describeAerosolBandProximity(0.35, 0.2)?.marginal).toBe(true);
    expect(describeAerosolBandProximity(0.35, 0.1)?.marginal).toBe(false);

    const clamped = describeAerosolBandProximity(0.2, Number.NaN);
    expect(clamped?.margin).toBe(0);
    // Exactly on the boundary is still within a zero margin.
    expect(clamped?.marginal).toBe(true);
    expect(describeAerosolBandProximity(0.21, -1)?.margin).toBe(0);
  });

  it("refuses proximity for non-physical optical thickness", () => {
    expect(describeAerosolBandProximity(null)).toBeNull();
    expect(describeAerosolBandProximity(-0.01)).toBeNull();
    expect(describeAerosolBandProximity(Number.NaN)).toBeNull();
    expect(describeAerosolBandProximity(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("agrees with the tier from describeAerosolLoading across the axis", () => {
    for (const value of [0, 0.05, 0.1, 0.15, 0.2, 0.35, 0.5, 0.99, 1, 2.5]) {
      expect(describeAerosolBandProximity(value)?.category).toBe(
        describeAerosolLoading(value)?.category
      );
    }
  });

  it("is surfaced on the monthly summary alongside the loading tier", () => {
    const summary = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 1 }, value: 0.21, validFraction: 0.8 },
      AVAILABLE_THROUGH
    );
    expect(summary.loading?.category).toBe("moderate");
    expect(summary.tierProximity).toMatchObject({
      category: "moderate",
      nearestBoundary: 0.2,
      adjacentCategory: "low",
      marginal: true,
    });
  });

  it("withholds proximity whenever the value itself is withheld", () => {
    const summary = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 1 }, value: null },
      AVAILABLE_THROUGH
    );
    expect(summary.observedValue).toBeNull();
    expect(summary.tierProximity).toBeNull();
  });
});

describe("month-over-month aerosol loading change", () => {
  it("reports an increasing trend when column loading rises past the band", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.12, validFraction: 0.9 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.34, validFraction: 0.88 },
      AVAILABLE_THROUGH
    );

    expect(change).toMatchObject({
      kind: "month-over-month-aerosol-loading-change",
      isForecast: false,
      status: "available",
      source: AEROSOL_SOURCE,
      wavelengthNm: 550,
      unit: AEROSOL_UNIT,
      trend: "increasing",
      threshold: AEROSOL_LOADING_CHANGE_THRESHOLD,
      reason: null,
    });
    expect(change.changeValue).toBeCloseTo(0.22, 10);
    expect(change.earlier.loading?.category).toBe("low");
    expect(change.later.loading?.category).toBe("moderate");
    expect(change.limitations).toBe(AEROSOL_LOADING_LIMITATIONS);
  });

  it("reports a decreasing trend when column loading falls past the band", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.6 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.15 },
      AVAILABLE_THROUGH
    );
    expect(change.status).toBe("available");
    expect(change.trend).toBe("decreasing");
    expect(change.changeValue).toBeCloseTo(-0.45, 10);
  });

  it("reports little-change for a difference inside the threshold band", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.3 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.315 },
      AVAILABLE_THROUGH
    );
    expect(change.trend).toBe("little-change");
    expect(change.changeValue).toBeCloseTo(0.015, 10);
  });

  it("treats the threshold as an exclusive little-change boundary", () => {
    const atBoundary = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.02 },
      AVAILABLE_THROUGH
    );
    // A change of exactly the threshold (0.02) is reported, not little-change:
    // the band is `Math.abs(change) < threshold`, so the boundary is excluded.
    expect(atBoundary.changeValue).toBe(0.02);
    expect(atBoundary.trend).toBe("increasing");
  });

  it("honours a custom threshold", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.3 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.38 },
      AVAILABLE_THROUGH,
      { threshold: 0.1 }
    );
    expect(change.threshold).toBe(0.1);
    expect(change.trend).toBe("little-change");
  });

  it("refuses to span non-consecutive months without fabricating a value", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.2 },
      { dataMonth: { year: 2026, month: 3 }, value: 0.5 },
      AVAILABLE_THROUGH
    );
    expect(change.status).toBe("non-adjacent-months");
    expect(change.reason).toBe("months-not-consecutive");
    expect(change.changeValue).toBeNull();
    expect(change.trend).toBeNull();
  });

  it("rejects a reversed month order as non-consecutive", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 2 }, value: 0.2 },
      { dataMonth: { year: 2026, month: 1 }, value: 0.3 },
      AVAILABLE_THROUGH
    );
    expect(change.status).toBe("non-adjacent-months");
    expect(change.changeValue).toBeNull();
  });

  it("withholds a change when an endpoint is not yet published", () => {
    // March is published at the checkpoint; April is not, so no change is stated.
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 3 }, value: 0.2 },
      { dataMonth: { year: 2026, month: 4 }, value: 0.5 },
      AVAILABLE_THROUGH
    );
    expect(change.later.publicationStatus).toBe("not-yet-published");
    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
    expect(change.changeValue).toBeNull();
  });

  it("withholds a change when an endpoint has no usable coverage", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: null },
      { dataMonth: { year: 2026, month: 2 }, value: 0.5 },
      AVAILABLE_THROUGH
    );
    expect(change.earlier.coverage.status).toBe("no-data");
    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
  });

  it("marks an invalid threshold unavailable and falls back to the default", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.2 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.5 },
      AVAILABLE_THROUGH,
      { threshold: -1 }
    );
    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("invalid-threshold");
    expect(change.threshold).toBe(AEROSOL_LOADING_CHANGE_THRESHOLD);
    expect(change.changeValue).toBeNull();
  });
});

describe("rendered-ramp censoring at the open-ended top bin", () => {
  it("pins the ramp maximum to the calibrated probe scale GIBS's colormap sets", () => {
    // GIBS renders this product in 0.005 bins from 0.000 to 0.900, with a final
    // open-ended `>= 0.900` bin. Drifting from the probe scale would let a
    // censored reading be presented as a measurement again.
    expect(AEROSOL_RENDERED_RAMP_MAX).toBe(0.9);
    expect(AEROSOL_RENDERED_RAMP_MAX).toBe(PROBE_SCALES.aerosol.max);
  });

  it("treats a value inside the ramp as a two-sided reading", () => {
    const censoring = describeAerosolCensoring(0.32);
    expect(censoring).toMatchObject({
      status: "uncensored",
      isLowerBound: false,
      rampMax: 0.9,
      lowestPossibleCategory: "moderate",
    });
    expect(censoring?.statement).toContain("inside the rendered ramp");
  });

  it("reports a value at the ramp's top bin as a lower bound, not a measurement", () => {
    const censoring = describeAerosolCensoring(0.9);
    expect(censoring).toMatchObject({
      status: "censored-high",
      isLowerBound: true,
      // `high` is the *lowest* tier consistent with the reading; the true
      // loading could be `very-high` and the pixel would look identical.
      lowestPossibleCategory: "high",
    });
    expect(censoring?.statement).toContain("at least 0.9");
    expect(censoring?.statement).toContain("cannot be recovered");
  });

  it("declines to characterize a value that is not usable optical thickness", () => {
    expect(describeAerosolCensoring(null)).toBeNull();
    expect(describeAerosolCensoring(-0.1)).toBeNull();
    expect(describeAerosolCensoring(Number.NaN)).toBeNull();
  });

  it("cannot reach the very-high tier from a rendered reading", () => {
    // The literature break point (1.0) sits above the ramp's top bin, so the
    // tier is unreachable from imagery by construction. This guards the comment
    // on AEROSOL_LOADING_BANDS: if either number moves, the claim must be re-checked.
    const veryHigh = AEROSOL_LOADING_BANDS.find(
      (band) => band.category === "very-high"
    );
    expect(veryHigh?.minInclusive).toBeGreaterThan(AEROSOL_RENDERED_RAMP_MAX);
    expect(describeAerosolLoading(AEROSOL_RENDERED_RAMP_MAX)?.category).toBe(
      "high"
    );
  });

  it("attaches censoring to a summarized month", () => {
    const summary = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 1 }, value: 0.9, validFraction: 0.95 },
      AVAILABLE_THROUGH
    );
    expect(summary.censoring?.isLowerBound).toBe(true);
    expect(summary.observedValue).toBe(0.9);
    // Provenance and the cited source survive the bound.
    expect(summary.source).toEqual(LAYERS.aerosol.dataset);
  });

  it("leaves censoring null when there is no usable value", () => {
    const summary = summarizeAerosolLoading(
      { dataMonth: { year: 2026, month: 1 }, value: null },
      AVAILABLE_THROUGH
    );
    expect(summary.censoring).toBeNull();
  });

  it("names a rise from an uncensored month to a censored one a lower bound", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.3 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.9 },
      AVAILABLE_THROUGH
    );
    expect(change.status).toBe("available");
    // The direction is safe: the true later value is only higher still.
    expect(change.trend).toBe("increasing");
    expect(change.changeBound).toBe("bounded-below");
    expect(change.changeValue).toBeCloseTo(0.6, 10);
  });

  it("names a fall from a censored month to an uncensored one an upper bound", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.9 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.3 },
      AVAILABLE_THROUGH
    );
    expect(change.trend).toBe("decreasing");
    expect(change.changeBound).toBe("bounded-above");
    expect(change.changeValue).toBeCloseTo(-0.6, 10);
  });

  it("withholds the direction when censoring leaves it unresolved", () => {
    // 0.89 -> >=0.9 computes as +0.01, under the little-change threshold, but
    // the true later value could be 3.0. Calling that "little change" would
    // assert a stability the imagery cannot support.
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.89 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.9 },
      AVAILABLE_THROUGH
    );
    expect(change.status).toBe("available");
    expect(change.trend).toBeNull();
    expect(change.reason).toBe("censored-endpoint-direction-unresolved");
    expect(change.changeBound).toBe("bounded-below");
    // The bound itself is still reportable.
    expect(change.changeValue).toBeCloseTo(0.01, 10);
  });

  it("withholds a change entirely when both months saturate the ramp", () => {
    // Both read 0.9, so the arithmetic difference is 0 -- but the true months
    // could be 0.9 and 3.0 in either order. Neither sign nor size survives.
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.9 },
      { dataMonth: { year: 2026, month: 2 }, value: 1.4 },
      AVAILABLE_THROUGH
    );
    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("both-endpoints-censored");
    expect(change.changeBound).toBe("indeterminate");
    expect(change.changeValue).toBeNull();
    expect(change.trend).toBeNull();
  });

  it("marks an ordinary in-ramp comparison exact", () => {
    const change = describeAerosolLoadingChange(
      { dataMonth: { year: 2026, month: 1 }, value: 0.2 },
      { dataMonth: { year: 2026, month: 2 }, value: 0.5 },
      AVAILABLE_THROUGH
    );
    expect(change.changeBound).toBe("exact");
    expect(change.trend).toBe("increasing");
  });

  it("states the censoring limit alongside the other scope limits", () => {
    expect(
      AEROSOL_LOADING_LIMITATIONS.some((limit) => limit.includes("open-ended"))
    ).toBe(true);
  });
});
