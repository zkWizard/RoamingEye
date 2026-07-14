import { describe, expect, it } from "vitest";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  summarizeAnnualNdviPhenology,
} from "./phenology";
import { describeNdviAnnualLimb } from "./phenologyLimb";

/** Build a single-year annual summary from month/ndvi pairs at a latitude. */
function annualFrom(
  months: readonly (readonly [number, number])[],
  latitude: number,
  year = 2025
) {
  const [summary] = summarizeAnnualNdviPhenology(
    months.map(([month, ndvi]) => ({ month: { year, month }, ndvi })),
    latitude
  );
  return summary;
}

describe("describeNdviAnnualLimb", () => {
  it("reports a rising limb when the trough precedes the peak in calendar order", () => {
    const limb = describeNdviAnnualLimb(
      annualFrom(
        [
          [3, 0.24],
          [4, 0.39],
          [5, 0.61],
          [6, 0.82],
          [7, 0.74],
          [8, 0.42],
        ],
        48.8
      )
    );

    expect(limb).toMatchObject({
      kind: "observed-ndvi-annual-limb",
      isForecast: false,
      year: 2025,
      hemisphere: "northern",
      status: "available",
      limb: {
        direction: "rising",
        start: { month: { year: 2025, month: 3 }, ndvi: 0.24 },
        end: { month: { year: 2025, month: 6 }, ndvi: 0.82 },
        spanMonths: 3,
      },
      unit: NDVI_UNIT,
      reason: null,
    });
    // Signed change equals the annual seasonal range on a rising limb.
    expect(limb.limb?.ndviChange).toBeCloseTo(0.58, 12);
    // NASA MOD13A3 provenance survives the descriptor.
    expect(limb.source).toBe(NDVI_SOURCE);
  });

  it("reports a falling limb when the peak precedes the trough in calendar order", () => {
    const limb = describeNdviAnnualLimb(
      annualFrom(
        [
          [2, 0.7],
          [3, 0.55],
          [4, 0.4],
          [5, 0.3],
          [6, 0.35],
          [7, 0.6],
        ],
        45
      )
    );

    expect(limb.status).toBe("available");
    expect(limb.limb).toMatchObject({
      direction: "falling",
      start: { month: { year: 2025, month: 2 }, ndvi: 0.7 },
      end: { month: { year: 2025, month: 5 }, ndvi: 0.3 },
      spanMonths: 3,
    });
    expect(limb.limb?.ndviChange).toBeCloseTo(-0.4, 12);
  });

  it("carries the extrema calendar-season labels through unchanged", () => {
    const limb = describeNdviAnnualLimb(
      annualFrom(
        [
          [3, 0.24],
          [4, 0.39],
          [5, 0.61],
          [6, 0.82],
          [7, 0.74],
          [8, 0.42],
        ],
        48.8
      )
    );

    expect(limb.limb?.start.meteorologicalSeason).toBe("spring");
    expect(limb.limb?.end.meteorologicalSeason).toBe("summer");
  });

  it("reports a flat year with no within-year variation as flat, not a zero-length limb", () => {
    const limb = describeNdviAnnualLimb(
      annualFrom(
        [
          [1, 0.5],
          [2, 0.5],
          [3, 0.5],
          [4, 0.5],
          [5, 0.5],
          [6, 0.5],
        ],
        10
      )
    );

    expect(limb.status).toBe("flat");
    expect(limb.limb).toBeNull();
    expect(limb.reason).toBe("no-within-year-variation");
  });

  it("carries no limb for a sparse year below the annual-extrema threshold", () => {
    const limb = describeNdviAnnualLimb(
      annualFrom(
        [
          [5, 0.4],
          [6, 0.7],
          [7, 0.5],
        ],
        48.8
      )
    );

    expect(limb.status).toBe("sparse");
    expect(limb.limb).toBeNull();
    expect(limb.reason).toBe("sparse-year");
  });

  it("keeps the equatorial hemisphere without inventing a seasonal label", () => {
    const limb = describeNdviAnnualLimb(
      annualFrom(
        [
          [1, 0.3],
          [2, 0.35],
          [3, 0.45],
          [4, 0.6],
          [5, 0.55],
          [6, 0.4],
        ],
        0
      )
    );

    expect(limb.hemisphere).toBe("equatorial");
    expect(limb.status).toBe("available");
    expect(limb.limb?.direction).toBe("rising");
    expect(limb.limb?.start.meteorologicalSeason).toBe("not-assigned");
    expect(limb.limb?.end.meteorologicalSeason).toBe("not-assigned");
  });
});
