import { describe, expect, it } from "vitest";
import {
  probeSoilMoistureStanding,
  soilMoistureStandingClause,
} from "./probeSoilMoistureStanding";
import { CLIMATE_METRICS } from "./climate";
import { PROBE_SCALES } from "./probe";
import type { YearMonth } from "./timeline";

interface ProbeSeries {
  months: YearMonth[];
  values: (number | null)[];
  shares: (number | null)[];
}

/**
 * Build a March-anchored series: one March per year carrying `priorValues`,
 * then the target March in the following year. Every year also carries a July
 * far outside the March range, so the helper has to do the calendar-month
 * restriction itself rather than inheriting it from the fixture.
 */
function marchSeries(
  priorValues: readonly number[],
  targetValue: number,
  fillOtherMonths = true
): ProbeSeries {
  const series: ProbeSeries = { months: [], values: [], shares: [] };
  const push = (month: YearMonth, value: number | null): void => {
    series.months.push(month);
    series.values.push(value);
    series.shares.push(1);
  };
  const firstYear = 2000;
  for (let index = 0; index < priorValues.length; index++) {
    const year = firstYear + index;
    // If these leaked into the ranking the target would read as the driest
    // month in the record rather than an ordinary March.
    if (fillOtherMonths) push({ year, month: 7 }, 999);
    push({ year, month: 3 }, priorValues[index]);
  }
  push({ year: firstYear + priorValues.length, month: 3 }, targetValue);
  return series;
}

const rank = (series: ProbeSeries) =>
  probeSoilMoistureStanding(
    "soil",
    series.months,
    series.values,
    series.shares
  );

const clauseFor = (series: ProbeSeries) =>
  soilMoistureStandingClause(rank(series));

/** Twelve prior Marches at 10..21 kg/m², clearing the ten-sample floor. */
const TWELVE_PRIORS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

describe("probeSoilMoistureStanding", () => {
  it("is silent for every layer that is not soil moisture", () => {
    const { months, values, shares } = marchSeries(TWELVE_PRIORS, 15);
    for (const layerId of ["precip", "snow", "ndvi", "sst", "lst"] as const) {
      expect(
        probeSoilMoistureStanding(layerId, months, values, shares)
      ).toBeNull();
    }
    expect(
      probeSoilMoistureStanding(undefined, months, values, shares)
    ).toBeNull();
  });

  it("is silent for a mode that measures no footprint share", () => {
    // A point probe charts a median of a tight pixel block and passes null.
    // The baseline rejects a share-less observation at any threshold, so the
    // clause must not be attempted rather than be attempted and come back bare.
    const { months, values } = marchSeries(TWELVE_PRIORS, 15);
    expect(probeSoilMoistureStanding("soil", months, values, null)).toBeNull();
  });

  it("ranks the latest observed month within prior same-calendar months", () => {
    const standing = rank(marchSeries(TWELVE_PRIORS, 15));
    expect(standing).not.toBeNull();
    expect(standing?.status).toBe("available");
    expect(standing?.sampleCount).toBe(12);
    // Five priors below 15, six above, one tied: F = (5 + 0.5) / 12 = 45.8%.
    expect(standing?.drierRecordCount).toBe(5);
    expect(standing?.wetterRecordCount).toBe(6);
    expect(standing?.tiedRecordCount).toBe(1);
    expect(standing?.percentileRank).toBeCloseTo(45.83, 1);
    expect(standing?.isDriestInRecord).toBe(false);
    expect(standing?.isWettestInRecord).toBe(false);
  });

  it("excludes other calendar months from the ranking", () => {
    const withJuly = rank(marchSeries(TWELVE_PRIORS, 15, true));
    const withoutJuly = rank(marchSeries(TWELVE_PRIORS, 15, false));
    expect(withJuly?.sampleCount).toBe(withoutJuly?.sampleCount);
    expect(withJuly?.percentileRank).toBe(withoutJuly?.percentileRank);
  });

  it("targets the latest OBSERVED month, not the latest requested one", () => {
    const series = marchSeries(TWELVE_PRIORS, 15);
    // A later, wholly unusable March must not become the target.
    series.months.push({ year: 2013, month: 3 });
    series.values.push(null);
    series.shares.push(0);
    expect(rank(series)?.baseline.target.dataMonth).toEqual({
      year: 2012,
      month: 3,
    });
  });

  it("drops a prior month whose footprint share is below the floor", () => {
    const series = marchSeries(TWELVE_PRIORS, 15);
    // Two prior Marches mostly cloud/edge: retained months fall under the
    // ten-sample floor, so no rank is stated rather than one from eight.
    let dropped = 0;
    for (let index = 0; index < series.months.length && dropped < 5; index++) {
      if (
        series.months[index].month === 3 &&
        series.months[index].year < 2012
      ) {
        series.shares[index] = 0.1;
        dropped += 1;
      }
    }
    const standing = rank(series);
    expect(standing?.sampleCount).toBe(7);
    expect(standing?.percentileRank).toBeNull();
    expect(soilMoistureStandingClause(standing)).toBe("");
  });

  it("reports no rank when the record is shorter than the sample floor", () => {
    const standing = rank(marchSeries([10, 11, 12, 13], 15));
    expect(standing?.percentileRank).toBeNull();
    expect(soilMoistureStandingClause(standing)).toBe("");
  });

  it("returns null when the series carries no observed month at all", () => {
    const months: YearMonth[] = [
      { year: 2000, month: 3 },
      { year: 2001, month: 3 },
    ];
    expect(
      probeSoilMoistureStanding("soil", months, [null, null], [1, 1])
    ).toBeNull();
    expect(probeSoilMoistureStanding("soil", [], [], [])).toBeNull();
  });

  it("hands the probe's physical series over without unit conversion", () => {
    // The clause reports GLDAS column water in the metric's native unit, and
    // the probe's soil scale already reports in that unit. If either is ever
    // re-expressed, this bridge needs a conversion the way precipitation does.
    expect(CLIMATE_METRICS["soil-moisture"].nativeUnit).toBe("kg/m²");
    expect(PROBE_SCALES.soil.unit).toBe("kg/m²");
  });
});

describe("soilMoistureStandingClause", () => {
  it("is empty for a null standing", () => {
    expect(soilMoistureStandingClause(null)).toBe("");
  });

  it("states an ordinary rank with its provenance and scope limit", () => {
    expect(clauseFor(marchSeries(TWELVE_PRIORS, 15))).toBe(
      "soil moisture Mar 2012 at the 46th percentile of 12 prior same-month observations (empirical rank in this record only, GLDAS-Noah modeled column water, not a drought index)"
    );
  });

  it("words a saturating rank as the record standing rather than 0th/100th", () => {
    const driest = clauseFor(marchSeries(TWELVE_PRIORS, 1));
    expect(driest).toContain("driest of 12 prior same-month observations");
    expect(driest).not.toContain("percentile of");
    expect(driest).not.toContain("0th");

    const wettest = clauseFor(marchSeries(TWELVE_PRIORS, 99));
    expect(wettest).toContain("wettest of 12 prior same-month observations");
    expect(wettest).not.toContain("100th");
  });

  it("reports a spreadless record as a tie, not as a record in either direction", () => {
    const flat = Array.from({ length: 12 }, () => 20);
    const clause = clauseFor(marchSeries(flat, 20));
    expect(clause).toContain("matches all 12 prior same-month observations");
    expect(clause).not.toContain("driest");
    expect(clause).not.toContain("wettest");
  });

  it("carries exactly one parenthetical, holding provenance and scope together", () => {
    const clause = clauseFor(marchSeries(TWELVE_PRIORS, 15));
    expect(clause.split("(")).toHaveLength(2);
    // One clause on the status line, never a second segment of its own.
    expect(clause.split(" · ")).toHaveLength(1);
    expect(clause).toContain("GLDAS-Noah modeled column water");
    expect(clause).toContain("not a drought index");
  });

  it("never claims a drought category, a normal, or a forecast", () => {
    const clause = clauseFor(marchSeries(TWELVE_PRIORS, 15));
    for (const forbidden of ["drought", "normal", "expect", "will "]) {
      // "not a drought index" is the one licensed mention, as a refusal.
      const claimed =
        clause.toLowerCase().includes(forbidden) &&
        !clause.includes("not a drought index");
      expect(claimed).toBe(false);
    }
  });

  it("stays inside the status line's measured headroom", () => {
    expect(
      clauseFor(marchSeries(TWELVE_PRIORS, 15)).length
    ).toBeLessThanOrEqual(200);
  });
});
