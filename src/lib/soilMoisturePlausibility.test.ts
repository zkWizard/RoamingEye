import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate, type ClimateMetricId } from "./climate";
import {
  PLAUSIBLE_SOIL_MOISTURE_KG_M2,
  RENDERED_SOIL_MOISTURE_RAMP,
  SOIL_MOISTURE_COLUMN,
  formatSoilMoisturePlausibility,
  soilMoisturePlausibility,
} from "./soilMoisturePlausibility";
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

describe("soil-moisture plausibility band", () => {
  it("accepts a realistic 0-10 cm monthly soil-water mass", () => {
    // ≈ 18 kg/m² over 10 cm is a volumetric water content of ≈ 0.18 — a
    // typical moist-but-unsaturated month.
    const result = soilMoisturePlausibility(summaryOf("soil-moisture", 18));

    expect(result).toMatchObject({
      kind: "soil-moisture-plausibility",
      isForecast: false,
      status: "plausible",
      observedKgM2: 18,
      reason: null,
      bounds: { minKgM2: 0, maxKgM2: 100 },
    });
  });

  it("accepts a bone-dry (zero) month as plausible", () => {
    const result = soilMoisturePlausibility(summaryOf("soil-moisture", 0));

    // Zero is not "no data" here: a desert month can genuinely store no water.
    expect(result?.status).toBe("plausible");
    expect(result?.observedKgM2).toBe(0);
  });

  it("never flags a saturated reading the rendered ramp can express", () => {
    // The GIBS ramp tops out at 50 kg/m², so a correct inversion cannot exceed
    // it. The band clears that top by a factor of two.
    const saturated = soilMoisturePlausibility(
      summaryOf("soil-moisture", RENDERED_SOIL_MOISTURE_RAMP.maxKgM2)
    );

    expect(saturated?.status).toBe("plausible");
    expect(PLAUSIBLE_SOIL_MOISTURE_KG_M2.maxKgM2).toBeGreaterThan(
      RENDERED_SOIL_MOISTURE_RAMP.maxKgM2
    );
  });

  it("derives the ceiling from the rendered column depth, not a magic number", () => {
    // The band is only defensible while it equals the depth of pure water the
    // rendered 0-10 cm column could hold. Pin the derivation, not the literal.
    expect(PLAUSIBLE_SOIL_MOISTURE_KG_M2.maxKgM2).toBe(
      SOIL_MOISTURE_COLUMN.depthM * SOIL_MOISTURE_COLUMN.waterDensityKgM3
    );
    expect(SOIL_MOISTURE_COLUMN.saturatedCeilingKgM2).toBe(100);
  });

  it("flags a deeper column's water mass mistakenly read as the 0-10 cm layer", () => {
    // A saturated 1 m root zone holds hundreds of kg/m² — impossible for the
    // 10 cm column GIBS actually renders.
    const result = soilMoisturePlausibility(summaryOf("soil-moisture", 380));

    expect(result?.status).toBe("implausibly-wet");
    expect(result?.observedKgM2).toBe(380);
  });

  it("flags a value left in another metric's units", () => {
    // A 2 m air temperature in kelvin (287.4) reaching the soil-moisture path.
    const result = soilMoisturePlausibility(summaryOf("soil-moisture", 287.4));

    expect(result?.status).toBe("implausibly-wet");
  });

  it("flags a negative water mass as impossible", () => {
    // climate.ts rejects negatives upstream, so construct the summary directly
    // to prove the band is self-contained and does not assume that guard ran.
    const summary = {
      ...summaryOf("soil-moisture", 18),
      observedValue: -4,
    };
    const result = soilMoisturePlausibility(summary);

    expect(result?.status).toBe("implausibly-negative");
  });

  it("treats the inclusive bounds themselves as plausible", () => {
    const atMin = soilMoisturePlausibility(summaryOf("soil-moisture", 0));
    const atMax = soilMoisturePlausibility(summaryOf("soil-moisture", 100));
    const justAbove = soilMoisturePlausibility(
      summaryOf("soil-moisture", 100.1)
    );

    expect(atMin?.status).toBe("plausible");
    expect(atMax?.status).toBe("plausible");
    expect(justAbove?.status).toBe("implausibly-wet");
  });

  it("returns null for non-soil metrics so the band is never misapplied", () => {
    // 289.4 K and 5e-5 kg/m²/s are both outside the soil band numerically;
    // returning null is what stops them being judged by it.
    expect(
      soilMoisturePlausibility(summaryOf("air-temperature-2m", 289.4))
    ).toBeNull();
    expect(
      soilMoisturePlausibility(summaryOf("precipitation-rate", 5e-5))
    ).toBeNull();
  });

  it("withholds a verdict for a not-yet-published month", () => {
    const future = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 8 },
        value: 18,
      },
      { year: 2026, month: 5 }
    );
    const result = soilMoisturePlausibility(future);

    expect(result?.status).toBe("not-usable");
    expect(result?.observedKgM2).toBeNull();
    expect(result?.reason).toBe("not-yet-published");
  });

  it("withholds a verdict when the month has no usable coverage", () => {
    const noData = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: null,
      },
      { year: 2026, month: 5 }
    );
    const result = soilMoisturePlausibility(noData);

    expect(result?.status).toBe("not-usable");
    expect(result?.observedKgM2).toBeNull();
    expect(result?.reason).toBe("missing-value");
  });

  it("keeps the observation's cited provenance unchanged", () => {
    const result = soilMoisturePlausibility(summaryOf("soil-moisture", 18));

    expect(result?.source).toMatchObject({
      shortName: "GLDAS_NOAH025_M",
      version: "2.1",
    });
    expect(result?.dataMonth).toEqual({ year: 2026, month: 1 });
  });
});

describe("soil-moisture plausibility formatting", () => {
  it("marks a pass as a sanity check, not a correctness guarantee", () => {
    const text = formatSoilMoisturePlausibility(
      soilMoisturePlausibility(summaryOf("soil-moisture", 18))!
    );

    expect(text).toContain("kg/m²");
    expect(text).toContain("sanity");
    expect(text).toContain("not a correctness guarantee");
    expect(text).toMatch(/GLDAS_NOAH025_M v2\.1/);
  });

  it("names a flagged value as a likely unit or decode error", () => {
    const text = formatSoilMoisturePlausibility(
      soilMoisturePlausibility(summaryOf("soil-moisture", 380))!
    );

    expect(text).toContain("above");
    expect(text).toContain("unit or decode error");
  });

  it("reports honestly when there is nothing to check", () => {
    const noData = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: null,
      },
      { year: 2026, month: 5 }
    );
    const text = formatSoilMoisturePlausibility(
      soilMoisturePlausibility(noData)!
    );

    expect(text).toContain("No usable soil-moisture value");
  });
});
