import { describe, expect, it } from "vitest";
import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import {
  compareAerosolToSeasonalBaseline,
  MINIMUM_AEROSOL_SEASONAL_BASELINE_SAMPLES,
  MINIMUM_AEROSOL_SEASONAL_VALID_FRACTION,
} from "./aerosolSeasonalBaseline";

/** A usable July AOD observation for a fixed place. */
function july(
  year: number,
  value: number | null,
  validFraction = 0.95
): AerosolObservation {
  return { dataMonth: { year, month: 7 }, value, validFraction };
}

/** N prior Julys of AOD, oldest to newest, all at the same fixed value. */
function priorJulys(
  startYear: number,
  value: number,
  count = MINIMUM_AEROSOL_SEASONAL_BASELINE_SAMPLES
): AerosolObservation[] {
  return Array.from({ length: count }, (_unused, index) =>
    july(startYear + index, value)
  );
}

const AVAILABLE_THROUGH = { year: 2026, month: 12 };

describe("aerosol same-calendar-month seasonal baseline", () => {
  it("reports the anomaly against same-month AOD samples", () => {
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.35),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH
    );

    expect(comparison).toMatchObject({
      kind: "same-calendar-month-aerosol-baseline",
      isForecast: false,
      claimScope: "descriptive-column-aerosol-optical-depth-only",
      status: "available",
      source: AEROSOL_SOURCE,
      wavelengthNm: AEROSOL_WAVELENGTH_NM,
      unit: AEROSOL_UNIT,
      anomalyUnit: AEROSOL_UNIT,
      reason: null,
    });
    expect(comparison.anomaly).toBeCloseTo(0.15, 10);
    expect(comparison.baseline.mean).toBeCloseTo(0.2, 10);
    expect(comparison.baseline.sampleCount).toBe(10);
    expect(comparison.bounds).toMatchObject({
      calendarMonth: 7,
      endYear: 2025,
    });
    // Samples retained oldest-to-newest for auditability.
    expect(comparison.samples.map((sample) => sample.month.year)).toEqual([
      2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(comparison.limitations.length).toBeGreaterThan(0);
  });

  it("keeps AOD dimensionless with no display conversion", () => {
    // 0.5 is exactly representable, so ten identical samples give a genuinely
    // zero variance and the target sits exactly on the baseline mean.
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.5),
      priorJulys(2016, 0.5),
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("available");
    expect(comparison.anomaly).toBe(0);
    expect(comparison.anomalyUnit).toBe("dimensionless");
    // Zero spread across identical samples => no standardized anomaly.
    expect(comparison.baseline.sampleStandardDeviation).toBe(0);
    expect(comparison.standardizedAnomaly).toBeNull();
  });

  it("computes a unitless standardized anomaly from the baseline spread", () => {
    // Samples 0.10..0.28 step 0.02 (mean 0.19, sample sd 0.0606..).
    const values = Array.from({ length: 10 }, (_u, i) => 0.1 + i * 0.02);
    const samples = values.map((value, index) => july(2016 + index, value));
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.31),
      samples,
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("available");
    const { mean, sampleStandardDeviation } = comparison.baseline;
    expect(mean).toBeCloseTo(0.19, 10);
    expect(comparison.anomaly).toBeCloseTo(0.12, 10);
    expect(comparison.standardizedAnomaly).toBeCloseTo(
      0.12 / (sampleStandardDeviation as number),
      10
    );
  });

  it("excludes the target year, duplicates, and out-of-window years", () => {
    const candidates = [
      ...priorJulys(2016, 0.2),
      july(2026, 999), // same year as target: out of the default window
      july(2020, 0.2), // duplicate 2020
    ];
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.3),
      candidates,
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.sampleCount).toBe(10);
    expect(comparison.exclusions.duplicateYear).toBe(1);
    expect(comparison.exclusions.outOfBounds).toBe(1);
  });

  it("never borrows other calendar months", () => {
    const candidates = [
      ...priorJulys(2016, 0.2),
      { dataMonth: { year: 2024, month: 3 }, value: 0.9, validFraction: 0.95 },
    ];
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.3),
      candidates,
      AVAILABLE_THROUGH
    );

    expect(comparison.exclusions.wrongCalendarMonth).toBe(1);
    expect(comparison.baseline.sampleCount).toBe(10);
  });

  it("drops not-yet-published baseline months", () => {
    // With availableThrough 2020-07 the target (2020) is published, but an
    // explicit window reaching 2025 pulls in 2021..2025 Julys that are not yet
    // published and must be excluded rather than compared against.
    const comparison = compareAerosolToSeasonalBaseline(
      july(2020, 0.3),
      priorJulys(2016, 0.2, 10), // 2016..2025
      { year: 2020, month: 7 },
      { baselineStartYear: 2016, baselineEndYear: 2025 }
    );

    expect(comparison.status).toBe("insufficient-samples");
    expect(comparison.exclusions.notYetPublished).toBe(5); // 2021..2025
    expect(comparison.baseline.sampleCount).toBe(5); // 2016..2020 published
    expect(comparison.anomaly).toBeNull();
  });

  it("flags a not-yet-published target without inventing an anomaly", () => {
    const comparison = compareAerosolToSeasonalBaseline(
      july(2030, 0.3),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("not-yet-published");
    expect(comparison.anomaly).toBeNull();
    expect(comparison.standardizedAnomaly).toBeNull();
  });

  it("reports no-data when the target value is missing", () => {
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, null),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("no-data");
    expect(comparison.anomaly).toBeNull();
  });

  it("rejects a negative (non-physical) target AOD as invalid", () => {
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, -0.2),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("invalid");
    expect(comparison.anomaly).toBeNull();
  });

  it("requires enough same-month samples", () => {
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.3),
      priorJulys(2016, 0.2, 5),
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("insufficient-samples");
    expect(comparison.baseline.sampleCount).toBe(5);
    expect(comparison.anomaly).toBeNull();
  });

  it("distinguishes insufficient coverage from too few samples", () => {
    // Enough same-month years, but every baseline month is below the coverage
    // floor: the record is coverage-eligible but too sparse to trust.
    const lowCoverage = Array.from({ length: 10 }, (_u, index) =>
      july(2016 + index, 0.2, MINIMUM_AEROSOL_SEASONAL_VALID_FRACTION - 0.1)
    );
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.3),
      lowCoverage,
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("insufficient-coverage");
    expect(comparison.exclusions.insufficientCoverage).toBe(10);
  });

  it("flags an under-covered target", () => {
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.3, MINIMUM_AEROSOL_SEASONAL_VALID_FRACTION - 0.1),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH
    );

    expect(comparison.status).toBe("insufficient-coverage");
    expect(comparison.reason).toBe("target-coverage-below-threshold");
  });

  it("honors an explicit baseline window", () => {
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.3),
      priorJulys(2010, 0.2, 16), // 2010..2025
      AVAILABLE_THROUGH,
      { baselineStartYear: 2016, baselineEndYear: 2025 }
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.sampleCount).toBe(10);
    expect(comparison.exclusions.outOfBounds).toBe(6); // 2010..2015
    expect(comparison.bounds).toMatchObject({
      startYear: 2016,
      endYear: 2025,
    });
  });

  it("rejects an invalid configuration", () => {
    const comparison = compareAerosolToSeasonalBaseline(
      july(2026, 0.3),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH,
      { minimumSamples: 0 }
    );

    expect(comparison.status).toBe("invalid");
    expect(comparison.reason).toBe("invalid-baseline-configuration");
  });
});
