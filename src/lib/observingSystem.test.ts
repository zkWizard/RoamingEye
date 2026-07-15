import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import {
  classifyObservingSystem,
  summarizeObservingSystems,
} from "./observingSystem";
import { NDVI_SOURCE } from "./phenology";
import { CLIMATE_METRICS } from "./climate";
import type { DatasetRef } from "./timeline";

/** A fully-usable four-signal brief, all observations within availability. */
const USABLE_INPUT: EnvironmentBriefInput = {
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
    dataMonth: { year: 2026, month: 1 },
    value: 289.4,
    validFraction: 0.93,
  },
  availableThrough: { year: 2026, month: 3 },
};

function signalsFor(input: EnvironmentBriefInput) {
  return composeEnvironmentBrief(input).signals;
}

/** Keep only the named signals from a composed brief, preserving order. */
function only(
  input: EnvironmentBriefInput,
  ids: EnvironmentSignalBrief["id"][]
): EnvironmentSignalBrief[] {
  return signalsFor(input).filter((s) => ids.includes(s.id));
}

describe("classifyObservingSystem", () => {
  it("classifies each brief signal's product by its observing system", () => {
    // NDVI (MOD13A3) is a direct satellite retrieval of the surface.
    expect(classifyObservingSystem(NDVI_SOURCE)).toBe("satellite-retrieval");
    // Rainfall and soil moisture are both GLDAS Noah land-surface-model fields.
    expect(
      classifyObservingSystem(CLIMATE_METRICS["precipitation-rate"].source)
    ).toBe("land-surface-model");
    expect(
      classifyObservingSystem(CLIMATE_METRICS["soil-moisture"].source)
    ).toBe("land-surface-model");
    // 2 m air temperature is a MERRA-2 atmospheric reanalysis field.
    expect(
      classifyObservingSystem(CLIMATE_METRICS["air-temperature-2m"].source)
    ).toBe("atmospheric-reanalysis");
  });

  it("keys on the product DOI, so the two GLDAS fields share one class", () => {
    // Rainfall and soil moisture share DOI 10.5067/SXAVCZFAQLNO (GLDAS_NOAH025_M).
    expect(CLIMATE_METRICS["precipitation-rate"].source.doi).toBe(
      CLIMATE_METRICS["soil-moisture"].source.doi
    );
    expect(
      classifyObservingSystem(CLIMATE_METRICS["precipitation-rate"].source)
    ).toBe(classifyObservingSystem(CLIMATE_METRICS["soil-moisture"].source));
  });

  it("returns unclassified for a product not in the observing-system table", () => {
    const unknown: DatasetRef = {
      shortName: "UNKNOWN",
      version: "1",
      doi: "10.0000/not-a-real-product",
      title: "Unlisted product",
    };
    expect(classifyObservingSystem(unknown)).toBe("unclassified");
  });

  it("tolerates surrounding whitespace on the DOI", () => {
    const padded: DatasetRef = {
      ...NDVI_SOURCE,
      doi: `  ${NDVI_SOURCE.doi}  `,
    };
    expect(classifyObservingSystem(padded)).toBe("satellite-retrieval");
  });
});

describe("summarizeObservingSystems", () => {
  it("classifies every usable signal and flags the observed/modelled mix", () => {
    const summary = summarizeObservingSystems(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("observing-system");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.classCounts).toEqual({
      "satellite-retrieval": 1,
      "land-surface-model": 2,
      "atmospheric-reanalysis": 1,
      unclassified: 0,
    });
    expect(summary.directnessCounts).toEqual({
      "directly-observed": 1,
      "model-derived": 3,
      unknown: 0,
    });
    // Only NDVI is directly observed; the other three are model estimates.
    expect(summary.observedSignalIds).toEqual(["vegetation"]);
    expect(summary.modelDerivedSignalIds).toEqual([
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesObservedAndModeled).toBe(true);
    expect(summary.statement).toContain("4 usable observations");
    expect(summary.statement).toContain(
      "1 satellite-retrieval, 2 land-surface-model, 1 atmospheric-reanalysis"
    );
    expect(summary.statement).toContain("only vegetation is directly observed");
    expect(summary.statement).toContain("do not read the modelled values");
  });

  it("marks each signal's directness on its per-signal classification", () => {
    const summary = summarizeObservingSystems(signalsFor(USABLE_INPUT));
    const byId = new Map(summary.signals.map((s) => [s.id, s]));

    expect(byId.get("vegetation")?.directlyObserved).toBe(true);
    expect(byId.get("vegetation")?.directness).toBe("directly-observed");
    expect(byId.get("soil-moisture")?.directlyObserved).toBe(false);
    expect(byId.get("air-temperature")?.observingSystemClass).toBe(
      "atmospheric-reanalysis"
    );
    // The per-signal statement carries the source, never a value claim.
    expect(byId.get("air-temperature")?.statement).toContain("M2TMNXSLV");
    expect(byId.get("air-temperature")?.statement).toContain(
      "a model or reanalysis estimate"
    );
  });

  it("reports a homogeneous set when every usable signal shares a class", () => {
    // Rainfall + soil moisture are both GLDAS land-surface-model fields.
    const summary = summarizeObservingSystems(
      only(USABLE_INPUT, ["rainfall", "soil-moisture"])
    );

    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesObservedAndModeled).toBe(false);
    expect(summary.observedSignalIds).toEqual([]);
    expect(summary.modelDerivedSignalIds).toEqual([
      "rainfall",
      "soil-moisture",
    ]);
    expect(summary.statement).toContain(
      "none is a direct measurement; all values are model or reanalysis estimates, not observations"
    );
  });

  it("uses singular phrasing for a lone model-derived signal", () => {
    const summary = summarizeObservingSystems(
      only(USABLE_INPUT, ["air-temperature"])
    );

    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesObservedAndModeled).toBe(false);
    expect(summary.statement).toContain("1 usable observation");
    expect(summary.statement).toContain(
      "none is a direct measurement; the value is a model or reanalysis estimate, not an observation"
    );
  });

  it("reports the all-observed case without a do-not-read caveat", () => {
    const summary = summarizeObservingSystems(
      only(USABLE_INPUT, ["vegetation"])
    );

    expect(summary.mixesObservedAndModeled).toBe(false);
    expect(summary.observedSignalIds).toEqual(["vegetation"]);
    expect(summary.statement).toContain(
      "all 1 classified is a directly-observed satellite retrieval"
    );
    expect(summary.statement).not.toContain("do not read");
  });

  it("considers only usable signals by default and 'all' on request", () => {
    // Air temperature not yet published: unavailable, so excluded by default.
    const partial: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      airTemperature: {
        dataMonth: { year: 2026, month: 5 },
        value: 290.1,
        validFraction: 0.9,
      },
      availableThrough: { year: 2026, month: 3 },
      availableThroughBySignal: { "air-temperature": { year: 2026, month: 3 } },
    };
    const signals = signalsFor(partial);

    const usable = summarizeObservingSystems(signals);
    expect(usable.consideredSignalIds).not.toContain("air-temperature");

    const all = summarizeObservingSystems(signals, { include: "all" });
    expect(all.consideredSignalIds).toContain("air-temperature");
    expect(all.classCounts["atmospheric-reanalysis"]).toBe(1);
  });

  it("handles an empty considered set honestly", () => {
    const summary = summarizeObservingSystems([]);

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesObservedAndModeled).toBe(false);
    expect(summary.classCounts).toEqual({
      "satellite-retrieval": 0,
      "land-surface-model": 0,
      "atmospheric-reanalysis": 0,
      unclassified: 0,
    });
    expect(summary.statement).toBe(
      "No usable observations to classify by observing system."
    );
  });

  it("makes no unsupported condition, quality, or forecast claim", () => {
    const summary = summarizeObservingSystems(signalsFor(USABLE_INPUT));
    // Scan the reported statements only. The limits deliberately name the
    // excluded claim types ("no ... forecast claim") to disavow them, so they
    // are checked separately below rather than against this blocklist.
    const prose = [
      summary.statement,
      ...summary.signals.map((s) => s.statement),
    ]
      .join(" ")
      .toLowerCase();

    expect(prose).not.toMatch(/\brisk\b/);
    expect(prose).not.toMatch(/\bforecast\b/);
    expect(prose).not.toMatch(/\bhealthy\b/);
    expect(prose).not.toMatch(/\bbetter\b/);
    // The limits keep the observed-vs-modelled framing honest.
    expect(summary.limits.length).toBeGreaterThanOrEqual(4);
    expect(summary.limits.join(" ")).toContain("meteorological forcing");
  });
});
