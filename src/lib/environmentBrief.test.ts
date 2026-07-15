import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import {
  attributeBrief,
  composeEnvironmentBrief,
  summarizeCompleteness,
  summarizeTemporalAlignment,
  unsupportedBriefLanguageHits,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import { NDVI_SOURCE, NDVI_UNIT } from "./phenology";
import { GIBS_ACKNOWLEDGMENT } from "./providers";

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

describe("environment brief attribution", () => {
  it("deduplicates shared-source signals by DOI and credits every source it drew on", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
      rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.00012 },
      soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6.4 },
      airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289.4 },
      availableThrough: { year: 2026, month: 1 },
    });

    const attribution = attributeBrief(brief.signals);

    // Rainfall and soil moisture are both GLDAS (one DOI): three distinct
    // sources, not four, with the shared product credited once.
    expect(attribution.sources.map((s) => s.source.shortName)).toEqual([
      "MOD13A3",
      "GLDAS_NOAH025_M",
      "M2TMNXSLV",
    ]);
    const gldas = attribution.sources[1];
    expect(gldas.signalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(gldas.signalLabels).toEqual([
      "Rainfall (precipitation rate)",
      "Soil moisture",
    ]);
    expect(gldas.contributedValue).toBe(true);
    expect(gldas.doiUrl).toBe("https://doi.org/10.5067/SXAVCZFAQLNO");

    expect(attribution.acknowledgment).toBe(GIBS_ACKNOWLEDGMENT);
    expect(attribution.line).toBe(
      "Data sources: MOD13A3 v061 — Vegetation (NDVI) " +
        "(https://doi.org/10.5067/MODIS/MOD13A3.061); " +
        "GLDAS_NOAH025_M v2.1 — Rainfall (precipitation rate), Soil moisture " +
        "(https://doi.org/10.5067/SXAVCZFAQLNO); " +
        "M2TMNXSLV v5.12.4 — Air temperature " +
        `(https://doi.org/10.5067/AP1B0BA5PD2K). ${GIBS_ACKNOWLEDGMENT}`
    );
    // A source credit must not smuggle in condition/forecast/causal language.
    expect(unsupportedBriefLanguageHits(attribution.line)).toEqual([]);
  });

  it("credits a consulted source even when it returned no usable value", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: null },
      rainfall: null,
      soilMoisture: null,
      airTemperature: null,
      availableThrough: { year: 2026, month: 1 },
    });

    const attribution = attributeBrief(brief.signals);
    const veg = attribution.sources.find(
      (s) => s.source.shortName === "MOD13A3"
    );

    // The source is still credited (it was consulted), but the flag is honest
    // that it yielded no usable value.
    expect(veg?.signalIds).toEqual(["vegetation"]);
    expect(veg?.contributedValue).toBe(false);
    expect(attribution.line).toContain("MOD13A3 v061 — Vegetation (NDVI)");
  });

  it("omits a resolver link for a source without a DOI", () => {
    const signals: EnvironmentSignalBrief[] = [
      {
        id: "vegetation",
        label: "Vegetation (NDVI)",
        layerId: "ndvi",
        source: {
          shortName: "MOD13A3",
          version: "061",
          doi: "  ",
          title: "MODIS/Terra Vegetation Indices Monthly L3 Global",
        },
        nativeUnit: NDVI_UNIT,
        dataMonth: { year: 2026, month: 1 },
        coverage: { status: "available", validFraction: null, reason: null },
        status: "available",
        observedValue: 0.5,
        statement: "",
      },
    ];

    const attribution = attributeBrief(signals);
    expect(attribution.sources[0].doiUrl).toBeNull();
    expect(attribution.line).toBe(
      `Data sources: MOD13A3 v061 — Vegetation (NDVI). ${GIBS_ACKNOWLEDGMENT}`
    );
  });

  it("credits one product once when the same DOI is cited with different casing or spacing", () => {
    // The handle system resolves ASCII DOIs case-insensitively, so a product
    // cited as "10.5067/ABC", "  10.5067/abc  ", and "10.5067/AbC" is one
    // product — crediting it three times would over-count a single source.
    const signal = (
      id: EnvironmentSignalBrief["id"],
      label: string,
      doi: string
    ): EnvironmentSignalBrief => ({
      id,
      label,
      layerId: "ndvi",
      source: { shortName: "PROD", version: "1", doi, title: "Product" },
      nativeUnit: NDVI_UNIT,
      dataMonth: { year: 2026, month: 1 },
      coverage: { status: "available", validFraction: null, reason: null },
      status: "available",
      observedValue: 0.4,
      statement: "",
    });

    const attribution = attributeBrief([
      signal("vegetation", "First", "10.5067/ABC"),
      signal("rainfall", "Second", "  10.5067/abc  "),
      signal("soil-moisture", "Third", "10.5067/AbC"),
    ]);

    expect(attribution.sources).toHaveLength(1);
    const [only] = attribution.sources;
    expect(only.signalIds).toEqual(["vegetation", "rainfall", "soil-moisture"]);
    // The first-seen casing is preserved for the resolvable link — a DOI suffix
    // can be case-sensitive, so the displayed link is never lower-cased.
    expect(only.doiUrl).toBe("https://doi.org/10.5067/ABC");
  });

  it("keeps two distinct DOI-less products as separate credits", () => {
    // Without a resolvable DOI, two references cannot be asserted to be the same
    // product, so each keeps its own credit rather than collapsing into one.
    const doiless = (
      id: EnvironmentSignalBrief["id"],
      shortName: string,
      label: string
    ): EnvironmentSignalBrief => ({
      id,
      label,
      layerId: "ndvi",
      source: { shortName, version: "1", doi: "", title: shortName },
      nativeUnit: NDVI_UNIT,
      dataMonth: { year: 2026, month: 1 },
      coverage: { status: "available", validFraction: null, reason: null },
      status: "available",
      observedValue: 0.4,
      statement: "",
    });

    const attribution = attributeBrief([
      doiless("vegetation", "PROD_A", "Signal A"),
      doiless("rainfall", "PROD_B", "Signal B"),
    ]);

    expect(attribution.sources.map((s) => s.source.shortName)).toEqual([
      "PROD_A",
      "PROD_B",
    ]);
    expect(attribution.sources.every((s) => s.doiUrl === null)).toBe(true);
  });

  it("reports when there is nothing to credit", () => {
    const attribution = attributeBrief([]);
    expect(attribution.sources).toEqual([]);
    expect(attribution.acknowledgment).toBe(GIBS_ACKNOWLEDGMENT);
    expect(attribution.line).toBe("No data sources to credit.");
  });
});
