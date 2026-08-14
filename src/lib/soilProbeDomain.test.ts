import { describe, expect, it } from "vitest";
import { emptySoilProbeNote, isSoilProbeLayer } from "./soilProbeDomain";
import { GLDAS_RAMP_SATURATION } from "./gldasRampSaturation";
import { LEGENDS } from "./legend";
import { buildColormapLut, NO_DATA_DISTANCE, type Rgb } from "./probe";
import { LAYERS } from "./timeline";

const EMPTY = [null, null, null];

/** Nearest distance from a colour to the ramp the point probe inverts against. */
function nearestRampDistance(rgb: Rgb): number {
  const spec = LEGENDS.soil;
  if (spec.kind === "classes") throw new Error("soil legend is not a ramp");
  return buildColormapLut(spec.stops).reduce(
    (best, entry) =>
      Math.min(
        best,
        Math.hypot(entry.r - rgb.r, entry.g - rgb.g, entry.b - rgb.b)
      ),
    Infinity
  );
}

describe("isSoilProbeLayer", () => {
  it("classifies only the GLDAS soil-moisture layer", () => {
    expect(isSoilProbeLayer("soil")).toBe(true);
    for (const other of [
      "precip",
      "airtemp",
      "aerosol",
      "sst",
      "snow",
      "ndvi",
    ] as const) {
      expect(isSoilProbeLayer(other)).toBe(false);
    }
    expect(isSoilProbeLayer(undefined)).toBe(false);
  });
});

describe("the rejections the note describes", () => {
  // The note's whole claim is that BOTH an undrawn pixel and the dropped top
  // cap fall outside the inversion, so both are re-derived here rather than
  // trusted as prose. If either ramp or threshold moves, this fails first.
  it("rejects an undrawn (black) pixel — the out-of-domain reading", () => {
    const distance = nearestRampDistance({ r: 0, g: 0, b: 0 });
    expect(distance).toBeGreaterThan(NO_DATA_DISTANCE);
    expect(distance).toBeCloseTo(235.5, 1);
  });

  it("rejects the published top cap — the near-saturated reading", () => {
    const distance = nearestRampDistance(
      GLDAS_RAMP_SATURATION.soil.ceiling.rgb
    );
    expect(distance).toBeGreaterThan(NO_DATA_DISTANCE);
    expect(distance).toBeCloseTo(76.9, 1);
  });

  it("keeps the ceiling bound at the porosity-scale value the note leans on", () => {
    expect(GLDAS_RAMP_SATURATION.soil.ceiling.boundReported).toBe(50);
    expect(GLDAS_RAMP_SATURATION.soil.reportedUnit).toBe("kg/m²");
  });
});

describe("emptySoilProbeNote", () => {
  it("stays silent for every layer it does not classify", () => {
    for (const other of [
      "precip",
      "airtemp",
      "aerosol",
      "sst",
      "snow",
      "ndvi",
    ] as const) {
      expect(emptySoilProbeNote(other, EMPTY)).toBeNull();
    }
    expect(emptySoilProbeNote(undefined, EMPTY)).toBeNull();
  });

  it("stays silent whenever any month decoded", () => {
    expect(emptySoilProbeNote("soil", [null, 22.4, null])).toBeNull();
    expect(emptySoilProbeNote("soil", [0])).toBeNull();
  });

  it("treats non-finite values as no value at all", () => {
    expect(
      emptySoilProbeNote("soil", [Number.NaN, Number.POSITIVE_INFINITY])
    ).not.toBeNull();
  });

  it("explains an empty record without diagnosing the point", () => {
    const note = emptySoilProbeNote("soil", EMPTY);
    expect(note).toContain("Soil moisture:");
    expect(note).toContain("land cells only");
    expect(note).toContain("≥ 50.0");
    expect(note).toContain("not a reading of dry soil");
    expect(note).toContain("not evidence of a failed retrieval");
    // It must never place the point on one side of the ambiguity it describes.
    expect(note).not.toMatch(
      /this point is|you clicked|over water\b|is saturated/i
    );
  });

  it("cites the layer's dataset", () => {
    const dataset = LAYERS.soil.dataset;
    expect(dataset).toBeDefined();
    expect(emptySoilProbeNote("soil", EMPTY)).toContain(
      `${dataset?.shortName} v${dataset?.version}`
    );
  });

  it("quotes the bound from the measured ramp facts, not a literal", () => {
    expect(emptySoilProbeNote("soil", EMPTY)).toContain(
      GLDAS_RAMP_SATURATION.soil.ceiling.publishedLabel
    );
  });
});
