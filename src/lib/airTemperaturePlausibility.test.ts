import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate, type ClimateMetricId } from "./climate";
import {
  AIR_TEMPERATURE_RECORD_ANCHORS,
  PLAUSIBLE_2M_AIR_TEMPERATURE_K,
  airTemperaturePlausibility,
  formatAirTemperaturePlausibility,
} from "./airTemperaturePlausibility";
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

describe("2 m air-temperature plausibility band", () => {
  it("accepts a realistic near-surface monthly mean", () => {
    const result = airTemperaturePlausibility(
      summaryOf("air-temperature-2m", 289.4)
    );

    expect(result).toMatchObject({
      kind: "air-temperature-plausibility",
      isForecast: false,
      status: "plausible",
      observedKelvin: 289.4,
      reason: null,
      bounds: { minKelvin: 170, maxKelvin: 340 },
    });
  });

  it("never flags a genuine surface-air extreme (record anchors stay inside the band)", () => {
    const cold = airTemperaturePlausibility(
      summaryOf(
        "air-temperature-2m",
        AIR_TEMPERATURE_RECORD_ANCHORS.coldestKelvin
      )
    );
    const hot = airTemperaturePlausibility(
      summaryOf(
        "air-temperature-2m",
        AIR_TEMPERATURE_RECORD_ANCHORS.hottestKelvin
      )
    );

    expect(cold?.status).toBe("plausible");
    expect(hot?.status).toBe("plausible");
    // The band is deliberately wider than the anchors it is built from.
    expect(PLAUSIBLE_2M_AIR_TEMPERATURE_K.minKelvin).toBeLessThan(
      AIR_TEMPERATURE_RECORD_ANCHORS.coldestKelvin
    );
    expect(PLAUSIBLE_2M_AIR_TEMPERATURE_K.maxKelvin).toBeGreaterThan(
      AIR_TEMPERATURE_RECORD_ANCHORS.hottestKelvin
    );
  });

  it("flags an unconverted °C value mistakenly treated as kelvin", () => {
    // 15 "K" is -258 °C — impossible near-surface air; a classic unit slip.
    const result = airTemperaturePlausibility(
      summaryOf("air-temperature-2m", 15)
    );

    expect(result?.status).toBe("implausibly-cold");
    expect(result?.observedKelvin).toBe(15);
  });

  it("flags a mis-scaled value that is far too warm", () => {
    const result = airTemperaturePlausibility(
      summaryOf("air-temperature-2m", 3000)
    );

    expect(result?.status).toBe("implausibly-warm");
  });

  it("treats the inclusive bounds themselves as plausible", () => {
    const atMin = airTemperaturePlausibility(
      summaryOf("air-temperature-2m", 170)
    );
    const atMax = airTemperaturePlausibility(
      summaryOf("air-temperature-2m", 340)
    );
    const justBelow = airTemperaturePlausibility(
      summaryOf("air-temperature-2m", 169.9)
    );
    const justAbove = airTemperaturePlausibility(
      summaryOf("air-temperature-2m", 340.1)
    );

    expect(atMin?.status).toBe("plausible");
    expect(atMax?.status).toBe("plausible");
    expect(justBelow?.status).toBe("implausibly-cold");
    expect(justAbove?.status).toBe("implausibly-warm");
  });

  it("returns null for non-air-temperature metrics so the band is never misapplied", () => {
    expect(
      airTemperaturePlausibility(summaryOf("precipitation-rate", 0.0002))
    ).toBeNull();
    expect(
      airTemperaturePlausibility(summaryOf("soil-moisture", 7.2))
    ).toBeNull();
  });

  it("withholds a verdict for a not-yet-published month", () => {
    const future = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 8 },
        value: 290,
      },
      { year: 2026, month: 5 }
    );
    const result = airTemperaturePlausibility(future);

    expect(result?.status).toBe("not-usable");
    expect(result?.observedKelvin).toBeNull();
    expect(result?.reason).toBe("not-yet-published");
  });

  it("withholds a verdict when the month has no usable coverage", () => {
    const noData = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 1 },
        value: null,
      },
      { year: 2026, month: 5 }
    );
    const result = airTemperaturePlausibility(noData);

    expect(result?.status).toBe("not-usable");
    expect(result?.observedKelvin).toBeNull();
    expect(result?.reason).toBe("missing-value");
  });
});

describe("plausibility formatting", () => {
  it("marks a pass as a sanity check, not a correctness guarantee", () => {
    const text = formatAirTemperaturePlausibility(
      airTemperaturePlausibility(summaryOf("air-temperature-2m", 289.4))!
    );

    expect(text).toContain("289.4 K");
    expect(text).toContain("sanity");
    expect(text).toMatch(/M2TMNXSLV v5\.12\.4/);
  });

  it("names a flagged value as a likely unit or decode error", () => {
    const text = formatAirTemperaturePlausibility(
      airTemperaturePlausibility(summaryOf("air-temperature-2m", 15))!
    );

    expect(text).toContain("below");
    expect(text).toContain("unit or decode error");
  });

  it("reports honestly when there is nothing to check", () => {
    const noData = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 1 },
        value: null,
      },
      { year: 2026, month: 5 }
    );
    const text = formatAirTemperaturePlausibility(
      airTemperaturePlausibility(noData)!
    );

    expect(text).toContain("No usable 2 m air-temperature value");
  });
});
