import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
} from "./environmentBrief";
import { summarizeCoObservation } from "./briefCoObservation";

function value(
  year: number,
  month: number,
  v: number | null,
  validFraction = 0.9
): EnvironmentObservation {
  return { dataMonth: { year, month }, value: v, validFraction };
}

/** A four-signal brief input, all signals usable by default; tweak per case. */
function briefInput(
  overrides: Partial<EnvironmentBriefInput> = {}
): EnvironmentBriefInput {
  return {
    vegetation: value(2026, 3, 0.5),
    rainfall: value(2026, 3, 2),
    soilMoisture: value(2026, 3, 20),
    airTemperature: value(2026, 3, 290),
    availableThrough: { year: 2026, month: 6 },
    ...overrides,
  };
}

function signalsFor(input: EnvironmentBriefInput) {
  return composeEnvironmentBrief(input).signals;
}

describe("summarizeCoObservation", () => {
  it("reports a single fully co-observed cohort when all signals share a month", () => {
    const summary = summarizeCoObservation(signalsFor(briefInput()));

    expect(summary.kind).toBe("brief-co-observation");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    expect(summary.cohortCount).toBe(1);
    expect(summary.cohorts[0]).toMatchObject({
      month: { year: 2026, month: 3 },
      signalIds: ["vegetation", "rainfall", "soil-moisture", "air-temperature"],
    });
    expect(summary.maxCohortSize).toBe(4);
    expect(summary.fullyCoObserved).toBe(true);
    expect(summary.statement).toBe(
      "4 usable observations all dated 2026-03; fully co-observed."
    );
  });

  it("partitions signals into chronological cohorts by shared data month", () => {
    // Vegetation and air temperature share 2026-03; rainfall and soil moisture
    // (both GLDAS) share an older 2026-01. The span alone (2 months) cannot say
    // which pairs are contemporaneous — the cohorts can.
    const summary = summarizeCoObservation(
      signalsFor(
        briefInput({
          rainfall: value(2026, 1, 2),
          soilMoisture: value(2026, 1, 20),
        })
      )
    );

    expect(summary.cohortCount).toBe(2);
    expect(summary.cohorts.map((c) => [c.month, c.signalIds])).toEqual([
      [{ year: 2026, month: 1 }, ["rainfall", "soil-moisture"]],
      [{ year: 2026, month: 3 }, ["vegetation", "air-temperature"]],
    ]);
    expect(summary.fullyCoObserved).toBe(false);
    expect(summary.statement).toBe(
      "4 usable observations form 2 co-observation cohorts: rainfall, soil-moisture share 2026-01; vegetation, air-temperature share 2026-03 — only signals sharing a data month are contemporaneous."
    );
  });

  it("describes a lone signal in a cohort with an 'at' clause", () => {
    const summary = summarizeCoObservation(
      signalsFor(
        briefInput({
          airTemperature: value(2025, 8, 290),
          rainfall: value(2026, 3, 2),
          soilMoisture: value(2026, 3, 20),
          vegetation: value(2026, 3, 0.5),
        })
      )
    );

    expect(summary.cohortCount).toBe(2);
    expect(summary.statement).toBe(
      "4 usable observations form 2 co-observation cohorts: air-temperature at 2025-08; vegetation, rainfall, soil-moisture share 2026-03 — only signals sharing a data month are contemporaneous."
    );
  });

  it("breaks cohort-size ties toward the chronologically-earliest cohort", () => {
    // Two months, two signals each: the earlier month wins `largestCohort`.
    const summary = summarizeCoObservation(
      signalsFor(
        briefInput({
          vegetation: value(2026, 1, 0.5),
          rainfall: value(2026, 1, 2),
          soilMoisture: value(2026, 3, 20),
          airTemperature: value(2026, 3, 290),
        })
      )
    );

    expect(summary.maxCohortSize).toBe(2);
    expect(summary.largestCohort?.month).toEqual({ year: 2026, month: 1 });
    expect(summary.largestCohort?.signalIds).toEqual([
      "vegetation",
      "rainfall",
    ]);
  });

  it("treats a single usable signal as not applicable for co-observation", () => {
    const summary = summarizeCoObservation(
      signalsFor(
        briefInput({
          rainfall: null,
          soilMoisture: null,
          airTemperature: null,
        })
      )
    );

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.cohortCount).toBe(1);
    expect(summary.maxCohortSize).toBe(1);
    expect(summary.fullyCoObserved).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation, dated 2026-03; co-observation is not applicable to a single signal."
    );
  });

  it("excludes no-data, invalid, and unpublished signals from cohorts", () => {
    // rainfall no-data (null value), soil moisture invalid month, air
    // temperature dated after its availability horizon (unpublished).
    const summary = summarizeCoObservation(
      signalsFor(
        briefInput({
          rainfall: value(2026, 3, null),
          soilMoisture: { dataMonth: { year: 2026, month: 13 }, value: 20 },
          airTemperature: value(2026, 7, 290),
          availableThrough: { year: 2026, month: 3 },
        })
      )
    );

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.cohortCount).toBe(1);
    expect(summary.cohorts[0].signalIds).toEqual(["vegetation"]);
  });

  it("returns an empty grouping when no signal is usable", () => {
    const summary = summarizeCoObservation(
      signalsFor(
        briefInput({
          vegetation: null,
          rainfall: null,
          soilMoisture: null,
          airTemperature: null,
        })
      )
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.cohorts).toEqual([]);
    expect(summary.cohortCount).toBe(0);
    expect(summary.largestCohort).toBeNull();
    expect(summary.maxCohortSize).toBe(0);
    expect(summary.fullyCoObserved).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to group by data month."
    );
  });

  it("carries no combined value, score, or condition claim", () => {
    const summary = summarizeCoObservation(signalsFor(briefInput()));
    expect("score" in summary).toBe(false);
    expect("value" in summary).toBe(false);
    expect(summary.statement).not.toMatch(/risk|forecast|trend|healthy/i);
  });
});
