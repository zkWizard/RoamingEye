import { describe, expect, it } from "vitest";
import {
  probeSoilMoistureRecordMargin,
  probeSoilMoistureStanding,
  soilMoistureStandingClause,
} from "./probeSoilMoistureStanding";
import { CLIMATE_METRICS } from "./climate";
import { csvDecimals, PROBE_SCALES, quantizationStep } from "./probe";
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

const margin = (series: ProbeSeries) =>
  probeSoilMoistureRecordMargin(
    "soil",
    series.months,
    series.values,
    series.shares
  );

/** The value precision ProbePanel derives from the soil scale it holds. */
const SOIL_PRECISION = {
  resolution: quantizationStep(PROBE_SCALES.soil),
  decimals: csvDecimals(PROBE_SCALES.soil),
  unit: PROBE_SCALES.soil.unit,
};

/** Exactly the triple ProbePanel hands the clause in production. */
const clauseFor = (series: ProbeSeries) =>
  soilMoistureStandingClause(rank(series), margin(series), SOIL_PRECISION);

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

describe("probeSoilMoistureRecordMargin", () => {
  it("is silent for every layer that is not soil moisture, and for a point probe", () => {
    const { months, values, shares } = marchSeries(TWELVE_PRIORS, 1);
    for (const layerId of ["precip", "snow", "ndvi", "sst", "lst"] as const) {
      expect(
        probeSoilMoistureRecordMargin(layerId, months, values, shares)
      ).toBeNull();
    }
    expect(
      probeSoilMoistureRecordMargin(undefined, months, values, shares)
    ).toBeNull();
    // A point probe measures no footprint share, so it can carry no standing.
    expect(
      probeSoilMoistureRecordMargin("soil", months, values, null)
    ).toBeNull();
  });

  it("ranks the identical sample set the percentile ranks", () => {
    // The two descriptions share one reduction precisely so a clause can state
    // a rank and a margin as facts about the SAME record.
    const series = marchSeries(TWELVE_PRIORS, 1);
    expect(margin(series)?.sampleCount).toBe(rank(series)?.sampleCount);
    expect(margin(series)?.dataMonth).toEqual(
      rank(series)?.baseline.target.dataMonth
    );
  });

  it("measures a new dry record against the earliest month that held it", () => {
    // Priors run 10..21 from 2000; the record low is 10, held by Mar 2000.
    const result = margin(marchSeries(TWELVE_PRIORS, 8));
    expect(result?.standing).toBe("driest-in-record");
    expect(result?.priorDriestValue).toBe(10);
    expect(result?.priorDriestMonth).toEqual({ year: 2000, month: 3 });
    expect(result?.recordExceedanceMargin).toBeCloseTo(2, 10);
    expect(result?.unit).toBe("kg/m²");
  });

  it("measures a new wet record against the earliest month that held it", () => {
    const result = margin(marchSeries(TWELVE_PRIORS, 24));
    expect(result?.standing).toBe("wettest-in-record");
    expect(result?.priorWettestValue).toBe(21);
    expect(result?.priorWettestMonth).toEqual({ year: 2011, month: 3 });
    expect(result?.recordExceedanceMargin).toBeCloseTo(3, 10);
  });

  it("breaches nothing on a tie or inside the range", () => {
    for (const [target, standing] of [
      [10, "ties-driest-in-record"],
      [21, "ties-wettest-in-record"],
      [15, "within-record-range"],
    ] as const) {
      const result = margin(marchSeries(TWELVE_PRIORS, target));
      expect(result?.standing).toBe(standing);
      expect(result?.recordExceedanceMargin).toBeNull();
    }
  });
});

describe("soilMoistureStandingClause record margin", () => {
  it("says how far a new dry record beat the month that held it", () => {
    const clause = clauseFor(marchSeries(TWELVE_PRIORS, 8));
    expect(clause).toContain("driest of 12 prior same-month observations");
    expect(clause).toContain("2.0 kg/m² drier than Mar 2000");
    // The margin joins the reading; it does not open a second parenthetical.
    expect(clause.split("(")).toHaveLength(2);
  });

  it("says how far a new wet record beat the month that held it", () => {
    const clause = clauseFor(marchSeries(TWELVE_PRIORS, 24));
    expect(clause).toContain("wettest of 12 prior same-month observations");
    expect(clause).toContain("3.0 kg/m² wetter than Mar 2011");
  });

  it("quotes the margin at the probe's own value precision", () => {
    // csvDecimals is the repository's single value-precision rule; the margin
    // is a difference of two probe values and may not be printed finer.
    const clause = clauseFor(marchSeries(TWELVE_PRIORS, 8));
    const quoted = /(\d+\.?\d*) kg\/m² drier/.exec(clause)?.[1];
    expect(quoted).toBe((2).toFixed(csvDecimals(PROBE_SCALES.soil)));
  });

  it("withholds a margin the probe's resolution cannot support", () => {
    // Each end of the difference is a colormap inversion carrying half a LUT
    // step, so a record won by less than one step was not resolved by this
    // method. The record STANDING still holds and is still stated.
    const step = quantizationStep(PROBE_SCALES.soil);
    const clause = clauseFor(marchSeries(TWELVE_PRIORS, 10 - step / 2));
    expect(clause).toContain("driest of 12 prior same-month observations");
    expect(clause).not.toContain("drier than");
    expect(clause).not.toContain("0.0 kg/m²");
  });

  it("states the smallest margin that clears the resolution floor", () => {
    // Just over one LUT step: the narrowest record this method actually
    // resolved, and the first that is allowed to quote its size.
    const step = quantizationStep(PROBE_SCALES.soil);
    const clause = clauseFor(marchSeries(TWELVE_PRIORS, 10 - step * 1.5));
    expect(clause).toContain("drier than Mar 2000");
    expect(clause).toContain("0.3 kg/m²");
  });

  it("states no margin for a tie, a flat record, or an ordinary month", () => {
    for (const target of [10, 21, 15]) {
      const clause = clauseFor(marchSeries(TWELVE_PRIORS, target));
      expect(clause).not.toContain("drier than");
      expect(clause).not.toContain("wetter than");
    }
    const flat = clauseFor(marchSeries(new Array(12).fill(14), 14));
    expect(flat).toContain("matches all 12 prior same-month observations");
    expect(flat).not.toContain("drier than");
    expect(flat).not.toContain("wetter than");
  });

  it("never contradicts the rank it is appended to", () => {
    // A strict record always satisfies "no sampled month was drier", so the
    // saturating wording and the margin can only ever describe one record.
    for (const target of [8, 24]) {
      const series = marchSeries(TWELVE_PRIORS, target);
      const standing = rank(series);
      const result = margin(series);
      if (result?.standing === "driest-in-record") {
        expect(standing?.isDriestInRecord).toBe(true);
      }
      if (result?.standing === "wettest-in-record") {
        expect(standing?.isWettestInRecord).toBe(true);
      }
    }
  });

  it("is unchanged when no margin is supplied at all", () => {
    const series = marchSeries(TWELVE_PRIORS, 8);
    expect(soilMoistureStandingClause(rank(series))).not.toContain(
      "drier than"
    );
    expect(soilMoistureStandingClause(rank(series))).toContain(
      "driest of 12 prior same-month observations"
    );
  });

  it("withholds the margin when the caller supplies no value precision", () => {
    // The floor the margin is screened against comes from the caller, so
    // without it the size cannot be shown to have been resolved at all.
    const series = marchSeries(TWELVE_PRIORS, 8);
    const clause = soilMoistureStandingClause(rank(series), margin(series));
    expect(clause).toContain("driest of 12 prior same-month observations");
    expect(clause).not.toContain("drier than");
  });

  it("withholds the margin when the record's unit is not the probe's", () => {
    // The resolution floor is measured on the probe scale, so the two are only
    // comparable while soil moisture needs no conversion.
    const series = marchSeries(TWELVE_PRIORS, 8);
    const clause = soilMoistureStandingClause(rank(series), margin(series), {
      ...SOIL_PRECISION,
      unit: "mm",
    });
    expect(clause).not.toContain("drier than");
  });

  it("keeps the caller's precision in step with the probe's own rule", () => {
    // If this ever diverges the panel is quoting margins at a precision the
    // method does not resolve; both sides read the same two functions.
    expect(SOIL_PRECISION.unit).toBe(
      CLIMATE_METRICS["soil-moisture"].nativeUnit
    );
    expect(SOIL_PRECISION.decimals).toBe(csvDecimals(PROBE_SCALES.soil));
    expect(SOIL_PRECISION.resolution).toBe(quantizationStep(PROBE_SCALES.soil));
  });

  it("keeps a record-setting clause inside the status line's headroom", () => {
    expect(clauseFor(marchSeries(TWELVE_PRIORS, 8)).length).toBeLessThanOrEqual(
      230
    );
  });

  it("claims no drought category, normal, or forecast with a margin present", () => {
    const clause = clauseFor(marchSeries(TWELVE_PRIORS, 8));
    for (const forbidden of ["drought", "normal", "expect", "will "]) {
      const claimed =
        clause.toLowerCase().includes(forbidden) &&
        !clause.includes("not a drought index");
      expect(claimed).toBe(false);
    }
  });
});
