import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import {
  MINIMUM_SPI_POSITIVE_SAMPLES,
  PRECIPITATION_SPI_LIMITATIONS,
  PRECIPITATION_SPI_METRIC,
  SPI_CLAMP_MAGNITUDE,
  describePrecipitationSpi,
  fitGammaByThom,
  gammaCdf,
  inverseStandardNormalCdf,
  logGamma,
  regularizedLowerIncompleteGamma,
} from "./precipitationSpi";
import type { PrecipitationObservation } from "./precipitationPercentile";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

// Native precipitation rates are small (kg/m²/s); a light drizzle is ~1e-5.
// Scaling by 1e-6 keeps fixtures in a realistic band while the gamma fit and its
// probability transform stay exactly invariant to the common scale factor.
const RATE = 1e-6;

const precipMonth = (
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.9
): PrecipitationObservation => ({
  dataMonth: { year, month },
  value: value === null ? null : value * RATE,
  validFraction,
});

/** Same-calendar-month prior-year record, one value per year from 2013 up. */
const priorYears = (
  month: number,
  values: readonly number[],
  validFraction = 0.9
): PrecipitationObservation[] =>
  values.map((value, index) =>
    precipMonth(2013 + index, month, value, validFraction)
  );

// A 12-year July record with clear year-to-year spread (unscaled units).
const JULY_RECORD = [80, 95, 100, 110, 120, 90, 130, 105, 115, 125, 88, 140];

describe("inverse standard-normal CDF (Acklam)", () => {
  it("recovers published standard-normal quantiles", () => {
    expect(inverseStandardNormalCdf(0.5)).toBeCloseTo(0, 9);
    // Φ⁻¹(0.975) = 1.959963985…, the classic 95% two-sided z.
    expect(inverseStandardNormalCdf(0.975)).toBeCloseTo(1.959963985, 6);
    expect(inverseStandardNormalCdf(0.025)).toBeCloseTo(-1.959963985, 6);
    // Φ⁻¹(0.99) = 2.326347874…
    expect(inverseStandardNormalCdf(0.99)).toBeCloseTo(2.326347874, 6);
    // Deep tail exercises the rational branch, not just the central one.
    expect(inverseStandardNormalCdf(0.001)).toBeCloseTo(-3.090232306, 5);
  });

  it("is antisymmetric about p = 0.5 and returns ±∞ at the open bounds", () => {
    for (const p of [0.02, 0.2, 0.37, 0.6, 0.98]) {
      expect(inverseStandardNormalCdf(p)).toBeCloseTo(
        -inverseStandardNormalCdf(1 - p),
        7
      );
    }
    expect(inverseStandardNormalCdf(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(inverseStandardNormalCdf(1)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("log-gamma (Lanczos)", () => {
  it("matches exact factorial and half-integer values", () => {
    expect(logGamma(1)).toBeCloseTo(0, 10);
    expect(logGamma(2)).toBeCloseTo(0, 10);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10); // 4!
    expect(logGamma(6)).toBeCloseTo(Math.log(120), 10); // 5!
    // Γ(1/2) = √π, so lnΓ(1/2) = ½ln(π).
    expect(logGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 10);
  });
});

describe("regularized lower incomplete gamma P(a, x)", () => {
  it("matches the exponential closed form P(1, x) = 1 − e^−x", () => {
    for (const x of [0.25, 1, 2, 5]) {
      expect(regularizedLowerIncompleteGamma(1, x)).toBeCloseTo(
        1 - Math.exp(-x),
        10
      );
    }
  });

  it("matches the shape-2 closed form P(2, x) = 1 − (1 + x)e^−x", () => {
    for (const x of [0.5, 2, 4, 7]) {
      expect(regularizedLowerIncompleteGamma(2, x)).toBeCloseTo(
        1 - (1 + x) * Math.exp(-x),
        10
      );
    }
  });

  it("is 0 at x = 0, approaches 1 far out, and rejects bad input", () => {
    expect(regularizedLowerIncompleteGamma(3, 0)).toBe(0);
    expect(regularizedLowerIncompleteGamma(3, 60)).toBeCloseTo(1, 10);
    expect(Number.isNaN(regularizedLowerIncompleteGamma(0, 1))).toBe(true);
    expect(Number.isNaN(regularizedLowerIncompleteGamma(2, -1))).toBe(true);
  });
});

describe("gamma CDF", () => {
  it("reduces to the exponential CDF at shape 1 and is 0 below support", () => {
    // shape 1, scale 2 → Exp(mean 2); CDF(2) = 1 − e^−1.
    expect(gammaCdf(2, 1, 2)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(gammaCdf(0, 3, 2)).toBe(0);
    expect(gammaCdf(-5, 3, 2)).toBe(0);
  });
});

describe("Thom gamma fit", () => {
  it("recovers the sample mean as α·β", () => {
    const values = JULY_RECORD.map((v) => v * RATE);
    const fit = fitGammaByThom(values);
    expect(fit).not.toBeNull();
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(fit!.shape * fit!.scale).toBeCloseTo(mean, 18);
    expect(fit!.shape).toBeGreaterThan(0);
    expect(fit!.scale).toBeGreaterThan(0);
  });

  it("withholds (null) when there is no spread or no positive input", () => {
    expect(fitGammaByThom([5, 5, 5, 5])).toBeNull();
    expect(fitGammaByThom([])).toBeNull();
    expect(fitGammaByThom([0, 0])).toBeNull();
  });

  it("is invariant in shape and scales linearly under a common factor", () => {
    const base = fitGammaByThom(JULY_RECORD)!;
    const scaled = fitGammaByThom(JULY_RECORD.map((v) => v * 1000))!;
    expect(scaled.shape).toBeCloseTo(base.shape, 10);
    expect(scaled.scale / base.scale).toBeCloseTo(1000, 6);
  });
});

describe("precipitation SPI", () => {
  it("scores a target within its same-calendar-month gamma fit, with full provenance", () => {
    const result = describePrecipitationSpi(
      precipMonth(2025, 7, 135),
      priorYears(7, JULY_RECORD),
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "precipitation-standardized-precipitation-index",
      isForecast: false,
      isTrend: false,
      claimScope:
        "standardized-index-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      sampleCount: 12,
      clampedToExtreme: false,
      reason: null,
    });
    expect(result.metric).toBe(CLIMATE_METRICS["precipitation-rate"]);
    expect(result.metric).toBe(PRECIPITATION_SPI_METRIC);
    expect(result.limitations).toBe(PRECIPITATION_SPI_LIMITATIONS);

    // A wet target (near the top of the record) yields a positive SPI.
    expect(result.spi).not.toBeNull();
    expect(result.spi!).toBeGreaterThan(0);
    expect(result.direction).toBe(result.spi! >= 1 ? "wet" : "normal");

    // The fit has no zeros here, so it should recover the mean of the 12 years.
    expect(result.fit).not.toBeNull();
    expect(result.fit!.positiveSampleCount).toBe(12);
    expect(result.fit!.zeroSampleCount).toBe(0);
    expect(result.fit!.zeroProbability).toBe(0);
  });

  it("reproduces the documented mixed-CDF → inverse-normal assembly exactly", () => {
    const target = 135;
    const result = describePrecipitationSpi(
      precipMonth(2025, 7, target),
      priorYears(7, JULY_RECORD),
      AVAILABLE_THROUGH
    );

    // Independently rebuild H(x) = q + (1−q)·G(x) then SPI = Φ⁻¹(H) from the
    // fitted parameters and confirm the pipeline wired the zero-mass, the target
    // exclusion, and the transform together correctly.
    const fit = result.fit!;
    const expectedH =
      fit.zeroProbability +
      (1 - fit.zeroProbability) * gammaCdf(target * RATE, fit.shape, fit.scale);
    expect(result.cumulativeProbability).toBeCloseTo(expectedH, 12);
    expect(result.spi).toBeCloseTo(inverseStandardNormalCdf(expectedH), 12);
  });

  it("is monotonic: a wetter target never scores a lower SPI", () => {
    const record = priorYears(7, JULY_RECORD);
    const spiFor = (value: number) =>
      describePrecipitationSpi(
        precipMonth(2025, 7, value),
        record,
        AVAILABLE_THROUGH
      ).spi!;
    const dry = spiFor(70);
    const mid = spiFor(105);
    const wet = spiFor(150);
    expect(dry).toBeLessThan(mid);
    expect(mid).toBeLessThan(wet);
  });

  it("is invariant to a common positive scale of every value", () => {
    const plain = describePrecipitationSpi(
      precipMonth(2025, 7, 135),
      priorYears(7, JULY_RECORD),
      AVAILABLE_THROUGH
    );
    // Multiply the target and every baseline year by the same factor.
    const scaledPriors = priorYears(
      7,
      JULY_RECORD.map((v) => v * 250)
    );
    const scaled = describePrecipitationSpi(
      precipMonth(2025, 7, 135 * 250),
      scaledPriors,
      AVAILABLE_THROUGH
    );
    expect(scaled.spi!).toBeCloseTo(plain.spi!, 9);
  });

  it("clamps an off-the-record target to ±3 and flags it", () => {
    const record = priorYears(7, JULY_RECORD);
    const soaking = describePrecipitationSpi(
      precipMonth(2025, 7, 100000),
      record,
      AVAILABLE_THROUGH
    );
    expect(soaking.clampedToExtreme).toBe(true);
    expect(soaking.spi).toBe(SPI_CLAMP_MAGNITUDE);
    expect(soaking.category).toBe("extremely-wet");
    expect(soaking.direction).toBe("wet");

    const parched = describePrecipitationSpi(
      precipMonth(2025, 7, 0),
      // No zero years in the fit, so a zero target sits below the whole record.
      record,
      AVAILABLE_THROUGH
    );
    expect(parched.clampedToExtreme).toBe(true);
    expect(parched.spi).toBe(-SPI_CLAMP_MAGNITUDE);
    expect(parched.category).toBe("extremely-dry");
  });

  it("mixes an empirical zero-precipitation mass into the CDF", () => {
    // Four arid Julys recorded as exactly zero among the twelve baseline years.
    const arid = [0, 0, 0, 0, 20, 25, 30, 22, 28, 24, 26, 21];
    const result = describePrecipitationSpi(
      precipMonth(2025, 7, 24),
      priorYears(7, arid),
      AVAILABLE_THROUGH
    );
    expect(result.status).toBe("available");
    expect(result.fit!.zeroSampleCount).toBe(4);
    expect(result.fit!.positiveSampleCount).toBe(8);
    expect(result.fit!.zeroProbability).toBeCloseTo(4 / 12, 12);
    // q alone (≈0.333) already pushes any positive target's cumulative
    // probability above the zero mass, so H > q by construction.
    expect(result.cumulativeProbability!).toBeGreaterThan(4 / 12);
  });

  it("assigns McKee categories from the SPI value", () => {
    // Probe the category boundaries directly through synthetic near-normal and
    // wet/dry targets against a symmetric-ish record.
    const record = priorYears(7, JULY_RECORD);
    const near = describePrecipitationSpi(
      precipMonth(2025, 7, 108),
      record,
      AVAILABLE_THROUGH
    );
    expect(Math.abs(near.spi!)).toBeLessThan(1);
    expect(near.category).toBe("near-normal");
    expect(near.direction).toBe("normal");
  });

  it("withholds when the baseline is under-sampled, passing the status through", () => {
    const result = describePrecipitationSpi(
      precipMonth(2025, 7, 120),
      priorYears(7, [100, 110, 120]), // only 3 years — below the floor
      AVAILABLE_THROUGH
    );
    expect(result.status).toBe("insufficient-samples");
    expect(result.spi).toBeNull();
    expect(result.fit).toBeNull();
    expect(result.reason).toBe("too-few-same-calendar-month-samples");
  });

  it("withholds when the target month is not yet published", () => {
    const result = describePrecipitationSpi(
      precipMonth(2026, 7, 120), // after AVAILABLE_THROUGH (2026-01)
      priorYears(7, JULY_RECORD),
      AVAILABLE_THROUGH
    );
    expect(result.status).toBe("not-yet-published");
    expect(result.spi).toBeNull();
  });

  it("withholds with insufficient-fit when too few months are positive", () => {
    // Twelve all-zero Julys clear the sample floor but leave nothing to fit.
    const result = describePrecipitationSpi(
      precipMonth(2025, 7, 0),
      priorYears(7, new Array(12).fill(0)),
      AVAILABLE_THROUGH
    );
    expect(result.status).toBe("insufficient-fit");
    expect(result.reason).toBe("too-few-positive-months");
    expect(result.spi).toBeNull();
    expect(MINIMUM_SPI_POSITIVE_SAMPLES).toBe(2);
  });

  it("withholds with insufficient-fit when the positive record has no spread", () => {
    const result = describePrecipitationSpi(
      precipMonth(2025, 7, 100),
      priorYears(7, new Array(12).fill(100)),
      AVAILABLE_THROUGH
    );
    expect(result.status).toBe("insufficient-fit");
    expect(result.reason).toBe("no-precipitation-variability");
    expect(result.spi).toBeNull();
  });

  it("rejects a physically invalid (negative) target via the upstream guard", () => {
    // summarizeMonthlyClimate treats negative precipitation as non-physical, so
    // the baseline never reaches "available" and SPI passes the status through.
    const result = describePrecipitationSpi(
      precipMonth(2025, 7, -5),
      priorYears(7, JULY_RECORD),
      AVAILABLE_THROUGH
    );
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("invalid-value");
    expect(result.spi).toBeNull();
    expect(result.fit).toBeNull();
  });
});
