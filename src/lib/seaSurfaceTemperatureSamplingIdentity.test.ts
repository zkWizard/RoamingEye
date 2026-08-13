import { describe, expect, it } from "vitest";
import {
  describeSstSamplingIdentity,
  SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY,
  SST_SAMPLING_IDENTITY_LIMITATIONS,
  sstSamplingIdentityCsvHeaders,
  sstSamplingIdentityDrift,
  sstSamplingQualifier,
} from "./seaSurfaceTemperatureSamplingIdentity";
import { LAYERS, LAYER_ORDER, type LayerConfig } from "./timeline";

const SST_LAYER = LAYERS.sst;

function layerWith(overrides: Partial<LayerConfig>): LayerConfig {
  return { ...SST_LAYER, ...overrides };
}

describe("sea-surface-temperature sampling identity", () => {
  it("names the GIBS layer the app actually renders", () => {
    // The identity is only meaningful if it describes the layer the imagery
    // and probe requests are built from (climate.ts reads LAYERS.sst.wmsLayer).
    expect(SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY.gibsLayer).toBe(
      SST_LAYER.wmsLayer
    );
  });

  it("records the daytime half of the diurnal cycle", () => {
    const identity = SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY;
    expect(identity.diurnalSampling).toBe("daytime-only");
    expect(identity.gibsLayer).toContain("_Day_");
    expect(identity.gibsTitle).toContain("Day");
    // GIBS publishes the night counterpart of the same product; naming it keeps
    // "we sampled one half of the cycle" a checkable statement.
    expect(identity.unsampledDiurnalCounterpartLayer).toContain("_Night_");
    expect(identity.unsampledDiurnalCounterpartLayer).not.toBe(
      identity.gibsLayer
    );
  });

  it("keeps the cited dataset's daytime short name in step with the layer", () => {
    expect(SST_LAYER.dataset?.shortName).toContain("DAYTIME");
    expect(SST_LAYER.dataset?.title).toContain("Daytime");
  });

  it("declares a skin retrieval and applies no correction", () => {
    const identity = SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY;
    expect(identity.retrievalDepth).toBe("radiometric-skin");
    // Reporting values as published is the honest default; a silent adjustment
    // would make the number untraceable to the source.
    expect(identity.biasCorrectionApplied).toBe(false);
  });

  it("states its limits without asserting a bias magnitude", () => {
    expect(SST_SAMPLING_IDENTITY_LIMITATIONS.length).toBeGreaterThan(0);
    for (const limitation of SST_SAMPLING_IDENTITY_LIMITATIONS) {
      expect(limitation.trim()).toBe(limitation);
      expect(limitation.length).toBeGreaterThan(0);
    }
    const joined = SST_SAMPLING_IDENTITY_LIMITATIONS.join(" ");
    expect(joined).toContain("not a day-and-night monthly mean");
    expect(joined).toContain("radiative skin");
    // No numeric bias estimate is claimed anywhere: the offset is conditional
    // on wind and insolation and is not quantified by this app.
    expect(joined).not.toMatch(/\d+(\.\d+)?\s*°?C/);
  });

  it("makes no biological, hazard, or forecast claim", () => {
    const prose = [
      describeSstSamplingIdentity(),
      sstSamplingQualifier(),
      ...SST_SAMPLING_IDENTITY_LIMITATIONS,
    ].join(" ");
    expect(prose).not.toMatch(
      /habitat|species|bleach|abundance|ecosystem health|forecast|predict|risk of/i
    );
  });

  it("describes the sampling with its provenance", () => {
    const sentence = describeSstSamplingIdentity();
    expect(sentence).toContain(
      SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY.gibsLayer
    );
    expect(sentence).toContain(
      SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY.unsampledDiurnalCounterpartLayer
    );
    expect(sentence).toContain("13:30");
    expect(sentence).toContain("No diurnal or skin-to-bulk correction");
  });

  it("offers a qualifier that names the sampling, not a consequence", () => {
    const qualifier = sstSamplingQualifier();
    expect(qualifier).toContain("daytime");
    expect(qualifier).toContain("not a day-and-night mean");
  });
});

describe("sstSamplingIdentityDrift", () => {
  it("reports no drift for the shipped SST layer", () => {
    expect(sstSamplingIdentityDrift()).toEqual([]);
    expect(sstSamplingIdentityDrift(SST_LAYER)).toEqual([]);
  });

  it("flags a swap to the night layer", () => {
    const drift = sstSamplingIdentityDrift(
      layerWith({ wmsLayer: "MODIS_Aqua_L3_SST_Thermal_9km_Night_Monthly" })
    );
    expect(drift).toContain("layer-identifier-changed");
    expect(drift).toContain("layer-is-not-daytime");
  });

  it("flags a swap to a different daytime product", () => {
    // Still daytime, so only the identifier claim breaks — the qualifier would
    // survive, but the recorded ows:Title would no longer be the right one.
    const drift = sstSamplingIdentityDrift(
      layerWith({ wmsLayer: "MODIS_Terra_L3_SST_Thermal_9km_Day_Monthly" })
    );
    expect(drift).toEqual(["layer-identifier-changed"]);
  });

  it("flags a description that drops the daytime qualifier", () => {
    expect(
      sstSamplingIdentityDrift(
        layerWith({ description: "Ocean surface temperature (MODIS/Aqua)." })
      )
    ).toEqual(["description-omits-daytime"]);
  });

  it("accepts any casing of the qualifier in the description", () => {
    expect(
      sstSamplingIdentityDrift(
        layerWith({ description: "Ocean surface temperature, DAYTIME only." })
      )
    ).toEqual([]);
  });
});

describe("sstSamplingIdentityCsvHeaders", () => {
  const headers = sstSamplingIdentityCsvHeaders("sst");

  it("states the daytime gate the dataset short name only implies", () => {
    const text = headers.join("\n");
    expect(text).toContain("daytime-only");
    expect(text).toContain("13:30");
    expect(text).toContain("not a day-and-night monthly mean");
  });

  it("separates the skin retrieval from a bulk temperature", () => {
    const text = headers.join("\n");
    expect(text).toContain("radiometric-skin");
    expect(text).toContain("bulk temperature of the mixed layer");
  });

  it("names the unsampled nighttime counterpart without synthesizing it", () => {
    const text = headers.join("\n");
    expect(text).toContain(
      SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY.unsampledDiurnalCounterpartLayer
    );
    expect(text).toContain("none is synthesized");
  });

  it("says no bias correction was applied", () => {
    expect(headers.join("\n")).toContain("# sst_bias_correction: none applied");
  });

  it("obeys the CSV header contract: no delimiter, quote, or line break", () => {
    // A comma here would tear provenance into ragged cells for every reader
    // (see csvHeaderText in probe.ts); these lines are not scrubbed on the way
    // out, so the discipline has to hold at the source.
    for (const line of headers) {
      expect(line.startsWith("# ")).toBe(true);
      expect(line).not.toMatch(/[,"\r\n]/);
    }
  });

  it("is silent for every layer but SST", () => {
    for (const id of LAYER_ORDER) {
      if (id === "sst") continue;
      expect(sstSamplingIdentityCsvHeaders(id)).toEqual([]);
    }
    expect(sstSamplingIdentityCsvHeaders(undefined)).toEqual([]);
  });

  it("asserts no magnitude and nothing biological", () => {
    const text = headers.join("\n").toLowerCase();
    for (const forbidden of [
      "warmer",
      "cooler",
      "°c",
      "heatwave",
      "habitat",
      "species",
      "ecosystem",
      "stress",
      "coral",
      "bleach",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
