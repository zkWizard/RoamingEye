import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
} from "./environmentBrief";
import {
  classifyCoverage,
  summarizeCoverageAdequacy,
  COVERAGE_TIERS,
} from "./coverageAdequacy";

const AVAILABLE_THROUGH = { year: 2026, month: 3 };

function obs(value: number, validFraction?: number): EnvironmentObservation {
  return { dataMonth: { year: 2026, month: 1 }, value, validFraction };
}

/** A brief where every signal is dated 2026-01 (published, in-range). */
function briefWith(
  overrides: Partial<EnvironmentBriefInput>
): ReturnType<typeof composeEnvironmentBrief> {
  return composeEnvironmentBrief({
    vegetation: null,
    rainfall: null,
    soilMoisture: null,
    airTemperature: null,
    availableThrough: AVAILABLE_THROUGH,
    ...overrides,
  });
}

describe("classifyCoverage", () => {
  it("buckets usable-area fractions into descending completeness tiers", () => {
    expect(classifyCoverage(1)).toBe("full");
    expect(classifyCoverage(0.99)).toBe("full");
    expect(classifyCoverage(0.98)).toBe("substantial");
    expect(classifyCoverage(0.75)).toBe("substantial");
    expect(classifyCoverage(0.74)).toBe("partial");
    expect(classifyCoverage(0.4)).toBe("partial");
    expect(classifyCoverage(0.39)).toBe("sparse");
    expect(classifyCoverage(0)).toBe("sparse");
  });

  it("rejects non-finite or out-of-range fractions", () => {
    expect(classifyCoverage(Number.NaN)).toBeNull();
    expect(classifyCoverage(Number.POSITIVE_INFINITY)).toBeNull();
    expect(classifyCoverage(-0.01)).toBeNull();
    expect(classifyCoverage(1.01)).toBeNull();
  });

  it("keeps the thresholds monotonically descending", () => {
    for (let i = 1; i < COVERAGE_TIERS.length; i += 1) {
      expect(COVERAGE_TIERS[i].min).toBeLessThan(COVERAGE_TIERS[i - 1].min);
    }
  });
});

describe("summarizeCoverageAdequacy", () => {
  it("tiers each available signal's sampled coverage and reports the range", () => {
    const brief = briefWith({
      vegetation: obs(0.6, 1), // full
      rainfall: obs(4, 0.8), // substantial
      soilMoisture: obs(0.3, 0.5), // partial
      airTemperature: obs(280, 0.2), // sparse
    });

    const summary = summarizeCoverageAdequacy(brief.signals);

    expect(summary.reportedCount).toBe(4);
    expect(summary.unreported).toHaveLength(0);
    expect(summary.minFraction).toBe(0.2);
    expect(summary.maxFraction).toBe(1);
    expect(summary.reported.map((r) => [r.id, r.tier])).toEqual([
      ["vegetation", "full"],
      ["rainfall", "substantial"],
      ["soil-moisture", "partial"],
      ["air-temperature", "sparse"],
    ]);
    expect(summary.tierCounts).toEqual({
      full: 1,
      substantial: 1,
      partial: 1,
      sparse: 1,
    });
    expect(summary.statement).toBe(
      "4 available observations report 20%–100% sampled coverage (1 full, 1 substantial, 1 partial, 1 sparse); coverage is the usable share of the sampled area, not a data-quality score."
    );
  });

  it("keeps provenance in every reported statement and avoids inference language", () => {
    const brief = briefWith({ rainfall: obs(4, 0.82) });
    const summary = summarizeCoverageAdequacy(brief.signals);

    expect(summary.reported[0].statement).toBe(
      "Rainfall (precipitation rate): 82% of the sampled area returned usable data (substantial); source GLDAS_NOAH025_M v2.1."
    );
    const prose = [
      summary.statement,
      ...summary.reported.map((r) => r.statement),
      ...summary.limits,
    ].join(" ");
    expect(unsupportedBriefLanguageHits(prose)).toEqual([]);
  });

  it("lists available signals with no supplied fraction separately, without inventing coverage", () => {
    const brief = briefWith({
      vegetation: obs(0.5, 0.9), // reported
      airTemperature: obs(280), // available, no validFraction supplied
    });

    const summary = summarizeCoverageAdequacy(brief.signals);

    expect(summary.reportedCount).toBe(1);
    expect(summary.reported[0].id).toBe("vegetation");
    expect(summary.unreported.map((u) => u.id)).toEqual(["air-temperature"]);
    expect(summary.unreported[0].statement).toBe(
      "Air temperature: available, but the sampler supplied no spatial coverage fraction; source M2TMNXSLV v5.12.4."
    );
    expect(summary.statement).toBe(
      "1 available observation reports 90% sampled coverage (1 substantial); coverage is the usable share of the sampled area, not a data-quality score. 1 more available without a supplied fraction."
    );
  });

  it("collapses the range phrase when a single fraction is reported", () => {
    const brief = briefWith({ soilMoisture: obs(0.3, 0.45) });
    const summary = summarizeCoverageAdequacy(brief.signals);
    expect(summary.minFraction).toBe(summary.maxFraction);
    expect(summary.statement).toBe(
      "1 available observation reports 45% sampled coverage (1 partial); coverage is the usable share of the sampled area, not a data-quality score."
    );
  });

  it("excludes non-available signals (no-data, unpublished) from the tally", () => {
    const brief = briefWith({
      vegetation: obs(0.5, 0), // zero coverage -> no-data, not available
      rainfall: {
        dataMonth: { year: 2026, month: 6 }, // after availableThrough -> unpublished
        value: 4,
        validFraction: 0.9,
      },
    });

    const summary = summarizeCoverageAdequacy(brief.signals);

    expect(summary.reportedCount).toBe(0);
    expect(summary.unreported).toHaveLength(0);
    expect(summary.statement).toBe(
      "No available observations to assess for spatial coverage."
    );
  });

  it("reports only the without-fraction message when no available signal supplied coverage", () => {
    const brief = briefWith({
      soilMoisture: obs(0.3), // available, no fraction
      airTemperature: obs(280), // available, no fraction
    });

    const summary = summarizeCoverageAdequacy(brief.signals);

    expect(summary.reportedCount).toBe(0);
    expect(summary.unreported).toHaveLength(2);
    expect(summary.minFraction).toBeNull();
    expect(summary.maxFraction).toBeNull();
    expect(summary.statement).toBe(
      "2 available observations, none with a supplied spatial coverage fraction; adequacy cannot be tallied."
    );
  });
});
