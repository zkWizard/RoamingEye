import { describe, expect, it } from "vitest";
import {
  censoredDrawnShare,
  classifySstSample,
  MEASURED_SST_ALPHA_SEPARABILITY,
  SST_ALPHA_SEPARABILITY_LIMITATIONS,
  SST_ALPHA_SEPARABILITY_SOURCE,
  type SstSeparabilityScene,
} from "./sstAlphaSeparability";
import { NO_DATA_DISTANCE } from "./probe";
import { LAYERS } from "./timeline";

/**
 * The cold end of GIBS's SST ramp, sampled from the live PNG render used in
 * MEASURED_SST_ALPHA_SEPARABILITY. Both sit inside NO_DATA_DISTANCE of black,
 * which is the whole point: they are real retrievals a colour test rejects.
 */
const COLD_RETRIEVAL = { r: 43, g: 0, b: 26 }; // 50.2 from black
const COLDEST_DRAWN = { r: 45, g: 0, b: 28 }; // 53.0 from black
const WARM_RETRIEVAL = { r: 214, g: 40, b: 30 };
const UNDRAWN = { r: 0, g: 0, b: 0 };

describe("provenance", () => {
  it("cites the rendered SST layer and retains its dataset ref", () => {
    expect(SST_ALPHA_SEPARABILITY_SOURCE.wmsLayer).toBe(LAYERS.sst.wmsLayer);
    expect(SST_ALPHA_SEPARABILITY_SOURCE.source).toBe(LAYERS.sst.dataset);
    expect(SST_ALPHA_SEPARABILITY_SOURCE.source.doi).toBeTruthy();
  });

  it("never presents coverage as a biological or predictive claim", () => {
    const result = classifySstSample(
      { ...WARM_RETRIEVAL, alpha: 255 },
      "alpha-carrying"
    );
    expect(result.marineBiologyObservation).toBe(false);
    expect(result.isForecast).toBe(false);
  });
});

describe("alpha-carrying transport", () => {
  it("reads a transparent pixel as no-data, exactly", () => {
    const result = classifySstSample(
      { ...UNDRAWN, alpha: 0 },
      "alpha-carrying"
    );
    expect(result).toMatchObject({
      status: "no-data",
      basis: "alpha-channel",
      exact: true,
      reason: "transparent",
      noDataDistance: null,
    });
  });

  it("keeps a genuinely near-black retrieval observed", () => {
    // The defect this module exists to name: on colour alone these pixels are
    // rejected, but alpha states they were drawn.
    for (const cold of [COLD_RETRIEVAL, COLDEST_DRAWN]) {
      const result = classifySstSample(
        { ...cold, alpha: 255 },
        "alpha-carrying"
      );
      expect(result.status).toBe("observed");
      expect(result.exact).toBe(true);
      expect(result.distanceFromBlack).toBeLessThan(NO_DATA_DISTANCE);
    }
  });

  it("reports blended coverage rather than rounding it to either side", () => {
    const result = classifySstSample(
      { ...COLD_RETRIEVAL, alpha: 128 },
      "alpha-carrying"
    );
    expect(result).toMatchObject({
      status: "partially-covered",
      basis: "alpha-channel",
      reason: "partial-alpha",
    });
  });

  it("falls back to the colour test when alpha is declared but absent", () => {
    // Never default a missing alpha to 255; that would invent coverage.
    const result = classifySstSample(COLD_RETRIEVAL, "alpha-carrying");
    expect(result).toMatchObject({
      status: "indeterminate-near-black",
      basis: "distance-from-black",
      exact: false,
    });
  });
});

describe("opaque-only transport", () => {
  it("cannot separate a cold retrieval from an undrawn pixel", () => {
    const cold = classifySstSample(COLD_RETRIEVAL, "opaque-only");
    const undrawn = classifySstSample(UNDRAWN, "opaque-only");
    expect(cold.status).toBe("indeterminate-near-black");
    expect(undrawn.status).toBe("indeterminate-near-black");
    // Same verdict for a real measurement and a gap — that is the censoring.
    expect(cold.status).toBe(undrawn.status);
    expect(cold.exact).toBe(false);
  });

  it("still resolves colours clear of black", () => {
    const result = classifySstSample(WARM_RETRIEVAL, "opaque-only");
    expect(result).toMatchObject({
      status: "observed",
      basis: "distance-from-black",
      exact: false,
      reason: "far-from-black",
      noDataDistance: NO_DATA_DISTANCE,
    });
  });

  it("ignores a supplied alpha it has no reason to trust", () => {
    const result = classifySstSample(
      { ...COLD_RETRIEVAL, alpha: 255 },
      "opaque-only"
    );
    expect(result.basis).toBe("distance-from-black");
    expect(result.status).toBe("indeterminate-near-black");
  });
});

describe("malformed pixels", () => {
  it.each([
    ["negative channel", { r: -1, g: 0, b: 0, alpha: 255 }],
    ["channel above 255", { r: 0, g: 300, b: 0, alpha: 255 }],
    ["fractional channel", { r: 0.5, g: 0, b: 0, alpha: 255 }],
    ["out-of-range alpha", { r: 10, g: 10, b: 10, alpha: 900 }],
    ["non-finite channel", { r: Number.NaN, g: 0, b: 0, alpha: 255 }],
  ])("refuses to classify a %s", (_label, pixel) => {
    const result = classifySstSample(pixel, "alpha-carrying");
    expect(result.reason).toBe("invalid-pixel");
    expect(result.exact).toBe(false);
    expect(result.distanceFromBlack).toBeNull();
  });
});

describe("measured separability", () => {
  const { scenes, noDataDistance, pngColorType } =
    MEASURED_SST_ALPHA_SEPARABILITY;

  it("records the RGBA colour type the measurement depends on", () => {
    // Colour type 6 is what makes the exact path available at all.
    expect(pngColorType).toBe(6);
    expect(MEASURED_SST_ALPHA_SEPARABILITY.requestedFormat).toBe("image/png");
  });

  it("takes its colour test from the app's live threshold", () => {
    expect(noDataDistance).toBe(NO_DATA_DISTANCE);
  });

  it("counts no more censored pixels than were drawn", () => {
    for (const scene of scenes) {
      expect(scene.drawnWithinNoDataDistance).toBeLessThanOrEqual(
        scene.drawnPixels
      );
      expect(scene.drawnPixels + scene.undrawnPixels).toBe(
        MEASURED_SST_ALPHA_SEPARABILITY.imageWidth *
          MEASURED_SST_ALPHA_SEPARABILITY.imageHeight
      );
    }
  });

  it("censors cold scenes and leaves warm ones untouched", () => {
    const share = (label: string) => {
      const scene = scenes.find((s) => s.label === label);
      expect(scene).toBeDefined();
      return censoredDrawnShare(scene!)!;
    };
    // Sub-polar water: the majority of Okhotsk retrievals are unrecoverable.
    expect(share("Sea of Okhotsk")).toBeGreaterThan(0.5);
    expect(share("Southern Ocean (Weddell)")).toBeGreaterThan(0.25);
    expect(share("Bering Sea")).toBeGreaterThan(0.05);
    // Temperate and tropical water: no censoring at all.
    for (const label of [
      "North Atlantic (temperate)",
      "Arabian Sea",
      "Equatorial Pacific",
    ]) {
      expect(share(label)).toBe(0);
    }
  });

  it("shows the censoring tracks the ramp, not the region", () => {
    // Every censored scene bottoms out at the same cold ramp colour, inside
    // the threshold; every clean scene stays outside it.
    for (const scene of scenes) {
      const censored = censoredDrawnShare(scene)! > 0;
      expect(scene.minDrawnDistanceFromBlack < noDataDistance).toBe(censored);
    }
  });

  it("declines to report a share when nothing was drawn", () => {
    const empty: SstSeparabilityScene = {
      label: "fully clouded",
      bounds: { south: 0, west: 0, north: 1, east: 1 },
      time: "2025-07-01",
      drawnPixels: 0,
      undrawnPixels: 65536,
      drawnWithinNoDataDistance: 0,
      minDrawnDistanceFromBlack: 0,
    };
    expect(censoredDrawnShare(empty)).toBeNull();
  });
});

describe("limitations", () => {
  it("keeps the value-dependent missingness stated", () => {
    const text = SST_ALPHA_SEPARABILITY_LIMITATIONS.join(" ");
    expect(text).toContain("sea ice");
    expect(text).toContain("lean warm");
    expect(text.toLowerCase()).toContain("not a global");
  });

  it("refuses biological and predictive framing", () => {
    const text = SST_ALPHA_SEPARABILITY_LIMITATIONS.join(" ").toLowerCase();
    for (const claim of ["habitat", "ecosystem", "forecast", "causal"]) {
      expect(text).toContain(claim);
    }
  });
});
