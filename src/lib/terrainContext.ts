import { LAYERS } from "./timeline";

/**
 * Provenance and interpretation limits for the terrain view.
 *
 * The active layer is a color shaded-relief rendering of ASTER GDEM, not a
 * calibrated elevation raster in this application. Keep this contract close
 * to the layer configuration so a user-facing explanation cannot drift from
 * the data path that actually renders the globe.
 */
export const TERRAIN_CONTEXT_SOURCE = {
  organization: "NASA",
  imageryService: "NASA Global Imagery Browse Services (GIBS)",
  imageryServiceUrl: "https://nasa-gibs.github.io/gibs-api-docs/",
  dataset: LAYERS.terrain.dataset!,
  datasetUrl: `https://doi.org/${LAYERS.terrain.dataset!.doi}`,
  wmsLayer: LAYERS.terrain.wmsLayer,
  wmtsMatrixSet: LAYERS.terrain.wmts!.set,
} as const;

export interface TerrainLayerContext {
  kind: "terrain-layer-context";
  provenance: typeof TERRAIN_CONTEXT_SOURCE;
  /** ASTER terrain is static in the configured GIBS layer; no month is selected. */
  dataMonth: null;
  temporalCoverage: "static-no-time-dimension";
  /** No point or regional terrain sample has been requested by this view. */
  geographicCoverage: "not-sampled";
  /** The configured serving matrix identifier, not an elevation precision claim. */
  wmtsMatrixSet: string;
  interpretation: {
    representation: "color-shaded-relief";
    colorValues: "not-calibrated-elevation-values";
    providesPointElevation: false;
  };
  accessibleNotice: string;
}

/**
 * Describe what the terrain legend can and cannot establish. This makes no
 * claim about local elevation, vertical accuracy, bathymetry, or coverage at
 * a supplied location because the application has not sampled terrain there.
 */
export function terrainLayerContext(): TerrainLayerContext {
  return {
    kind: "terrain-layer-context",
    provenance: TERRAIN_CONTEXT_SOURCE,
    dataMonth: null,
    temporalCoverage: "static-no-time-dimension",
    geographicCoverage: "not-sampled",
    wmtsMatrixSet: TERRAIN_CONTEXT_SOURCE.wmtsMatrixSet,
    interpretation: {
      representation: "color-shaded-relief",
      colorValues: "not-calibrated-elevation-values",
      providesPointElevation: false,
    },
    accessibleNotice:
      "Static shaded-relief imagery with no selected data month. Colors are not calibrated elevation values; this view does not provide point elevations or terrain coverage at a location.",
  };
}
