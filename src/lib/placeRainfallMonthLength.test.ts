import { describe, expect, it } from "vitest";
import {
  RAINFALL_MONTH_LENGTH_LIMITATIONS,
  placeRainfallMonthLengthSplit,
  rainfallMonthLengthNote,
} from "./placeRainfallMonthLength";

const FEB_2026 = { year: 2026, month: 2 } as const;
const MAR_2026 = { year: 2026, month: 3 } as const;
const DEC_2025 = { year: 2025, month: 12 } as const;
const JAN_2026 = { year: 2026, month: 1 } as const;
const FEB_2024 = { year: 2024, month: 2 } as const;

describe("place rainfall month-length split", () => {
  it("attributes an unchanged rate's whole step to calendar length", () => {
    // 3 mm/day throughout: Feb accumulates 84 mm, Mar 93 mm. Nothing about the
    // rain changed; only the calendar did.
    const split = placeRainfallMonthLengthSplit([FEB_2026, MAR_2026], [84, 93]);
    expect(split).not.toBeNull();
    expect(split!.earlierDays).toBe(28);
    expect(split!.laterDays).toBe(31);
    expect(split!.changeMm).toBe(9);
    expect(split!.calendarMm).toBeCloseTo(9, 10);
    expect(split!.rateMm).toBeCloseTo(0, 10);
    expect(split!.signInverted).toBe(false);
  });

  it("splits the step exactly, whatever the months and rates", () => {
    const cases: [number, number][] = [
      [84, 93],
      [120, 40],
      [0, 62],
      [55.5, 55.5],
    ];
    for (const totals of cases) {
      const split = placeRainfallMonthLengthSplit([FEB_2026, MAR_2026], totals);
      expect(split).not.toBeNull();
      // The decomposition is an identity, not an approximation.
      expect(split!.calendarMm + split!.rateMm).toBeCloseTo(
        split!.changeMm,
        10
      );
    }
  });

  it("reads leap-year February at its own length", () => {
    const split = placeRainfallMonthLengthSplit([FEB_2024, MAR_2026], [58, 62]);
    expect(split!.earlierDays).toBe(29);
    expect(split!.earlierRateMmPerDay).toBeCloseTo(2, 10);
  });

  it("flags a total that moved opposite to the daily rate", () => {
    // Feb: 84 mm over 28 d = 3.0 mm/day. Mar: 87 mm over 31 d ≈ 2.8 mm/day.
    // The total rose while the rain itself eased off.
    const split = placeRainfallMonthLengthSplit([FEB_2026, MAR_2026], [84, 87]);
    expect(split!.changeMm).toBe(3);
    expect(split!.signInverted).toBe(true);
    expect(split!.calendarMm).toBeCloseTo(9, 10);
    expect(split!.rateMm).toBeCloseTo(-6, 10);
  });

  it("does not flag a step the rate and total agree on", () => {
    const split = placeRainfallMonthLengthSplit(
      [FEB_2026, MAR_2026],
      [84, 155]
    );
    expect(split!.signInverted).toBe(false);
  });

  it("withholds a split it cannot verify", () => {
    expect(
      placeRainfallMonthLengthSplit([FEB_2026, MAR_2026], [Number.NaN, 93])
    ).toBeNull();
    expect(
      placeRainfallMonthLengthSplit(
        [FEB_2026, MAR_2026],
        [84, Number.POSITIVE_INFINITY]
      )
    ).toBeNull();
    expect(
      placeRainfallMonthLengthSplit(
        [{ year: 2026, month: 13 }, MAR_2026],
        [84, 93]
      )
    ).toBeNull();
    expect(
      placeRainfallMonthLengthSplit(
        [FEB_2026, { year: 2026, month: 0 }],
        [84, 93]
      )
    ).toBeNull();
  });

  it("keeps its stated limits attached to every split", () => {
    const split = placeRainfallMonthLengthSplit([FEB_2026, MAR_2026], [84, 93]);
    expect(split!.limitations).toBe(RAINFALL_MONTH_LENGTH_LIMITATIONS);
    expect(split!.isForecast).toBe(false);
  });
});

describe("rainfall month-length note", () => {
  it("names the calendar share when the months differ in length", () => {
    expect(
      rainfallMonthLengthNote(
        placeRainfallMonthLengthSplit([FEB_2026, MAR_2026], [84, 93])
      )
    ).toBe("; +9 mm of that is 28 d → 31 d month length");
  });

  it("says so when the daily rate moved the other way", () => {
    expect(
      rainfallMonthLengthNote(
        placeRainfallMonthLengthSplit([FEB_2026, MAR_2026], [84, 87])
      )
    ).toBe(
      "; +9 mm of that is 28 d → 31 d month length, and the daily rate moved the other way (3.0 → 2.8 mm/day)"
    );
  });

  it("carries the sign of a shortening month", () => {
    expect(
      rainfallMonthLengthNote(
        placeRainfallMonthLengthSplit(
          [MAR_2026, { year: 2026, month: 4 }],
          [93, 90]
        )
      )
    ).toBe("; -3 mm of that is 31 d → 30 d month length");
  });

  it("stays quiet when the two months are the same length", () => {
    expect(
      rainfallMonthLengthNote(
        placeRainfallMonthLengthSplit([DEC_2025, JAN_2026], [100, 200])
      )
    ).toBe("");
  });

  it("stays quiet when the calendar share rounds away at panel precision", () => {
    // 0.1 mm/day: three extra days add 0.3 mm, below the whole millimetre the
    // panel reports. Nothing worth a reader's attention.
    expect(
      rainfallMonthLengthNote(
        placeRainfallMonthLengthSplit([FEB_2026, MAR_2026], [2.8, 3.5])
      )
    ).toBe("");
  });

  it("stays quiet when there is no split to report", () => {
    expect(rainfallMonthLengthNote(null)).toBe("");
  });
});
