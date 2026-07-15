import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate, type ClimateMetricId } from "./climate";
import {
  PLAUSIBLE_PRECIPITATION_RATE_KG_M2_S,
  PRECIPITATION_RATE_RECORD_ANCHOR,
  formatPrecipitationRatePlausibility,
  precipitationRatePlausibility,
} from "./precipitationRatePlausibility";
import type { YearMonth } from "./timeline";

/** Build a published, usable climate summary at a chosen month. */
function summaryOf(
  metricId: ClimateMetricId,
  value: number | null,
  dataMonth: YearMonth = { year: 2026, month: 1 }
) {
  return summarizeMonthlyClimate(
    { metricId, dataMonth, value, validFraction: 0.8 },
    { year: dataMonth.year + 1, month: dataMonth.month }
  );
}

describe("precipitation-rate plausibility band", () => {
  it("accepts a realistic monthly-mean precipitation rate", () => {
    // ≈ 4.3 mm/day, a typical wet-region monthly mean.
    const result = precipitationRatePlausibility(
      summaryOf("precipitation-rate", 5e-5)
    );

    expect(result).toMatchObject({
      kind: "precipitation-rate-plausibility",
      isForecast: false,
      status: "plausible",
      observedKgM2S: 5e-5,
      reason: null,
      bounds: { minKgM2S: 0, maxKgM2S: 0.01 },
    });
  });

  it("accepts a rainless (zero) month as plausible", () => {
    const result = precipitationRatePlausibility(
      summaryOf("precipitation-rate", 0)
    );

    // Zero is not "no data" here: an arid month can genuinely mean zero.
    expect(result?.status).toBe("plausible");
    expect(result?.observedKgM2S).toBe(0);
  });

  it("never flags a genuine rainfall extreme (record anchor stays inside the band)", () => {
    const wettest = precipitationRatePlausibility(
      summaryOf(
        "precipitation-rate",
        PRECIPITATION_RATE_RECORD_ANCHOR.wettestCalendarMonthKgM2S
      )
    );

    expect(wettest?.status).toBe("plausible");
    // The band is deliberately wider than the record it is anchored to.
    expect(PLAUSIBLE_PRECIPITATION_RATE_KG_M2_S.maxKgM2S).toBeGreaterThan(
      PRECIPITATION_RATE_RECORD_ANCHOR.wettestCalendarMonthKgM2S
    );
  });

  it("flags an unconverted mm/day value mistakenly treated as kg/m²/s", () => {
    // 20 "kg/m²/s" is ≈ 1.7 million mm/day — impossible; a classic unit slip.
    const result = precipitationRatePlausibility(
      summaryOf("precipitation-rate", 20)
    );

    expect(result?.status).toBe("implausibly-wet");
    expect(result?.observedKgM2S).toBe(20);
  });

  it("flags a negative rate as impossible", () => {
    // climate.ts rejects negatives upstream, so construct the summary directly
    // to prove the band is self-contained and does not assume that guard ran.
    const summary = {
      ...summaryOf("precipitation-rate", 5e-5),
      observedValue: -1e-5,
    };
    const result = precipitationRatePlausibility(summary);

    expect(result?.status).toBe("implausibly-negative");
  });

  it("treats the inclusive bounds themselves as plausible", () => {
    const atMin = precipitationRatePlausibility(
      summaryOf("precipitation-rate", 0)
    );
    const atMax = precipitationRatePlausibility(
      summaryOf("precipitation-rate", 0.01)
    );
    const justAbove = precipitationRatePlausibility(
      summaryOf("precipitation-rate", 0.0101)
    );

    expect(atMin?.status).toBe("plausible");
    expect(atMax?.status).toBe("plausible");
    expect(justAbove?.status).toBe("implausibly-wet");
  });

  it("returns null for non-precipitation metrics so the band is never misapplied", () => {
    expect(
      precipitationRatePlausibility(summaryOf("air-temperature-2m", 289.4))
    ).toBeNull();
    expect(
      precipitationRatePlausibility(summaryOf("soil-moisture", 7.2))
    ).toBeNull();
  });

  it("withholds a verdict for a not-yet-published month", () => {
    const future = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 8 },
        value: 5e-5,
      },
      { year: 2026, month: 5 }
    );
    const result = precipitationRatePlausibility(future);

    expect(result?.status).toBe("not-usable");
    expect(result?.observedKgM2S).toBeNull();
    expect(result?.reason).toBe("not-yet-published");
  });

  it("withholds a verdict when the month has no usable coverage", () => {
    const noData = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: null,
      },
      { year: 2026, month: 5 }
    );
    const result = precipitationRatePlausibility(noData);

    expect(result?.status).toBe("not-usable");
    expect(result?.observedKgM2S).toBeNull();
    expect(result?.reason).toBe("missing-value");
  });
});

describe("precipitation-rate plausibility formatting", () => {
  it("marks a pass as a sanity check, not a correctness guarantee", () => {
    const text = formatPrecipitationRatePlausibility(
      precipitationRatePlausibility(summaryOf("precipitation-rate", 5e-5))!
    );

    expect(text).toContain("kg/m²/s");
    expect(text).toContain("sanity");
    expect(text).toMatch(/GLDAS_NOAH025_M v2\.1/);
  });

  it("names a flagged value as a likely unit or decode error", () => {
    const text = formatPrecipitationRatePlausibility(
      precipitationRatePlausibility(summaryOf("precipitation-rate", 20))!
    );

    expect(text).toContain("above");
    expect(text).toContain("unit or decode error");
  });

  it("reports honestly when there is nothing to check", () => {
    const noData = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: null,
      },
      { year: 2026, month: 5 }
    );
    const text = formatPrecipitationRatePlausibility(
      precipitationRatePlausibility(noData)!
    );

    expect(text).toContain("No usable precipitation-rate value");
  });
});
