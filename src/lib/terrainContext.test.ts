import { describe, expect, it } from "vitest";
import { LAYERS } from "./timeline";
import {
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
  });

  it("does not manufacture a data month or geographic coverage sample", () => {
    const context = terrainLayerContext();

    expect(context.dataMonth).toBeNull();
    expect(context.temporalCoverage).toBe("static-no-time-dimension");
    expect(context.geographicCoverage).toBe("not-sampled");
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
