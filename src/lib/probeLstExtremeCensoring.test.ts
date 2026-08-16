import { describe, expect, it } from "vitest";
import {
  lstExtremeBoundPrefix,
  lstExtremeCensoringClause,
  lstExtremeCensoringCsvHeaders,
  probeLstExtremeCensoring,
} from "./probeLstExtremeCensoring";
import { LST_PUBLISHED_RAMP } from "./lstRampCensoring";
import { PROBE_SCALES } from "./probe";

/** An interior land-surface temperature that no cap can claim. */
const INTERIOR = 295.15;
/** What the inversion returns for the ramp's open low cap. */
const FLOOR = 200.3;
/** What the inversion returns for the ramp's open high cap. */
const CEILING = 349.7;

describe("probeLstExtremeCensoring", () => {
  it("is inapplicable for every layer but LST", () => {
    for (const layerId of ["ndvi", "sst", "airtemp", "precip"] as const) {
      const censoring = probeLstExtremeCensoring(layerId, [FLOOR, CEILING]);
      expect(censoring.applicable).toBe(false);
      expect(censoring.minBound).toBeNull();
      expect(censoring.maxBound).toBeNull();
      expect(censoring.meanBound).toBeNull();
      expect(lstExtremeCensoringClause(censoring)).toBeNull();
      expect(lstExtremeBoundPrefix(censoring, "min")).toBe("");
    }
  });

  it("is inapplicable when no month returned a usable value", () => {
    expect(probeLstExtremeCensoring("lst", []).applicable).toBe(false);
    expect(probeLstExtremeCensoring("lst", [null, null]).applicable).toBe(
      false
    );
    expect(probeLstExtremeCensoring("lst", [Number.NaN, null]).applicable).toBe(
      false
    );
  });

  it("leaves an interior record entirely unqualified", () => {
    const censoring = probeLstExtremeCensoring("lst", [
      280.4,
      INTERIOR,
      301.65,
    ]);
    expect(censoring.applicable).toBe(true);
    expect(censoring.minBound).toBeNull();
    expect(censoring.maxBound).toBeNull();
    expect(censoring.meanBound).toBeNull();
    expect(censoring.floorMonthCount).toBe(0);
    expect(censoring.ceilingMonthCount).toBe(0);
    expect(censoring.observedMonthCount).toBe(3);
    expect(lstExtremeCensoringClause(censoring)).toBeNull();
    expect(lstExtremeBoundPrefix(censoring, "min")).toBe("");
    expect(lstExtremeBoundPrefix(censoring, "mean")).toBe("");
    expect(lstExtremeBoundPrefix(censoring, "max")).toBe("");
  });

  it("ignores months that returned nothing", () => {
    const censoring = probeLstExtremeCensoring("lst", [
      null,
      FLOOR,
      null,
      INTERIOR,
    ]);
    expect(censoring.observedMonthCount).toBe(2);
    expect(censoring.floorMonthCount).toBe(1);
  });

  it("reads a floor-bin minimum as an upper bound, and the mean with it", () => {
    const censoring = probeLstExtremeCensoring("lst", [FLOOR, 245.8, INTERIOR]);
    expect(censoring.minBound).toBe("upper");
    expect(censoring.maxBound).toBeNull();
    expect(censoring.meanBound).toBe("upper");
    expect(censoring.floorMonthCount).toBe(1);
    expect(censoring.ceilingMonthCount).toBe(0);
    expect(censoring.observedMonthCount).toBe(3);
    expect(lstExtremeBoundPrefix(censoring, "min")).toBe("≤ ");
    expect(lstExtremeBoundPrefix(censoring, "mean")).toBe("≤ ");
    expect(lstExtremeBoundPrefix(censoring, "max")).toBe("");

    const clause = lstExtremeCensoringClause(censoring);
    // The capped count is the subject, so it governs the verb; the noun it
    // qualifies is pluralized by the denominator.
    expect(clause).toContain("1 of 3 sampled months lands in");
    expect(clause).toContain("open low cap");
    expect(clause).toContain("min and mean are upper bounds");
    expect(clause).toContain("possibly colder surface");
    expect(clause).toContain(LST_PUBLISHED_RAMP.colormapDoc);
  });

  it("reads a ceiling-bin maximum as a lower bound, and the mean with it", () => {
    const censoring = probeLstExtremeCensoring("lst", [INTERIOR, CEILING]);
    expect(censoring.minBound).toBeNull();
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("lower");
    expect(censoring.ceilingMonthCount).toBe(1);
    expect(lstExtremeBoundPrefix(censoring, "min")).toBe("");
    expect(lstExtremeBoundPrefix(censoring, "mean")).toBe("≥ ");
    expect(lstExtremeBoundPrefix(censoring, "max")).toBe("≥ ");

    const clause = lstExtremeCensoringClause(censoring);
    expect(clause).toContain("1 of 2 sampled months");
    expect(clause).toContain("open high cap");
    expect(clause).toContain("mean and max are lower bounds");
    expect(clause).toContain("possibly hotter surface");
  });

  it("leaves the mean unbounded when both caps are hit", () => {
    const censoring = probeLstExtremeCensoring("lst", [
      FLOOR,
      INTERIOR,
      CEILING,
    ]);
    expect(censoring.minBound).toBe("upper");
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("indeterminate");
    // An indeterminate mean gets NO inequality: the two biases oppose, and
    // rendering either one would assert a direction the imagery destroyed.
    expect(lstExtremeBoundPrefix(censoring, "mean")).toBe("");
    expect(lstExtremeBoundPrefix(censoring, "min")).toBe("≤ ");
    expect(lstExtremeBoundPrefix(censoring, "max")).toBe("≥ ");

    const clause = lstExtremeCensoringClause(censoring);
    expect(clause).toContain("open end caps");
    expect(clause).toContain("bounded in neither direction");
  });

  it("censors the minimum too when every month sat in one cap", () => {
    const censoring = probeLstExtremeCensoring("lst", [CEILING, 349.5]);
    expect(censoring.minBound).toBe("lower");
    expect(censoring.maxBound).toBe("lower");
    expect(censoring.meanBound).toBe("lower");
    expect(lstExtremeBoundPrefix(censoring, "min")).toBe("≥ ");
    // The sentence lists exactly the statistics the prefixes marked.
    expect(lstExtremeCensoringClause(censoring)).toContain(
      "min, mean and max are lower bounds"
    );
  });

  it("agrees with the single-month wording", () => {
    const clause = lstExtremeCensoringClause(
      probeLstExtremeCensoring("lst", [FLOOR])
    );
    expect(clause).toContain("1 of 1 sampled month lands in");
    expect(clause).not.toContain("sampled months");
    expect(clause).toContain("min, mean and max are upper bounds");
  });

  it("agrees the verb with the capped count, not the denominator", () => {
    const clause = lstExtremeCensoringClause(
      probeLstExtremeCensoring("lst", [FLOOR, 200.1, INTERIOR])
    );
    expect(clause).toContain("2 of 3 sampled months land in");
    expect(clause).not.toContain("months lands");
  });

  it("classifies the published bin edges themselves", () => {
    const floorEdge = probeLstExtremeCensoring("lst", [
      LST_PUBLISHED_RAMP.floorBin.hi,
    ]);
    expect(floorEdge.minBound).toBe("upper");
    const ceilingEdge = probeLstExtremeCensoring("lst", [
      LST_PUBLISHED_RAMP.ceilingBin.lo,
    ]);
    expect(ceilingEdge.maxBound).toBe("lower");
    // Just inside the finite ramp on either side stays a measurement.
    expect(
      probeLstExtremeCensoring("lst", [LST_PUBLISHED_RAMP.floorBin.hi + 0.1])
        .minBound
    ).toBeNull();
    expect(
      probeLstExtremeCensoring("lst", [LST_PUBLISHED_RAMP.ceilingBin.lo - 0.1])
        .maxBound
    ).toBeNull();
  });

  it("judges against the same ramp the probe inverts onto", () => {
    expect(LST_PUBLISHED_RAMP.floorBin.lo).toBe(PROBE_SCALES.lst.min);
    expect(LST_PUBLISHED_RAMP.ceilingBin.hi).toBe(PROBE_SCALES.lst.max);
    expect(LST_PUBLISHED_RAMP.unit).toBe(PROBE_SCALES.lst.unit);
  });

  it("claims nothing beyond the colour ramp", () => {
    const clause =
      lstExtremeCensoringClause(
        probeLstExtremeCensoring("lst", [FLOOR, CEILING])
      ) ?? "";
    expect(clause).not.toMatch(/air temperature|heat wave|hazard|health/i);
    expect(clause).not.toMatch(/forecast|will |expected to/i);
    // It names a bound, never a recovered value behind the cap.
    expect(clause).not.toMatch(/actually|true value|really/i);
  });

  it("carries the marker fields the export and panel screen on", () => {
    const censoring = probeLstExtremeCensoring("lst", [CEILING]);
    expect(censoring.kind).toBe(
      "probe-land-surface-temperature-extreme-censoring"
    );
    expect(censoring.airTemperatureObservation).toBe(false);
    expect(censoring.isForecast).toBe(false);
  });
});

describe("lstExtremeCensoringCsvHeaders", () => {
  it("stays silent for every layer but LST and every uncensored record", () => {
    expect(
      lstExtremeCensoringCsvHeaders(
        probeLstExtremeCensoring("sst", [FLOOR, CEILING])
      )
    ).toEqual([]);
    expect(
      lstExtremeCensoringCsvHeaders(probeLstExtremeCensoring("lst", []))
    ).toEqual([]);
    // An ordinary mid-latitude record leaves the file byte-identical.
    expect(
      lstExtremeCensoringCsvHeaders(
        probeLstExtremeCensoring("lst", [INTERIOR, 280.4, null])
      )
    ).toEqual([]);
  });

  it("never emits a comma — a `#` line must not carry the CSV delimiter", () => {
    for (const values of [
      [FLOOR, INTERIOR],
      [INTERIOR, CEILING],
      [FLOOR, CEILING],
      [CEILING],
    ]) {
      for (const line of lstExtremeCensoringCsvHeaders(
        probeLstExtremeCensoring("lst", values)
      )) {
        expect(line).not.toContain(",");
        expect(line.startsWith("# lst_ramp_censoring")).toBe(true);
      }
    }
  });

  it("counts the capped months on each side and pluralizes the denominator", () => {
    const [summary] = lstExtremeCensoringCsvHeaders(
      probeLstExtremeCensoring("lst", [FLOOR, 245.8, INTERIOR])
    );
    expect(summary).toContain("1 of 3 sampled months");
    expect(summary).toContain("(1 at the ramp floor; 0 at its ceiling)");
    expect(summary).toContain("one-sided bounds and not measurements");

    const [single] = lstExtremeCensoringCsvHeaders(
      probeLstExtremeCensoring("lst", [CEILING])
    );
    expect(single).toContain("1 of 1 sampled month ");
    expect(single).toContain("(0 at the ramp floor; 1 at its ceiling)");
  });

  it("states the row rule inclusively on both sides, matching the classifier", () => {
    const [, rows] = lstExtremeCensoringCsvHeaders(
      probeLstExtremeCensoring("lst", [FLOOR, CEILING])
    );
    // The published detection edges, quoted so a reader can mark the rows
    // without the app — and inclusive exactly as `lstRampBoundDirection` is.
    expect(rows).toContain(
      `at or below ${LST_PUBLISHED_RAMP.floorBin.hi.toFixed(2)} K`
    );
    expect(rows).toContain(
      `at or above ${LST_PUBLISHED_RAMP.ceilingBin.lo.toFixed(2)} K`
    );
    // The caps themselves are distinct from the bins that detect them.
    expect(rows).toContain(
      `below ${LST_PUBLISHED_RAMP.floorBin.lo.toFixed(1)} K shares one colour`
    );
    expect(rows).toContain(
      `at or above ${LST_PUBLISHED_RAMP.ceilingBin.hi.toFixed(1)} K shares one colour`
    );
  });

  it("reads the mean sentence off the computed bound so it cannot contradict the panel", () => {
    const derivedFor = (values: (number | null)[]) => {
      const censoring = probeLstExtremeCensoring("lst", values);
      const line = lstExtremeCensoringCsvHeaders(censoring)[3];
      return { censoring, line };
    };

    const floorOnly = derivedFor([FLOOR, INTERIOR]);
    expect(floorOnly.censoring.meanBound).toBe("upper");
    expect(lstExtremeBoundPrefix(floorOnly.censoring, "mean")).toBe("≤ ");
    expect(floorOnly.line).toContain("mean taken over these rows is an upper");

    const ceilingOnly = derivedFor([INTERIOR, CEILING]);
    expect(ceilingOnly.censoring.meanBound).toBe("lower");
    expect(lstExtremeBoundPrefix(ceilingOnly.censoring, "mean")).toBe("≥ ");
    expect(ceilingOnly.line).toContain("mean taken over these rows is a lower");

    // Both caps: the biases oppose, so no bound — and the panel renders no
    // prefix either. Silence must not be readable as an unbiased mean.
    const both = derivedFor([FLOOR, CEILING]);
    expect(both.censoring.meanBound).toBe("indeterminate");
    expect(lstExtremeBoundPrefix(both.censoring, "mean")).toBe("");
    expect(both.line).toContain("bounded in neither direction");
    expect(both.line).toContain("not the same as an unbiased mean");
  });

  it("corrects the two header lines above that the caps falsify", () => {
    const lines = lstExtremeCensoringCsvHeaders(
      probeLstExtremeCensoring("lst", [FLOOR, INTERIOR])
    );
    expect(lines).toHaveLength(5);
    expect(lines[2]).toContain("two-sided");
    expect(lines[2]).toContain("uncertainty line above");
    expect(lines[3]).toContain("anomaly column");
    // A slope is not given a direction: a resolved cap can tilt it either way.
    expect(lines[3]).toContain("no direction is claimed for the trend");
  });

  it("cites the published colormap it judged against", () => {
    const source = lstExtremeCensoringCsvHeaders(
      probeLstExtremeCensoring("lst", [CEILING])
    )[4];
    expect(source).toContain(LST_PUBLISHED_RAMP.colormapDoc);
    expect(source).toMatch(/https?:\/\//);
  });

  it("claims nothing beyond the colour ramp", () => {
    const text = lstExtremeCensoringCsvHeaders(
      probeLstExtremeCensoring("lst", [FLOOR, CEILING])
    ).join(" ");
    expect(text).not.toMatch(/heat wave|hazard|health|ecosystem|drought/i);
    expect(text).not.toMatch(/forecast|will |expected to/i);
    expect(text).not.toMatch(/actually|true value|really/i);
    // The skin-versus-air offset is disclosed once already, by
    // `lstSamplingIdentityCsvHeaders`, a few lines up in the same file.
    expect(text).not.toMatch(/air temperature|2 m/i);
  });
});
