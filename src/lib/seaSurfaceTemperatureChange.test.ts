import { describe, expect, it } from "vitest";
import {
  summarizeOceanConditions,
  type OceanConditionSummary,
  type SeaSurfaceTemperatureObservation,
  type SstFootprint,
} from "./oceanConditions";
import {
  SEA_SURFACE_TEMPERATURE_CHANGE_LIMITATIONS,
  SEA_SURFACE_TEMPERATURE_CHANGE_THRESHOLD_C,
  describeSeaSurfaceTemperatureChange,
  formatSeaSurfaceTemperatureChange,
} from "./seaSurfaceTemperatureChange";
import type { YearMonth } from "./timeline";

/** Build a single-month SST summary at a chosen month and value. */
function sstSummary(
  value: number | null,
  dataMonth: YearMonth,
  footprint: SstFootprint = "water"
): OceanConditionSummary {
  const observation: SeaSurfaceTemperatureObservation = {
    dataMonth,
    value,
    footprint,
  };
  return summarizeOceanConditions(observation);
}

describe("month-over-month sea-surface-temperature change", () => {
  it("reports a warmer later month as a positive change", () => {
    const earlier = sstSummary(18, { year: 2026, month: 6 });
    const later = sstSummary(21, { year: 2026, month: 7 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.status).toBe("available");
    expect(change.trend).toBe("warmer");
    expect(change.changeValue).toBeCloseTo(3, 9);
    expect(change.reason).toBeNull();
  });

  it("reports a cooler later month as a negative change", () => {
    const earlier = sstSummary(21, { year: 2026, month: 9 });
    const later = sstSummary(16, { year: 2026, month: 10 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.status).toBe("available");
    expect(change.trend).toBe("cooler");
    expect(change.changeValue).toBeCloseTo(-5, 9);
  });

  it("calls a sub-threshold difference little-change", () => {
    const earlier = sstSummary(20, { year: 2026, month: 3 });
    const later = sstSummary(20.3, { year: 2026, month: 4 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.status).toBe("available");
    expect(change.trend).toBe("little-change");
    expect(change.changeValue).toBeCloseTo(0.3, 9);
  });

  it("defaults the little-change band to the documented convention", () => {
    const earlier = sstSummary(15, { year: 2026, month: 1 });
    const later = sstSummary(15, { year: 2026, month: 2 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.thresholdValue).toBe(
      SEA_SURFACE_TEMPERATURE_CHANGE_THRESHOLD_C
    );
    expect(change.trend).toBe("little-change");
    expect(change.changeValue).toBe(0);
  });

  it("honours a caller-supplied threshold", () => {
    const earlier = sstSummary(18, { year: 2026, month: 5 });
    const later = sstSummary(20, { year: 2026, month: 6 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later, {
      thresholdC: 3,
    });

    // A 2 °C rise is real but sits under the widened 3 °C band.
    expect(change.trend).toBe("little-change");
    expect(change.thresholdValue).toBe(3);
  });

  it("reports a descriptive-band transition without over-reading it", () => {
    // 9 °C is "cool" (<10); 12 °C is "temperate" (<20).
    const earlier = sstSummary(9, { year: 2026, month: 4 });
    const later = sstSummary(12, { year: 2026, month: 5 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.band.earlier).toBe("cool");
    expect(change.band.later).toBe("temperate");
    expect(change.band.changed).toBe(true);
  });

  it("marks no band transition when both months share a band", () => {
    const earlier = sstSummary(22, { year: 2026, month: 7 });
    const later = sstSummary(25, { year: 2026, month: 8 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.band.earlier).toBe("warm");
    expect(change.band.later).toBe("warm");
    expect(change.band.changed).toBe(false);
  });

  it("preserves the shared cited SST provenance", () => {
    const earlier = sstSummary(17, { year: 2026, month: 2 });
    const later = sstSummary(19, { year: 2026, month: 3 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.metric).toBe(earlier.metric);
    expect(change.metric.source).toBe(later.metric.source);
    expect(change.isForecast).toBe(false);
    expect(change.limitations).toBe(SEA_SURFACE_TEMPERATURE_CHANGE_LIMITATIONS);
  });

  it("refuses non-consecutive months rather than spanning the gap", () => {
    const earlier = sstSummary(18, { year: 2026, month: 1 });
    const later = sstSummary(24, { year: 2026, month: 3 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.status).toBe("non-adjacent-months");
    expect(change.reason).toBe("months-not-consecutive");
    expect(change.changeValue).toBeNull();
    expect(change.trend).toBeNull();
    expect(change.band.changed).toBeNull();
  });

  it("refuses a reversed (later-before-earlier) pair", () => {
    const earlier = sstSummary(18, { year: 2026, month: 4 });
    const later = sstSummary(24, { year: 2026, month: 3 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.status).toBe("non-adjacent-months");
    expect(change.changeValue).toBeNull();
  });

  it("bridges a December→January year boundary as consecutive", () => {
    const earlier = sstSummary(14, { year: 2025, month: 12 });
    const later = sstSummary(13, { year: 2026, month: 1 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.status).toBe("available");
    expect(change.trend).toBe("cooler");
    expect(change.changeValue).toBeCloseTo(-1, 9);
  });

  it("withholds a change when an endpoint has no usable SST value", () => {
    const earlier = sstSummary(18, { year: 2026, month: 1 });
    const missing = sstSummary(null, { year: 2026, month: 2 });

    const change = describeSeaSurfaceTemperatureChange(earlier, missing);

    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
    expect(change.changeValue).toBeNull();
  });

  it("withholds a change over a land footprint endpoint", () => {
    const earlier = sstSummary(18, { year: 2026, month: 1 });
    const land = sstSummary(18, { year: 2026, month: 2 }, "land");

    const change = describeSeaSurfaceTemperatureChange(earlier, land);

    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
  });

  it("rejects a negative or non-finite threshold", () => {
    const earlier = sstSummary(18, { year: 2026, month: 1 });
    const later = sstSummary(20, { year: 2026, month: 2 });

    const change = describeSeaSurfaceTemperatureChange(earlier, later, {
      thresholdC: -1,
    });

    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("invalid-threshold");
    expect(change.thresholdValue).toBe(
      SEA_SURFACE_TEMPERATURE_CHANGE_THRESHOLD_C
    );
  });

  it("carries a land-mixed-coastal endpoint through as usable", () => {
    // Coastal footprints still report a value; the change stays descriptive.
    const earlier = sstSummary(
      19,
      { year: 2026, month: 5 },
      "land-mixed-coastal"
    );
    const later = sstSummary(
      20,
      { year: 2026, month: 6 },
      "land-mixed-coastal"
    );

    const change = describeSeaSurfaceTemperatureChange(earlier, later);

    expect(change.status).toBe("available");
    expect(change.changeValue).toBeCloseTo(1, 9);
  });
});

describe("formatSeaSurfaceTemperatureChange", () => {
  it("formats a warmer month with magnitude, unit, and provenance", () => {
    const earlier = sstSummary(18, { year: 2026, month: 6 });
    const later = sstSummary(21, { year: 2026, month: 7 });

    const text = formatSeaSurfaceTemperatureChange(
      describeSeaSurfaceTemperatureChange(earlier, later)
    );

    expect(text).toContain("Jul 2026 vs Jun 2026");
    expect(text).toContain("warmer by 3 °C");
    expect(text).toContain("source");
  });

  it("annotates a band transition in the readout", () => {
    const earlier = sstSummary(9, { year: 2026, month: 4 });
    const later = sstSummary(12, { year: 2026, month: 5 });

    const text = formatSeaSurfaceTemperatureChange(
      describeSeaSurfaceTemperatureChange(earlier, later)
    );

    expect(text).toContain("band cool → temperate");
  });

  it("formats a signed little-change value", () => {
    const earlier = sstSummary(20, { year: 2026, month: 3 });
    const later = sstSummary(20.3, { year: 2026, month: 4 });

    const text = formatSeaSurfaceTemperatureChange(
      describeSeaSurfaceTemperatureChange(earlier, later)
    );

    expect(text).toContain("little change (+0.3 °C)");
  });

  it("states an unavailable result plainly rather than as a number", () => {
    const earlier = sstSummary(18, { year: 2026, month: 1 });
    const missing = sstSummary(null, { year: 2026, month: 2 });

    const text = formatSeaSurfaceTemperatureChange(
      describeSeaSurfaceTemperatureChange(earlier, missing)
    );

    expect(text).toContain(
      "No month-over-month sea-surface-temperature change"
    );
    expect(text).toContain("endpoint-not-available");
  });
});
