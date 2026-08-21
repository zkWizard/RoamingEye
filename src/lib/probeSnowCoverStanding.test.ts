import { describe, expect, it } from "vitest";
import {
  probeSnowCoverRecordMargin,
  snowCoverStandingClause,
} from "./probeSnowCoverStanding";
import { MINIMUM_SNOW_PERCENTILE_SAMPLES } from "./snowCoverPercentile";
import { csvDecimals, PROBE_SCALES, quantizationStep } from "./probe";
import type { ProbeValuePrecision } from "./probeSoilMoistureStanding";
import type { SnowCoverRecordMargin } from "./snowCoverRecordMargin";
import type { YearMonth } from "./timeline";

/** The precision the panel derives from the probe's own snow scale. */
const SNOW_PRECISION: ProbeValuePrecision = {
  resolution: quantizationStep(PROBE_SCALES.snow),
  decimals: csvDecimals(PROBE_SCALES.snow),
  unit: PROBE_SCALES.snow.unit,
};

/**
 * A run of consecutive Marches whose last entry is the target.
 *
 * The default start year is 2004 because GIBS does not distribute 2002-03 (see
 * SNOW_COVER_UNDISTRIBUTED_MONTHS): a run begun earlier silently loses a sample
 * to the gap, which one test below exercises deliberately.
 */
function marchSeries(
  values: readonly (number | null)[],
  startYear = 2004
): { months: YearMonth[]; values: (number | null)[] } {
  const months = values.map((_, index) => ({
    year: startYear + index,
    month: 3,
  }));
  return { months, values: [...values] };
}

/** A record of `count` prior Marches all at `value`, then the target. */
function priorsThen(
  count: number,
  value: number,
  target: number | null
): { months: YearMonth[]; values: (number | null)[] } {
  return marchSeries([...Array.from({ length: count }, () => value), target]);
}

/** Ten usable prior Marches spanning 10-60, snowiest 2009, then the target. */
function recordThen(target: number | null): {
  months: YearMonth[];
  values: (number | null)[];
} {
  return marchSeries([10, 20, 30, 40, 50, 60, 55, 45, 35, 25, target]);
}

function marginFor(
  series: { months: YearMonth[]; values: (number | null)[] },
  validFractions: readonly (number | null)[] | null = null
): SnowCoverRecordMargin | null {
  return probeSnowCoverRecordMargin(
    "snow",
    series.months,
    series.values,
    validFractions
  );
}

describe("probeSnowCoverRecordMargin", () => {
  it("returns null for any layer other than snow", () => {
    const { months, values } = priorsThen(
      MINIMUM_SNOW_PERCENTILE_SAMPLES,
      20,
      80
    );
    expect(probeSnowCoverRecordMargin("soil", months, values, null)).toBeNull();
    expect(probeSnowCoverRecordMargin("ndvi", months, values, null)).toBeNull();
    expect(
      probeSnowCoverRecordMargin(undefined, months, values, null)
    ).toBeNull();
  });

  it("returns null when the series carries no observed month", () => {
    expect(marginFor(marchSeries([null, null, null]))).toBeNull();
  });

  it("ranks a point probe, which supplies no footprint share at all", () => {
    const margin = marginFor(
      priorsThen(MINIMUM_SNOW_PERCENTILE_SAMPLES, 20, 80)
    );
    expect(margin?.status).toBe("available");
    expect(margin?.standing).toBe("most-in-record");
  });

  it("passes supplied footprint shares through to the coverage floor", () => {
    const series = priorsThen(MINIMUM_SNOW_PERCENTILE_SAMPLES, 20, 80);
    const thin = series.months.map(() => 0.1);
    const margin = marginFor(series, thin);
    expect(margin?.standing).toBeNull();
    expect(margin?.status).toBe("insufficient-coverage");
  });

  it("targets the latest OBSERVED month, not the latest requested one", () => {
    // Ten usable prior Marches, a record-setting 2014, then two unusable months.
    const margin = marginFor(
      marchSeries([
        ...Array.from({ length: MINIMUM_SNOW_PERCENTILE_SAMPLES }, () => 20),
        80,
        null,
        null,
      ])
    );
    expect(margin?.target.dataMonth).toEqual({ year: 2014, month: 3 });
    expect(margin?.standing).toBe("most-in-record");
  });

  it("does not depend on the order the series arrives in", () => {
    const series = priorsThen(MINIMUM_SNOW_PERCENTILE_SAMPLES, 20, 80);
    const order = series.months.map((_, index) => index).reverse();
    const margin = probeSnowCoverRecordMargin(
      "snow",
      order.map((index) => series.months[index]),
      order.map((index) => series.values[index]),
      null
    );
    expect(margin?.target.dataMonth).toEqual({ year: 2014, month: 3 });
    expect(margin?.standing).toBe("most-in-record");
  });

  it("drops a March the imagery service does not distribute", () => {
    // Marches 2000-2009 look like ten prior samples, but GIBS serves no
    // 2002-03, so only nine reach the floor and no standing is stated.
    const margin = marginFor(recordThen(80), null);
    expect(margin?.sampleCount).toBe(MINIMUM_SNOW_PERCENTILE_SAMPLES);
    const gapped = marginFor(marchSeries(recordThen(80).values, 2000));
    expect(gapped?.sampleCount).toBe(MINIMUM_SNOW_PERCENTILE_SAMPLES - 1);
    expect(gapped?.status).toBe("insufficient-samples");
    expect(gapped?.standing).toBeNull();
    expect(snowCoverStandingClause(gapped, SNOW_PRECISION)).toBe("");
  });
});

describe("snowCoverStandingClause", () => {
  function clauseFor(
    values: readonly (number | null)[],
    precision: ProbeValuePrecision | null = SNOW_PRECISION
  ): string {
    return snowCoverStandingClause(marginFor(marchSeries(values)), precision);
  }

  it("names the record, the sample count, the margin and the month that held it", () => {
    expect(
      snowCoverStandingClause(marginFor(recordThen(66.4)), SNOW_PRECISION)
    ).toBe(
      "snow cover Mar 2014 snowiest of 10 prior same-month observations, 6.4 percentage points above Mar 2009 (this record only, MOD10CM monthly-average snow-covered area; snow-free months are undrawn and absent from it)"
    );
  });

  it("names the EARLIEST holder when the prior record was tied", () => {
    const clause = clauseFor([60, 20, 30, 60, 50, 40, 55, 45, 35, 25, 70]);
    expect(clause).toContain("above Mar 2004");
  });

  it("says nothing when the month is inside the sampled range", () => {
    expect(
      snowCoverStandingClause(marginFor(recordThen(33)), SNOW_PRECISION)
    ).toBe("");
  });

  it("says nothing when the month merely ties the prior record", () => {
    expect(
      snowCoverStandingClause(marginFor(recordThen(60)), SNOW_PRECISION)
    ).toBe("");
  });

  it("withholds every LOW-snow standing, because snow-free months are undrawn", () => {
    // Percent 0 renders transparent, so a snow-free month never reaches the
    // record and the retained years are biased upward. A least-in-record claim
    // ranked against them would be unsound, so nothing is said — even though
    // the module underneath computed the standing and its margin.
    const margin = marginFor(recordThen(1));
    expect(margin?.standing).toBe("least-in-record");
    expect(margin?.recordExceedanceMargin).toBeCloseTo(9, 10);
    expect(snowCoverStandingClause(margin, SNOW_PRECISION)).toBe("");
  });

  it("withholds a flat record, which ties both extremes at once", () => {
    const margin = marginFor(
      priorsThen(MINIMUM_SNOW_PERCENTILE_SAMPLES, 40, 40)
    );
    expect(margin?.standing).toBe("ties-flat-record");
    expect(snowCoverStandingClause(margin, SNOW_PRECISION)).toBe("");
  });

  it("says nothing when the record is shorter than the sample floor", () => {
    expect(clauseFor([10, 20, 30, 40, 50, 90])).toBe("");
  });

  it("drops a margin the probe's own LUT step cannot resolve", () => {
    // Snow's scale resolves ~0.392 points, so a record won by 0.2 sits inside
    // the measurement's own uncertainty: the standing holds, its size does not.
    const margin = marginFor(recordThen(60.2));
    expect(margin?.standing).toBe("most-in-record");
    expect(snowCoverStandingClause(margin, SNOW_PRECISION)).toBe("");
  });

  it("keeps a margin the LUT step does resolve", () => {
    // Two steps rather than one: the difference of two decoded values carries
    // floating-point slop, so a margin sitting exactly on the step can land a
    // hair under it and be withheld. That direction is the safe one — the
    // clause goes silent rather than quoting an unresolvable size — and it
    // matches the soil and precipitation gates this one mirrors.
    const margin = marginFor(
      recordThen(60 + quantizationStep(PROBE_SCALES.snow) * 2)
    );
    expect(snowCoverStandingClause(margin, SNOW_PRECISION)).toContain(
      "percentage points above Mar 2009"
    );
  });

  it("drops the clause when either unit stops being the one checked", () => {
    const margin = marginFor(recordThen(80));
    expect(
      snowCoverStandingClause(margin, { ...SNOW_PRECISION, unit: "fraction" })
    ).toBe("");
    expect(margin).not.toBeNull();
    const relabelled = margin
      ? { ...margin, unit: "fraction of area" }
      : margin;
    expect(snowCoverStandingClause(relabelled, SNOW_PRECISION)).toBe("");
  });

  it("says nothing without a precision, and nothing for a null margin", () => {
    expect(snowCoverStandingClause(marginFor(recordThen(80)), null)).toBe("");
    expect(snowCoverStandingClause(null, SNOW_PRECISION)).toBe("");
  });

  it("renders the margin with the probe's own decimals, never more", () => {
    expect(
      snowCoverStandingClause(marginFor(recordThen(67.13579)), SNOW_PRECISION)
    ).toContain("7.1 percentage points above Mar 2009");
  });

  it("needs no unit conversion: the record and the probe scale share a quantity", () => {
    // Guards the assumption the resolution gate rests on — snow's percentage
    // points and PROBE_SCALES.snow's percent are the same 0-100 quantity, so a
    // margin is compared with the LUT step directly. Precipitation, by
    // contrast, converts kg/m²/s to mm/day before any such comparison.
    expect(PROBE_SCALES.snow.unit).toBe("%");
    expect(PROBE_SCALES.snow.min).toBe(0);
    expect(PROBE_SCALES.snow.max).toBe(100);
    const margin = marginFor(recordThen(80));
    expect(margin?.unit).toBe("% snow-covered area");
    expect(margin?.recordExceedanceMargin).toBeCloseTo(20, 10);
  });

  it("carries exactly one parenthetical, holding scope, provenance and censoring", () => {
    const clause = snowCoverStandingClause(
      marginFor(recordThen(80)),
      SNOW_PRECISION
    );
    expect(clause.match(/\(/g)).toHaveLength(1);
    expect(clause).toContain("this record only");
    expect(clause).toContain("MOD10CM");
    expect(clause).toContain("snow-free months are undrawn");
    // Never a forecast, a depth, a melt rate, or a water volume.
    expect(clause).not.toMatch(/depth|water equivalent|melt|runoff|will /i);
  });
});
