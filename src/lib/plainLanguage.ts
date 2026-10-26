import { LAYERS, type LayerConfig, type LayerId } from "./timeline";

/**
 * Names a non-technical visitor can act on. The catalog `label` stays the
 * precise scientific name (probe CSVs, citations, accuracy tests). This map
 * is what the layer picker, the probe title, and the view cards say out loud.
 */
export const PLAIN_LAYER_NAMES: Record<LayerId, string> = {
  ndvi: "Greenness",
  evi: "Lush vegetation",
  lst: "Land temperature",
  airtemp: "Air temperature",
  sst: "Ocean temperature",
  precip: "Rain",
  soil: "Ground moisture",
  snow: "Snow & ice",
  aerosol: "Smoke & dust in the air",
  landcover: "Land cover",
  terrain: "Land shape",
};

export function plainLayerName(id: LayerId): string {
  return PLAIN_LAYER_NAMES[id];
}

/** Scientific name, dataset id, and the GIBS layer — the Advanced fold. */
export function layerAdvancedLine(layer: LayerConfig): string {
  const dataset = layer.dataset?.shortName;
  return dataset
    ? `${layer.label} · ${dataset} · ${layer.wmsLayer}`
    : `${layer.label} · ${layer.wmsLayer}`;
}

export function layerAdvancedLines(): Array<{
  id: LayerId;
  plain: string;
  advanced: string;
}> {
  return (Object.keys(LAYERS) as LayerId[]).map((id) => ({
    id,
    plain: plainLayerName(id),
    advanced: layerAdvancedLine(LAYERS[id]),
  }));
}
