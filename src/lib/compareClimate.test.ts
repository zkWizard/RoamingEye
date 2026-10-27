import { describe, expect, it } from "vitest";
import {
  chartWindow,
  climateFetchRange,
  formatRain,
  formatTimes,
  latestCompleteMonth,
  monthsFromDaily,
  pointClimateSuggestion,
  rainSentence,
  selectCompareMonth,
  tempSentence,
} from "./compareClimate";
import { formatProbeValue, PROBE_SCALES, scaleValue } from "./probe";

/**
 * ERA5 daily precipitation (mm) for January 2026, recorded from the
 * Open-Meteo archive (`models=era5`) on 2026-10-27.
 * Houston 29.76, -95.37 sums to 78.9 mm (3.1 in).
 * Austin 30.26, -97.75 sums to 32.1 mm (1.3 in).
 */
const HOUSTON_JAN_2026 = [
  0, 0, 0, 0, 0, 0.1, 0.2, 1.3, 2.1, 15.2, 0, 0, 1, 0.2, 0, 0, 0.8, 0, 0, 0,
  4.1, 3.1, 0, 23.5, 27.3, 0, 0, 0, 0, 0, 0,
];
const AUSTIN_JAN_2026 = [
  0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0.2, 1, 0, 0, 0, 0, 0, 0, 0, 1.4, 0.4, 2.3,
  23.5, 1.3, 0, 0, 0, 0, 0, 0,
];

const JAN_DAYS = HOUSTON_JAN_2026.map(
  (_, index) => `2026-01-${String(index + 1).padStart(2, "0")}`
);

function january(precip: number[]) {
  return monthsFromDaily({
    time: JAN_DAYS,
    precipMm: precip,
    tempC: precip.map(() => 12),
  })[0];
}

describe("monthsFromDaily", () => {
  it("turns Houston and Austin January days into non-zero monthly totals", () => {
    const houston = january(HOUSTON_JAN_2026);
    const austin = january(AUSTIN_JAN_2026);
    expect(houston.precipMm).toBeCloseTo(78.9, 1);
    expect(austin.precipMm).toBeCloseTo(32.1, 1);
    expect(houston.precipDays).toBe(31);
    expect(austin.precipDays).toBe(31);
    expect(houston.expectedDays).toBe(31);
  });

  it("leaves a short trailing month incomplete", () => {
    const months = monthsFromDaily({
      time: ["2026-09-01", "2026-10-01", "2026-10-02"],
      precipMm: [10, 1, 1],
      tempC: [20, 18, 18],
    });
    expect(months[0].expectedDays).toBe(30);
    expect(latestCompleteMonth(months, "precipMm")?.month).toBeUndefined();
    const fullSeptember = monthsFromDaily({
      time: Array.from(
        { length: 30 },
        (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`
      ).concat(["2026-10-01"]),
      precipMm: Array.from({ length: 30 }, () => 1).concat([4]),
      tempC: Array.from({ length: 30 }, () => 20).concat([18]),
    });
    expect(latestCompleteMonth(fullSeptember, "precipMm")).toMatchObject({
      year: 2026,
      month: 9,
    });
  });
});

describe("colormap fractions are not rainfall", () => {
  it("prints an unscaled winter fraction as 0.0 mm/day", () => {
    const scale = PROBE_SCALES.precip;
    // Median legend position measured on the Jan 2026 GLDAS JPEG at Houston.
    const houstonFraction = 0.016;
    const austinFraction = 0.043;
    expect(formatProbeValue(houstonFraction, scale)).toBe("0.0 mm/day");
    const houston = scaleValue(houstonFraction, scale);
    const austin = scaleValue(austinFraction, scale);
    expect(formatProbeValue(houston, scale)).toBe("0.7 mm/day");
    expect(houston).toBeGreaterThan(0);
    expect(austin).toBeGreaterThan(houston);
  });
});

describe("Houston and Austin rainfall", () => {
  const today = { year: 2026, month: 10 };
  const noDate = {
    requested: { year: null, month: null },
    defaultMonth: 9,
  };

  it("is non-zero, plausible, and Houston is wetter in January 2026", () => {
    const houston = january(HOUSTON_JAN_2026);
    const austin = january(AUSTIN_JAN_2026);
    const houstonIn = (houston.precipMm ?? 0) / 25.4;
    const austinIn = (austin.precipMm ?? 0) / 25.4;
    // Houston's January normal is roughly 3–4 in. ERA5 lands inside that.
    expect(houstonIn).toBeGreaterThan(2);
    expect(houstonIn).toBeLessThan(5);
    expect(austinIn).toBeGreaterThan(0.4);
    expect(austinIn).toBeLessThan(houstonIn);
    expect(houston.precipMm).not.toBe(0);
    expect(austin.precipMm).not.toBe(0);

    const sentence = rainSentence(
      "Houston",
      "Austin",
      "January 2026",
      houston.precipMm,
      austin.precipMm
    );
    expect(sentence).toBe(
      "Houston got about 2.5× more rain than Austin in January 2026."
    );
    expect(sentence).not.toContain("0.0");
    expect(formatRain(houston.precipMm ?? 0)).toEqual({
      primary: "79 mm",
      secondary: "3.1 in",
    });
    expect(formatRain(austin.precipMm ?? 0).secondary).toBe("1.3 in");
  });

  it("defaults a dateless query to the latest complete month, not a partial one", () => {
    const months = [
      {
        year: 2026,
        month: 9,
        precipMm: 181.2,
        tempC: 27.5,
        precipDays: 30,
        tempDays: 30,
        expectedDays: 30,
      },
      {
        year: 2026,
        month: 10,
        precipMm: 53.8,
        tempC: 23.9,
        precipDays: 21,
        tempDays: 21,
        expectedDays: 31,
      },
    ];
    const selected = selectCompareMonth(months, noDate, "precipMm", today);
    expect(selected?.month).toEqual({ year: 2026, month: 9 });
    expect(selected?.note).toBeNull();
    // September 2026 ERA5: Houston 181.2 mm, Austin 11.5 mm.
    const sentence = rainSentence(
      "Houston",
      "Austin",
      "September 2026",
      181.2,
      11.5
    );
    expect(sentence).toBe(
      "Houston got about 16× more rain than Austin in September 2026."
    );
    expect(formatRain(181.2).secondary).toBe("7.1 in");
    expect(formatRain(11.5).primary).toBe("12 mm");
  });

  it("does not call a small gap zero or an infinite ratio", () => {
    expect(rainSentence("Houston", "Austin", "August 2026", 80, 70)).toContain(
      "about the same rain"
    );
    expect(rainSentence("Houston", "Austin", "August 2026", 40, 0)).toContain(
      "Houston got 40 mm"
    );
    expect(
      rainSentence("Houston", "Austin", "August 2026", 40, 0)
    ).not.toContain("×");
    expect(formatTimes(2)).toBe("2");
  });
});

describe("temperature sentences", () => {
  it("says who was warmer in degrees people use", () => {
    expect(
      tempSentence("Houston", "Austin", "September 2026", 27.5, 30.8)
    ).toBe("Austin was about 6°F warmer than Houston in September 2026.");
    expect(
      tempSentence("Houston", "Austin", "January 2026", 12.2, 12.4)
    ).toContain("about the same temperature");
  });
});

describe("point climate month choice", () => {
  const today = { year: 2026, month: 10 };

  it("names September for rainfall 2026 while that month is already over", () => {
    expect(
      pointClimateSuggestion(
        {
          layer: "precip",
          defaultMonth: 9,
          requested: { year: 2026, month: null },
        },
        today
      )
    ).toBe("Rain · Sep 2026");
  });

  it("does not pretend the current month is complete", () => {
    expect(
      pointClimateSuggestion(
        {
          layer: "lst",
          defaultMonth: 7,
          requested: { year: null, month: null },
        },
        today
      )
    ).toBe("Air temperature · latest complete month");
    expect(
      pointClimateSuggestion(
        {
          layer: "precip",
          defaultMonth: 9,
          requested: { year: 2026, month: 10 },
        },
        today
      )
    ).toContain("isn't complete yet");
  });

  it("fetches a recent window through today when no date is named", () => {
    expect(
      climateFetchRange(
        { requested: { year: null, month: null }, defaultMonth: 9 },
        today
      )
    ).toEqual({ start: { year: 2025, month: 8 }, end: today });
  });
});

describe("chartWindow", () => {
  it("aligns twelve months and skips an incomplete one", () => {
    const full = (month: number, precipMm: number) => ({
      year: 2026,
      month,
      precipMm,
      tempC: 20,
      precipDays: month === 2 ? 28 : 30,
      tempDays: 30,
      expectedDays: month === 2 ? 28 : 30,
    });
    const window = chartWindow(
      { year: 2026, month: 3 },
      [full(2, 40), full(3, 80)],
      [full(3, 20)],
      "precipMm"
    );
    expect(window.labels).toHaveLength(12);
    expect(window.labels[11]).toBe("Mar");
    expect(window.a[10]).toBe(40);
    expect(window.a[11]).toBe(80);
    expect(window.b[10]).toBeNull();
    expect(window.b[11]).toBe(20);
  });
});
