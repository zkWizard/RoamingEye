import { describe, expect, it } from "vitest";
import { LAYERS, LAYER_ORDER } from "./timeline";
import {
  ASTER_GDEM_COVERAGE,
  reliefShadingLegendCaveat,
  TERRAIN_CONTEXT_SOURCE,
  terrainLayerContext,
  terrainTileAvailability,
  terrainTileAvailabilityNotice,
} from "./terrainContext";

describe("terrainLayerContext", () => {
  it("retains the configured ASTER GDEM and GIBS provenance", () => {
    const context = terrainLayerContext();

    expect(context.provenance).toEqual(TERRAIN_CONTEXT_SOURCE);
    expect(context.provenance.dataset).toEqual(LAYERS.terrain.dataset);
    expect(context.provenance.wmsLayer).toBe(LAYERS.terrain.wmsLayer);
    expect(context.provenance.dataset.shortName).toBe("ASTGTM");
    expect(context.provenance.dataset.version).toBe("003");
    expect(context.provenance.datasetUrl).toBe(
      "https://doi.org/10.5067/ASTER/ASTGTM.003"
    );
    expect(context.provenance.coverageReference).toBe(
      "https://www.earthdata.nasa.gov/s3fs-public/2025-04/ASTGTM_User_Guide_V3.pdf"
    );
  });

  it("does not manufacture a data month or geographic coverage sample", () => {
    const context = terrainLayerContext();

    expect(context.dataMonth).toBeNull();
    expect(context.temporalCoverage).toBe("static-no-time-dimension");
    expect(context.geographicCoverage.viewSample).toBe("not-sampled");
  });

  it("retains the published land-only latitude coverage separately from view sampling", () => {
    const context = terrainLayerContext();

    expect(context.geographicCoverage.source).toEqual(ASTER_GDEM_COVERAGE);
    expect(context.geographicCoverage.source).toEqual({
      surface: "land-surfaces-only",
      latitude: {
        south: -83,
        north: 83,
        units: "decimal degrees",
        boundary: "inclusive",
      },
    });
    expect(context.accessibleNotice).toContain(
      "land surfaces from 83°S through 83°N"
    );
    expect(context.accessibleNotice).toContain(
      "has not sampled coverage at a location"
    );
  });

  it("marks shaded-relief colors as non-calibrated and not point elevations", () => {
    const context = terrainLayerContext();

    expect(context.interpretation).toEqual({
      representation: "color-shaded-relief",
      colorValues: "not-calibrated-elevation-values",
      providesPointElevation: false,
    });
    expect(context.accessibleNotice).toContain(
      "not calibrated elevation values"
    );
    expect(context.accessibleNotice).toContain(
      "does not provide point elevations"
    );
  });

  it("keeps the matrix-set identifier distinct from an elevation precision claim", () => {
    const context = terrainLayerContext();

    expect(context.wmtsMatrixSet).toBe("31.25m");
    expect(context.accessibleNotice).not.toContain("31.25");
  });
});

describe("terrainTileAvailability", () => {
  it("distinguishes unrequested, loading, available, and unavailable views", () => {
    expect(terrainTileAvailability(0, 0, 0).state).toBe("not-observed");
    expect(terrainTileAvailability(4, 0, 1).state).toBe("loading");
    expect(terrainTileAvailability(4, 2, 2).state).toBe("available");
    expect(terrainTileAvailability(4, 0, 4).state).toBe("unavailable");
  });

  it("reports visible request counts without claiming global coverage", () => {
    const notice = terrainTileAvailabilityNotice(
      terrainTileAvailability(6, 4, 2)
    );
    expect(notice).toBe(
      "Visible tile coverage: 4 loaded, 2 unavailable of 6 requested."
    );
    expect(notice).not.toMatch(/global|complete/i);
  });

  it("rejects impossible request accounting", () => {
    expect(() => terrainTileAvailability(2, 2, 1)).toThrow(RangeError);
    expect(() => terrainTileAvailability(-1, 0, 0)).toThrow(RangeError);
    expect(() => terrainTileAvailability(1.5, 0, 0)).toThrow(RangeError);
  });
});

describe("reliefShadingLegendCaveat", () => {
  it("names the mechanism that breaks the bar's elevation ordering", () => {
    const caveat = reliefShadingLegendCaveat("terrain");

    expect(caveat).not.toBeNull();
    // Slope and illumination are the two things folded into the drawn colour;
    // naming them is what separates this from the existing "not calibrated"
    // wording, which a reader can honour while still trusting the ordering.
    expect(caveat).toContain("slope and illumination");
    expect(caveat).toContain("one colour occurs across a span of elevations");
  });

  it("keeps the layer descriptive rather than declaring the view useless", () => {
    const caveat = reliefShadingLegendCaveat("terrain") ?? "";

    // The rendering still shows landform shape; the caveat bounds what may be
    // read off a colour, and must not read as "this layer shows nothing".
    expect(caveat).toContain("landform shape");
    // Descriptive geometry only: no hazard, risk, or accuracy claim.
    expect(caveat).not.toMatch(/hazard|risk|accurac|error|±/i);
  });

  it("is silent for every layer whose colour is a function of the value", () => {
    for (const id of LAYER_ORDER) {
      if (id === "terrain") continue;
      expect(reliefShadingLegendCaveat(id)).toBeNull();
    }
  });

  it("agrees with the layer configuration it describes", () => {
    // The caveat is only correct for a shaded-relief rendering, and only needed
    // for a layer the probe does not invert to a physical value.
    expect(LAYERS.terrain.wmsLayer).toContain("Color_Shaded_Relief");
    expect(terrainLayerContext().interpretation.representation).toBe(
      "color-shaded-relief"
    );
    expect(terrainLayerContext().interpretation.providesPointElevation).toBe(
      false
    );
  });
});
