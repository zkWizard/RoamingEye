import { describe, expect, it } from "vitest";
import { IGBP_RENDERED_PALETTE } from "../lib/landCoverPalette";
import { readLandCoverRegionText } from "./landCoverRegionRead";

/** An opaque pixel exactly as GIBS renders the given IGBP class. */
function pixel(classCode: keyof typeof IGBP_RENDERED_PALETTE) {
  return { ...IGBP_RENDERED_PALETTE[classCode], a: 255 };
}

/** `count` copies of the rendered colour for one class. */
function block(classCode: keyof typeof IGBP_RENDERED_PALETTE, count: number) {
  return Array.from({ length: count }, () => pixel(classCode));
}

const SAMPLING = {
  latitudeGridSize: 8,
  longitudeGridSize: 8,
  sourcePixelCount: 20,
};

describe("readLandCoverRegionText", () => {
  it("names the most frequent class and the sampled grid", () => {
    const text = readLandCoverRegionText(block(1, 12), 2024, SAMPLING);

    expect(text).toContain("Evergreen needleleaf forest (IGBP class 1) only");
    expect(text).toContain("MCD12Q1 v061, 500 m, 2024 annual IGBP map");
    expect(text).toContain(
      "Sampled on a 8×8 grid over the drawn box, resolving to 20 distinct source pixels."
    );
  });
});

describe("human land use on the drawn-region reading", () => {
  it("states the cultivated and built-up share the leading class hides", () => {
    // 9 forest, 6 cropland, 5 urban of 20 classified pixels. Forest leads at
    // 45%, so the composition copy names forest alone — while 55% of the
    // classified mix is cultivated or built-up.
    const text = readLandCoverRegionText(
      [...block(1, 9), ...block(12, 6), ...block(13, 5)],
      2024,
      SAMPLING
    );

    expect(text).toContain(
      "Evergreen needleleaf forest (IGBP class 1) most frequent — 45% of classified pixels"
    );
    expect(text).toContain(
      "Cropland or urban & built-up on 55% of classified pixels"
    );
    expect(text).not.toContain("mosaic");
  });

  it("keeps the ambiguous mosaic out of the unambiguous share", () => {
    // 10 cropland, 5 mosaic, 5 grassland: the mosaic is 40-60% cultivation, so
    // forcing it to either side of the split would overstate one bound.
    const text = readLandCoverRegionText(
      [...block(12, 10), ...block(14, 5), ...block(10, 5)],
      2024,
      SAMPLING
    );

    expect(text).toContain(
      "Cropland or urban & built-up on 50% of classified pixels"
    );
    expect(text).toContain(
      "a further 25% of classified pixels is the cropland/natural vegetation mosaic"
    );
  });

  it("adds no human-use clause to a region with none, or with no classes", () => {
    const water = readLandCoverRegionText(
      [...block(17, 10), ...block(1, 6)],
      2024,
      SAMPLING
    );
    expect(water).toContain("Water (IGBP class 17) most frequent");
    expect(water).not.toContain("human land use");

    const unclassified = readLandCoverRegionText(
      block(255, 12),
      2024,
      SAMPLING
    );
    expect(unclassified).toContain("No IGBP land-cover classes in this region");
    expect(unclassified).not.toContain("human land use");
  });

  it("orders the clauses composition, human use, vegetation-index support", () => {
    const text = readLandCoverRegionText(
      [...block(12, 10), ...block(17, 6)],
      2024,
      SAMPLING
    );

    const composition = text.indexOf("Cropland (IGBP class 12) most frequent");
    const humanUse = text.indexOf("the IGBP classes that record direct human");
    const support = text.indexOf("MOD13A3 v061 NDVI/EVI reads as plant");
    const grid = text.indexOf("Sampled on a");

    expect(composition).toBeGreaterThanOrEqual(0);
    expect(humanUse).toBeGreaterThan(composition);
    expect(support).toBeGreaterThan(humanUse);
    expect(grid).toBeGreaterThan(support);
  });

  it("does not depend on the order the rendered pixels arrive in", () => {
    // Colormap decoding yields whole class codes, so an exact count tie between
    // a cultivated and a natural class is ordinary rather than rare.
    const pixels = [...block(12, 6), ...block(10, 6), ...block(14, 4)];

    expect(readLandCoverRegionText([...pixels].reverse(), 2024, SAMPLING)).toBe(
      readLandCoverRegionText(pixels, 2024, SAMPLING)
    );
  });
});
