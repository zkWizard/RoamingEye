import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import {
  composeEnvironmentBrief,
  summarizeCompleteness,
  summarizeTemporalAlignment,
  unsupportedBriefLanguageHits,
} from "./environmentBrief";
import { NDVI_SOURCE, NDVI_UNIT } from "./phenology";

describe("environment provenance brief", () => {
  it("composes four independent signals with month, coverage, unit, and source", () => {
    const brief = composeEnvironmentBrief({
      vegetation: {
        dataMonth: { year: 2026, month: 1 },
        value: 0.61,
        validFraction: 0.82,
      },
      rainfall: {
        dataMonth: { year: 2026, month: 1 },
        value: 0.00012,
        validFraction: 0.74,
      },
      soilMoisture: {
        dataMonth: { year: 2026, month: 1 },
        value: 6.4,
        validFraction: 0.67,
      },
      airTemperature: {
        dataMonth: { year: 2026, month: 3 },
        value: 289.4,
        validFraction: 0.93,
      },
      availableThrough: { year: 2026, month: 3 },
    });

    expect(brief.kind).toBe("provenance-first-environment-brief");
    expect("score" in brief).toBe(false);
    expect(brief.signals.map((signal) => signal.id)).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(brief.signals).toHaveLength(4);
    expect(brief.signals[0]).toMatchObject({
      id: "vegetation",
      layerId: "ndvi",
      source: NDVI_SOURCE,
      nativeUnit: NDVI_UNIT,
      dataMonth: { year: 2026, month: 1 },
      coverage: {
        status: "available",
        validFraction: 0.82,
        reason: null,
      },
      observedValue: 0.61,
    });
    expect(brief.signals[1]).toMatchObject({
      id: "rainfall",
      layerId: "precip",
      source: CLIMATE_METRICS["precipitation-rate"].source,
      nativeUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
      dataMonth: { year: 2026, month: 1 },
      coverage: {
        status: "available",
        validFraction: 0.74,
        reason: null,
      },
      observedValue: 0.00012,
    });
    expect(brief.signals[2]).toMatchObject({
      id: "soil-moisture",
      source: CLIMATE_METRICS["soil-moisture"].source,
      nativeUnit: CLIMATE_METRICS["soil-moisture"].nativeUnit,
      observedValue: 6.4,
    });
    expect(brief.signals[3]).toMatchObject({
      id: "air-temperature",
      source: CLIMATE_METRICS["air-temperature-2m"].source,
      nativeUnit: "K",
      observedValue: 289.4,
    });
    expect(brief.statements.join(" ")).toContain("2026-01");
    expect(brief.statements.join(" ")).toContain("82% sampled coverage");
    expect(brief.unsupportedLanguageHits).toEqual([]);
  });

  it("keeps missing, invalid, not-yet-published, and not-supplied states explicit", () => {
    const brief = composeEnvironmentBrief({
      vegetation: {
        dataMonth: { year: 2026, month: 1 },
        value: null,
        validFraction: 0,
      },
      rainfall: {
        dataMonth: { year: 2026, month: 2 },
        value: 0.00014,
        validFraction: 0.8,
      },
      soilMoisture: {
        dataMonth: { year: 2026, month: 1 },
        value: -2,
      },
      airTemperature: null,
      availableThrough: { year: 2026, month: 1 },
    });

    expect(brief.signals[0]).toMatchObject({
      status: "no-data",
      observedValue: null,
      coverage: {
        status: "no-data",
        reason: "missing-value",
        validFraction: 0,
      },
    });
    expect(brief.signals[1]).toMatchObject({
      status: "unavailable",
      observedValue: null,
      coverage: {
        status: "unavailable",
        reason: "not-yet-published",
        validFraction: 0.8,
      },
      climateSummary: {
        publicationStatus: "not-yet-published",
        publicationLagMonths: null,
      },
    });
    expect(brief.signals[2]).toMatchObject({
      status: "invalid",
      observedValue: null,
      coverage: { status: "invalid", reason: "invalid-value" },
    });
    expect(brief.signals[3]).toMatchObject({
      status: "unavailable",
      dataMonth: null,
      observedValue: null,
      coverage: { reason: "not-supplied" },
    });
    expect(brief.statements[3]).toContain("data month unavailable");
    expect(brief.statements[3]).toContain("coverage not supplied");
  });

  it("uses product-specific availability checkpoints when schedules differ", () => {
    const brief = composeEnvironmentBrief({
      vegetation: null,
      rainfall: {
        dataMonth: { year: 2026, month: 1 },
        value: 0.00012,
      },
      soilMoisture: {
        dataMonth: { year: 2026, month: 1 },
        value: 6,
      },
      airTemperature: {
        dataMonth: { year: 2026, month: 3 },
        value: 289,
      },
      availableThrough: { year: 2026, month: 1 },
      availableThroughBySignal: {
        "air-temperature": { year: 2026, month: 3 },
      },
    });

    expect(brief.signals[1].climateSummary?.publicationStatus).toBe(
      "published"
    );
    expect(brief.signals[2].climateSummary?.publicationStatus).toBe(
      "published"
    );
    expect(brief.signals[3].climateSummary).toMatchObject({
      availableThrough: { year: 2026, month: 3 },
      publicationStatus: "published",
    });
  });

  it("flags unsupported risk, causal, forecast, compliance, and health language", () => {
    expect(
      unsupportedBriefLanguageHits(
        "High risk because conditions predict a compliance and health issue."
      )
    ).toEqual(["risk", "prediction", "compliance", "health", "causal"]);

    const brief = composeEnvironmentBrief({
      vegetation: {
        dataMonth: { year: 2026, month: 1 },
        value: 0.2,
      },
      rainfall: null,
      soilMoisture: null,
      airTemperature: null,
      availableThrough: { year: 2026, month: 1 },
    });

    expect(brief.unsupportedLanguageHits).toEqual([]);
    expect(brief.statements.join(" ")).not.toMatch(
      /\b(risk|diagnos|forecast|predict|compliance|health|cause|because|due to)\b/i
    );
  });
});

describe("environment brief temporal alignment", () => {
  it("flags a multi-month spread of usable observations as not synchronized", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
      rainfall: { dataMonth: { year: 2026, month: 2 }, value: 0.00012 },
      soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6.4 },
      airTemperature: { dataMonth: { year: 2026, month: 3 }, value: 289.4 },
      availableThrough: { year: 2026, month: 3 },
    });

    expect(brief.temporalAlignment).toMatchObject({
      comparedSignalIds: [
        "vegetation",
        "rainfall",
        "soil-moisture",
        "air-temperature",
      ],
      earliestMonth: { year: 2026, month: 1 },
      latestMonth: { year: 2026, month: 3 },
      spanMonths: 2,
      aligned: false,
    });
    expect(brief.temporalAlignment.statement).toBe(
      "4 usable observations span 2026-01 to 2026-03 (2-months spread); signals are not a synchronized snapshot and should not be read as simultaneous."
    );
    // A currency caveat must never introduce condition/comparison language.
    expect(
      unsupportedBriefLanguageHits(brief.temporalAlignment.statement)
    ).toEqual([]);
  });

  it("only compares usable signals, ignoring no-data, invalid, and unpublished", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.5 },
      rainfall: { dataMonth: { year: 2025, month: 1 }, value: null },
      soilMoisture: { dataMonth: { year: 2020, month: 1 }, value: -2 },
      airTemperature: { dataMonth: { year: 2030, month: 6 }, value: 289 },
      availableThrough: { year: 2026, month: 1 },
    });

    // rainfall (no-data), soil-moisture (invalid), and air-temperature
    // (not-yet-published) are excluded, so only vegetation remains.
    expect(brief.temporalAlignment).toMatchObject({
      comparedSignalIds: ["vegetation"],
      earliestMonth: { year: 2026, month: 1 },
      latestMonth: { year: 2026, month: 1 },
      spanMonths: 0,
      aligned: false,
    });
    expect(brief.temporalAlignment.statement).toBe(
      "1 usable observation, dated 2026-01; no cross-signal temporal comparison."
    );
  });

  it("marks a single shared month across signals as aligned", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.5 },
      rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.0001 },
      soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6 },
      airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289 },
      availableThrough: { year: 2026, month: 1 },
    });

    expect(brief.temporalAlignment).toMatchObject({
      spanMonths: 0,
      aligned: true,
    });
    expect(brief.temporalAlignment.statement).toBe(
      "4 usable observations all dated 2026-01; temporally aligned."
    );
  });

  it("uses a singular month word for a one-month spread", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.5 },
      rainfall: { dataMonth: { year: 2026, month: 2 }, value: 0.0001 },
      soilMoisture: null,
      airTemperature: null,
      availableThrough: { year: 2026, month: 2 },
    });

    expect(brief.temporalAlignment).toMatchObject({
      spanMonths: 1,
      aligned: false,
    });
    expect(brief.temporalAlignment.statement).toBe(
      "2 usable observations span 2026-01 to 2026-02 (1-month spread); signals are not a synchronized snapshot and should not be read as simultaneous."
    );
  });

  it("reports when no usable observation is present", () => {
    const summary = summarizeTemporalAlignment([]);
    expect(summary).toMatchObject({
      comparedSignalIds: [],
      earliestMonth: null,
      latestMonth: null,
      spanMonths: null,
      aligned: false,
    });
    expect(summary.statement).toBe(
      "No usable observations to compare across time."
    );
  });
});

describe("environment brief completeness", () => {
  it("tallies usable signals without combining or scoring their values", () => {
    const brief = composeEnvironmentBrief({
      vegetation: {
        dataMonth: { year: 2026, month: 1 },
        value: 0.61,
        validFraction: 0.82,
      },
      rainfall: { dataMonth: { year: 2026, month: 1 }, value: null },
      soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: -2 },
      airTemperature: null,
      availableThrough: { year: 2026, month: 1 },
    });

    expect(brief.completeness).toMatchObject({
      total: 4,
      available: 1,
      availableSignalIds: ["vegetation"],
      byStatus: {
        available: 1,
        "no-data": 1,
        invalid: 1,
        unavailable: 1,
      },
      usableFraction: 0.25,
    });
    expect(brief.completeness.statement).toBe(
      "Usable observations for 1 of 4 signals: vegetation (1 no-data, 1 invalid, 1 unavailable)."
    );
    // Completeness is a data-coverage tally, never a condition claim.
    expect(unsupportedBriefLanguageHits(brief.completeness.statement)).toEqual(
      []
    );
    expect("score" in brief.completeness).toBe(false);
  });

  it("reports when no signal carries a usable observation", () => {
    const summary = summarizeCompleteness([
      {
        id: "vegetation",
        label: "Vegetation (NDVI)",
        layerId: "ndvi",
        source: NDVI_SOURCE,
        nativeUnit: NDVI_UNIT,
        dataMonth: null,
        coverage: { status: "unavailable", validFraction: null, reason: null },
        status: "unavailable",
        observedValue: null,
        statement: "",
      },
    ]);

    expect(summary).toMatchObject({
      total: 1,
      available: 0,
      availableSignalIds: [],
      usableFraction: 0,
    });
    expect(summary.statement).toBe(
      "No usable observations across 1 signal (1 unavailable)."
    );
  });

  it("counts every signal available with no remainder clause", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.5 },
      rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.0001 },
      soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6 },
      airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289 },
      availableThrough: { year: 2026, month: 1 },
    });

    expect(brief.completeness.available).toBe(4);
    expect(brief.completeness.usableFraction).toBe(1);
    expect(brief.completeness.statement).toBe(
      "Usable observations for 4 of 4 signals: vegetation, rainfall, soil-moisture, air-temperature."
    );
  });

  it("handles an empty signal set", () => {
    const summary = summarizeCompleteness([]);
    expect(summary).toMatchObject({
      total: 0,
      available: 0,
      usableFraction: 0,
    });
    expect(summary.statement).toBe("No signals composed.");
  });
});
