import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import { SECONDS_PER_DAY } from "./precipitationAccumulation";
import {
  PRECIP_ACCUMULATION_CHANGE_LIMITATIONS,
  PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM,
  describePrecipitationAccumulationChange,
  formatPrecipitationAccumulationChange,
} from "./precipitationAccumulationChange";
import type { YearMonth } from "./timeline";

/** Build a published, usable precipitation-rate summary at a chosen month. */
function precipSummary(rate: number | null, dataMonth: YearMonth) {
  return summarizeMonthlyClimate(
    { metricId: "precipitation-rate", dataMonth, value: rate },
    { year: dataMonth.year + 1, month: dataMonth.month }
  );
}

/** Expected accumulated depth (mm) for a rate over a month of `days` length. */
function expectedTotalMm(rate: number, days: number) {
  return rate * days * SECONDS_PER_DAY;
}

describe("month-over-month precipitation accumulation change", () => {
  it("reports a wetter later month as a positive change", () => {
    // Jan (31d) at a low rate, Feb (28d) at a higher rate: more water fell.
    const earlier = precipSummary(0.00005, { year: 2026, month: 1 });
    const later = precipSummary(0.0001, { year: 2026, month: 2 });

    const change = describePrecipitationAccumulationChange(earlier, later);

    const expected = expectedTotalMm(0.0001, 28) - expectedTotalMm(0.00005, 31);
    expect(change.status).toBe("available");
    expect(change.trend).toBe("wetter");
    expect(change.changeMm).toBeCloseTo(expected, 9);
    expect(expected).toBeGreaterThan(0);
    expect(change.reason).toBeNull();
  });

  it("reports a drier later month as a negative change", () => {
    const earlier = precipSummary(0.0001, { year: 2026, month: 3 });
    const later = precipSummary(0.00003, { year: 2026, month: 4 });

    const change = describePrecipitationAccumulationChange(earlier, later);

    expect(change.status).toBe("available");
    expect(change.trend).toBe("drier");
    expect(change.changeMm).toBeLessThan(0);
  });

  it("calls a sub-threshold difference little-change", () => {
    // Same rate; the only difference is 31 vs 28 days ≈ 8 mm at this rate,
    // which exceeds 1 mm — so widen the threshold to confirm the band works.
    const earlier = precipSummary(0.0001, { year: 2026, month: 1 });
    const later = precipSummary(0.0001, { year: 2026, month: 2 });

    const change = describePrecipitationAccumulationChange(earlier, later, {
      thresholdMm: 100,
    });

    expect(change.status).toBe("available");
    expect(change.trend).toBe("little-change");
    expect(change.changeMm).not.toBeNull();
  });

  it("defaults the little-change band to the documented convention", () => {
    const earlier = precipSummary(0.00005, { year: 2026, month: 6 });
    const later = precipSummary(0.00005, { year: 2026, month: 7 });

    const change = describePrecipitationAccumulationChange(earlier, later);

    expect(change.thresholdMm).toBe(PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM);
  });

  it("preserves the shared cited dataset provenance", () => {
    const earlier = precipSummary(0.0001, { year: 2026, month: 5 });
    const later = precipSummary(0.0002, { year: 2026, month: 6 });

    const change = describePrecipitationAccumulationChange(earlier, later);

    expect(change.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("refuses non-consecutive months rather than spanning the gap", () => {
    const earlier = precipSummary(0.0001, { year: 2026, month: 1 });
    const later = precipSummary(0.0002, { year: 2026, month: 3 });

    const change = describePrecipitationAccumulationChange(earlier, later);

    expect(change.status).toBe("non-adjacent-months");
    expect(change.reason).toBe("months-not-consecutive");
    expect(change.changeMm).toBeNull();
    expect(change.trend).toBeNull();
  });

  it("refuses a reversed (later-before-earlier) pair", () => {
    const earlier = precipSummary(0.0001, { year: 2026, month: 4 });
    const later = precipSummary(0.0002, { year: 2026, month: 3 });

    const change = describePrecipitationAccumulationChange(earlier, later);

    expect(change.status).toBe("non-adjacent-months");
  });

  it("withholds a change when an endpoint has no usable accumulation", () => {
    const earlier = precipSummary(0.0001, { year: 2026, month: 1 });
    const noData = precipSummary(null, { year: 2026, month: 2 });

    const change = describePrecipitationAccumulationChange(earlier, noData);

    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
    expect(change.later).toBeNull();
    expect(change.earlier).not.toBeNull();
  });

  it("withholds a change for a not-yet-published later month", () => {
    const earlier = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 4 },
        value: 0.0001,
      },
      { year: 2026, month: 4 }
    );
    const future = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 5 },
        value: 0.0001,
      },
      { year: 2026, month: 4 }
    );

    const change = describePrecipitationAccumulationChange(earlier, future);

    expect(future.publicationStatus).toBe("not-yet-published");
    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
  });

  it("rejects a non-precipitation metric via a null accumulation", () => {
    const soil = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: 7.2,
      },
      { year: 2026, month: 5 }
    );
    const later = precipSummary(0.0001, { year: 2026, month: 2 });

    const change = describePrecipitationAccumulationChange(soil, later);

    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
  });

  it("rejects an invalid threshold rather than guessing a band", () => {
    const earlier = precipSummary(0.0001, { year: 2026, month: 1 });
    const later = precipSummary(0.0002, { year: 2026, month: 2 });

    const change = describePrecipitationAccumulationChange(earlier, later, {
      thresholdMm: -3,
    });

    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("invalid-threshold");
    expect(change.thresholdMm).toBe(PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM);
  });

  it("formats an available change with direction, magnitude, and source", () => {
    const earlier = precipSummary(0.00005, { year: 2026, month: 1 });
    const later = precipSummary(0.0001, { year: 2026, month: 2 });

    const line = formatPrecipitationAccumulationChange(
      describePrecipitationAccumulationChange(earlier, later)
    );

    expect(line).toMatch(/Feb 2026 vs Jan 2026/);
    expect(line).toMatch(/wetter by/);
    expect(line).toMatch(/mm/);
    expect(line).toMatch(/GLDAS_NOAH025_M/);
  });

  it("formats a withheld change honestly rather than as a number", () => {
    const earlier = precipSummary(0.0001, { year: 2026, month: 1 });
    const later = precipSummary(0.0002, { year: 2026, month: 3 });

    const line = formatPrecipitationAccumulationChange(
      describePrecipitationAccumulationChange(earlier, later)
    );

    expect(line).toMatch(/No month-over-month accumulation change/);
    expect(line).toMatch(/months-not-consecutive/);
  });

  it("documents that the difference is confounded by month length, not a forecast", () => {
    const joined = PRECIP_ACCUMULATION_CHANGE_LIMITATIONS.join(" ");
    expect(joined).toMatch(/calendar-month length/i);
    expect(joined).toMatch(/future value/i);
  });
});
