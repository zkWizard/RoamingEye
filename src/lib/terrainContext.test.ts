import { describe, expect, it } from "vitest";
import { LAYERS } from "./timeline";
import {
  ASTER_GDEM_COVERAGE,
  TERRAIN_CONTEXT_SOURCE,
  terrainLayerContext,
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
