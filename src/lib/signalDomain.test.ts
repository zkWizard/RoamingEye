import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import { classifySignalDomain, summarizeSignalDomains } from "./signalDomain";

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

function signalsFor(input: EnvironmentBriefInput): EnvironmentSignalBrief[] {
  return composeEnvironmentBrief(input).signals;
}

describe("classifySignalDomain", () => {
  it("asserts the four brief signals' documented domains", () => {
    expect(classifySignalDomain("vegetation")).toBe("land-only");
    expect(classifySignalDomain("rainfall")).toBe("land-only");
    expect(classifySignalDomain("soil-moisture")).toBe("land-only");
    expect(classifySignalDomain("air-temperature")).toBe("land-and-ocean");
  });

  it("never invents a domain for an unknown signal id", () => {
    expect(
      classifySignalDomain(
        "streamflow" as Parameters<typeof classifySignalDomain>[0]
      )
    ).toBe("unclassified");
  });
});

describe("summarizeSignalDomains", () => {
  it("classifies the four real signals and flags the land-only / ocean mix", () => {
    const summary = summarizeSignalDomains(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("signal-domain");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    // NDVI + both GLDAS fields are land-only; only MERRA-2 air temp spans ocean.
    expect(summary.domainCounts).toEqual({
      "land-only": 3,
      "land-and-ocean": 1,
      unclassified: 0,
    });
    expect(summary.landOnlySignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
    ]);
    expect(summary.unclassifiedCount).toBe(0);
    expect(summary.homogeneous).toBe(false);
    expect(summary.mixesLandOnlyAndOcean).toBe(true);
    expect(summary.signals[3]).toMatchObject({
      id: "air-temperature",
      domain: "land-and-ocean",
      coversOcean: true,
    });
    expect(summary.signals[0].coversOcean).toBe(false);
    expect(summary.statement).toBe(
      "4 usable observations: 3 land-only, 1 land-and-ocean; vegetation, rainfall, soil-moisture are defined over land only — over open water their absence is out of the product's domain, not a low value, while the land-and-ocean signal remains defined."
    );
  });

  it("carries the cited source on every classification", () => {
    const summary = summarizeSignalDomains(signalsFor(USABLE_INPUT));
    for (const signal of summary.signals) {
      expect(signal.source).toBeDefined();
      expect(signal.source.doi.length).toBeGreaterThan(0);
      expect(signal.statement).toContain(signal.source.shortName);
    }
  });

  it("only considers usable observations by default", () => {
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      soilMoisture: null,
      airTemperature: {
        dataMonth: { year: 2026, month: 1 },
        value: null,
        validFraction: 0.5,
      },
    };
    const summary = summarizeSignalDomains(signalsFor(input));

    // soil moisture unavailable, air temperature no-data → two land-only left.
    expect(summary.consideredSignalIds).toEqual(["vegetation", "rainfall"]);
    expect(summary.domainCounts["land-only"]).toBe(2);
    expect(summary.domainCounts["land-and-ocean"]).toBe(0);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesLandOnlyAndOcean).toBe(false);
    expect(summary.statement).toBe(
      "2 usable observations: 2 land-only; all 2 classified are defined over land only, so over open water an absence is out of the product's domain, not a low value."
    );
  });

  it("describes the whole domain basis when include is 'all'", () => {
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      soilMoisture: null,
    };
    const summary = summarizeSignalDomains(signalsFor(input), {
      include: "all",
    });

    // The unavailable soil-moisture signal still carries its domain.
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.domainCounts["land-only"]).toBe(3);
    expect(summary.mixesLandOnlyAndOcean).toBe(true);
  });

  it("reports the single air-temperature signal as land-and-ocean only", () => {
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      vegetation: null,
      rainfall: null,
      soilMoisture: null,
    };
    const summary = summarizeSignalDomains(signalsFor(input));

    expect(summary.consideredSignalIds).toEqual(["air-temperature"]);
    expect(summary.landOnlySignalIds).toEqual([]);
    expect(summary.homogeneous).toBe(true);
    expect(summary.mixesLandOnlyAndOcean).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation: 1 land-and-ocean; all 1 classified is defined over both land and ocean."
    );
  });

  it("does not assert a domain for a signal absent from the table", () => {
    // Re-label a signal id the table does not know to exercise the
    // unclassified branch without inventing a domain for it.
    const signals: EnvironmentSignalBrief[] = signalsFor(USABLE_INPUT).map(
      (signal) =>
        signal.id === "soil-moisture"
          ? { ...signal, id: "streamflow" as EnvironmentSignalBrief["id"] }
          : signal
    );
    const summary = summarizeSignalDomains(signals);

    expect(summary.domainCounts.unclassified).toBe(1);
    expect(summary.unclassifiedCount).toBe(1);
    expect(summary.statement).toContain("1 unclassified signal not asserted.");
  });

  it("handles a brief with no usable observations", () => {
    const summary = summarizeSignalDomains(
      signalsFor({
        vegetation: null,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
        availableThrough: { year: 2026, month: 3 },
      })
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.signals).toEqual([]);
    expect(summary.mixesLandOnlyAndOcean).toBe(false);
    expect(summary.homogeneous).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to classify by spatial domain of definition."
    );
  });

  it("keeps every considered signal — none silently dropped", () => {
    const summary = summarizeSignalDomains(signalsFor(USABLE_INPUT));
    const counted = Object.values(summary.domainCounts).reduce(
      (sum, n) => sum + n,
      0
    );
    expect(counted).toBe(summary.consideredSignalIds.length);
    expect(summary.signals.map((s) => s.id)).toEqual(
      summary.consideredSignalIds
    );
  });

  it("states honest method limits", () => {
    const summary = summarizeSignalDomains(signalsFor(USABLE_INPUT));
    expect(summary.limits.length).toBeGreaterThanOrEqual(3);
    expect(summary.limits.join(" ")).toMatch(
      /not the share of a sampled area/i
    );
  });
});
