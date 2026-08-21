import { describe, expect, it } from "vitest";
import {
  precipitationCycleClause,
  precipitationRecordClause,
  probePrecipitationAnnualTotals,
  probePrecipitationCycle,
  probePrecipitationRecordMargin,
  probePrecipitationSeasonalTiming,
} from "./probePrecipitationCycle";
import { SECONDS_PER_DAY } from "./precipitationAccumulation";
import { PROBE_SCALES, csvDecimals, quantizationStep } from "./probe";
import { MINIMUM_PRECIP_ANNUAL_CYCLE_YEARS_PER_MONTH } from "./precipitationAnnualCycle";
import type { YearMonth } from "./timeline";

/**
 * A synthetic probe series: `years` calendar years of monthly mm/day values
 * taken from `perMonthMmPerDay`, indexed by calendar month. Built the way the
 * probe supplies its own series — months ascending, physical units, nulls for
 * months that carried no usable value.
 */
function series(
  years: number,
  perMonthMmPerDay: readonly (number | null)[],
  startYear = 2000
): { months: YearMonth[]; values: (number | null)[] } {
  const months: YearMonth[] = [];
  const values: (number | null)[] = [];
  for (let y = 0; y < years; y++) {
    for (let month = 1; month <= 12; month++) {
      months.push({ year: startYear + y, month });
      values.push(perMonthMmPerDay[month - 1]);
    }
  }
  return { months, values };
}

/** A flat 1 mm/day year with one wet month, so the extremes are unambiguous. */
const ONE_WET_MONTH = [1, 1, 1, 1, 1, 1, 10, 1, 1, 1, 1, 1];

describe("probePrecipitationCycle", () => {
  it("returns null for every layer but precipitation", () => {
    const { months, values } = series(4, ONE_WET_MONTH);
    for (const layer of ["soil", "snow", "ndvi", "airtemp", "sst"] as const) {
      expect(probePrecipitationCycle(layer, months, values)).toBeNull();
    }
    expect(probePrecipitationCycle(undefined, months, values)).toBeNull();
    expect(probePrecipitationCycle("precip", months, values)).not.toBeNull();
  });

  it("returns null when the series carries no months", () => {
    expect(probePrecipitationCycle("precip", [], [])).toBeNull();
  });

  it("converts the probe's mm/day values back to the metric's native rate", () => {
    // 1 mm/day integrated over a 31-day January is 31 mm; over a 30-day
    // November, 30 mm. A fixed month length would print the same depth for
    // both, which is the calendar-length error this conversion avoids.
    const { months, values } = series(4, ONE_WET_MONTH);
    const cycle = probePrecipitationCycle("precip", months, values);
    const january = cycle?.monthlyClimatology.find(
      (month) => month.calendarMonth === 1
    );
    const november = cycle?.monthlyClimatology.find(
      (month) => month.calendarMonth === 11
    );
    expect(january?.meanMm).toBeCloseTo(31, 6);
    expect(november?.meanMm).toBeCloseTo(30, 6);
    // And the native value handed to the descriptor really is kg/m²/s.
    expect(1 / SECONDS_PER_DAY).toBeCloseTo(1.1574e-5, 9);
  });

  it("names the wettest and driest calendar months of the mean cycle", () => {
    const { months, values } = series(4, ONE_WET_MONTH);
    const cycle = probePrecipitationCycle("precip", months, values);
    expect(cycle?.status).toBe("available");
    // July at 10 mm/day over 31 days is 310 mm; February at 1 mm/day is the
    // shortest month, so it is driest on depth even though every non-July
    // month shares the same rate.
    expect(cycle?.wettestMonth?.calendarMonth).toBe(7);
    expect(cycle?.driestMonth?.calendarMonth).toBe(2);
  });
});

describe("precipitationCycleClause", () => {
  it("states both extremes, the range, and the weakest month's year count", () => {
    const { months, values } = series(4, ONE_WET_MONTH);
    const clause = precipitationCycleClause(
      probePrecipitationCycle("precip", months, values)
    );
    expect(clause).toContain("wettest Jul 310 mm");
    // 2000 is a leap year, so the four Februaries average 28.25 days, which
    // three significant figures render as 28.3.
    expect(clause).toContain("driest Feb 28.3 mm");
    expect(clause).toContain("range 282 mm");
    expect(clause).toContain("≥4 yr per calendar month");
    expect(clause).toContain("not a climate normal");
  });

  it("quotes the SMALLEST per-month year count, not the record's length", () => {
    // A long record whose Februaries mostly dropped out must not advertise its
    // full length: the named months are only as well supported as the weakest
    // month behind the cycle.
    const { months, values } = series(6, ONE_WET_MONTH);
    for (let index = 0; index < months.length; index++) {
      if (months[index].month === 2 && months[index].year >= 2003) {
        values[index] = null;
      }
    }
    const clause = precipitationCycleClause(
      probePrecipitationCycle("precip", months, values)
    );
    expect(clause).toContain("≥3 yr per calendar month");
    expect(clause).not.toContain("≥6 yr");
  });

  it("stays silent when a calendar month misses the years-per-month floor", () => {
    // One month short of the floor withholds the amplitude, and a wettest or
    // driest month picked from eleven months could be beaten by the twelfth.
    const { months, values } = series(
      MINIMUM_PRECIP_ANNUAL_CYCLE_YEARS_PER_MONTH,
      ONE_WET_MONTH
    );
    for (let index = 0; index < months.length; index++) {
      if (months[index].month === 3 && months[index].year === 2000) {
        values[index] = null;
      }
    }
    const cycle = probePrecipitationCycle("precip", months, values);
    expect(cycle?.calendarMonthsCovered).toBe(11);
    expect(precipitationCycleClause(cycle)).toBeNull();
  });

  it("stays silent for a record too short to cover a calendar year", () => {
    const { months, values } = series(2, ONE_WET_MONTH);
    expect(
      precipitationCycleClause(
        probePrecipitationCycle("precip", months, values)
      )
    ).toBeNull();
  });

  it("stays silent for a wholly empty record and for a non-precip layer", () => {
    const { months, values } = series(4, ONE_WET_MONTH);
    const empty = values.map(() => null);
    expect(
      precipitationCycleClause(probePrecipitationCycle("precip", months, empty))
    ).toBeNull();
    expect(
      precipitationCycleClause(probePrecipitationCycle("soil", months, values))
    ).toBeNull();
    expect(precipitationCycleClause(null)).toBeNull();
  });

  it("reports a bone-dry month as a measured 0 mm rather than withholding it", () => {
    // Zero precipitation is a real observation, not a gap; the driest month of
    // a desert cycle must still be named.
    const dry = [0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0];
    const { months, values } = series(4, dry);
    const clause = precipitationCycleClause(
      probePrecipitationCycle("precip", months, values)
    );
    expect(clause).toContain("wettest Jul 310 mm");
    expect(clause).toContain("driest Jan 0 mm");
    expect(clause).toContain("range 310 mm");
  });
});

describe("probePrecipitationSeasonalTiming", () => {
  it("returns null for every layer but precipitation", () => {
    const { months, values } = series(5, ONE_WET_MONTH);
    for (const layer of ["soil", "snow", "ndvi", "airtemp", "sst"] as const) {
      expect(
        probePrecipitationSeasonalTiming(layer, months, values)
      ).toBeNull();
    }
    expect(
      probePrecipitationSeasonalTiming(undefined, months, values)
    ).toBeNull();
    expect(
      probePrecipitationSeasonalTiming("precip", months, values)
    ).not.toBeNull();
  });

  it("returns null when the series carries no months", () => {
    expect(probePrecipitationSeasonalTiming("precip", [], [])).toBeNull();
  });

  it("converts mm/day to the native rate before pooling, as the cycle does", () => {
    // Getting this wrong is silent: the timing still resolves, just weighted by
    // depths 86 400x too large. A wrong factor would not move the centroid, so
    // assert the pooled water instead — 5 years of 1 mm/day with one 10 mm/day
    // July is (365.25-ish days + 9 x 31 extra July mm) per year.
    const { months, values } = series(5, ONE_WET_MONTH);
    const timing = probePrecipitationSeasonalTiming("precip", months, values);
    expect(timing?.totalMm).toBeGreaterThan(5 * 600);
    expect(timing?.totalMm).toBeLessThan(5 * 700);
  });
});

describe("precipitationCycleClause seasonal timing", () => {
  it("extends the same reading with the centroid month and R", () => {
    const { months, values } = series(5, ONE_WET_MONTH);
    const clause = precipitationCycleClause(
      probePrecipitationCycle("precip", months, values),
      probePrecipitationSeasonalTiming("precip", months, values)
    );
    expect(clause).toContain("mean annual cycle: wettest Jul");
    expect(clause).toContain("centred on Jul");
    expect(clause).toMatch(
      /timing concentration R 0[.]\d\d of 1 centred on Jul [(]Markham, 5 complete yr[)]/
    );
    // One reading, not two: no second separator opens a new clause.
    expect(clause?.split(" · ")).toHaveLength(1);
  });

  it("prints a low R for two rainy seasons the wettest month alone would hide", () => {
    const twoSeasons = [1, 1, 1, 10, 1, 1, 1, 1, 1, 10, 1, 1];
    const { months, values } = series(5, twoSeasons);
    const clause = precipitationCycleClause(
      probePrecipitationCycle("precip", months, values),
      probePrecipitationSeasonalTiming("precip", months, values)
    );
    expect(clause).toContain("wettest Oct");
    expect(clause).toMatch(/timing concentration R 0[.]0\d of 1/);
  });

  it("keeps the cycle reading intact when no timing is available", () => {
    // The floor is complete calendar years; a record below it must not silence
    // the cycle itself, and must not append a partial timing either.
    const { months, values } = series(4, ONE_WET_MONTH);
    const withoutTiming = precipitationCycleClause(
      probePrecipitationCycle("precip", months, values)
    );
    expect(withoutTiming).toContain("mean annual cycle: wettest Jul");
    expect(withoutTiming).not.toContain("Markham");
    expect(
      precipitationCycleClause(
        probePrecipitationCycle("precip", months, values),
        null
      )
    ).toBe(withoutTiming);
  });

  it("says nothing at all when the cycle itself is withheld", () => {
    const { months, values } = series(5, ONE_WET_MONTH);
    expect(
      precipitationCycleClause(
        null,
        probePrecipitationSeasonalTiming("precip", months, values)
      )
    ).toBeNull();
  });
});

describe("probePrecipitationAnnualTotals", () => {
  /** Blank one calendar month of one year, the way a no-data month arrives. */
  function withoutMonth(
    built: { months: YearMonth[]; values: (number | null)[] },
    year: number,
    month: number
  ): { months: YearMonth[]; values: (number | null)[] } {
    const values = built.values.map((value, index) =>
      built.months[index]?.year === year && built.months[index]?.month === month
        ? null
        : value
    );
    return { months: built.months, values };
  }

  it("returns null for every layer but precipitation", () => {
    const { months, values } = series(4, ONE_WET_MONTH);
    for (const layer of ["soil", "snow", "ndvi", "airtemp", "sst"] as const) {
      expect(probePrecipitationAnnualTotals(layer, months, values)).toBeNull();
    }
    expect(
      probePrecipitationAnnualTotals(undefined, months, values)
    ).toBeNull();
  });

  it("returns null when no calendar year is complete", () => {
    const { months, values } = series(1, ONE_WET_MONTH);
    // Six months of one year: a real record start, and no year to total.
    expect(
      probePrecipitationAnnualTotals(
        "precip",
        months.slice(0, 6),
        values.slice(0, 6)
      )
    ).toBeNull();
    expect(probePrecipitationAnnualTotals("precip", [], [])).toBeNull();
  });

  it("means whole observed years, integrating each month's own length", () => {
    // 1 mm/day every month but July at 10 gives 365 + 9 x 31 = 644 mm in a
    // common year and one millimetre more across a leap February. Averaging
    // 2000-2003 is therefore (645 + 644 x 3) / 4 = 644.25 mm.
    const { months, values } = series(4, ONE_WET_MONTH);
    const totals = probePrecipitationAnnualTotals("precip", months, values);
    expect(totals?.yearsUsed).toBe(4);
    expect(totals?.meanTotalMm).toBeCloseTo(644.25, 6);
  });

  it("skips an incomplete year rather than totalling it as a short one", () => {
    // Losing July costs that year 310 mm. Counting the remainder as a year
    // would drag the mean far below any year the place actually had.
    const built = withoutMonth(series(4, ONE_WET_MONTH), 2001, 7);
    const totals = probePrecipitationAnnualTotals(
      "precip",
      built.months,
      built.values
    );
    expect(totals?.yearsUsed).toBe(3);
    expect(totals?.meanTotalMm).toBeCloseTo((645 + 644 * 2) / 3, 6);
  });

  it("counts whole years, not the cycle's years-per-calendar-month floor", () => {
    // Two different years each lose one month. Every calendar month still
    // stands on four years, so the cycle prints four; only three years are
    // whole, so the total must print three. Borrowing the cycle's number
    // here would claim a year of record the total never had.
    const built = withoutMonth(
      withoutMonth(series(5, ONE_WET_MONTH), 2001, 7),
      2002,
      1
    );
    const cycle = probePrecipitationCycle("precip", built.months, built.values);
    const perMonthYears = Math.min(
      ...(cycle?.monthlyClimatology ?? []).map((month) => month.yearsUsed)
    );
    const totals = probePrecipitationAnnualTotals(
      "precip",
      built.months,
      built.values
    );
    expect(perMonthYears).toBe(4);
    expect(totals?.yearsUsed).toBe(3);
  });

  it("qualifies the cycle with the total and stays one reading", () => {
    const { months, values } = series(4, ONE_WET_MONTH);
    const clause = precipitationCycleClause(
      probePrecipitationCycle("precip", months, values),
      null,
      null,
      probePrecipitationAnnualTotals("precip", months, values)
    );
    expect(clause).toContain(
      "mean annual cycle (644 mm/yr over 4 complete yr):"
    );
    expect(clause).toContain("wettest Jul");
    // One reading on the status line, never a second sentence.
    expect(clause?.split(" · ")).toHaveLength(1);
  });

  it("leaves the cycle clause exactly as it was without a total", () => {
    const { months, values } = series(4, ONE_WET_MONTH);
    const cycle = probePrecipitationCycle("precip", months, values);
    const bare = precipitationCycleClause(cycle);
    expect(bare).toContain("mean annual cycle: wettest Jul");
    expect(precipitationCycleClause(cycle, null, null, null)).toBe(bare);
  });

  it("says nothing when the cycle itself is withheld", () => {
    const { months, values } = series(4, ONE_WET_MONTH);
    expect(
      precipitationCycleClause(
        null,
        null,
        null,
        probePrecipitationAnnualTotals("precip", months, values)
      )
    ).toBeNull();
  });
});

/**
 * Marches only, which is all the same-calendar-month record needs: `priors`
 * oldest-first from 2000, then the target as the latest month. Every month
 * carries a full footprint share, because the seasonal baseline rejects an
 * observation that measures none at any threshold.
 */
function marchSeries(
  priorsMmPerDay: readonly number[],
  targetMmPerDay: number | null
): {
  months: YearMonth[];
  values: (number | null)[];
  shares: (number | null)[];
} {
  const months: YearMonth[] = [];
  const values: (number | null)[] = [];
  for (let index = 0; index < priorsMmPerDay.length; index++) {
    months.push({ year: 2000 + index, month: 3 });
    values.push(priorsMmPerDay[index]);
  }
  months.push({ year: 2000 + priorsMmPerDay.length, month: 3 });
  values.push(targetMmPerDay);
  return { months, values, shares: months.map(() => 1) };
}

/** Thirteen flat 2 mm/day prior Marches: the record has a single holder. */
const FLAT_PRIOR_MARCHES = Array.from({ length: 13 }, () => 2);

const PRECIP_STEP_MM_PER_DAY = quantizationStep(PROBE_SCALES.precip);

/** The precision the panel derives and hands to the clause. */
const PRECIP_PRECISION = {
  resolution: PRECIP_STEP_MM_PER_DAY,
  decimals: csvDecimals(PROBE_SCALES.precip),
  unit: PROBE_SCALES.precip.unit,
};

describe("probePrecipitationRecordMargin", () => {
  it("returns null for every layer but precipitation", () => {
    const { months, values, shares } = marchSeries(FLAT_PRIOR_MARCHES, 3);
    for (const layer of ["soil", "snow", "ndvi", "airtemp", "sst"] as const) {
      expect(
        probePrecipitationRecordMargin(layer, months, values, shares)
      ).toBeNull();
    }
    expect(
      probePrecipitationRecordMargin(undefined, months, values, shares)
    ).toBeNull();
    expect(
      probePrecipitationRecordMargin("precip", months, values, shares)
    ).not.toBeNull();
  });

  it("returns null when the mode measured no footprint share", () => {
    // A point probe supplies no shares at all, and the seasonal baseline
    // rejects an observation carrying none at any threshold — so the standing
    // is withheld here rather than fabricated from an unscreened record.
    const { months, values } = marchSeries(FLAT_PRIOR_MARCHES, 3);
    expect(
      probePrecipitationRecordMargin("precip", months, values, null)
    ).toBeNull();
  });

  it("returns null when the series carries no observed month", () => {
    const { months, shares } = marchSeries(FLAT_PRIOR_MARCHES, null);
    expect(
      probePrecipitationRecordMargin(
        "precip",
        months,
        months.map(() => null),
        shares
      )
    ).toBeNull();
  });

  it("converts the probe's mm/day series into the metric's native unit", () => {
    // The descriptor is defined in kg/m²/s while the probe reports mm/day, so
    // the bridge must divide by the day length on the way in. If it did not,
    // every value would be 86 400x too large and the reported record values
    // would be nonsense even though the ORDERING — and so the standing — would
    // survive unchanged. Assert the values, not just the standing.
    const { months, values, shares } = marchSeries(FLAT_PRIOR_MARCHES, 3);
    const margin = probePrecipitationRecordMargin(
      "precip",
      months,
      values,
      shares
    );
    expect(margin?.unit).toBe("kg/m²/s");
    expect(margin?.targetValue).toBeCloseTo(3 / SECONDS_PER_DAY, 12);
    expect(margin?.priorWettestValue).toBeCloseTo(2 / SECONDS_PER_DAY, 12);
    expect(margin?.standing).toBe("wettest-in-record");
    expect((margin?.recordExceedanceMargin ?? 0) * SECONDS_PER_DAY).toBeCloseTo(
      1,
      9
    );
  });
});

describe("precipitationRecordClause", () => {
  function clauseFor(
    priors: readonly number[],
    target: number,
    precision: typeof PRECIP_PRECISION | null = PRECIP_PRECISION
  ): string {
    const { months, values, shares } = marchSeries(priors, target);
    return precipitationRecordClause(
      probePrecipitationRecordMargin("precip", months, values, shares),
      precision
    );
  }

  it("states a new wet record, its margin, and the month that held it", () => {
    expect(clauseFor(FLAT_PRIOR_MARCHES, 3)).toBe(
      "precipitation Mar 2013 wettest of 13 prior same-month observations, " +
        "1.0 mm/day wetter than Mar 2000 (this record only, GLDAS-Noah modeled rate)"
    );
  });

  it("states a new dry record in the opposite direction", () => {
    expect(clauseFor(FLAT_PRIOR_MARCHES, 1)).toBe(
      "precipitation Mar 2013 driest of 13 prior same-month observations, " +
        "1.0 mm/day drier than Mar 2000 (this record only, GLDAS-Noah modeled rate)"
    );
  });

  it("keeps the standing but drops a margin the probe did not resolve", () => {
    // Each end of the difference is an independent colormap inversion carrying
    // half a LUT step, so a record won by less than one step is real as an
    // ORDERING but unresolved as a SIZE. The standing survives; the number does
    // not, and it is dropped rather than printed as "0.1 mm/day".
    const margin = PRECIP_STEP_MM_PER_DAY / 2;
    expect(margin).toBeLessThan(PRECIP_STEP_MM_PER_DAY);
    expect(clauseFor(FLAT_PRIOR_MARCHES, 2 + margin)).toBe(
      "precipitation Mar 2013 wettest of 13 prior same-month observations " +
        "(this record only, GLDAS-Noah modeled rate)"
    );
  });

  it("compares the margin against the floor in mm/day, not in native units", () => {
    // The regression this pins: a native margin is ~1e-6 while the floor is
    // ~0.17 mm/day, so comparing the two without converting would pass EVERY
    // record through the gate and make it meaningless. A margin of one and a
    // half steps must survive; a quarter step must not.
    const resolved = PRECIP_STEP_MM_PER_DAY * 1.5;
    expect(clauseFor(FLAT_PRIOR_MARCHES, 2 + resolved)).toContain(
      `${resolved.toFixed(PRECIP_PRECISION.decimals)} mm/day wetter than Mar 2000`
    );
    expect(
      clauseFor(FLAT_PRIOR_MARCHES, 2 + PRECIP_STEP_MM_PER_DAY / 4)
    ).not.toContain("wetter than");
  });

  it("says nothing for a month inside the record's range", () => {
    // Most probes land here, and a margin to an extreme this month never
    // reached would put a second number on the ordinary case.
    const varied = [1, 1.5, 2, 2.5, 3, 1.2, 1.8, 2.2, 2.8, 1.4, 2.6, 1.6, 2.4];
    expect(clauseFor(varied, 2)).toBe("");
  });

  it("says nothing when the target merely ties an extreme", () => {
    // A tie breaches nothing, so there is no margin to state and no record to
    // claim — the flat record ties both ends at once.
    expect(clauseFor(FLAT_PRIOR_MARCHES, 2)).toBe("");
  });

  it("says nothing without a resolved precision to gate the margin", () => {
    expect(clauseFor(FLAT_PRIOR_MARCHES, 3, null)).toBe("");
    expect(precipitationRecordClause(null, PRECIP_PRECISION)).toBe("");
  });

  it("says nothing when the record is too short to rank against", () => {
    // The ten-sample floor lives in the seasonal baseline; the bridge must not
    // route around it. Nine prior Marches cannot carry a record standing.
    expect(clauseFor([2, 2, 2, 2, 2, 2, 2, 2, 2], 3)).toBe("");
  });

  it("withholds the margin if the probe scale stops being mm/day", () => {
    // The floor is measured on the probe's own scale, so the two are only
    // comparable while precipitation renders in mm/day. A unit change must drop
    // the phrase rather than silently mis-scale it.
    expect(
      clauseFor(FLAT_PRIOR_MARCHES, 3, {
        ...PRECIP_PRECISION,
        unit: "kg/m²/s",
      })
    ).toBe(
      "precipitation Mar 2013 wettest of 13 prior same-month observations " +
        "(this record only, GLDAS-Noah modeled rate)"
    );
  });

  it("pins the probe scale the resolution floor is derived from", () => {
    // Every number above is a consequence of this scale; if it moves, the
    // fixtures above are measuring the wrong floor.
    expect(PROBE_SCALES.precip.unit).toBe("mm/day");
    expect(PRECIP_PRECISION.decimals).toBe(1);
    expect(PRECIP_STEP_MM_PER_DAY).toBeCloseTo(43.2 / 255, 10);
  });
});
