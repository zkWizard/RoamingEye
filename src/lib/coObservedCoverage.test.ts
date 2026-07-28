import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
} from "./environmentBrief";
import { summarizeCoObservedCoverage } from "./coObservedCoverage";

const AVAILABLE_THROUGH = { year: 2026, month: 3 };

function obs(value: number, validFraction?: number): EnvironmentObservation {
  return { dataMonth: { year: 2026, month: 1 }, value, validFraction };
}

/** A brief where every supplied signal is dated 2026-01 (published, in-range). */
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

describe("summarizeCoObservedCoverage", () => {
  it("bounds the co-observed area with the Fréchet inequalities", () => {
    // Σpᵢ = 3.0, K = 4 → lower = max(0, 3.0 − 3) = 0; upper = min = 0.6.
    const brief = briefWith({
      vegetation: obs(0.6, 0.9),
      rainfall: obs(4, 0.8),
      soilMoisture: obs(0.3, 0.7),
      airTemperature: obs(280, 0.6),
    });

    const summary = summarizeCoObservedCoverage(brief.signals);

    expect(summary.memberCount).toBe(4);
    expect(summary.excluded).toHaveLength(0);
    expect(summary.upperBound).toBe(0.6);
    expect(summary.lowerBound).toBeCloseTo(0, 9);
    expect(summary.multiSignal).toBe(true);
    expect(summary.disjointPossible).toBe(true);
    expect(summary.statement).toBe(
      "4 available observations co-observe between 0% and 60% of the sampled area (Fréchet bounds; exact overlap unknown without pixel masks). The guaranteed overlap is 0%: the signals may share no common area, so they cannot be assumed to describe the same patch of ground."
    );
  });

  it("reports a positive guaranteed overlap when the marginals are high enough", () => {
    // Σpᵢ = 1.7, K = 2 → lower = 0.7; upper = 0.8; overlap is guaranteed.
    const brief = briefWith({
      vegetation: obs(0.6, 0.9),
      rainfall: obs(4, 0.8),
    });

    const summary = summarizeCoObservedCoverage(brief.signals);

    expect(summary.memberCount).toBe(2);
    expect(summary.lowerBound).toBeCloseTo(0.7, 9);
    expect(summary.upperBound).toBe(0.8);
    expect(summary.disjointPossible).toBe(false);
    expect(summary.statement).toBe(
      "2 available observations co-observe between 70% and 80% of the sampled area (Fréchet bounds; exact overlap unknown without pixel masks)."
    );
  });

  it("collapses to an exact overlap when both bounds coincide", () => {
    // Two signals both at full coverage must co-observe the whole sampled area.
    const brief = briefWith({
      vegetation: obs(0.6, 1),
      rainfall: obs(4, 1),
    });

    const summary = summarizeCoObservedCoverage(brief.signals);

    expect(summary.lowerBound).toBe(1);
    expect(summary.upperBound).toBe(1);
    expect(summary.disjointPossible).toBe(false);
    expect(summary.statement).toBe(
      "2 available observations co-observe exactly 100% of the sampled area (Fréchet bounds; exact overlap unknown without pixel masks)."
    );
  });

  it("does not bound cross-signal overlap for a single usable signal", () => {
    const brief = briefWith({ soilMoisture: obs(0.3, 0.75) });

    const summary = summarizeCoObservedCoverage(brief.signals);

    expect(summary.memberCount).toBe(1);
    expect(summary.multiSignal).toBe(false);
    expect(summary.disjointPossible).toBe(false);
    expect(summary.lowerBound).toBe(0.75);
    expect(summary.upperBound).toBe(0.75);
    expect(summary.statement).toBe(
      "1 available observation with 75% sampled coverage; co-observation needs 2+ signals, so no cross-signal overlap is bounded."
    );
  });

  it("lists available signals with no supplied fraction separately, without inventing coverage", () => {
    const brief = briefWith({
      vegetation: obs(0.6, 0.9), // member
      airTemperature: obs(280), // available, no validFraction supplied
    });

    const summary = summarizeCoObservedCoverage(brief.signals);

    expect(summary.members.map((m) => m.id)).toEqual(["vegetation"]);
    expect(summary.excluded.map((e) => e.id)).toEqual(["air-temperature"]);
    expect(summary.excluded[0].statement).toBe(
      "Air temperature: available, but supplied no usable spatial coverage fraction; excluded from the co-observed bound; source M2TMNXSLV v5.12.4."
    );
    expect(summary.statement).toBe(
      "1 available observation with 90% sampled coverage; co-observation needs 2+ signals, so no cross-signal overlap is bounded. 1 more available without a supplied fraction, excluded from the bound."
    );
  });

  it("cannot bound when no available signal supplied a coverage fraction", () => {
    const brief = briefWith({
      soilMoisture: obs(0.3), // available, no fraction
      airTemperature: obs(280), // available, no fraction
    });

    const summary = summarizeCoObservedCoverage(brief.signals);

    expect(summary.memberCount).toBe(0);
    expect(summary.excluded).toHaveLength(2);
    expect(summary.lowerBound).toBeNull();
    expect(summary.upperBound).toBeNull();
    expect(summary.statement).toBe(
      "2 available observations, none with a supplied coverage fraction; co-observed area cannot be bounded."
    );
  });

  it("ignores non-available signals (no-data, unpublished) entirely", () => {
    const brief = briefWith({
      vegetation: obs(0.5, 0), // zero coverage -> no-data, not available
      rainfall: {
        dataMonth: { year: 2026, month: 6 }, // after availableThrough -> unpublished
        value: 4,
        validFraction: 0.9,
      },
    });

    const summary = summarizeCoObservedCoverage(brief.signals);

    expect(summary.memberCount).toBe(0);
    expect(summary.excluded).toHaveLength(0);
    expect(summary.lowerBound).toBeNull();
    expect(summary.upperBound).toBeNull();
    expect(summary.statement).toBe(
      "No available observations with a supplied coverage fraction; co-observed area cannot be bounded."
    );
  });

  it("keeps provenance and never uses inference language", () => {
    const brief = briefWith({
      vegetation: obs(0.6, 0.9),
      rainfall: obs(4, 0.4),
      airTemperature: obs(280), // excluded, carries source in its statement
    });

    const summary = summarizeCoObservedCoverage(brief.signals);

    const prose = [
      summary.statement,
      ...summary.excluded.map((e) => e.statement),
      ...summary.limits,
    ].join(" ");
    expect(unsupportedBriefLanguageHits(prose)).toEqual([]);
    expect(summary.kind).toBe("brief-co-observed-coverage");
  });
});
