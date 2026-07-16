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

export type TerrainTileAvailability =
  | { state: "not-observed"; requested: 0; loaded: 0; failed: 0 }
  | { state: "loading"; requested: number; loaded: number; failed: number }
  | { state: "available"; requested: number; loaded: number; failed: number }
  | { state: "unavailable"; requested: number; loaded: 0; failed: number };

/** Summarize only the tiles requested for the current visible terrain view. */
export function terrainTileAvailability(
  requested: number,
  loaded: number,
  failed: number
): TerrainTileAvailability {
  const counts = [requested, loaded, failed];
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new RangeError("Terrain tile counts must be non-negative integers");
  }
  if (loaded + failed > requested) {
    throw new RangeError("Terrain tile outcomes cannot exceed requests");
  }
  if (requested === 0)
    return { state: "not-observed", requested, loaded: 0, failed: 0 };
  if (loaded > 0) return { state: "available", requested, loaded, failed };
  if (failed === requested)
    return { state: "unavailable", requested, loaded: 0, failed };
  return { state: "loading", requested, loaded, failed };
}

export function terrainTileAvailabilityNotice(
  availability: TerrainTileAvailability
): string {
  switch (availability.state) {
    case "not-observed":
      return "Visible high-resolution tile coverage has not been requested.";
    case "loading":
      return `Visible tile coverage loading: ${availability.failed} unavailable of ${availability.requested} requested.`;
    case "available":
      return `Visible tile coverage: ${availability.loaded} loaded, ${availability.failed} unavailable of ${availability.requested} requested.`;
    case "unavailable":
      return `Visible tile coverage unavailable: all ${availability.requested} requested tiles failed to load.`;
  }
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
