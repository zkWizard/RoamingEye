import { describe, expect, it } from "vitest";
import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  type SeaSurfaceTemperatureObservation,
  type SstFootprint,
} from "./oceanConditions";
import { summarizeSstSeasonalCycle } from "./oceanSeasonalCycle";
import {
  MINIMUM_MONTHS_FOR_ANNUAL_HARMONIC,
  SST_SEASONAL_HARMONIC_LIMITATIONS,
  summarizeSstSeasonalHarmonic,
} from "./oceanSeasonalHarmonic";

const RADIANS_PER_MONTH = (2 * Math.PI) / 12;

/** One SST observation for a given calendar month and year. */
function obs(
  year: number,
  month: number,
  value: number,
  footprint: SstFootprint = "water",
  validFraction = 0.95
): SeaSurfaceTemperatureObservation {
  return { dataMonth: { year, month }, value, validFraction, footprint };
}

/** Mid-month angle used by the fit, matching the module's placement. */
function angleOf(month: number): number {
  return RADIANS_PER_MONTH * (month - 0.5);
}

/**
 * Build `years` observations for each requested calendar month, drawing the SST
 * value from `meanFor`. Because every year of a month shares the value, each
 * calendar-month climatological mean equals `meanFor(month)` exactly, so a fit of
 * a single harmonic recovers its generating parameters to machine precision.
 */
function climatology(
  meanFor: (month: number) => number,
  months: readonly number[],
  footprint: SstFootprint = "water",
  years = 3,
  startYear = 2015
): SeaSurfaceTemperatureObservation[] {
  const out: SeaSurfaceTemperatureObservation[] = [];
  for (const month of months) {
    for (let i = 0; i < years; i++) {
      out.push(obs(startYear + i, month, meanFor(month), footprint));
    }
  }
  return out;
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

describe("SST annual-harmonic seasonal fit", () => {
  it("recovers the level, amplitude, phase, and variance of a pure annual harmonic", () => {
    const level = 18;
    const amplitude = 6;
    const phiDegrees = 225; // maximum at the mid-August angle (2π·7.5/12)
    const phi = (phiDegrees * Math.PI) / 180;
    const meanFor = (month: number) =>
      level + amplitude * Math.cos(angleOf(month) - phi);

    const harmonic = summarizeSstSeasonalHarmonic(
      climatology(meanFor, ALL_MONTHS)
    );

    expect(harmonic).toMatchObject({
      kind: "derived-sst-seasonal-harmonic",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      status: "available",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      footprint: "water",
      monthsUsed: 12,
      peakCalendarMonth: 8,
      peakMonthName: "Aug",
      unit: "°C",
      reason: null,
    });
    expect(harmonic.meanLevel).toBeCloseTo(level, 9);
    expect(harmonic.amplitude).toBeCloseTo(amplitude, 9);
    expect(harmonic.phaseDegrees).toBeCloseTo(phiDegrees, 9);
    expect(harmonic.peakMonth).toBeCloseTo(8, 9);
    expect(harmonic.varianceExplained).toBeCloseTo(1, 9);
    expect(harmonic.limitations).toBe(SST_SEASONAL_HARMONIC_LIMITATIONS);
  });

  it("reports the harmonic amplitude as half the observed peak-to-trough range", () => {
    // level ± amplitude at the extremes → warmest−coldest = 2·amplitude.
    const level = 15;
    const amplitude = 5;
    const meanFor = (month: number) =>
      level + amplitude * Math.cos(angleOf(month) - angleOf(8));
    const observations = climatology(meanFor, ALL_MONTHS);

    const harmonic = summarizeSstSeasonalHarmonic(observations);
    const cycle = summarizeSstSeasonalCycle(observations);

    expect(harmonic.amplitude).toBeCloseTo(amplitude, 9);
    // The discrete seasonal cycle measures the full peak-to-trough swing.
    expect(cycle.seasonalAmplitude).toBeCloseTo(2 * amplitude, 9);
  });

  it("resolves the peak timing to finer than a whole month", () => {
    // Maximum placed at 202.5° → continuous peak month 7.25 (late July).
    const meanFor = (month: number) =>
      12 + 4 * Math.cos(angleOf(month) - (202.5 * Math.PI) / 180);

    const harmonic = summarizeSstSeasonalHarmonic(
      climatology(meanFor, ALL_MONTHS)
    );

    expect(harmonic.peakMonth).toBeCloseTo(7.25, 9);
    expect(harmonic.peakCalendarMonth).toBe(7);
    expect(harmonic.peakMonthName).toBe("Jul");
  });

  it("withholds the phase but keeps the amplitude when the annual harmonic is negligible", () => {
    // A purely semiannual (double-peaked) climatology: the single annual
    // harmonic is orthogonal to it, so its amplitude collapses to zero.
    const meanFor = (month: number) => 15 + 5 * Math.cos(2 * angleOf(month));

    const harmonic = summarizeSstSeasonalHarmonic(
      climatology(meanFor, ALL_MONTHS)
    );

    expect(harmonic.status).toBe("available");
    expect(harmonic.amplitude).not.toBeNull();
    expect(harmonic.amplitude as number).toBeLessThan(1e-9);
    expect(harmonic.phaseDegrees).toBeNull();
    expect(harmonic.peakMonth).toBeNull();
    expect(harmonic.peakCalendarMonth).toBeNull();
    expect(harmonic.peakMonthName).toBeNull();
    expect(harmonic.varianceExplained).toBeCloseTo(0, 6);
    expect(harmonic.reason).toBe("annual-harmonic-amplitude-negligible");
  });

  it("reports variance-explained below one for a skewed annual cycle", () => {
    // Annual harmonic plus a semiannual overtone: the single harmonic captures
    // only part of the across-month variance.
    const meanFor = (month: number) =>
      16 +
      6 * Math.cos(angleOf(month) - angleOf(8)) +
      2 * Math.cos(2 * angleOf(month));

    const harmonic = summarizeSstSeasonalHarmonic(
      climatology(meanFor, ALL_MONTHS)
    );

    expect(harmonic.status).toBe("available");
    expect(harmonic.varianceExplained).not.toBeNull();
    expect(harmonic.varianceExplained as number).toBeGreaterThan(0.5);
    expect(harmonic.varianceExplained as number).toBeLessThan(1);
  });

  it("keeps open-water and land-mixed coastal footprints separate", () => {
    const meanFor = (month: number) =>
      14 + 5 * Math.cos(angleOf(month) - angleOf(9));
    const observations = [
      ...climatology(meanFor, ALL_MONTHS, "water"),
      ...climatology((m) => meanFor(m) + 3, ALL_MONTHS, "land-mixed-coastal"),
    ];

    const coastal = summarizeSstSeasonalHarmonic(observations, {
      footprint: "land-mixed-coastal",
    });

    expect(coastal.footprint).toBe("land-mixed-coastal");
    expect(coastal.monthsUsed).toBe(12);
    // Adding a constant offset shifts the level but not the amplitude or phase.
    expect(coastal.meanLevel).toBeCloseTo(17, 9);
    expect(coastal.amplitude).toBeCloseTo(5, 9);
    expect(coastal.peakCalendarMonth).toBe(9);
  });

  it("counts calendar months below the years floor as unqualified and omits them", () => {
    const meanFor = (month: number) =>
      13 + 4 * Math.cos(angleOf(month) - angleOf(8));
    const observations = [
      ...climatology(meanFor, [1, 3, 5, 7, 9, 11]), // six qualified months
      obs(2015, 8, meanFor(8)), // a single lone year: never qualifies
    ];

    const harmonic = summarizeSstSeasonalHarmonic(observations);

    expect(harmonic.status).toBe("available");
    expect(harmonic.monthsUsed).toBe(6);
    expect(harmonic.exclusions.unqualifiedMonth).toBe(1);
  });

  it("reports insufficient qualified months when fewer than the floor qualify", () => {
    const meanFor = (month: number) =>
      13 + 4 * Math.cos(angleOf(month) - angleOf(8));
    const observations = climatology(meanFor, [2, 4, 6, 8, 10]); // only five

    const harmonic = summarizeSstSeasonalHarmonic(observations);

    expect(harmonic.status).toBe("insufficient-qualified-months");
    expect(harmonic.footprint).toBe("water");
    expect(harmonic.monthsUsed).toBe(0);
    expect(harmonic.amplitude).toBeNull();
    expect(harmonic.peakCalendarMonth).toBeNull();
    expect(harmonic.reason).toBe("too-few-qualified-calendar-months");
  });

  it("reports no usable observations when nothing survives coverage or footprint", () => {
    const landOnly = climatology(() => 20, ALL_MONTHS, "land");

    const harmonic = summarizeSstSeasonalHarmonic(landOnly);

    expect(harmonic.status).toBe("no-usable-observations");
    expect(harmonic.footprint).toBeNull();
    expect(harmonic.amplitude).toBeNull();
    expect(harmonic.reason).toBe("no-usable-sst-observations");
  });

  it("rejects a minimum-months option below the parameter count", () => {
    const meanFor = (month: number) =>
      13 + 4 * Math.cos(angleOf(month) - angleOf(8));

    const harmonic = summarizeSstSeasonalHarmonic(
      climatology(meanFor, ALL_MONTHS),
      { minimumMonths: 2 }
    );

    expect(harmonic.status).toBe("invalid");
    expect(harmonic.reason).toBe("invalid-harmonic-configuration");
  });

  it("propagates an invalid underlying climatology configuration", () => {
    const meanFor = (month: number) =>
      13 + 4 * Math.cos(angleOf(month) - angleOf(8));

    const harmonic = summarizeSstSeasonalHarmonic(
      climatology(meanFor, ALL_MONTHS),
      { minimumYearsPerMonth: 0 }
    );

    expect(harmonic.status).toBe("invalid");
    expect(harmonic.reason).toBe("invalid-harmonic-configuration");
  });

  it("exposes a conservative default month floor of six", () => {
    expect(MINIMUM_MONTHS_FOR_ANNUAL_HARMONIC).toBe(6);
  });
});
