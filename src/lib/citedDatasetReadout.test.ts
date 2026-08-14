import { describe, expect, it } from "vitest";
import { characterizeLayerInversion } from "./briefValueUncertainty";
import {
  datasetReadout,
  datasetReadoutNote,
  type DatasetReadout,
} from "./citedDatasetReadout";
import { HIRES_LAYER } from "./imagery";
import { citedDatasets } from "./providers";
import { LAYERS, LAYER_ORDER, type LayerId } from "./timeline";

/**
 * The readout the authority would derive for a layer. `characterizeLayerInversion`
 * decides this from LEGENDS and PROBE_SCALES; the shipped module pins the answer
 * instead so the providers chunk never imports probe.ts (see the module doc).
 * This is the check that keeps the pinned table honest.
 */
function derivedReadout(id: LayerId): DatasetReadout {
  const characterization = characterizeLayerInversion(id);
  if (characterization.status === "characterized") return "ramp-inverted";
  switch (characterization.reason) {
    case "categorical-layer":
      return "classes";
    case "uncalibrated-scale":
      return "relative-ramp";
    default:
      // Unvalidated or recovering nothing: still inverted from a colour ramp to
      // physical units, so the citation's claim is the same.
      return "ramp-inverted";
  }
}

describe("pinned readout table", () => {
  it("agrees with characterizeLayerInversion for every layer", () => {
    for (const id of LAYER_ORDER) {
      expect(datasetReadout(LAYERS[id].dataset!), id).toBe(derivedReadout(id));
    }
  });

  it("detects a layer whose readout kind changed", () => {
    // Proves the check above can fail: land cover is the one categorical layer,
    // so deriving it must not produce the ramp answer the others get.
    expect(derivedReadout("landcover")).not.toBe(derivedReadout("lst"));
  });
});

describe("datasetReadout", () => {
  it("classifies a ramp-inverted product by the layer it backs", () => {
    expect(datasetReadout(LAYERS.lst.dataset!)).toBe("ramp-inverted");
    expect(datasetReadout(LAYERS.aerosol.dataset!)).toBe("ramp-inverted");
  });

  it("treats an unvalidated ramp as ramp-inverted, not as no readout", () => {
    // Snow inverts the same way the measured layers do; only its validation
    // run is missing, and an unmeasured error is not an absent one.
    expect(datasetReadout(LAYERS.snow.dataset!)).toBe("ramp-inverted");
  });

  it("distinguishes discrete classes from a measurement", () => {
    expect(datasetReadout(LAYERS.landcover.dataset!)).toBe("classes");
  });

  it("distinguishes a relative colour scale with no physical units", () => {
    expect(datasetReadout(LAYERS.terrain.dataset!)).toBe("relative-ramp");
  });

  it("reports imagery-only for a dataset no sampled layer claims", () => {
    expect(datasetReadout(HIRES_LAYER.dataset)).toBe("imagery-only");
  });

  it("takes the strongest claim when one dataset backs several layers", () => {
    // MOD13A3 is cited once for NDVI (measured inversion) and EVI (never
    // validated); the shared entry must still disclose that values are read
    // by inverting a ramp.
    expect(LAYERS.ndvi.dataset!.doi).toBe(LAYERS.evi.dataset!.doi);
    expect(datasetReadout(LAYERS.ndvi.dataset!)).toBe("ramp-inverted");
  });

  it("gives every dataset the citation bundle exports a note", () => {
    const notes = citedDatasets().map((entry) =>
      datasetReadoutNote(entry.dataset)
    );
    expect(notes).toHaveLength(10);
    for (const note of notes) {
      expect(note.length).toBeGreaterThan(0);
      expect(note).toContain("RoamingEye");
    }
  });

  it("never states an error magnitude, which is per layer and not per dataset", () => {
    for (const entry of citedDatasets()) {
      expect(datasetReadoutNote(entry.dataset)).not.toMatch(/\d/);
    }
  });

  it("says a ramp-inverted value is not the archived product's", () => {
    const note = datasetReadoutNote(LAYERS.lst.dataset!);
    expect(note).toContain("browse imagery");
    expect(note).toContain("not");
    expect(note).toContain("archived product");
  });
});
