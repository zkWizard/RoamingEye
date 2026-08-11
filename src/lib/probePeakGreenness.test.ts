import { describe, expect, it } from "vitest";
import {
  peakGreennessClause,
  probePeakGreennessTiming,
} from "./probePeakGreenness";
import type { YearMonth } from "./timeline";

/** Build a contiguous monthly range starting at Jan of `startYear`. */
function months(startYear: number, count: number): YearMonth[] {
  const out: YearMonth[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ year: startYear + Math.floor(i / 12), month: (i % 12) + 1 });
  }
  return out;
}

/**
 * A seasonal cycle whose maximum lands on `peakMonth` every year. Values stay
 * inside NDVI's valid [-1, 1] range and inside the probe's 0..1 NDVI scale.
 *
 * The tiny month-proportional term only breaks ties: it is far smaller than the
 * 0.05 step per month of circular distance, so it can never move the peak, but
 * it keeps the two months either side of the peak distinguishable.
 */
function cycle(monthList: readonly YearMonth[], peakMonth: number): number[] {
  return monthList.map((ym) => {
    const separation = Math.abs(ym.month - peakMonth) % 12;
    const circular = Math.min(separation, 12 - separation); // 0..6
    return 0.55 - 0.05 * circular + 0.002 * ym.month;
  });
}

describe("probePeakGreennessTiming", () => {
  it("returns null for layers that are not MOD13A3 NDVI", () => {
    const range = months(2001, 60);
    const values = cycle(range, 7);
    // EVI is the same product but a different index; the summaries would be
    // stamped with NDVI provenance, so the bridge declines them.
    expect(probePeakGreennessTiming("evi", range, values, 45)).toBeNull();
    expect(probePeakGreennessTiming("lst", range, values, 45)).toBeNull();
    expect(probePeakGreennessTiming("precip", range, values, 45)).toBeNull();
  });

  it("recovers a stable northern peak month across years", () => {
    const range = months(2001, 12 * 6);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 8), 52);

    expect(timing).not.toBeNull();
    expect(timing?.status).toBe("available");
    expect(timing?.hemisphere).toBe("northern");
    expect(timing?.dominantPeakMonth?.month).toBe(8);
    expect(timing?.dominantPeakMonth?.count).toBe(6);
    expect(timing?.coverage.contributingYearCount).toBe(6);
    // Every year peaked in the same month, so the peaks are coincident on the
    // calendar circle and the mean resultant length saturates at 1.
    expect(timing?.meanResultantLength).toBeCloseTo(1, 10);
    expect(timing?.timingConcordance).toBe("tightly-clustered");
  });

  it("labels the calendar season for the sampled hemisphere", () => {
    const range = months(2001, 12 * 5);
    const january = probePeakGreennessTiming(
      "ndvi",
      range,
      cycle(range, 1),
      -30
    );

    expect(january?.hemisphere).toBe("southern");
    expect(january?.dominantPeakMonth?.month).toBe(1);
    // January is southern-hemisphere summer, not winter.
    expect(january?.dominantPeakMonth?.meteorologicalSeason).toBe("summer");
  });

  it("is invariant to a strictly increasing rescaling of the values", () => {
    const range = months(2001, 12 * 5);
    const base = cycle(range, 6);
    // Stands in for the legend ramp's calibration error: order-preserving, so
    // the argmax month — and therefore the whole timing summary — must not move.
    const rescaled = base.map((v) => 0.4 * v + 0.11);

    const before = probePeakGreennessTiming("ndvi", range, base, 40);
    const after = probePeakGreennessTiming("ndvi", range, rescaled, 40);

    expect(after?.dominantPeakMonth).toEqual(before?.dominantPeakMonth);
    expect(after?.meanResultantLength).toBeCloseTo(
      before?.meanResultantLength ?? -1,
      12
    );
  });

  it("treats unsampled months as missing rather than as zero greenness", () => {
    const range = months(2001, 12 * 5);
    const values: (number | null)[] = cycle(range, 7);
    // Blank the peak month of the first year only. A null must not be read as
    // a low NDVI value, and it must not shift that year's peak to a real month
    // by being counted as data.
    const firstPeak = range.findIndex(
      (ym) => ym.year === 2001 && ym.month === 7
    );
    values[firstPeak] = null;

    const timing = probePeakGreennessTiming("ndvi", range, values, 41);
    expect(timing?.status).toBe("available");
    expect(timing?.coverage.contributingYearCount).toBe(5);
    // Four years still peak in July; 2001's peak falls to the adjacent August
    // rather than the year being dropped or read as zero greenness.
    expect(timing?.dominantPeakMonth?.month).toBe(7);
    expect(timing?.dominantPeakMonth?.count).toBe(4);
    expect(timing?.peakMonthCounts).toEqual([
      expect.objectContaining({ month: 7, count: 4 }),
      expect.objectContaining({ month: 8, count: 1 }),
    ]);
  });

  it("reports insufficient years rather than guessing from a short record", () => {
    const range = months(2001, 14);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 8), 44);

    // Two calendar years, one of them a 2-month stub below the annual minimum.
    expect(timing?.status).toBe("insufficient-years");
    expect(timing?.dominantPeakMonth).toBeNull();
    expect(timing?.meanResultantLength).toBeNull();
  });

  it("returns null when the series carries no months at all", () => {
    expect(probePeakGreennessTiming("ndvi", [], [], 12)).toBeNull();
  });

  it("keeps MOD13A3 provenance and the NDVI unit on the summary", () => {
    const range = months(2001, 12 * 4);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 5), 33);

    expect(timing?.source.shortName).toBe("MOD13A3");
    expect(timing?.source.doi).toBe("10.5067/MODIS/MOD13A3.061");
    expect(timing?.unit).toBe("NDVI (unitless)");
  });
});

describe("peakGreennessClause", () => {
  it("omits itself entirely for a non-NDVI layer", () => {
    expect(peakGreennessClause(null)).toBeNull();
  });

  it("names the modal month with its support and the resultant length", () => {
    const range = months(2001, 12 * 6);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 8), 52);

    expect(peakGreennessClause(timing)).toBe(
      "peak NDVI month usually Aug (6/6 yr · R 1.00)"
    );
  });

  it("says so plainly when the record is too short", () => {
    const range = months(2001, 14);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 8), 44);

    expect(peakGreennessClause(timing)).toBe("peak NDVI month: too few years");
  });

  it("never states a peak NDVI value, only a month", () => {
    const range = months(2001, 12 * 6);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 8), 52);
    const clause = peakGreennessClause(timing) ?? "";

    // The legend inversion's absolute error would carry into a magnitude, so
    // the clause must stay purely about timing.
    expect(clause).not.toMatch(/0\.\d\d\d/);
    expect(clause).toContain("month");
  });
});
