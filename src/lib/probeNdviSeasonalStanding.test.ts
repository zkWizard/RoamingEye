import { describe, expect, it } from "vitest";
import {
  ndviSeasonalStandingClause,
  probeNdviSeasonalStanding,
  type NdviValuePrecision,
} from "./probeNdviSeasonalStanding";
import { NDVI_UNIT } from "./phenology";
import { csvDecimals, PROBE_SCALES, quantizationStep } from "./probe";
import type { YearMonth } from "./timeline";

const NDVI_SCALE = PROBE_SCALES.ndvi;

/** The precision the wired caller derives from the probe's own NDVI scale. */
const PRECISION: NdviValuePrecision = {
  resolution: quantizationStep(NDVI_SCALE),
  decimals: csvDecimals(NDVI_SCALE),
  unit: NDVI_SCALE.unit,
};

/** A latitude only ever used for a hemisphere label; it gates nothing. */
const LATITUDE = 41.5;

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
  targetValue: number | null,
  fillOtherMonths = true
): ProbeSeries {
  const series: ProbeSeries = { months: [], values: [], shares: [] };
  const push = (month: YearMonth, value: number | null): void => {
    series.months.push(month);
    series.values.push(value);
    series.shares.push(1);
  };
  const firstYear = 2001;
  for (let index = 0; index < priorValues.length; index++) {
    const year = firstYear + index;
    // If these leaked into the ranking the target would read as the least green
    // month in the record rather than an ordinary March.
    if (fillOtherMonths) push({ year, month: 7 }, 0.95);
    push({ year, month: 3 }, priorValues[index]);
  }
  push({ year: firstYear + priorValues.length, month: 3 }, targetValue);
  return series;
}

/** Twelve prior Marches spread across the index, so no rank saturates. */
const SPREAD = [
  0.3, 0.34, 0.38, 0.42, 0.46, 0.5, 0.54, 0.58, 0.62, 0.66, 0.7, 0.74,
];

function standingFor(series: ProbeSeries) {
  return probeNdviSeasonalStanding(
    "ndvi",
    series.months,
    series.values,
    series.shares,
    LATITUDE
  );
}

describe("probeNdviSeasonalStanding", () => {
  it("declines every layer that is not the NDVI vegetation index", () => {
    const series = marchSeries(SPREAD, 0.52);
    for (const layer of [
      "evi",
      "lst",
      "soil",
      "precip",
      "landcover",
    ] as const) {
      expect(
        probeNdviSeasonalStanding(
          layer,
          series.months,
          series.values,
          series.shares,
          LATITUDE
        )
      ).toBeNull();
    }
    expect(
      probeNdviSeasonalStanding(
        undefined,
        series.months,
        series.values,
        series.shares,
        LATITUDE
      )
    ).toBeNull();
  });

  it("declines a mode that measures no usable footprint share", () => {
    // A point probe supplies no share, and the seasonal baseline rejects an
    // observation carrying none at any threshold, so the rank is refused here
    // rather than silently reported against an empty sample.
    const series = marchSeries(SPREAD, 0.52);
    expect(
      probeNdviSeasonalStanding(
        "ndvi",
        series.months,
        series.values,
        null,
        LATITUDE
      )
    ).toBeNull();
  });

  it("returns null when the series carries no observed month", () => {
    const series = marchSeries([], null);
    expect(standingFor(series)).toBeNull();
  });

  it("ranks the latest observed month against the same calendar month only", () => {
    const standing = standingFor(marchSeries(SPREAD, 0.52));
    expect(standing?.status).toBe("available");
    expect(standing?.sampleCount).toBe(SPREAD.length);
    // 0.52 sits above six of the twelve priors and below six.
    expect(standing?.lessGreenRecordCount).toBe(6);
    expect(standing?.greenerRecordCount).toBe(6);
    expect(standing?.percentileRank).toBeCloseTo(50, 6);
    expect(standing?.baseline.target.dataMonth).toEqual({
      year: 2013,
      month: 3,
    });
  });

  it("targets the latest OBSERVED month, not the latest requested one", () => {
    const series = marchSeries(SPREAD, 0.52);
    // A wholly cloud-blocked March after the target: it must not become the
    // ranked month, and must not displace the record's publication frontier.
    series.months.push({ year: 2014, month: 3 });
    series.values.push(null);
    series.shares.push(1);
    const standing = standingFor(series);
    expect(standing?.baseline.target.dataMonth).toEqual({
      year: 2013,
      month: 3,
    });
    expect(standing?.status).toBe("available");
  });

  it("is invariant to the order the sampler streamed the months in", () => {
    // An exact tie is ordinary here, not rare: the probe recovers values through
    // a quantised colormap ramp and MOD13A3 composites monthly, so two years can
    // invert to the identical float.
    const tied = [...SPREAD.slice(0, 11), 0.52];
    const forward = marchSeries(tied, 0.52);
    const reversed: ProbeSeries = {
      months: [...forward.months].reverse(),
      values: [...forward.values].reverse(),
      shares: [...forward.shares].reverse(),
    };
    const a = standingFor(forward);
    const b = standingFor(reversed);
    expect(a?.percentileRank).toBe(b?.percentileRank);
    expect(a?.tiedRecordCount).toBe(b?.tiedRecordCount);
    expect(ndviSeasonalStandingClause(a, PRECISION)).toBe(
      ndviSeasonalStandingClause(b, PRECISION)
    );
  });
});

describe("ndviSeasonalStandingClause", () => {
  it("says nothing when no rank can be stated", () => {
    expect(ndviSeasonalStandingClause(null, PRECISION)).toBe("");
    // Nine priors is one short of the baseline's ten-sample floor, so the rank
    // is refused rather than reported from a record too short to hold it.
    const short = standingFor(marchSeries(SPREAD.slice(0, 9), 0.52));
    expect(short?.status).toBe("insufficient-samples");
    expect(ndviSeasonalStandingClause(short, PRECISION)).toBe("");
  });

  it("states an ordinary month as a percentile with its provenance", () => {
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(SPREAD, 0.52)),
      PRECISION
    );
    expect(clause).toMatch(
      /^NDVI Mar 2013 at the 50th percentile of 12 prior same-month observations \(/
    );
    expect(clause).toContain("MOD13A3 vegetation index");
    expect(clause).toContain("not a measure of vegetation amount");
    // An ordinary month carries the rank alone: a margin to an extreme it never
    // reached would be a second number on the commonest case.
    expect(clause).not.toMatch(/above|below/);
  });

  it("words a new record as the record it is, with the margin it won by", () => {
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(SPREAD, 0.81)),
      PRECISION
    );
    expect(clause).toMatch(/greenest of 12 prior same-month observations/);
    // 0.81 − 0.74 (Mar 2012, the prior high) = 0.07.
    expect(clause).toMatch(/0\.070 NDVI above Mar 2012/);
    expect(clause).not.toMatch(/percentile of/);
  });

  it("words a new low the same way, naming the month that held it", () => {
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(SPREAD, 0.21)),
      PRECISION
    );
    expect(clause).toMatch(/least green of 12 prior same-month observations/);
    // 0.30 (Mar 2001, the prior low) − 0.21 = 0.09.
    expect(clause).toMatch(/0\.090 NDVI below Mar 2001/);
  });

  it("names the EARLIEST holder when the breached extreme was shared", () => {
    // Mar 2001 and Mar 2003 both sit at the record low; the target undercuts
    // both, and the earlier holder is the one named.
    const shared = [
      0.3, 0.5, 0.3, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74,
    ];
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(shared, 0.21)),
      PRECISION
    );
    expect(clause).toMatch(/0\.090 NDVI below Mar 2001/);
  });

  it("withholds the margin when the target only TIED the extreme", () => {
    // Nothing was breached, so there is no margin to state — but the rank still
    // says no sampled year was greener, which remains true.
    const tied = [...SPREAD.slice(0, 11), 0.74];
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(tied, 0.74)),
      PRECISION
    );
    expect(clause).toMatch(/greenest of 12 prior same-month observations/);
    expect(clause).not.toMatch(/NDVI (above|below)/);
  });

  it("reports a record with no spread at all as the tie it is", () => {
    const flat = new Array(12).fill(0.5) as number[];
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(flat, 0.5)),
      PRECISION
    );
    expect(clause).toMatch(/matches all 12 prior same-month observations/);
    expect(clause).not.toMatch(/greenest|least green/);
    expect(clause).not.toMatch(/NDVI (above|below)/);
  });

  it("withholds a margin the colormap inversion never resolved", () => {
    // Half a LUT step beyond the prior high: the record standing holds, its
    // size does not.
    const margin = quantizationStep(NDVI_SCALE) / 2;
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(SPREAD, 0.74 + margin)),
      PRECISION
    );
    expect(clause).toMatch(/greenest of 12 prior same-month observations/);
    expect(clause).not.toMatch(/NDVI (above|below)/);
  });

  it("withholds the margin when the caller supplies no precision", () => {
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(SPREAD, 0.81))
    );
    expect(clause).toMatch(/greenest of 12 prior same-month observations/);
    expect(clause).not.toMatch(/NDVI (above|below)/);
  });

  it("never reads a strictly interior month as a record standing", () => {
    // The rank the panel prints has to keep "nearly the least green March here"
    // distinct from "the least green March here": one prior year below the
    // target is still a prior year below it.
    const many = Array.from({ length: 24 }, (_, index) => 0.2 + index / 100);
    const clause = ndviSeasonalStandingClause(
      standingFor(marchSeries(many, 0.205)),
      PRECISION
    );
    expect(clause).toMatch(/at the 4th percentile of 24 prior same-month/);
    expect(clause).not.toMatch(/least green|greenest/);
  });
});

describe("probe scale agreement", () => {
  it("keeps the resolution floor comparable with the ranked values", () => {
    // The margin differences values the baseline retained unconverted, while
    // the floor is measured on the probe scale. The two are only comparable
    // while NDVI needs no conversion between them.
    expect(NDVI_SCALE.unit).toBe("");
    expect(NDVI_SCALE.calibrated).toBe(true);
    expect(NDVI_UNIT).toBe("NDVI (unitless)");
    expect(PRECISION.decimals).toBe(3);
  });
});
