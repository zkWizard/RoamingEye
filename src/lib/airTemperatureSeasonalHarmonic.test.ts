import { describe, expect, it } from "vitest";
import type { MonthlyClimateObservation } from "./climate";
import {
  AIR_TEMPERATURE_SEASONAL_HARMONIC_LIMITATIONS,
  MINIMUM_MONTHS_FOR_AIR_TEMPERATURE_HARMONIC,
  summarizeAirTemperatureSeasonalHarmonic,
} from "./airTemperatureSeasonalHarmonic";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Three distinct years so every calendar month clears the default years floor. */
const YEARS = [2023, 2024, 2025] as const;

const RADIANS_PER_MONTH = (2 * Math.PI) / 12;

/** Build a usable air-temperature observation. */
function air(
  value: number | null,
  month: number,
  year: number,
  extra: Partial<MonthlyClimateObservation> = {}
): MonthlyClimateObservation {
  return {
    metricId: "air-temperature-2m",
    dataMonth: { year, month },
    value,
    ...extra,
  };
}

/**
 * A pure single-harmonic climatology whose fitted maximum sits at
 * `peakMonthTarget` (continuous month), replicated across the qualifying years
 * so each calendar month exactly equals its harmonic value.
 */
function sinusoidObservations(
  level: number,
  amplitude: number,
  peakMonthTarget: number,
  months: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
): MonthlyClimateObservation[] {
  const phaseRadians = RADIANS_PER_MONTH * (peakMonthTarget - 0.5);
  const observations: MonthlyClimateObservation[] = [];
  for (const month of months) {
    const angle = RADIANS_PER_MONTH * (month - 0.5);
    const mean = level + amplitude * Math.cos(angle - phaseRadians);
    for (const year of YEARS) observations.push(air(mean, month, year));
  }
  return observations;
}

describe("air-temperature seasonal harmonic", () => {
  it("recovers phase, amplitude, and near-unit variance for a clean summer-peaking sinusoid", () => {
    const summary = summarizeAirTemperatureSeasonalHarmonic(
      sinusoidObservations(285, 15, 7),
      AVAILABLE_THROUGH
    );

    expect(summary).toMatchObject({
      kind: "derived-air-temperature-seasonal-harmonic",
      isForecast: false,
      claimScope: "descriptive-air-temperature-only",
      status: "available",
      nativeUnit: "K",
      monthsUsed: 12,
      calendarMonthsCovered: 12,
      peakCalendarMonth: 7,
      peakMonthName: "Jul",
      reason: null,
    });
    expect(summary.meanLevelKelvin).toBeCloseTo(285, 6);
    expect(summary.amplitudeKelvin).toBeCloseTo(15, 6);
    expect(summary.peakMonth).toBeCloseTo(7, 6);
    expect(summary.phaseDegrees).toBeCloseTo(195, 6);
    expect(summary.varianceExplained).toBeCloseTo(1, 6);
    expect(summary.metric.id).toBe("air-temperature-2m");
    expect(summary.source.shortName.length).toBeGreaterThan(0);
    expect(summary.limitations).toBe(
      AIR_TEMPERATURE_SEASONAL_HARMONIC_LIMITATIONS
    );
  });

  it("wraps a January (southern-hemisphere) peak across the Dec/Jan boundary", () => {
    const summary = summarizeAirTemperatureSeasonalHarmonic(
      sinusoidObservations(288, 8, 1),
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("available");
    expect(summary.peakMonth).toBeCloseTo(1, 6);
    expect(summary.peakCalendarMonth).toBe(1);
    expect(summary.peakMonthName).toBe("Jan");
    expect(summary.phaseDegrees).toBeCloseTo(15, 6);
  });

  it("reports variance explained below 1 when a second harmonic distorts the cycle", () => {
    // Base annual sinusoid peaking in July plus a weaker semiannual term the
    // single annual harmonic cannot represent.
    const observations: MonthlyClimateObservation[] = [];
    const phaseRadians = RADIANS_PER_MONTH * (7 - 0.5);
    for (let month = 1; month <= 12; month++) {
      const angle = RADIANS_PER_MONTH * (month - 0.5);
      const mean =
        285 + 15 * Math.cos(angle - phaseRadians) + 4 * Math.cos(2 * angle);
      for (const year of YEARS) observations.push(air(mean, month, year));
    }

    const summary = summarizeAirTemperatureSeasonalHarmonic(
      observations,
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("available");
    expect(summary.varianceExplained).not.toBeNull();
    expect(summary.varianceExplained!).toBeLessThan(1);
    expect(summary.varianceExplained!).toBeGreaterThan(0.8);
    // The dominant annual mode still places the fitted peak in boreal summer.
    expect(summary.peakCalendarMonth).toBe(7);
  });

  it("withholds a spurious phase for a flat climatology but still reports it as available", () => {
    const observations: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of YEARS) observations.push(air(285, month, year));
    }

    const summary = summarizeAirTemperatureSeasonalHarmonic(
      observations,
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("available");
    expect(summary.meanLevelKelvin).toBeCloseTo(285, 6);
    expect(summary.amplitudeKelvin).toBeCloseTo(0, 6);
    expect(summary.phaseDegrees).toBeNull();
    expect(summary.peakMonth).toBeNull();
    expect(summary.peakCalendarMonth).toBeNull();
    expect(summary.peakMonthName).toBeNull();
    // A flat climatology has no across-month variance, so the ratio is undefined.
    expect(summary.varianceExplained).toBeNull();
    expect(summary.reason).toBe("annual-harmonic-amplitude-negligible");
  });

  it("fits a partial cycle once the qualifying-month floor is lowered", () => {
    const summary = summarizeAirTemperatureSeasonalHarmonic(
      sinusoidObservations(285, 12, 7, [2, 4, 6, 8, 10]),
      AVAILABLE_THROUGH,
      { minimumMonths: 5 }
    );

    expect(summary.status).toBe("available");
    expect(summary.monthsUsed).toBe(5);
    expect(summary.peakCalendarMonth).toBe(7);
    expect(summary.amplitudeKelvin).toBeCloseTo(12, 6);
  });

  it("reports insufficient-qualified-months when too few calendar months clear the floor", () => {
    const summary = summarizeAirTemperatureSeasonalHarmonic(
      sinusoidObservations(285, 12, 7, [1, 4, 7, 10]),
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("insufficient-qualified-months");
    expect(summary.requiredMonths).toBe(
      MINIMUM_MONTHS_FOR_AIR_TEMPERATURE_HARMONIC
    );
    expect(summary.monthsUsed).toBe(0);
    expect(summary.peakCalendarMonth).toBeNull();
    expect(summary.reason).toBe("too-few-qualified-calendar-months");
  });

  it("reports no-usable-observations when nothing survives coverage filtering", () => {
    const summary = summarizeAirTemperatureSeasonalHarmonic(
      [],
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("no-usable-observations");
    expect(summary.calendarMonthsCovered).toBe(0);
    expect(summary.meanLevelKelvin).toBeNull();
    expect(summary.reason).toBe("no-usable-air-temperature-observations");
  });

  it("rejects an out-of-range minimum-months configuration", () => {
    const belowParameterCount = summarizeAirTemperatureSeasonalHarmonic(
      sinusoidObservations(285, 15, 7),
      AVAILABLE_THROUGH,
      { minimumMonths: 2 }
    );
    expect(belowParameterCount.status).toBe("invalid");
    expect(belowParameterCount.reason).toBe("invalid-harmonic-configuration");

    const nonInteger = summarizeAirTemperatureSeasonalHarmonic(
      sinusoidObservations(285, 15, 7),
      AVAILABLE_THROUGH,
      { minimumMonths: 4.5 }
    );
    expect(nonInteger.status).toBe("invalid");
  });

  it("excludes non-temperature metrics rather than mixing them into the fit", () => {
    const observations = sinusoidObservations(285, 15, 7);
    observations.push(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2024, month: 7 },
        value: 3e-5,
      },
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2024, month: 1 },
        value: 40,
      }
    );

    const summary = summarizeAirTemperatureSeasonalHarmonic(
      observations,
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("available");
    expect(summary.exclusions.wrongMetric).toBe(2);
    expect(summary.peakCalendarMonth).toBe(7);
    expect(summary.amplitudeKelvin).toBeCloseTo(15, 6);
  });
});
