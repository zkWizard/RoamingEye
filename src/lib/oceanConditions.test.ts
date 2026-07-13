import { describe, expect, it } from "vitest";
import {
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
