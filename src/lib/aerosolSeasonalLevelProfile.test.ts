import { describe, expect, it } from "vitest";
import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import { MINIMUM_AEROSOL_SEASONAL_BASELINE_SAMPLES } from "./aerosolSeasonalBaseline";
import {
  AEROSOL_SEASONAL_LEVEL_PROFILE_LIMITATIONS,
  describeAerosolSeasonalLevelProfile,
  formatAerosolSeasonalLevelProfile,
} from "./aerosolSeasonalLevelProfile";

/** A usable July AOD observation for a fixed place. */
function july(
  year: number,
  value: number | null,
  validFraction = 0.95
): AerosolObservation {
  return { dataMonth: { year, month: 7 }, value, validFraction };
}

/** Prior Julys of AOD at the supplied values, oldest to newest. */
function priorJulys(startYear: number, values: number[]): AerosolObservation[] {
  return values.map((value, index) => july(startYear + index, value));
}

const AVAILABLE_THROUGH = { year: 2026, month: 12 };

describe("aerosol same-calendar-month robust level profile", () => {
  it("reports median, quartiles, IQR, and mean of the retained record", () => {
    // Ten Julys 0.10..0.28 step 0.02 (ascending). For n=10 the R-7 quantiles
    // are: Q1 at index 2.25 => 0.145, median at 4.5 => 0.19, Q3 at 6.75 => 0.235.
    const values = Array.from({ length: 10 }, (_u, i) => 0.1 + i * 0.02);
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.5),
      priorJulys(2016, values),
      AVAILABLE_THROUGH
    );

    expect(profile).toMatchObject({
      kind: "same-calendar-month-aerosol-level-profile",
      isForecast: false,
      claimScope: "descriptive-column-aerosol-optical-depth-only",
      status: "available",
      source: AEROSOL_SOURCE,
      wavelengthNm: AEROSOL_WAVELENGTH_NM,
      unit: AEROSOL_UNIT,
      reason: null,
    });
    expect(profile.bounds).toMatchObject({ calendarMonth: 7, endYear: 2025 });
    expect(profile.sampleCount).toBe(10);
    expect(profile.requiredSampleCount).toBe(
      MINIMUM_AEROSOL_SEASONAL_BASELINE_SAMPLES
    );
    const q = profile.quantiles;
    expect(q).not.toBeNull();
    expect(q?.min).toBeCloseTo(0.1, 10);
    expect(q?.q1).toBeCloseTo(0.145, 10);
    expect(q?.median).toBeCloseTo(0.19, 10);
    expect(q?.q3).toBeCloseTo(0.235, 10);
    expect(q?.max).toBeCloseTo(0.28, 10);
    expect(q?.iqr).toBeCloseTo(0.09, 10);
    expect(q?.mean).toBeCloseTo(0.19, 10);
    expect(profile.limitations).toBe(
      AEROSOL_SEASONAL_LEVEL_PROFILE_LIMITATIONS
    );
    expect(profile.limitations.length).toBeGreaterThan(0);
  });

  it("resists a single episodic high-AOD month in the median but not the mean", () => {
    // Nine clean Julys at 0.12 plus one dust/smoke outlier at 1.50. The median
    // stays at the clean background; the mean is dragged well above it.
    const values = [...Array.from({ length: 9 }, () => 0.12), 1.5];
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.2),
      priorJulys(2016, values),
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("available");
    expect(profile.quantiles?.median).toBeCloseTo(0.12, 10);
    expect(profile.quantiles?.iqr).toBeCloseTo(0, 10);
    expect(profile.quantiles?.max).toBeCloseTo(1.5, 10);
    // Mean is pulled up by the outlier, above the robust median.
    expect(profile.quantiles?.mean).toBeGreaterThan(
      profile.quantiles?.median as number
    );
    expect(profile.quantiles?.mean).toBeCloseTo((9 * 0.12 + 1.5) / 10, 10);
  });

  it("keeps AOD dimensionless with no display conversion", () => {
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.3),
      priorJulys(
        2016,
        Array.from({ length: 10 }, () => 0.3)
      ),
      AVAILABLE_THROUGH
    );

    expect(profile.unit).toBe("dimensionless");
    expect(profile.quantiles?.median).toBe(0.3);
    // A perfectly flat record has zero robust spread.
    expect(profile.quantiles?.iqr).toBe(0);
    expect(profile.quantiles?.min).toBe(0.3);
    expect(profile.quantiles?.max).toBe(0.3);
  });

  it("profiles the record even when the target month is not yet published", () => {
    // Target is beyond availability, so the mean baseline would be target-blocked,
    // but the historical record is fully defined and must still be profiled.
    const profile = describeAerosolSeasonalLevelProfile(
      july(2030, 0.2),
      priorJulys(
        2016,
        Array.from({ length: 10 }, (_u, i) => 0.1 + i * 0.01)
      ),
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("available");
    expect(profile.sampleCount).toBe(10);
    expect(profile.quantiles?.median).toBeCloseTo(0.145, 10);
  });

  it("reports insufficient-samples below the minimum floor", () => {
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.2),
      priorJulys(2016, [0.1, 0.2, 0.3]),
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("insufficient-samples");
    expect(profile.quantiles).toBeNull();
    expect(profile.sampleCount).toBe(3);
    expect(profile.reason).toBe("too-few-same-calendar-month-samples");
  });

  it("honours a lowered minimum-sample option", () => {
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.2),
      priorJulys(2016, [0.1, 0.2, 0.3]),
      AVAILABLE_THROUGH,
      { minimumSamples: 3 }
    );

    expect(profile.status).toBe("available");
    expect(profile.requiredSampleCount).toBe(3);
    expect(profile.quantiles?.median).toBeCloseTo(0.2, 10);
    expect(profile.quantiles?.q1).toBeCloseTo(0.15, 10);
    expect(profile.quantiles?.q3).toBeCloseTo(0.25, 10);
  });

  it("reports unavailable for an invalid target calendar month", () => {
    const profile = describeAerosolSeasonalLevelProfile(
      { dataMonth: { year: 2026, month: 13 }, value: 0.2, validFraction: 0.95 },
      priorJulys(
        2016,
        Array.from({ length: 10 }, () => 0.2)
      ),
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("unavailable");
    expect(profile.quantiles).toBeNull();
  });

  it("reports unavailable for an invalid baseline configuration", () => {
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.2),
      priorJulys(
        2016,
        Array.from({ length: 10 }, () => 0.2)
      ),
      AVAILABLE_THROUGH,
      { minimumSamples: 0 }
    );

    expect(profile.status).toBe("unavailable");
    expect(profile.quantiles).toBeNull();
    expect(profile.reason).toBe("invalid-baseline-configuration");
  });

  it("does not borrow adjacent calendar months into the record", () => {
    const candidates: AerosolObservation[] = [
      ...priorJulys(
        2016,
        Array.from({ length: 10 }, () => 0.2)
      ),
      // Augusts at a very different level must never enter the July record.
      { dataMonth: { year: 2019, month: 8 }, value: 1.2, validFraction: 0.95 },
      { dataMonth: { year: 2020, month: 8 }, value: 1.3, validFraction: 0.95 },
    ];
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.2),
      candidates,
      AVAILABLE_THROUGH
    );

    expect(profile.sampleCount).toBe(10);
    expect(profile.quantiles?.max).toBe(0.2);
    expect(profile.samples.every((sample) => sample.month.month === 7)).toBe(
      true
    );
  });

  it("formats a cited one-line readout flagging right-skew", () => {
    const values = [...Array.from({ length: 9 }, () => 0.12), 1.5];
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.2),
      priorJulys(2016, values),
      AVAILABLE_THROUGH
    );
    const line = formatAerosolSeasonalLevelProfile(profile);

    expect(line).toContain("level profile for July");
    expect(line).toContain("median 0.12");
    expect(line).toContain("right-skewed");
    expect(line).toContain(AEROSOL_SOURCE.shortName);
    expect(line).toContain("not a climatological normal");
  });

  it("formats non-available profiles plainly", () => {
    const profile = describeAerosolSeasonalLevelProfile(
      july(2026, 0.2),
      priorJulys(2016, [0.1, 0.2]),
      AVAILABLE_THROUGH
    );
    const line = formatAerosolSeasonalLevelProfile(profile);

    expect(line).toContain("no profile is reported");
    expect(line).toContain("too-few-same-calendar-month-samples");
  });
});
