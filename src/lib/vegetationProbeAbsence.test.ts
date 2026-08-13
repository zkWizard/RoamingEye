import { describe, it, expect } from "vitest";
import {
  emptyVegetationProbeNote,
  isUndrawnBelowRampLayer,
} from "./vegetationProbeAbsence";
import { vegetationAveragedSupportNote } from "./vegetationAveragedSupport";
import { LAYERS, type LayerId } from "./timeline";
import { RENDERED_VEGETATION_INDEX_RANGE } from "./vegetationIndexRenderedRange";

const EMPTY = [null, null, null, null];
const INDEX_LAYERS = ["ndvi", "evi"] as const;

describe("empty vegetation-index probe record", () => {
  it("classifies both rendered vegetation-index layers", () => {
    for (const id of INDEX_LAYERS) {
      expect(isUndrawnBelowRampLayer(id)).toBe(true);
    }
  });

  it("leaves every other layer unclassified rather than guessing", () => {
    // Including the other land-only products and the categorical layer: an
    // unclassified layer must produce no note at all, not a plausible one.
    const others: LayerId[] = [
      "snow",
      "lst",
      "airtemp",
      "aerosol",
      "precip",
      "soil",
      "sst",
      "landcover",
      "terrain",
    ];
    for (const id of others) {
      expect(isUndrawnBelowRampLayer(id)).toBe(false);
      expect(emptyVegetationProbeNote(id, EMPTY)).toBeNull();
    }
    // An absent layer id is unclassified too, not a crash.
    expect(isUndrawnBelowRampLayer(undefined)).toBe(false);
    expect(emptyVegetationProbeNote(undefined, EMPTY)).toBeNull();
  });

  it("explains an empty record by the transparent below-ramp bands", () => {
    for (const id of INDEX_LAYERS) {
      const note = emptyVegetationProbeNote(id, EMPTY) ?? "";
      const range = RENDERED_VEGETATION_INDEX_RANGE[id];

      expect(note).toContain(`no sampled month drew ${id.toUpperCase()}`);
      expect(note).toContain(
        `GIBS draws no colour below ${range.renderedMinimum}`
      );
      // The colormap is named so the claim is checkable against the document.
      expect(note).toContain(range.colormapDoc);
      expect(note).toContain("rejected rather than decoded");
    }
  });

  it("reads the ramp start from the measured range, never a literal", () => {
    // A GIBS re-render that moves the ramp start must move this sentence with
    // it; pinning the measured value here would let the two drift apart.
    const note = emptyVegetationProbeNote("ndvi", EMPTY) ?? "";
    expect(note).toContain(
      String(RENDERED_VEGETATION_INDEX_RANGE.ndvi.renderedMinimum)
    );
  });

  it("refuses both readings the empty record cannot separate", () => {
    for (const id of INDEX_LAYERS) {
      const note = emptyVegetationProbeNote(id, EMPTY) ?? "";

      // Neither a measurement of no greenness...
      expect(note).toContain("neither a measured zero");
      // ...nor the retrieval failure the generic panel sentence implies.
      expect(note).toContain("nor evidence of a failed retrieval");
      expect(note).toContain("indistinguishable");
      // It never places the point on any particular surface.
      expect(note).not.toMatch(
        /this point is|you clicked|over land|over water|is bare|is frozen/i
      );
    }
  });

  it("names which surfaces fall below the ramp without claiming one here", () => {
    const note = emptyVegetationProbeNote("ndvi", EMPTY) ?? "";
    // The four causes are named as a class...
    expect(note).toContain("open water, snow, ice, cloud");
    // ...and explicitly as undrawn rather than as a low index.
    expect(note).toContain("left undrawn rather than low");
  });

  it("infers no cover, biomass, condition, or trend", () => {
    for (const id of INDEX_LAYERS) {
      const note = emptyVegetationProbeNote(id, EMPTY) ?? "";
      expect(note).not.toMatch(
        /biomass|habitat|health|condition|productivity|dying|greening|browning|forecast/i
      );
    }
  });

  it("keeps the cited dataset on every note", () => {
    for (const id of INDEX_LAYERS) {
      const dataset = LAYERS[id].dataset;
      expect(dataset).toBeDefined();
      expect(emptyVegetationProbeNote(id, EMPTY)).toContain(
        `Source ${dataset?.shortName} v${dataset?.version}`
      );
    }
  });

  it("says nothing about a record that returned any usable value", () => {
    for (const id of INDEX_LAYERS) {
      expect(emptyVegetationProbeNote(id, [null, 0.42, null])).toBeNull();
      // A drawn zero is a value, not an absence.
      expect(emptyVegetationProbeNote(id, [0])).toBeNull();
      // A non-finite entry is not a usable value, so that record is still
      // empty and the note speaks rather than treating NaN as data.
      expect(emptyVegetationProbeNote(id, [Number.NaN, null])).toBeTruthy();
    }
  });

  it("defers to a clause that already explained the same absence", () => {
    // The averaged surfaces supply shares, so vegetationAveragedSupport.ts
    // speaks for them; this module must not explain the absence twice.
    const existing = vegetationAveragedSupportNote(
      "ndvi",
      "drawn-region",
      EMPTY,
      [0, 0, 0, 0]
    );
    expect(existing).toBeTruthy();
    expect(emptyVegetationProbeNote("ndvi", EMPTY, existing)).toBeNull();
    // An empty string is not an explanation, so the note still speaks.
    expect(emptyVegetationProbeNote("ndvi", EMPTY, "")).toBeTruthy();
    expect(emptyVegetationProbeNote("ndvi", EMPTY, null)).toBeTruthy();
  });

  it("covers the point probe, which supplies no shares at all", () => {
    // The hole this module exists for: a point probe passes null fractions, so
    // the averaged clause stays silent and nothing explained the absence.
    expect(
      vegetationAveragedSupportNote("ndvi", "sampled-area", EMPTY, null)
    ).toBeNull();
    expect(emptyVegetationProbeNote("ndvi", EMPTY, null)).toBeTruthy();
  });
});
