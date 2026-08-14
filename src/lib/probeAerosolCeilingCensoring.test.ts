import { describe, expect, it } from "vitest";
import {
  AEROSOL_PROBE_DECODE_CEILING,
  aerosolCeilingBoundPrefix,
  aerosolCeilingCensoringClause,
  aerosolCeilingCensoringCsvHeaders,
  probeAerosolCeilingCensoring,
  PROBE_AEROSOL_CEILING_CENSORING_LIMITATIONS,
} from "./probeAerosolCeilingCensoring";
import { AEROSOL_RENDERED_RAMP_MAX } from "./aerosolLoading";
import { COLORMAP_DOCS, colormapUrl } from "./colormap";
import { PROBE_SCALES, quantizationStep } from "./probe";

describe("AEROSOL_PROBE_DECODE_CEILING", () => {
  it("sits one quantization step below the rendered ramp maximum", () => {
    expect(AEROSOL_PROBE_DECODE_CEILING).toBeCloseTo(
      AEROSOL_RENDERED_RAMP_MAX - quantizationStep(PROBE_SCALES.aerosol),
      12
    );
  });

  it("is reachable by the inversion, unlike the open cap itself", () => {
    // parseColormapEntries drops the `>= 0.900` bin, so the topmost decodable
    // value is 0.8975. A test against 0.9 would never fire.
    expect(AEROSOL_PROBE_DECODE_CEILING).toBeLessThan(0.8975);
    expect(AEROSOL_PROBE_DECODE_CEILING).toBeGreaterThan(0.89);
  });
});

describe("probeAerosolCeilingCensoring", () => {
  it("is inapplicable for every other layer", () => {
    const result = probeAerosolCeilingCensoring("sst", [0.9, 0.9]);
    expect(result.applicable).toBe(false);
    expect(result.maxBound).toBeNull();
    expect(result.meanBound).toBeNull();
  });

  it("is inapplicable when no layer is known", () => {
    expect(probeAerosolCeilingCensoring(undefined, [0.95]).applicable).toBe(
      false
    );
  });

  it("is inapplicable when the series carries no usable value", () => {
    const result = probeAerosolCeilingCensoring("aerosol", [null, null]);
    expect(result.applicable).toBe(false);
    expect(result.observedMonthCount).toBe(0);
  });

  it("leaves an ordinary clean-column record uncensored", () => {
    const result = probeAerosolCeilingCensoring("aerosol", [0.05, 0.2, 0.41]);
    expect(result.applicable).toBe(true);
    expect(result.ceilingMonthCount).toBe(0);
    expect(result.observedMonthCount).toBe(3);
    expect(result.maxBound).toBeNull();
    expect(result.meanBound).toBeNull();
  });

  it("bounds max and mean from below once a month rests on the top bin", () => {
    const result = probeAerosolCeilingCensoring("aerosol", [
      0.12,
      null,
      0.8975,
      0.44,
    ]);
    expect(result.ceilingMonthCount).toBe(1);
    expect(result.observedMonthCount).toBe(3);
    expect(result.maxBound).toBe("lower");
    expect(result.meanBound).toBe("lower");
  });

  it("counts every capped month, not just the maximum", () => {
    const result = probeAerosolCeilingCensoring(
      "aerosol",
      [0.8975, 0.8975, 0.3]
    );
    expect(result.ceilingMonthCount).toBe(2);
    expect(result.observedMonthCount).toBe(3);
  });

  it("ignores non-finite values rather than counting them as observed", () => {
    const result = probeAerosolCeilingCensoring("aerosol", [
      Number.NaN,
      0.8975,
    ]);
    expect(result.observedMonthCount).toBe(1);
    expect(result.ceilingMonthCount).toBe(1);
  });

  it("treats a value exactly on the decode ceiling as capped", () => {
    const result = probeAerosolCeilingCensoring("aerosol", [
      AEROSOL_PROBE_DECODE_CEILING,
    ]);
    expect(result.ceilingMonthCount).toBe(1);
    expect(result.maxBound).toBe("lower");
  });

  it("keeps its cited source and refuses air-quality or forecast readings", () => {
    const result = probeAerosolCeilingCensoring("aerosol", [0.8975]);
    expect(result.isForecast).toBe(false);
    expect(result.airQualityObservation).toBe(false);
    expect(result.source.title.length).toBeGreaterThan(0);
  });
});

describe("PROBE_AEROSOL_CEILING_CENSORING_LIMITATIONS", () => {
  it("keeps the mean's direction and the trend's refusal on the record", () => {
    const text = PROBE_AEROSOL_CEILING_CENSORING_LIMITATIONS.join(" ");
    expect(text).toContain("understates the true mean");
    expect(text).toMatch(/no direction is claimed for it/);
    expect(text).toContain("within-season pairs");
  });
});

describe("aerosolCeilingBoundPrefix", () => {
  const censored = probeAerosolCeilingCensoring("aerosol", [0.2, 0.8975]);
  const clean = probeAerosolCeilingCensoring("aerosol", [0.2, 0.4]);

  it("marks max and mean but never min", () => {
    expect(aerosolCeilingBoundPrefix(censored, "max")).toBe("≥ ");
    expect(aerosolCeilingBoundPrefix(censored, "mean")).toBe("≥ ");
    expect(aerosolCeilingBoundPrefix(censored, "min")).toBe("");
  });

  it("adds nothing to an uncensored record", () => {
    for (const statistic of ["min", "mean", "max"] as const) {
      expect(aerosolCeilingBoundPrefix(clean, statistic)).toBe("");
    }
  });

  it("adds nothing for another layer", () => {
    const other = probeAerosolCeilingCensoring("sst", [0.8975]);
    expect(aerosolCeilingBoundPrefix(other, "max")).toBe("");
  });
});

describe("aerosolCeilingCensoringClause", () => {
  // The status line only ever prints a trend it could fit; `testable` is the
  // flag trendClause itself switches on between a slope and "insufficient
  // record", so the clause is exercised on both sides of it.
  const fitted = { testable: true };
  const tooShort = { testable: false };

  it("stays silent for another layer and for a clean record", () => {
    expect(
      aerosolCeilingCensoringClause(
        probeAerosolCeilingCensoring("sst", [0.9]),
        fitted
      )
    ).toBeNull();
    expect(
      aerosolCeilingCensoringClause(
        probeAerosolCeilingCensoring("aerosol", [0.1, 0.2]),
        fitted
      )
    ).toBeNull();
  });

  it("names the tally, the open cap, the affected statistics and the source", () => {
    const clause = aerosolCeilingCensoringClause(
      probeAerosolCeilingCensoring("aerosol", [0.1, 0.8975, 0.8975]),
      fitted
    );
    expect(clause).toBe(
      "2 of 3 sampled months rest on the aerosol colormap's open top bin " +
        "(every column AOD at or above 0.900 at 550 nm shares one colour), " +
        "so max and mean are lower bounds on possibly heavier columns and the " +
        "trend fitted over the same series inherits that censoring but not its " +
        "direction, because a substituted cap moves a seasonal median whichever " +
        "way the record's shape decides; min is unaffected because the ramp's " +
        "low end is closed at 0 (source " +
        "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly colormap)"
    );
  });

  it("bounds the mean but refuses to sign the trend it names", () => {
    const clause =
      aerosolCeilingCensoringClause(
        probeAerosolCeilingCensoring("aerosol", [0.2, 0.8975]),
        fitted
      ) ?? "";
    // The mean keeps its direction — one open cap can only bias it downward.
    expect(clause).toContain("max and mean are lower bounds");
    // The trend must not inherit it. Sen's slope is a median of within-season
    // pairwise slopes and a capped month is the earlier member of some pairs
    // and the later member of others (Helsel 2012, section 11), so the clause
    // may not leave a signed slope standing.
    expect(clause).toContain("inherits that censoring but not its direction");
    expect(clause).not.toMatch(/trend[^;]*\b(lower|upper) bound/);
  });

  it("omits the trend entirely when the record was too short to fit one", () => {
    // trendClause prints "trend: insufficient record" here, so there is no
    // numeric claim to qualify — naming a censored trend would invent one.
    const clause =
      aerosolCeilingCensoringClause(
        probeAerosolCeilingCensoring("aerosol", [0.2, 0.8975]),
        tooShort
      ) ?? "";
    expect(clause).not.toContain("trend");
    // The statistics that were reported still carry their bounds.
    expect(clause).toContain("max and mean are lower bounds");
    expect(clause).toContain("min is unaffected");
    expect(clause).toContain(COLORMAP_DOCS.aerosol);
  });

  it("keeps the tally singular for a one-month record", () => {
    const clause = aerosolCeilingCensoringClause(
      probeAerosolCeilingCensoring("aerosol", [0.8975]),
      fitted
    );
    expect(clause).toContain("1 of 1 sampled month rests on");
  });

  it("claims no air-quality, health or forecast meaning", () => {
    for (const trend of [fitted, tooShort]) {
      const clause =
        aerosolCeilingCensoringClause(
          probeAerosolCeilingCensoring("aerosol", [0.8975]),
          trend
        ) ?? "";
      for (const forbidden of [
        "air quality",
        "health",
        "forecast",
        "unhealthy",
      ]) {
        expect(clause.toLowerCase()).not.toContain(forbidden);
      }
    }
  });
});

describe("aerosolCeilingCensoringCsvHeaders", () => {
  it("writes nothing for a non-aerosol layer or an empty record", () => {
    expect(
      aerosolCeilingCensoringCsvHeaders(
        probeAerosolCeilingCensoring("sst", [0.95, 0.95])
      )
    ).toEqual([]);
    expect(
      aerosolCeilingCensoringCsvHeaders(
        probeAerosolCeilingCensoring("aerosol", [null, null])
      )
    ).toEqual([]);
  });

  it("stays silent for a record that never reached the cap", () => {
    // The ordinary clean-column export must remain byte-identical.
    expect(
      aerosolCeilingCensoringCsvHeaders(
        probeAerosolCeilingCensoring("aerosol", [0.12, 0.31, 0.08])
      )
    ).toEqual([]);
  });

  it("tallies the capped months against the observed ones", () => {
    const [scope] = aerosolCeilingCensoringCsvHeaders(
      probeAerosolCeilingCensoring("aerosol", [
        0.12,
        null,
        AEROSOL_PROBE_DECODE_CEILING,
        0.9,
      ])
    );
    expect(scope).toContain("2 of 3 sampled months");
    expect(scope).toContain("lower bounds and not measurements");
  });

  it("agrees in singular for a one-month record", () => {
    const [scope] = aerosolCeilingCensoringCsvHeaders(
      probeAerosolCeilingCensoring("aerosol", [AEROSOL_PROBE_DECODE_CEILING])
    );
    expect(scope).toContain("1 of 1 sampled month ");
  });

  it("states a bin rule the reader can apply to the value column", () => {
    const [, rows] = aerosolCeilingCensoringCsvHeaders(
      probeAerosolCeilingCensoring("aerosol", [AEROSOL_PROBE_DECODE_CEILING])
    );
    // The decode ceiling, not the rendered 0.9 cap: parseColormapEntries drops
    // the open bin, so no exported value can ever reach 0.9.
    expect(rows).toContain(AEROSOL_PROBE_DECODE_CEILING.toFixed(4));
    expect(rows).toContain(AEROSOL_RENDERED_RAMP_MAX.toFixed(3));
    expect(rows).toContain("550 nm");
  });

  it("marks one arm only, because the ramp's low end is closed at 0", () => {
    const headers = aerosolCeilingCensoringCsvHeaders(
      probeAerosolCeilingCensoring("aerosol", [AEROSOL_PROBE_DECODE_CEILING])
    );
    const [, rows] = headers;
    expect(rows).toContain("closed at 0");
    // No upper-bound language anywhere: only the top of this ramp censors.
    for (const line of headers) {
      expect(line).not.toContain("upper bound");
    }
  });

  it("bounds a mean over the rows but claims no direction for the trend", () => {
    const derived = aerosolCeilingCensoringCsvHeaders(
      probeAerosolCeilingCensoring("aerosol", [
        0.2,
        AEROSOL_PROBE_DECODE_CEILING,
      ])
    ).find((line) => line.startsWith("# aerosol_ramp_censoring_derived:"));
    expect(derived).toBeDefined();
    expect(derived).toContain("lower bound");
    expect(derived).toContain("no direction is claimed for the trend");
  });

  it("cites the published colormap it read the cap from", () => {
    const source = aerosolCeilingCensoringCsvHeaders(
      probeAerosolCeilingCensoring("aerosol", [AEROSOL_PROBE_DECODE_CEILING])
    ).at(-1);
    expect(source).toContain(COLORMAP_DOCS.aerosol);
    expect(source).toContain(colormapUrl(COLORMAP_DOCS.aerosol));
  });

  it("keeps every line a single comma-free CSV comment", () => {
    for (const line of aerosolCeilingCensoringCsvHeaders(
      probeAerosolCeilingCensoring("aerosol", [
        0.2,
        AEROSOL_PROBE_DECODE_CEILING,
      ])
    )) {
      expect(line.startsWith("# ")).toBe(true);
      expect(line).not.toContain(",");
      expect(line).not.toContain("\n");
      expect(line).not.toContain('"');
    }
  });

  it("claims no air-quality, health or forecast meaning", () => {
    for (const line of aerosolCeilingCensoringCsvHeaders(
      probeAerosolCeilingCensoring("aerosol", [
        0.2,
        AEROSOL_PROBE_DECODE_CEILING,
      ])
    )) {
      for (const forbidden of [
        "air quality",
        "health",
        "forecast",
        "exposure",
      ]) {
        expect(line.toLowerCase()).not.toContain(forbidden);
      }
    }
  });
});
