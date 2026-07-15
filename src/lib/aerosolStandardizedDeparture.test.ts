import { describe, expect, it } from "vitest";
import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import { compareAerosolToSeasonalBaseline } from "./aerosolSeasonalBaseline";
import {
  standardizeAerosolSeasonalDeparture,
  AEROSOL_STANDARDIZED_DEPARTURE_LIMITATIONS,
} from "./aerosolStandardizedDeparture";

const AVAILABLE_THROUGH = { year: 2026, month: 12 };

/** A usable July AOD observation for a fixed place. */
function july(
  year: number,
  value: number | null,
  validFraction = 0.95
): AerosolObservation {
  return { dataMonth: { year, month: 7 }, value, validFraction };
}

/** Ten same-calendar-month Julys (2016..2025) carrying the supplied values. */
function baselineJulys(
  values: readonly number[],
  validFraction = 0.95
): AerosolObservation[] {
  return values.map((value, index) => july(2016 + index, value, validFraction));
}

describe("standardizeAerosolSeasonalDeparture", () => {
  it("expresses the AOD departure in multiples of the baseline sample standard deviation", () => {
    // Baseline: ten Julys, mean 0.20, a modest same-month spread.
    const values = [0.17, 0.18, 0.19, 0.2, 0.2, 0.2, 0.21, 0.22, 0.23, 0.2];
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.23), // +0.03 above the baseline mean
      baselineJulys(values),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    const sd = comparison.baseline.sampleStandardDeviation!;
    const result = standardizeAerosolSeasonalDeparture(comparison);

    expect(result).toMatchObject({
      kind: "standardized-aerosol-seasonal-departure",
      isForecast: false,
      status: "available",
      direction: "above",
      source: AEROSOL_SOURCE,
      wavelengthNm: AEROSOL_WAVELENGTH_NM,
      unit: AEROSOL_UNIT,
      baselineSampleCount: 10,
      reason: null,
    });
    // The raw AOD departure and its unit are echoed for audit.
    expect(result.differenceFromBaseline).toBeCloseTo(0.03, 12);
    expect(result.unit).toBe("dimensionless");
    // The standardized value matches an independent recomputation.
    expect(result.baselineStandardDeviation).toBeCloseTo(sd, 12);
    expect(result.standardizedDeparture).toBeCloseTo(
      comparison.anomaly! / sd,
      12
    );
    // Cross-check against the comparison's own standardizedAnomaly field.
    expect(result.standardizedDeparture).toBeCloseTo(
      comparison.standardizedAnomaly!,
      12
    );
    // +0.03 against ~0.018 spread lands beyond one but within two SD.
    expect(result.magnitudeBand).toBe("beyond-typical-spread");
    expect(result.limitations).toBe(AEROSOL_STANDARDIZED_DEPARTURE_LIMITATIONS);
  });

  it("classifies a small departure as within the typical year-to-year spread", () => {
    const values = [0.05, 0.07, 0.09, 0.11, 0.13, 0.05, 0.07, 0.09, 0.11, 0.13];
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.095), // baseline mean is 0.09; +0.005 is a fraction of a SD
      baselineJulys(values),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    const result = standardizeAerosolSeasonalDeparture(comparison);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("above");
    expect(Math.abs(result.standardizedDeparture!)).toBeLessThan(1);
    expect(result.magnitudeBand).toBe("within-typical-spread");
  });

  it("classifies a large negative departure as well beyond the typical spread", () => {
    const values = [0.195, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.205];
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.1), // far below a very tight baseline (mean 0.20)
      baselineJulys(values),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    const result = standardizeAerosolSeasonalDeparture(comparison);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("below");
    expect(result.standardizedDeparture!).toBeLessThan(-2);
    expect(result.magnitudeBand).toBe("well-beyond-typical-spread");
  });

  it("reports 'at' with a zero standardized value when the target equals the baseline mean", () => {
    // 0.25/0.75/0.5 are all binary-exact, so the mean is exactly 0.50 and the
    // anomaly is a true zero (not a floating-point residue) while the baseline
    // still carries genuine spread.
    const values = [0.25, 0.75, 0.25, 0.75, 0.25, 0.75, 0.25, 0.75, 0.25, 0.75];
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.5),
      baselineJulys(values),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    const result = standardizeAerosolSeasonalDeparture(comparison);
    expect(comparison.anomaly).toBeCloseTo(0, 12);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("at");
    expect(result.standardizedDeparture).toBeCloseTo(0, 12);
    expect(result.magnitudeBand).toBe("within-typical-spread");
  });

  it("withholds when the baseline has too few samples to form a standard deviation", () => {
    // Only two same-calendar-month years => insufficient samples for the
    // comparison itself; no anomaly, so nothing to standardize.
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.21),
      baselineJulys([0.19, 0.2]),
      AVAILABLE_THROUGH,
      { minimumSamples: 3 }
    );

    expect(comparison.status).toBe("insufficient-samples");
    const result = standardizeAerosolSeasonalDeparture(comparison);
    expect(result).toMatchObject({
      status: "unavailable",
      standardizedDeparture: null,
      magnitudeBand: null,
      direction: null,
      differenceFromBaseline: null,
      reason: "too-few-same-calendar-month-samples",
    });
    // The cited source is retained even when withholding.
    expect(result.source).toBe(AEROSOL_SOURCE);
    expect(result.baselineSampleCount).toBe(2);
    expect(result.limitations).toBe(AEROSOL_STANDARDIZED_DEPARTURE_LIMITATIONS);
  });

  it("withholds without dividing by zero when the baseline has no variability", () => {
    // A flat baseline: usable anomaly, but a zero sample standard deviation.
    // 0.5 is exactly representable, so ten identical samples give a true zero.
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.52),
      baselineJulys([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.sampleStandardDeviation).toBe(0);
    const result = standardizeAerosolSeasonalDeparture(comparison);
    expect(result).toMatchObject({
      status: "unavailable",
      standardizedDeparture: null,
      magnitudeBand: null,
      reason: "no-baseline-variability",
    });
    // The raw anomaly is still echoed for auditability.
    expect(result.differenceFromBaseline).toBeCloseTo(0.02, 12);
    expect(result.baselineStandardDeviation).toBe(0);
  });

  it("withholds when the underlying comparison is unavailable", () => {
    // Target month is later than the caller-confirmed availability checkpoint.
    const comparison = compareAerosolToSeasonalBaseline(
      july(2027, 0.21),
      baselineJulys([0.14, 0.16, 0.18, 0.2, 0.22, 0.24, 0.26, 0.18, 0.2, 0.22]),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    expect(comparison.status).not.toBe("available");
    const result = standardizeAerosolSeasonalDeparture(comparison);
    expect(result.status).toBe("unavailable");
    expect(result.standardizedDeparture).toBeNull();
    expect(result.reason).toBe(comparison.reason);
  });
});
