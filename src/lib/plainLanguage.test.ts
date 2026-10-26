import { describe, expect, it } from "vitest";
import { LAYERS, LAYER_ORDER } from "./timeline";
import {
  layerAdvancedLine,
  plainLayerName,
  PLAIN_LAYER_NAMES,
} from "./plainLanguage";

describe("plain layer names", () => {
  it("names every catalog layer in everyday words", () => {
    for (const id of LAYER_ORDER) {
      expect(PLAIN_LAYER_NAMES[id].length).toBeGreaterThan(0);
      expect(plainLayerName(id)).toBe(PLAIN_LAYER_NAMES[id]);
    }
  });

  it("keeps the scientific name and dataset id in the advanced line", () => {
    const ndvi = layerAdvancedLine(LAYERS.ndvi);
    expect(ndvi).toContain(LAYERS.ndvi.label);
    expect(ndvi).toContain(LAYERS.ndvi.dataset?.shortName);
    expect(ndvi).toContain(LAYERS.ndvi.wmsLayer);

    expect(layerAdvancedLine(LAYERS.aerosol)).toContain(LAYERS.aerosol.label);
    expect(layerAdvancedLine(LAYERS.sst)).toContain(LAYERS.sst.label);
    expect(plainLayerName("ndvi")).toBe("Greenness");
    expect(plainLayerName("aerosol")).toBe("Smoke & dust in the air");
    expect(plainLayerName("sst")).toBe("Ocean temperature");
  });
});
