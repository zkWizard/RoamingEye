import { describe, expect, it } from "vitest";
import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import { MINIMUM_AEROSOL_SEASONAL_BASELINE_SAMPLES } from "./aerosolSeasonalBaseline";
import { describeAerosolSeasonalPercentile } from "./aerosolSeasonalPercentile";

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

/** Ten prior Julys with well-separated AOD values 0.05, 0.10, ..., 0.50. */
function spreadJulys(): AerosolObservation[] {
  return Array.from({ length: 10 }, (_unused, index) =>
    july(2016 + index, 0.05 * (index + 1))
  );
}

const AVAILABLE_THROUGH = { year: 2026, month: 12 };

describe("aerosol same-calendar-month seasonal percentile", () => {
  it("ranks the target within its same-month AOD record", () => {
    // Samples 0.05..0.50; target 0.32 sits between the 6th (0.30) and 7th
    // (0.35): six months clearer, four hazier, none tied.
    const result = describeAerosolSeasonalPercentile(
      july(2026, 0.32),
      spreadJulys(),
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "aerosol-seasonal-percentile-of-record",
      isForecast: false,
      isTrend: false,
      claimScope:
        "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      source: AEROSOL_SOURCE,
      wavelengthNm: AEROSOL_WAVELENGTH_NM,
      unit: AEROSOL_UNIT,
      sampleCount: 10,
      clearerRecordCount: 6,
      hazierRecordCount: 4,
      tiedRecordCount: 0,
      isClearestInRecord: false,
      isHaziestInRecord: false,
      reason: null,
    });
    expect(result.percentileRank).toBeCloseTo(60, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0.4, 10);
    // The audited baseline is retained for provenance.
    expect(result.baseline.status).toBe("available");
    expect(result.baseline.source).toEqual(AEROSOL_SOURCE);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("keeps non-exceedance and exceedance complementary by construction", () => {
    const result = describeAerosolSeasonalPercentile(
      july(2026, 0.32),
      spreadJulys(),
      AVAILABLE_THROUGH
    );

    expect(result.percentileRank).not.toBeNull();
    expect(
      (result.percentileRank as number) / 100 +
        (result.exceedanceProbability as number)
    ).toBeCloseTo(1, 12);
  });

  it("stays defined on a zero-spread record where a standardized anomaly is not", () => {
    // Ten identical samples give zero baseline spread, so the parametric
    // standardized anomaly is undefined — but the mid-rank percentile is still
    // defined (all months tie the target).
    const result = describeAerosolSeasonalPercentile(
      july(2026, 0.5),
      priorJulys(2016, 0.5),
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("available");
    expect(result.baseline.baseline.sampleStandardDeviation).toBe(0);
    expect(result.baseline.standardizedAnomaly).toBeNull();
    expect(result.tiedRecordCount).toBe(10);
    expect(result.percentileRank).toBeCloseTo(50, 10);
    expect(result.isClearestInRecord).toBe(true);
    expect(result.isHaziestInRecord).toBe(true);
  });

  it("marks the haziest month in the record at the 100th percentile", () => {
    const result = describeAerosolSeasonalPercentile(
      july(2026, 0.9),
      spreadJulys(),
      AVAILABLE_THROUGH
    );

    expect(result.clearerRecordCount).toBe(10);
    expect(result.hazierRecordCount).toBe(0);
    expect(result.percentileRank).toBeCloseTo(100, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0, 10);
    expect(result.isHaziestInRecord).toBe(true);
    expect(result.isClearestInRecord).toBe(false);
  });

  it("marks the clearest month in the record at the 0th percentile", () => {
    const result = describeAerosolSeasonalPercentile(
      july(2026, 0.01),
      spreadJulys(),
      AVAILABLE_THROUGH
    );

    expect(result.clearerRecordCount).toBe(0);
    expect(result.hazierRecordCount).toBe(10);
    expect(result.percentileRank).toBeCloseTo(0, 10);
    expect(result.exceedanceProbability).toBeCloseTo(1, 10);
    expect(result.isClearestInRecord).toBe(true);
    expect(result.isHaziestInRecord).toBe(false);
  });

  it("passes an under-sampled record through without inventing a rank", () => {
    const result = describeAerosolSeasonalPercentile(
      july(2026, 0.3),
      priorJulys(2016, 0.2, 5),
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.sampleCount).toBe(5);
    expect(result.percentileRank).toBeNull();
    expect(result.exceedanceProbability).toBeNull();
    expect(result.clearerRecordCount).toBeNull();
    expect(result.hazierRecordCount).toBeNull();
    expect(result.isClearestInRecord).toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it("flags a not-yet-published target without ranking it", () => {
    const result = describeAerosolSeasonalPercentile(
      july(2030, 0.3),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("not-yet-published");
    expect(result.percentileRank).toBeNull();
  });

  it("reports no-data when the target value is missing", () => {
    const result = describeAerosolSeasonalPercentile(
      july(2026, null),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("no-data");
    expect(result.percentileRank).toBeNull();
  });

  it("surfaces an invalid baseline configuration", () => {
    const result = describeAerosolSeasonalPercentile(
      july(2026, 0.3),
      priorJulys(2016, 0.2),
      AVAILABLE_THROUGH,
      { minimumSamples: 0 }
    );

    expect(result.status).toBe("invalid");
    expect(result.percentileRank).toBeNull();
    expect(result.reason).toBe("invalid-baseline-configuration");
  });
});
