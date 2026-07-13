import { describe, expect, it } from "vitest";
import {
  describeOceanCondition,
  SEA_SURFACE_TEMPERATURE_METRIC,
  summarizeOceanConditions,
} from "./oceanConditions";

describe("ocean condition summaries", () => {
  it("describes water SST using the existing layer, source, and units", () => {
    const summary = summarizeOceanConditions({
      dataMonth: { year: 2026, month: 3 },
      value: 24.2,
      validFraction: 0.98,
      footprint: "water",
    });

    expect(summary).toMatchObject({
      kind: "observed-sea-surface-temperature-condition",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      dataMonth: { year: 2026, month: 3 },
      observedValue: 24.2,
      temperatureBand: "warm",
      coverage: {
        status: "water",
        footprint: "water",
        validFraction: 0.98,
        reason: null,
      },
    });
  });

  it("keeps coastal and land-mixed SST coverage visible", () => {
    const summary = summarizeOceanConditions({
      dataMonth: { year: 2026, month: 3 },
      value: 18.4,
      validFraction: 0.37,
      footprint: "land-mixed-coastal",
    });

    expect(summary).toMatchObject({
      observedValue: 18.4,
      temperatureBand: "temperate",
      coverage: {
        status: "land-mixed-coastal",
        footprint: "land-mixed-coastal",
        validFraction: 0.37,
        reason: null,
      },
    });
  });

  it("distinguishes land from missing SST coverage without inventing values", () => {
    const land = summarizeOceanConditions({
      dataMonth: { year: 2026, month: 3 },
      value: null,
      validFraction: 0,
      footprint: "land",
    });
    const missing = summarizeOceanConditions({
      dataMonth: { year: 2026, month: 3 },
      value: null,
      footprint: "unknown",
    });

    expect(land).toMatchObject({
      observedValue: null,
      temperatureBand: null,
      coverage: {
        status: "land",
        footprint: "land",
        validFraction: 0,
        reason: "land-footprint",
      },
    });
    expect(missing).toMatchObject({
      observedValue: null,
      temperatureBand: null,
      coverage: {
        status: "missing",
        footprint: "unknown",
        validFraction: null,
        reason: "missing-sst-value",
      },
    });
  });

  it("rejects invalid months, coverage, and source-scale values", () => {
    expect(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 13 },
        value: 16,
        footprint: "water",
      }).coverage
    ).toMatchObject({ status: "invalid", reason: "invalid-month" });
    expect(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 3 },
        value: 16,
        validFraction: 1.2,
        footprint: "water",
      }).coverage
    ).toMatchObject({ status: "invalid", reason: "invalid-coverage" });
    expect(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 3 },
        value: 99,
        footprint: "water",
      }).coverage
    ).toMatchObject({ status: "invalid", reason: "invalid-value" });
  });
});

describe("ocean condition narratives", () => {
  it("describes a water SST value, band, coverage, and provenance", () => {
    const text = describeOceanCondition(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 3 },
        value: 24.2,
        validFraction: 0.98,
        footprint: "water",
      })
    );

    expect(text).toContain("Sea surface temperature for Mar 2026:");
    expect(text).toContain("24.2°C");
    expect(text).toContain("a warm descriptive band");
    expect(text).toContain("98% of the sampled footprint had usable SST");
    expect(text).toContain(
      `Source: ${SEA_SURFACE_TEMPERATURE_METRIC.source.shortName} v${SEA_SURFACE_TEMPERATURE_METRIC.source.version}.`
    );
    expect(text).toContain("not a marine-biology");
  });

  it("flags coastal or land-mixed footprints without hiding the value", () => {
    const text = describeOceanCondition(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 3 },
        value: 18.4,
        validFraction: 0.37,
        footprint: "land-mixed-coastal",
      })
    );

    expect(text).toContain("18.4°C");
    expect(text).toContain("a temperate descriptive band");
    expect(text).toContain("coastal or land-mixed");
    expect(text).toContain("37% of the sampled footprint had usable SST");
  });

  it("notes when spatial coverage was not supplied", () => {
    const text = describeOceanCondition(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 3 },
        value: 1.5,
        footprint: "water",
      })
    );

    expect(text).toContain("1.5°C");
    expect(text).toContain("a near-freezing descriptive band");
    expect(text).toContain("Spatial SST coverage was not supplied.");
  });

  it("states land and missing footprints honestly instead of inventing a value", () => {
    const land = describeOceanCondition(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 3 },
        value: null,
        validFraction: 0,
        footprint: "land",
      })
    );
    const missing = describeOceanCondition(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 3 },
        value: null,
        footprint: "unknown",
      })
    );

    expect(land).toContain(
      "the sampled footprint is land, so no sea-surface temperature is reported."
    );
    expect(land).not.toContain("°C");
    expect(missing).toContain(
      "no usable sea-surface-temperature value was supplied."
    );
    expect(missing).not.toContain("°C");
  });

  it("reports invalid metadata with its reason rather than a value", () => {
    const text = describeOceanCondition(
      summarizeOceanConditions({
        dataMonth: { year: 2026, month: 13 },
        value: 16,
        footprint: "water",
      })
    );

    expect(text).toContain("an invalid month");
    expect(text).toContain("invalid (invalid-month)");
    expect(text).not.toContain("16°C");
  });
});
