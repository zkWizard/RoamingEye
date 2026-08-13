import { describe, expect, it } from "vitest";
import {
  AEROSOL_PROBE_DECODE_CEILING,
  aerosolCeilingBoundPrefix,
  aerosolCeilingCensoringClause,
  probeAerosolCeilingCensoring,
} from "./probeAerosolCeilingCensoring";
import { AEROSOL_RENDERED_RAMP_MAX } from "./aerosolLoading";
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
  it("stays silent for another layer and for a clean record", () => {
    expect(
      aerosolCeilingCensoringClause(probeAerosolCeilingCensoring("sst", [0.9]))
    ).toBeNull();
    expect(
      aerosolCeilingCensoringClause(
        probeAerosolCeilingCensoring("aerosol", [0.1, 0.2])
      )
    ).toBeNull();
  });

  it("names the tally, the open cap, the affected statistics and the source", () => {
    const clause = aerosolCeilingCensoringClause(
      probeAerosolCeilingCensoring("aerosol", [0.1, 0.8975, 0.8975])
    );
    expect(clause).toBe(
      "2 of 3 sampled months rest on the aerosol colormap's open top bin " +
        "(every column AOD at or above 0.900 at 550 nm shares one colour), " +
        "so max and mean are lower bounds on possibly heavier columns and the " +
        "trend fitted over the same series inherits that censoring; min is " +
        "unaffected because the ramp's low end is closed at 0 (source " +
        "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly colormap)"
    );
  });

  it("keeps the tally singular for a one-month record", () => {
    const clause = aerosolCeilingCensoringClause(
      probeAerosolCeilingCensoring("aerosol", [0.8975])
    );
    expect(clause).toContain("1 of 1 sampled month rests on");
  });

  it("claims no air-quality, health or forecast meaning", () => {
    const clause =
      aerosolCeilingCensoringClause(
        probeAerosolCeilingCensoring("aerosol", [0.8975])
      ) ?? "";
    for (const forbidden of [
      "air quality",
      "health",
      "forecast",
      "unhealthy",
    ]) {
      expect(clause.toLowerCase()).not.toContain(forbidden);
    }
  });
});
