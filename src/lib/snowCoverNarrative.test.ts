import { describe, expect, it } from "vitest";
import {
  describeSnowSeasonChange,
  summarizeSnowCover,
  type SnowCoverObservation,
} from "./snowCover";
import {
  describeSnowCoverObservation,
  describeSnowSeasonChangeNarrative,
} from "./snowCoverNarrative";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

function observation(
  overrides: Partial<SnowCoverObservation> = {}
): SnowCoverObservation {
  return {
    dataMonth: { year: 2025, month: 1 },
    snowCoveredPercent: 72,
    validFraction: 0.9,
    ...overrides,
  };
}

describe("describeSnowCoverObservation", () => {
  it("describes a published, usable month with its extent and provenance", () => {
    const summary = summarizeSnowCover(observation(), AVAILABLE_THROUGH);
    const narrative = describeSnowCoverObservation(summary);

    expect(narrative.kind).toBe("snow-cover-observation-narrative");
    expect(narrative.isInterpretation).toBe(false);
    expect(narrative.headline).toBe("Extensive snow cover in 2025-01");
    expect(narrative.detail).toContain("72%");
    expect(narrative.detail).toContain("extensive snow cover");
    expect(narrative.detail).toContain("Usable area coverage was 90%");
    expect(narrative.provenance.dataMonth).toBe("2025-01");
    expect(narrative.provenance.availableThrough).toBe("2026-01");
    expect(narrative.provenance.publicationLagMonths).toBe(12);
    expect(narrative.provenance.validFraction).toBe(0.9);
    expect(narrative.provenance.sourceLabel).toContain("MOD10CM");
    expect(narrative.provenance.sourceUrl).toBe(
      `https://doi.org/${summary.dataset.doi}`
    );
    expect(narrative.provenance.sourceResolution).toContain("0.05°");
    expect(narrative.limitations).toBe(summary.limitations);
  });

  it("does not surface a number for a not-yet-published month", () => {
    const summary = summarizeSnowCover(
      observation({ dataMonth: { year: 2026, month: 6 } }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowCoverObservation(summary);

    expect(narrative.headline).toBe(
      "Snow-cover record not published for 2026-06"
    );
    expect(narrative.detail).toContain("not yet published");
    expect(narrative.detail).not.toContain("%");
    expect(narrative.provenance.publicationStatus).toBe("not-yet-published");
    expect(narrative.provenance.publicationLagMonths).toBeNull();
  });

  it("reports a published month with no usable value honestly", () => {
    const summary = summarizeSnowCover(
      observation({ snowCoveredPercent: null, validFraction: 0 }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowCoverObservation(summary);

    expect(narrative.headline).toBe("No usable snow-cover value for 2025-01");
    expect(narrative.detail).toContain("No usable monthly-average value");
    expect(narrative.provenance.publicationStatus).toBe("published");
  });

  it("rounds the covered-area percentage to one decimal", () => {
    const summary = summarizeSnowCover(
      observation({ snowCoveredPercent: 33.333 }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowCoverObservation(summary);
    expect(narrative.detail).toContain("33.3%");
  });
});

describe("describeSnowSeasonChangeNarrative", () => {
  it("describes an advancing season with a signed magnitude", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 40,
      }),
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 70,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowSeasonChangeNarrative(change);

    expect(narrative.headline).toBe("Snow cover advanced (2025-01 → 2025-02)");
    expect(narrative.detail).toContain("advanced by 30 percentage points");
    expect(narrative.detail).toContain("not depth");
    expect(narrative.earlier.provenance.dataMonth).toBe("2025-01");
    expect(narrative.later.provenance.dataMonth).toBe("2025-02");
    expect(narrative.limitations).toBe(change.limitations);
  });

  it("names the reporting band for a little-change season", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 60,
      }),
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 62,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowSeasonChangeNarrative(change);

    expect(narrative.headline).toContain("showed little change");
    expect(narrative.detail).toContain("less than the 5 percentage points");
    expect(narrative.detail).toContain("+2 pp");
  });

  it("reports non-consecutive months as unavailable without a number", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 40,
      }),
      observation({
        dataMonth: { year: 2025, month: 4 },
        snowCoveredPercent: 70,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowSeasonChangeNarrative(change);

    expect(narrative.headline).toBe(
      "Month-over-month snow-cover change unavailable"
    );
    expect(narrative.detail).toContain("not exactly one calendar month apart");
    expect(narrative.detail).not.toContain("percentage points.");
  });

  it("reports a retreating season", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 80,
      }),
      observation({
        dataMonth: { year: 2025, month: 3 },
        snowCoveredPercent: 55,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowSeasonChangeNarrative(change);

    expect(narrative.headline).toContain("retreated");
    expect(narrative.detail).toContain("retreated by 25 percentage points");
  });
});
