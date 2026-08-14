import { describe, expect, it } from "vitest";
import {
  dominantMonthTieClause,
  peakGreennessClause,
  peakSupportClause,
  peakTieClause,
  peakYearCoverageClause,
  probePeakGreennessTiming,
  probePeakSupport,
  probeSeasonalConcentration,
  seasonalConcentrationClause,
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

describe("probePeakSupport", () => {
  it("returns null for layers that are not MOD13A3 NDVI", () => {
    const range = months(2001, 60);
    const values = cycle(range, 7);
    expect(probePeakSupport("evi", range, values, 45)).toBeNull();
    expect(probePeakSupport("lst", range, values, 45)).toBeNull();
  });

  it("returns null when the series carries no months at all", () => {
    expect(probePeakSupport("ndvi", [], [], 12)).toBeNull();
  });

  it("assesses each year the annual summaries reported a peak for", () => {
    const range = months(2001, 12 * 5);
    const support = probePeakSupport("ndvi", range, cycle(range, 7), 52);

    expect(support?.status).toBe("available");
    expect(support?.coverage.usableYearCount).toBe(5);
    // A July peak in a complete year is flanked by observed June and August.
    expect(support?.peakTally.bracketed).toBe(5);
    expect(support?.source.shortName).toBe("MOD13A3");
  });

  it("summarizes the same record regardless of supply order, including exact ties", () => {
    const range = months(2001, 12 * 4);
    // June and July tie exactly at the annual maximum. MOD13A3 months are
    // decoded from a quantised colour ramp, so exact ties are ordinary; the
    // summary must not depend on which one arrived first.
    const values = range.map((ym) =>
      ym.month === 6 || ym.month === 7 ? 0.6 : 0.3
    );
    const forward = probePeakSupport("ndvi", range, values, 52);
    const backward = probePeakSupport(
      "ndvi",
      [...range].reverse(),
      [...values].reverse(),
      52
    );

    expect(forward?.status).toBe("available");
    expect(backward).toEqual(forward);
  });
});

describe("peakSupportClause", () => {
  it("omits itself when either summary is unavailable", () => {
    expect(peakSupportClause(null, null)).toBeNull();
  });

  it("stays silent when every contributing peak is bracketed", () => {
    const range = months(2001, 12 * 5);
    const values = cycle(range, 7);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);
    const support = probePeakSupport("ndvi", range, values, 52);

    // Nothing to caveat, so the status line must not grow.
    expect(peakGreennessClause(timing)).not.toBeNull();
    expect(peakSupportClause(timing, support)).toBeNull();
  });

  it("names the bracketed share when a data gap flanks a peak", () => {
    const range = months(2001, 12 * 5);
    const base = cycle(range, 7);
    // Drop June 2003 only: that year's July peak loses an observed flank, so
    // an unobserved higher month could sit right beside it.
    const gapIndex = range.findIndex(
      (ym) => ym.year === 2003 && ym.month === 6
    );
    const values = base.map((v, i) => (i === gapIndex ? null : v));
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);
    const support = probePeakSupport("ndvi", range, values, 52);

    expect(support?.peakTally.flankGap).toBe(1);
    expect(peakSupportClause(timing, support)).toBe(
      "peak bracketed by observed neighbours in 4/5 yr"
    );
  });

  it("stays silent when the timing clause named no month", () => {
    const range = months(2001, 24); // under the three-year timing minimum
    const values = cycle(range, 7);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);
    const support = probePeakSupport("ndvi", range, values, 52);

    expect(timing?.status).toBe("insufficient-years");
    expect(peakSupportClause(timing, support)).toBeNull();
  });

  it("never states an NDVI value or an ecological conclusion", () => {
    const range = months(2001, 12 * 5);
    const base = cycle(range, 7);
    const gapIndex = range.findIndex(
      (ym) => ym.year === 2003 && ym.month === 6
    );
    const values = base.map((v, i) => (i === gapIndex ? null : v));
    const clause =
      peakSupportClause(
        probePeakGreennessTiming("ndvi", range, values, 52),
        probePeakSupport("ndvi", range, values, 52)
      ) ?? "";

    expect(clause).not.toMatch(/0\.\d/);
    expect(clause).not.toMatch(/health|biomass|productiv|greener|degrad/i);
  });
});

describe("peakTieClause", () => {
  /**
   * A probe series whose peak month is exactly matched by the month after it in
   * `tiedYears`. The plateau uses the identical float in both months, which is
   * what a quantised ramp and MOD13A3 monthly compositing actually produce.
   */
  function plateau(
    monthList: readonly YearMonth[],
    peakMonth: number,
    tiedYears: readonly number[]
  ): number[] {
    return monthList.map((ym) => {
      const separation = Math.abs(ym.month - peakMonth) % 12;
      const circular = Math.min(separation, 12 - separation);
      const base = 0.55 - 0.05 * circular;
      const isSecondPeak =
        tiedYears.includes(ym.year) && ym.month === peakMonth + 1;
      return isSecondPeak ? 0.55 : base;
    });
  }

  it("says how many years shared their peak across months", () => {
    const range = months(2001, 12 * 5);
    const values = plateau(range, 7, [2002, 2004]);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);

    // The plateaued years still contribute at July, the earliest tied month.
    expect(timing?.dominantPeakMonth).toMatchObject({ month: 7, count: 5 });
    expect(peakTieClause(timing)).toBe(
      "annual peak tied across months in 2/5 yr (earliest counted)"
    );
  });

  it("stays silent when every year held its peak in one month", () => {
    const range = months(2001, 12 * 5);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 7), 52);

    // A cleanly dated record must not grow the status line at all.
    expect(timing?.coverage.tiedPeakYearCount).toBe(0);
    expect(peakTieClause(timing)).toBeNull();
  });

  it("stays silent when the timing clause named no month", () => {
    const range = months(2001, 24); // under the three-year timing minimum
    const timing = probePeakGreennessTiming(
      "ndvi",
      range,
      plateau(range, 7, [2001, 2002]),
      52
    );

    expect(timing?.status).toBe("insufficient-years");
    expect(peakTieClause(timing)).toBeNull();
  });

  it("stays silent for a layer that is not NDVI", () => {
    expect(peakTieClause(null)).toBeNull();
  });

  it("never states an NDVI value or an ecological conclusion", () => {
    const range = months(2001, 12 * 5);
    const clause =
      peakTieClause(
        probePeakGreennessTiming(
          "ndvi",
          range,
          plateau(range, 7, [2002, 2003]),
          52
        )
      ) ?? "";

    expect(clause).not.toBe("");
    expect(clause).not.toMatch(/0\.\d/);
    expect(clause).not.toMatch(
      /health|biomass|productiv|greener|degrad|season/i
    );
  });
});

describe("dominantMonthTieClause", () => {
  /**
   * A record whose annual peak follows `peakMonths` year by year, so a tally
   * where two months hold the annual peak in exactly as many years can be built
   * deliberately. Shares `cycle`'s tiny month-proportional tie-break term, which
   * is far smaller than the 0.05 step per month of circular distance and so can
   * never move a year's peak off its assigned month.
   */
  function cycleByYear(
    monthList: readonly YearMonth[],
    startYear: number,
    peakMonths: readonly number[]
  ): number[] {
    return monthList.map((ym) => {
      const peakMonth = peakMonths[ym.year - startYear] ?? peakMonths[0];
      const separation = Math.abs(ym.month - peakMonth) % 12;
      const circular = Math.min(separation, 12 - separation);
      return 0.55 - 0.05 * circular + 0.002 * ym.month;
    });
  }

  it("names the month that reached the same tally as the one reported", () => {
    const range = months(2001, 12 * 5);
    // Two Junes, two Julys, one August: July and June lead the tally equally.
    const values = cycleByYear(range, 2001, [6, 6, 7, 7, 8]);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);

    expect(timing?.peakMonthCounts).toEqual([
      expect.objectContaining({ month: 6, count: 2 }),
      expect.objectContaining({ month: 7, count: 2 }),
      expect.objectContaining({ month: 8, count: 1 }),
    ]);
    // The timing clause names one of the two equal leaders and quotes a count
    // that cannot reveal the other reached it — which is what this qualifies.
    expect(timing?.dominantPeakMonth).toMatchObject({ month: 7, count: 2 });
    expect(peakGreennessClause(timing)).toContain("usually Jul (2/5 yr");
    expect(dominantMonthTieClause(timing)).toBe(
      "modal peak month tied with Jun (nearest the circular mean named)"
    );
  });

  it("names the earliest-month fallback when no circular mean exists", () => {
    const range = months(2001, 12 * 4);
    // Two Januarys and two Julys sit opposite each other on the calendar
    // circle, so the resultant vector collapses and no mean direction is
    // defined. `dominantMonth` then falls back to the smaller month number, and
    // the clause must not claim a circular-mean tie-break it did not use.
    const values = cycleByYear(range, 2001, [1, 1, 7, 7]);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);

    expect(timing?.status).toBe("available");
    expect(timing?.circularMeanMonth).toBeNull();
    expect(timing?.dominantPeakMonth).toMatchObject({ month: 1, count: 2 });
    expect(dominantMonthTieClause(timing)).toBe(
      "modal peak month tied with Jul (earliest named)"
    );
  });

  it("lists every co-leader, in calendar order", () => {
    const range = months(2001, 12 * 3);
    const values = cycleByYear(range, 2001, [4, 6, 9]);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);

    // Three single-peak years tie at one apiece. June sits nearest the circular
    // mean of the three, so it is reported and the other two are the rivals —
    // listed by month rather than in tally order.
    expect(timing?.dominantPeakMonth).toMatchObject({ month: 6, count: 1 });
    expect(dominantMonthTieClause(timing)).toBe(
      "modal peak month tied with Apr, Sep (nearest the circular mean named)"
    );
  });

  it("stays silent when the named month leads the tally outright", () => {
    const range = months(2001, 12 * 5);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 7), 52);

    // A decisive record must not grow the status line at all.
    expect(timing?.dominantPeakMonth).toMatchObject({ month: 7, count: 5 });
    expect(dominantMonthTieClause(timing)).toBeNull();
  });

  it("stays silent when the timing clause named no month", () => {
    const range = months(2001, 24); // under the three-year timing minimum
    const timing = probePeakGreennessTiming(
      "ndvi",
      range,
      cycleByYear(range, 2001, [6, 7]),
      52
    );

    expect(timing?.status).toBe("insufficient-years");
    expect(dominantMonthTieClause(timing)).toBeNull();
  });

  it("stays silent for a layer that is not NDVI", () => {
    expect(dominantMonthTieClause(null)).toBeNull();
  });

  it("reports the same tie whichever order the months arrive in", () => {
    const range = months(2001, 12 * 5);
    const values = cycleByYear(range, 2001, [6, 6, 7, 7, 8]);
    const forward = probePeakGreennessTiming("ndvi", range, values, 52);
    const reversed = probePeakGreennessTiming(
      "ndvi",
      [...range].reverse(),
      [...values].reverse(),
      52
    );

    // An exact tally tie is the input-order trap: the reduction must not hand
    // the lead to whichever equal month the supply order happened to visit
    // first.
    expect(dominantMonthTieClause(reversed)).toBe(
      dominantMonthTieClause(forward)
    );
    expect(reversed?.dominantPeakMonth?.month).toBe(
      forward?.dominantPeakMonth?.month
    );
  });

  it("states no NDVI value and no ecological conclusion", () => {
    const range = months(2001, 12 * 5);
    const clause =
      dominantMonthTieClause(
        probePeakGreennessTiming(
          "ndvi",
          range,
          cycleByYear(range, 2001, [6, 6, 7, 7, 8]),
          52
        )
      ) ?? "";

    expect(clause).not.toBe("");
    expect(clause).not.toMatch(/0\.\d/);
    expect(clause).not.toMatch(
      /health|biomass|productiv|greener|degrad|season|amplitude/i
    );
  });
});

describe("seasonalConcentrationClause", () => {
  /**
   * A year with two comparable greenness maxima half a year apart, which is
   * what a bimodal humid-tropical record looks like. January edges July out, so
   * the timing clause still names a month — but the year's above-minimum
   * greenness is split between opposite points of the calendar circle, so the
   * resultant very nearly cancels and R lands near zero.
   */
  function bimodal(monthList: readonly YearMonth[]): number[] {
    return monthList.map((ym) => {
      if (ym.month === 1) return 0.6;
      if (ym.month === 7) return 0.59;
      return 0.2;
    });
  }

  it("qualifies a peak month that tops a year with no single centre", () => {
    const range = months(2001, 12 * 5);
    const values = bimodal(range);
    const timing = probePeakGreennessTiming("ndvi", range, values, 8);

    // The argmax is January every year, so the timing clause reads confidently.
    expect(timing?.dominantPeakMonth).toMatchObject({ month: 1, count: 5 });
    expect(peakGreennessClause(timing)).toContain(
      "peak NDVI month usually Jan"
    );

    const concentrations = probeSeasonalConcentration("ndvi", range, values, 8);
    expect(seasonalConcentrationClause(timing, concentrations)).toBe(
      "within-year greenness near-aseasonal (median 0.01 over 5 yr)"
    );
  });

  /**
   * Two opposed months carry all of the above-minimum greenness, so the year's
   * magnitude-weighted resultant is exactly (w1 − w7) / (w1 + w7). That lets a
   * fixture land R just under a bin break point, where the value the clause
   * prints and the value it classified stop agreeing.
   */
  function opposed(
    monthList: readonly YearMonth[],
    weightJan: number,
    weightJul: number
  ): number[] {
    return monthList.map((ym) => {
      if (ym.month === 1) return 0.2 + weightJan;
      if (ym.month === 7) return 0.2 + weightJul;
      return 0.2;
    });
  }

  it("labels the median it prints, not the one it computed", () => {
    const range = months(2001, 12 * 5);
    // R = 0.1499, which rounds to the 0.15 break into the weakly-seasonal bin.
    const values = opposed(range, 0.57495, 0.42505);
    const timing = probePeakGreennessTiming("ndvi", range, values, 8);
    const concentrations = probeSeasonalConcentration("ndvi", range, values, 8);

    // The raw value really does sit in the aseasonal bin — the rounding, not
    // the measurement, is what moves the label.
    expect(concentrations?.[0]?.seasonalityClass).toBe("aseasonal");
    expect(seasonalConcentrationClause(timing, concentrations)).toBe(
      "within-year greenness weakly seasonal (median 0.15 over 5 yr)"
    );
  });

  it("stays silent when the printed median reads as seasonal", () => {
    const range = months(2001, 12 * 5);
    // R = 0.3499 rounds to 0.35, the break out of the weakly-seasonal bin, so
    // the clause must not print a label the number beside it contradicts.
    const values = opposed(range, 0.67495, 0.32505);
    const timing = probePeakGreennessTiming("ndvi", range, values, 8);
    const concentrations = probeSeasonalConcentration("ndvi", range, values, 8);

    expect(concentrations?.[0]?.seasonalityClass).toBe("weakly-seasonal");
    expect(seasonalConcentrationClause(timing, concentrations)).toBeNull();
  });

  it("leaves a median clear of a break point untouched", () => {
    const range = months(2001, 12 * 5);
    // R = 0.30, well inside the weakly-seasonal bin either way.
    const values = opposed(range, 0.65, 0.35);
    const timing = probePeakGreennessTiming("ndvi", range, values, 8);
    const concentrations = probeSeasonalConcentration("ndvi", range, values, 8);

    expect(seasonalConcentrationClause(timing, concentrations)).toBe(
      "within-year greenness weakly seasonal (median 0.30 over 5 yr)"
    );
  });

  it("stays silent for a record that peaks on one season", () => {
    const range = months(2001, 12 * 5);
    const values = cycle(range, 7);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);
    const concentrations = probeSeasonalConcentration(
      "ndvi",
      range,
      values,
      52
    );

    // A single-crested year sits in the "seasonal" bin, so a normal
    // mid-latitude record must not grow the status line at all.
    expect(concentrations?.[0]?.seasonalityClass).toBe("seasonal");
    expect(seasonalConcentrationClause(timing, concentrations)).toBeNull();
  });

  it("stays silent when the timing clause named no month", () => {
    const range = months(2001, 24); // under the three-year timing minimum
    const values = bimodal(range);
    const timing = probePeakGreennessTiming("ndvi", range, values, 8);

    expect(timing?.status).toBe("insufficient-years");
    expect(
      seasonalConcentrationClause(
        timing,
        probeSeasonalConcentration("ndvi", range, values, 8)
      )
    ).toBeNull();
  });

  it("returns null for layers that are not MOD13A3 NDVI", () => {
    const range = months(2001, 12 * 5);
    expect(
      probeSeasonalConcentration("evi", range, bimodal(range), 8)
    ).toBeNull();
    expect(seasonalConcentrationClause(null, null)).toBeNull();
  });

  it("does not depend on the order the months arrive in", () => {
    const range = months(2001, 12 * 5);
    const values = bimodal(range);
    // An exact tie between two months is ordinary here: MOD13A3 composites a
    // month to one value and the probe decodes a quantised ramp.
    const forward = probeSeasonalConcentration("ndvi", range, values, 8);
    const reversedRange = [...range].reverse();
    const reversed = probeSeasonalConcentration(
      "ndvi",
      reversedRange,
      [...values].reverse(),
      8
    );

    expect(reversed?.map((year) => year.year)).toEqual(
      forward?.map((year) => year.year)
    );
    forward?.forEach((year, index) => {
      expect(reversed?.[index]?.centroidMonth).toBe(year.centroidMonth);
      expect(reversed?.[index]?.status).toBe(year.status);
      // Compensated summation is not guaranteed bit-identical across orders.
      expect(reversed?.[index]?.concentration ?? 0).toBeCloseTo(
        year.concentration ?? 0,
        12
      );
    });
  });

  it("states no NDVI amplitude and no ecological conclusion", () => {
    const range = months(2001, 12 * 5);
    const values = bimodal(range);
    const clause =
      seasonalConcentrationClause(
        probePeakGreennessTiming("ndvi", range, values, 8),
        probeSeasonalConcentration("ndvi", range, values, 8)
      ) ?? "";

    expect(clause).not.toBe("");
    // R is scale-invariant, so the copy must never suggest a swing size.
    expect(clause).not.toMatch(/amplitude|swing|range|variation|flat/i);
    expect(clause).not.toMatch(
      /health|biomass|productiv|degrad|evergreen|growing|phenophase/i
    );
  });
});

/**
 * Blank every month of `sparseYears` except `keep` of them, so those years fall
 * below the six usable months an annual extremum needs and drop out of the
 * timing summary. A null is the probe's own representation of an unsampled or
 * no-data month, so this is the shape a patchy MOD13A3 read actually produces.
 */
function sparsifyYears(
  monthList: readonly YearMonth[],
  values: readonly number[],
  sparseYears: readonly number[],
  keep = 3
): (number | null)[] {
  const kept = new Map<number, number>();
  return monthList.map((ym, index) => {
    if (!sparseYears.includes(ym.year)) return values[index];
    const takenSoFar = kept.get(ym.year) ?? 0;
    if (takenSoFar >= keep) return null;
    kept.set(ym.year, takenSoFar + 1);
    return values[index];
  });
}

describe("peakYearCoverageClause", () => {
  it("is silent when every supplied year contributed a peak", () => {
    const range = months(2001, 12 * 6);
    const timing = probePeakGreennessTiming("ndvi", range, cycle(range, 8), 52);

    expect(timing?.coverage.contributingYearCount).toBe(6);
    expect(timing?.coverage.sparseYearCount).toBe(0);
    expect(timing?.coverage.invalidYearCount).toBe(0);
    // A clean record must add no width to the status line.
    expect(peakYearCoverageClause(timing)).toBeNull();
  });

  it("names how many probed years dropped out, and why", () => {
    const range = months(2001, 12 * 8);
    const values = sparsifyYears(range, cycle(range, 8), [2001, 2002]);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);

    expect(timing?.status).toBe("available");
    expect(timing?.coverage.contributingYearCount).toBe(6);
    expect(timing?.coverage.sparseYearCount).toBe(2);
    expect(peakYearCoverageClause(timing)).toBe(
      "peak timing from 6/8 yr (2003–2008; 2 under 6 usable months)"
    );
  });

  it("spans the contributing years, not the probed record", () => {
    // 2001-2002 dropped out, so the span opens at 2003 even though the probe
    // supplied months from 2001 onward. The exclusion count beside it is what
    // says the span is not a claim of unbroken coverage.
    const range = months(2001, 12 * 8);
    const values = sparsifyYears(range, cycle(range, 8), [2001, 2002]);
    const clause = peakYearCoverageClause(
      probePeakGreennessTiming("ndvi", range, values, 52)
    );

    expect(clause).toContain("2003–2008");
    expect(clause).not.toContain("2001");
  });

  it("keeps the same denominator the peak clause reports", () => {
    const range = months(2001, 12 * 8);
    const values = sparsifyYears(range, cycle(range, 8), [2004]);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);

    // The peak clause counts against the contributing years; this clause exists
    // to say what that number is a fraction OF, so the two must agree on it.
    expect(peakGreennessClause(timing)).toContain("7/7 yr");
    expect(peakYearCoverageClause(timing)).toContain("from 7/8 yr");
  });

  it("is silent when the timing clause named no month to qualify", () => {
    // Two years is below MINIMUM_YEARS_FOR_PEAK_TIMING, so the timing summary
    // is "insufficient-years" and there is no modal month to qualify.
    const range = months(2001, 12 * 2);
    const values = sparsifyYears(range, cycle(range, 8), [2001]);
    const timing = probePeakGreennessTiming("ndvi", range, values, 52);

    expect(timing?.status).toBe("insufficient-years");
    expect(peakYearCoverageClause(timing)).toBeNull();
    expect(peakYearCoverageClause(null)).toBeNull();
  });

  it("does not depend on the order the months were supplied", () => {
    const range = months(2001, 12 * 8);
    const values = sparsifyYears(range, cycle(range, 8), [2001, 2005]);
    const forward = peakYearCoverageClause(
      probePeakGreennessTiming("ndvi", range, values, 52)
    );
    const reversed = peakYearCoverageClause(
      probePeakGreennessTiming(
        "ndvi",
        [...range].reverse(),
        [...values].reverse(),
        52
      )
    );

    expect(forward).not.toBeNull();
    expect(reversed).toBe(forward);
  });

  it("reports record coverage only, never vegetation", () => {
    const range = months(2001, 12 * 8);
    const values = sparsifyYears(range, cycle(range, 8), [2001, 2002]);
    const clause =
      peakYearCoverageClause(
        probePeakGreennessTiming("ndvi", range, values, 52)
      ) ?? "";

    expect(clause).not.toBe("");
    // A dropped year is a coverage fact; it must not read as a year without
    // vegetation, nor imply any ecological or causal conclusion.
    expect(clause).not.toMatch(
      /health|biomass|productiv|degrad|habitat|greenness|phenophase|growing/i
    );
    expect(clause).not.toMatch(/because|caused|driven|expect|forecast|trend/i);
  });
});
