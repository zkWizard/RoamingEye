import { describe, expect, it } from "vitest";
import {
  probeSstExtremeCensoring,
  sstExtremeBoundPrefix,
  sstExtremeCensoringClause,
  sstExtremeCensoringCsvHeaders,
} from "./probeSstExtremeCensoring";
import { SST_PUBLISHED_RAMP } from "./sstRampCensoring";
import { PROBE_SCALES } from "./probe";

/** An interior SST that no cap can claim. */
const INTERIOR = 18.4;
/** What the inversion returns for the ramp's open low cap. */
const FLOOR = 0.075;
/** What the inversion returns for the ramp's open high cap. */
const CEILING = 31.9;

describe("probeSstExtremeCensoring", () => {
  it("is inapplicable for every layer but SST", () => {
    for (const layerId of ["ndvi", "lst", "airtemp", "precip"] as const) {
      const censoring = probeSstExtremeCensoring(layerId, [FLOOR, CEILING]);
      expect(censoring.applicable).toBe(false);
      expect(censoring.minBound).toBeNull();
      expect(censoring.maxBound).toBeNull();
      expect(censoring.meanBound).toBeNull();
    }
  });

  it("is inapplicable when no month returned a usable value", () => {
    expect(probeSstExtremeCensoring("sst", []).applicable).toBe(false);
    expect(probeSstExtremeCensoring("sst", [null, null]).applicable).toBe(
      false
    );
    expect(probeSstExtremeCensoring("sst", [Number.NaN, null]).applicable).toBe(
      false
    );
  });

  it("leaves an interior record entirely unqualified", () => {
    const censoring = probeSstExtremeCensoring("sst", [17.2, INTERIOR, 21.9]);
    expect(censoring.applicable).toBe(true);
    expect(censoring.minBound).toBeNull();
    expect(censoring.maxBound).toBeNull();
    expect(censoring.meanBound).toBeNull();
    expect(censoring.floorMonthCount).toBe(0);
    expect(censoring.ceilingMonthCount).toBe(0);
    expect(sstExtremeCensoringClause(censoring)).toBeNull();
    expect(sstExtremeBoundPrefix(censoring, "min")).toBe("");
    expect(sstExtremeBoundPrefix(censoring, "mean")).toBe("");
    expect(sstExtremeBoundPrefix(censoring, "max")).toBe("");
  });

  it("reads a floor-bin minimum as an upper bound, and the mean with it", () => {
    const censoring = probeSstExtremeCensoring("sst", [FLOOR, 4.5, INTERIOR]);
    expect(censoring.minBound).toBe("upper");
    expect(censoring.maxBound).toBeNull();
    expect(censoring.meanBound).toBe("upper");
    expect(censoring.floorMonthCount).toBe(1);
    expect(censoring.observedMonthCount).toBe(3);
    expect(sstExtremeBoundPrefix(censoring, "min")).toBe("≤ ");
    expect(sstExtremeBoundPrefix(censoring, "mean")).toBe("≤ ");
    expect(sstExtremeBoundPrefix(censoring, "max")).toBe("");
    const clause = sstExtremeCensoringClause(censoring);
    expect(clause).toContain("1 of 3 sampled months");
    expect(clause).toContain("open low cap");
    expect(clause).toContain("upper bounds on possibly colder water");
    expect(clause).toContain(SST_PUBLISHED_RAMP.colormapDoc);
  });

  it("reads a ceiling-bin maximum as a lower bound, and the mean with it", () => {
    const censoring = probeSstExtremeCensoring("sst", [INTERIOR, CEILING]);
    expect(censoring.minBound).toBeNull();
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("lower");
    expect(censoring.ceilingMonthCount).toBe(1);
    expect(sstExtremeBoundPrefix(censoring, "mean")).toBe("≥ ");
    expect(sstExtremeBoundPrefix(censoring, "max")).toBe("≥ ");
    const clause = sstExtremeCensoringClause(censoring);
    expect(clause).toContain("open high cap");
    expect(clause).toContain("lower bounds on possibly warmer water");
  });

  // The clause claims "min and mean are upper bounds" / "max and mean are lower
  // bounds" in prose. A renderer that marks only the extremes contradicts the
  // sentence beside it and reports the mean — the number a reader carries away —
  // as the one two-sided estimate on the line. Pin the prefix to the direction
  // the clause asserts, for both one-sided caps.
  it("marks the mean in the same direction the clause claims for it", () => {
    for (const [values, prefix, claim] of [
      [[FLOOR, 4.5, INTERIOR], "≤ ", "upper bounds on possibly colder water"],
      [[INTERIOR, CEILING], "≥ ", "lower bounds on possibly warmer water"],
    ] as const) {
      const censoring = probeSstExtremeCensoring("sst", values);
      expect(sstExtremeCensoringClause(censoring)).toContain(claim);
      expect(sstExtremeCensoringClause(censoring)).toContain("mean");
      expect(sstExtremeBoundPrefix(censoring, "mean")).toBe(prefix);
    }
  });

  // The failure this guards against is a doubly censored record reading as an
  // ordinary one: both statistics are bounds, and the mean's two biases oppose,
  // so no direction may be claimed for it.
  it("withholds a mean direction when both caps are hit", () => {
    const censoring = probeSstExtremeCensoring("sst", [
      FLOOR,
      INTERIOR,
      CEILING,
      CEILING,
    ]);
    expect(censoring.minBound).toBe("upper");
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("indeterminate");
    expect(censoring.floorMonthCount).toBe(1);
    expect(censoring.ceilingMonthCount).toBe(2);
    const clause = sstExtremeCensoringClause(censoring);
    expect(clause).toContain("3 of 4 sampled months");
    expect(clause).toContain("open end caps");
    expect(clause).toContain("bounded in neither direction");
    expect(clause).not.toContain("little change");
    // No inequality is true of a doubly censored mean, so the prefix withholds
    // one rather than picking a direction the record cannot support — the two
    // marked extremes plus the clause carry the disclosure instead.
    expect(sstExtremeBoundPrefix(censoring, "mean")).toBe("");
    expect(sstExtremeBoundPrefix(censoring, "min")).toBe("≤ ");
    expect(sstExtremeBoundPrefix(censoring, "max")).toBe("≥ ");
  });

  // A polar record whose every usable month decodes into the floor bin has its
  // MAXIMUM censored too — the warmest month is as unresolved as the coldest —
  // and marking only the minimum printed the same number twice with an
  // inequality and once without, handing the reader the unmarked one as a
  // measurement. The warm-pool record is the mirror image.
  it("censors both extremes when every month sat in one cap", () => {
    const floorOnly = probeSstExtremeCensoring("sst", [FLOOR, 0.02, 0.14]);
    expect(floorOnly.floorMonthCount).toBe(3);
    expect(floorOnly.ceilingMonthCount).toBe(0);
    expect(floorOnly.minBound).toBe("upper");
    expect(floorOnly.maxBound).toBe("upper");
    expect(floorOnly.meanBound).toBe("upper");
    expect(sstExtremeBoundPrefix(floorOnly, "min")).toBe("≤ ");
    expect(sstExtremeBoundPrefix(floorOnly, "mean")).toBe("≤ ");
    expect(sstExtremeBoundPrefix(floorOnly, "max")).toBe("≤ ");
    // The sentence enumerates exactly the statistics the prefixes marked.
    expect(sstExtremeCensoringClause(floorOnly)).toContain(
      "min, mean and max are upper bounds on possibly colder water"
    );

    const ceilingOnly = probeSstExtremeCensoring("sst", [CEILING, 31.85]);
    expect(ceilingOnly.minBound).toBe("lower");
    expect(ceilingOnly.maxBound).toBe("lower");
    expect(ceilingOnly.meanBound).toBe("lower");
    expect(sstExtremeBoundPrefix(ceilingOnly, "min")).toBe("≥ ");
    expect(sstExtremeCensoringClause(ceilingOnly)).toContain(
      "min, mean and max are lower bounds on possibly warmer water"
    );
  });

  // The ordinary mixed record keeps the sentence it always had: only the
  // extreme on the capped side and the mean are bounds, and the far extreme
  // stays a two-sided estimate that must not be swept into the enumeration.
  it("names only the bounded statistics when one extreme stayed interior", () => {
    expect(
      sstExtremeCensoringClause(
        probeSstExtremeCensoring("sst", [FLOOR, 4.5, INTERIOR])
      )
    ).toContain("min and mean are upper bounds on possibly colder water");
    expect(
      sstExtremeCensoringClause(
        probeSstExtremeCensoring("sst", [INTERIOR, CEILING])
      )
    ).toContain("mean and max are lower bounds on possibly warmer water");
  });

  it("counts a single sampled month in the singular", () => {
    const clause = sstExtremeCensoringClause(
      probeSstExtremeCensoring("sst", [CEILING])
    );
    expect(clause).toContain("1 of 1 sampled month ");
  });

  it("ignores nulls and non-finite values when locating the extremes", () => {
    const censoring = probeSstExtremeCensoring("sst", [
      null,
      Number.NaN,
      INTERIOR,
      null,
      CEILING,
    ]);
    expect(censoring.observedMonthCount).toBe(2);
    expect(censoring.min?.observedValue).toBe(INTERIOR);
    expect(censoring.max?.observedValue).toBe(CEILING);
  });

  // The probe's scale maps gradient position 0 and 1 onto exactly these values,
  // so both ends of the chart are reachable in practice.
  it("censors the probe scale's own endpoints", () => {
    const censoring = probeSstExtremeCensoring("sst", [
      PROBE_SCALES.sst.min,
      PROBE_SCALES.sst.max,
    ]);
    expect(censoring.minBound).toBe("upper");
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("indeterminate");
  });

  // A bound that pointed the wrong way would invert the claim, so pin the
  // direction to the ramp's published geometry rather than to a literal.
  it("bounds each extreme in the direction its cap allows", () => {
    const floorOnly = probeSstExtremeCensoring("sst", [
      SST_PUBLISHED_RAMP.floorBin.lo,
      INTERIOR,
    ]);
    expect(floorOnly.min?.boundDirection).toBe("upper");
    const ceilingOnly = probeSstExtremeCensoring("sst", [
      INTERIOR,
      SST_PUBLISHED_RAMP.ceilingBin.lo,
    ]);
    expect(ceilingOnly.max?.boundDirection).toBe("lower");
  });
});

describe("sstExtremeCensoringCsvHeaders", () => {
  const headersFor = (values: readonly (number | null)[]): string[] =>
    sstExtremeCensoringCsvHeaders(probeSstExtremeCensoring("sst", values));

  // The export must stay byte-identical for every file that has nothing to
  // disclose, or this becomes noise on ten other layers.
  it("is silent for other layers and for a record inside the finite ramp", () => {
    expect(headersFor([INTERIOR, 21.2, 5.5])).toEqual([]);
    expect(
      sstExtremeCensoringCsvHeaders(
        probeSstExtremeCensoring("ndvi", [FLOOR, CEILING])
      )
    ).toEqual([]);
    expect(
      sstExtremeCensoringCsvHeaders(probeSstExtremeCensoring("sst", [null]))
    ).toEqual([]);
  });

  // The defect being fixed: a capped month's value cell is an ordinary decimal,
  // so the file must say those rows are bounds and how many there are.
  it("counts the capped months and names them as bounds not measurements", () => {
    const headers = headersFor([FLOOR, INTERIOR, CEILING, CEILING]);
    const tally = headers.find((line) =>
      line.startsWith("# sst_ramp_censoring:")
    );
    expect(tally).toContain("3 of 4 sampled months");
    expect(tally).toContain("1 at the ramp floor");
    expect(tally).toContain("2 at its ceiling");
    expect(tally).toContain("one-sided bounds and not measurements");
  });

  // The point of quoting bin edges rather than only a count: a reader must be
  // able to mark the affected rows from the value column alone.
  it("quotes the detection edges a reader can apply to the value column", () => {
    const rows = headersFor([FLOOR, INTERIOR])[1];
    expect(rows).toContain(SST_PUBLISHED_RAMP.floorBin.hi.toFixed(2));
    expect(rows).toContain(SST_PUBLISHED_RAMP.ceilingBin.lo.toFixed(2));
    // Both directions are stated even when only one cap was reached: the reader
    // is being handed a rule to apply, not a description of this file's rows.
    expect(rows).toContain("upper bound on possibly colder water");
    expect(rows).toContain("lower bound on possibly warmer water");
  });

  // Two header lines already in the file are wrong over these months. Leaving a
  // reader to infer that is the same defect one level up.
  it("corrects the two-sided uncertainty line and the derived statistics", () => {
    const headers = headersFor([CEILING, INTERIOR]);
    const uncertainty = headers.find((line) =>
      line.startsWith("# sst_ramp_censoring_uncertainty:")
    );
    expect(uncertainty).toContain("two-sided");
    expect(uncertainty).toContain("does not describe those months");
    const derived = headers.find((line) =>
      line.startsWith("# sst_ramp_censoring_derived:")
    );
    expect(derived).toContain("anomaly column");
    expect(derived).toContain("trend");
    // No direction is claimable for a seasonal median — permanently, per
    // probeSstTrendCensoring. A "≤"/"≥" here would be an unearned claim.
    expect(derived).toContain("no bias direction is claimed");
    expect(derived).not.toMatch(/[≤≥]/);
  });

  it("cites the colormap the caps were read from", () => {
    const source = headersFor([FLOOR])[4];
    expect(source).toContain(SST_PUBLISHED_RAMP.colormapDoc);
    expect(source).toMatch(/https:\/\//);
  });

  // Hard constraint of the CSV header format: a `#` line may never contain a
  // delimiter, a quote or a line break, or naive consumers tear it into cells.
  it("never emits a comma quote or line break in a header line", () => {
    for (const values of [
      [FLOOR, INTERIOR],
      [INTERIOR, CEILING],
      [FLOOR, CEILING],
      [PROBE_SCALES.sst.min, PROBE_SCALES.sst.max],
    ]) {
      for (const line of headersFor(values)) {
        expect(line.startsWith("# ")).toBe(true);
        expect(line).not.toMatch(/[",\r\n]/);
      }
    }
  });

  // Singular/plural on the denominator, which the tally interpolates.
  it("agrees in number for a single sampled month", () => {
    expect(headersFor([FLOOR])[0]).toContain("1 of 1 sampled month");
  });
});
