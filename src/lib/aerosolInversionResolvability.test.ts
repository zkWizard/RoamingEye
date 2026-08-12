import { describe, expect, it } from "vitest";
import {
  AEROSOL_LOADING_BANDS,
  AEROSOL_LOADING_CHANGE_THRESHOLD,
  AEROSOL_SOURCE,
  AEROSOL_TIER_EDGE_MARGIN,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  describeAerosolLoading,
} from "./aerosolLoading";
import {
  AEROSOL_RESOLVABILITY_LIMITATIONS,
  describeAerosolChangeResolvability,
  describeAerosolTierResolvability,
} from "./aerosolInversionResolvability";
import { MEASURED_INVERSION } from "./validation";

/** The published end-to-end inversion RMSE this module reads at runtime. */
const RMSE = MEASURED_INVERSION.aerosol.rmse as number;

describe("describeAerosolTierResolvability", () => {
  it("reads the measured inversion RMSE rather than carrying its own copy", () => {
    const resolvability = describeAerosolTierResolvability(0.85);
    expect(resolvability?.inversionRmse).toBe(RMSE);
    // AOD is dimensionless, so no scale conversion may be applied to the figure.
    expect(MEASURED_INVERSION.aerosol.rmse).not.toBeNull();
  });

  it("bounds a value by +/- the inversion RMSE and keeps the reported tier", () => {
    const resolvability = describeAerosolTierResolvability(0.45);
    expect(resolvability).not.toBeNull();
    expect(resolvability?.category).toBe("moderate");
    expect(resolvability?.category).toBe(
      describeAerosolLoading(0.45)?.category
    );
    expect(resolvability?.lower).toBeCloseTo(0.45 - RMSE, 10);
    expect(resolvability?.upper).toBeCloseTo(0.45 + RMSE, 10);
    expect(resolvability?.observedValue).toBe(0.45);
  });

  it("marks a tier unresolved when the error band spans a tier boundary", () => {
    // 0.45 sits in `moderate` [0.2, 0.5) but +RMSE reaches into `high`.
    const resolvability = describeAerosolTierResolvability(0.45);
    expect(resolvability?.resolution).toBe("unresolved");
    expect(resolvability?.consistentCategories).toEqual(["moderate", "high"]);
    expect(resolvability?.statement).toContain("not resolved");
  });

  it("marks a tier resolved when the whole error band stays inside one tier", () => {
    // 0.85 +/- 0.13 stays within `high` [0.5, 1.0).
    const resolvability = describeAerosolTierResolvability(0.85);
    expect(resolvability?.resolution).toBe("resolved");
    expect(resolvability?.consistentCategories).toEqual(["high"]);
    expect(resolvability?.statement).toContain("the only tier consistent");
  });

  it("lists every tier the band touches, not just the two nearest", () => {
    // 0.15 +/- 0.13 spans 0.02-0.28: `very-low`, `low` and `moderate` all fit.
    const resolvability = describeAerosolTierResolvability(0.15);
    expect(resolvability?.consistentCategories).toEqual([
      "very-low",
      "low",
      "moderate",
    ]);
    expect(resolvability?.resolution).toBe("unresolved");
  });

  it("always includes the reported tier among the consistent ones", () => {
    for (const value of [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 0.9, 1.4]) {
      const resolvability = describeAerosolTierResolvability(value);
      expect(resolvability?.consistentCategories).toContain(
        describeAerosolLoading(value)?.category
      );
    }
  });

  it("floors the lower edge at zero because AOD cannot be negative", () => {
    const resolvability = describeAerosolTierResolvability(0.02);
    expect(resolvability?.lower).toBe(0);
    expect(resolvability?.upper).toBeCloseTo(0.02 + RMSE, 10);
  });

  it("does not cap the upper edge at the rendered ramp top", () => {
    // The ramp bounds what can be *rendered*, not what the column can truly be.
    const resolvability = describeAerosolTierResolvability(0.9);
    expect(resolvability?.upper).toBeCloseTo(0.9 + RMSE, 10);
    expect(resolvability?.upper as number).toBeGreaterThan(0.9);
  });

  it("returns null for values that are not usable optical thickness", () => {
    expect(describeAerosolTierResolvability(null)).toBeNull();
    expect(describeAerosolTierResolvability(-0.1)).toBeNull();
    expect(describeAerosolTierResolvability(Number.NaN)).toBeNull();
    expect(
      describeAerosolTierResolvability(Number.POSITIVE_INFINITY)
    ).toBeNull();
  });

  it("carries the cited MERRA-2 source, wavelength and unit", () => {
    const resolvability = describeAerosolTierResolvability(0.3);
    expect(resolvability?.source).toEqual(AEROSOL_SOURCE);
    expect(resolvability?.wavelengthNm).toBe(AEROSOL_WAVELENGTH_NM);
    expect(resolvability?.unit).toBe(AEROSOL_UNIT);
    expect(resolvability?.statement).toContain(AEROSOL_SOURCE.shortName);
    expect(resolvability?.isForecast).toBe(false);
    expect(resolvability?.limitations).toBe(AEROSOL_RESOLVABILITY_LIMITATIONS);
  });
});

describe("aerosol tier widths against the measured inversion error", () => {
  it("shows the two cleanest tiers are narrower than the inversion RMSE", () => {
    // This is the finding the module exists to surface: `very-low` and `low` are
    // each 0.1 wide against a measured 0.13 RMSE, so no value can ever be
    // uniquely binned into them by this pipeline.
    for (const category of ["very-low", "low"] as const) {
      const band = AEROSOL_LOADING_BANDS.find((b) => b.category === category);
      const width =
        (band?.maxExclusive as number) - (band?.minInclusive as number);
      expect(width).toBeLessThanOrEqual(RMSE);
    }

    // Sweep the whole band: no value anywhere in either tier resolves.
    for (let value = 0; value < 0.2; value += 0.005) {
      const resolvability = describeAerosolTierResolvability(value);
      expect(resolvability?.resolution).toBe("unresolved");
    }
  });

  it("shows the tier-edge margin is far finer than the inversion error", () => {
    // `marginal` flags a value within 0.02 of a boundary as edge-adjacent, but
    // the measured retrieval error is several times that, so a value the margin
    // calls robust can still be unresolved.
    expect(AEROSOL_TIER_EDGE_MARGIN).toBeLessThan(RMSE);
    const wellClearOfTheMargin = 0.45; // 0.05 from the 0.5 boundary, > margin
    expect(Math.abs(wellClearOfTheMargin - 0.5)).toBeGreaterThan(
      AEROSOL_TIER_EDGE_MARGIN
    );
    expect(
      describeAerosolTierResolvability(wellClearOfTheMargin)?.resolution
    ).toBe("unresolved");
  });
});

describe("describeAerosolChangeResolvability", () => {
  const FLOOR = Math.SQRT2 * RMSE;

  it("derives a conservative independent-error difference floor", () => {
    const change = describeAerosolChangeResolvability(0.3);
    expect(change?.differenceFloor).toBeCloseTo(FLOOR, 10);
    expect(change?.inversionRmse).toBe(RMSE);
  });

  it("resolves a change larger than the difference floor", () => {
    const change = describeAerosolChangeResolvability(FLOOR + 0.01);
    expect(change?.resolution).toBe("resolved");
    expect(change?.statement).toContain("distinguishable from");
  });

  it("leaves a change inside the floor unresolved without denying it", () => {
    const change = describeAerosolChangeResolvability(0.05);
    expect(change?.resolution).toBe("unresolved");
    expect(change?.statement).toContain("cannot separate it");
    // Never assert the change was absent — only that it is indistinguishable.
    expect(change?.statement).toContain(
      "does not assert that column loading was unchanged"
    );
  });

  it("treats the floor itself as unresolved", () => {
    expect(describeAerosolChangeResolvability(FLOOR)?.resolution).toBe(
      "unresolved"
    );
  });

  it("judges a decrease on magnitude alone, keeping the sign intact", () => {
    const change = describeAerosolChangeResolvability(-(FLOOR + 0.01));
    expect(change?.resolution).toBe("resolved");
    expect(change?.changeValue).toBeCloseTo(-(FLOOR + 0.01), 10);
    expect(change?.statement).toContain("-");
  });

  it("shows the loading-change threshold sits far below the noise floor", () => {
    // A change is called increasing/decreasing at 0.02, but a difference of two
    // inverted values carries a much larger conservative error, so a
    // just-over-threshold trend is not separable from inversion noise.
    expect(AEROSOL_LOADING_CHANGE_THRESHOLD).toBeLessThan(FLOOR);
    const justOverThreshold = AEROSOL_LOADING_CHANGE_THRESHOLD + 0.001;
    expect(
      describeAerosolChangeResolvability(justOverThreshold)?.resolution
    ).toBe("unresolved");
  });

  it("returns null when no finite difference was supplied", () => {
    expect(describeAerosolChangeResolvability(null)).toBeNull();
    expect(describeAerosolChangeResolvability(Number.NaN)).toBeNull();
    expect(
      describeAerosolChangeResolvability(Number.NEGATIVE_INFINITY)
    ).toBeNull();
  });

  it("resolves a zero change as unresolved rather than as stability", () => {
    const change = describeAerosolChangeResolvability(0);
    expect(change?.resolution).toBe("unresolved");
    expect(change?.changeValue).toBe(0);
  });

  it("carries the cited MERRA-2 source, wavelength and unit", () => {
    const change = describeAerosolChangeResolvability(0.3);
    expect(change?.source).toEqual(AEROSOL_SOURCE);
    expect(change?.wavelengthNm).toBe(AEROSOL_WAVELENGTH_NM);
    expect(change?.unit).toBe(AEROSOL_UNIT);
    expect(change?.isForecast).toBe(false);
    expect(change?.statement).toContain(AEROSOL_SOURCE.shortName);
    expect(change?.limitations).toBe(AEROSOL_RESOLVABILITY_LIMITATIONS);
  });
});
