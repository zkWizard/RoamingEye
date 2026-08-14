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

  it("does not claim a region has no land cover where nothing rendered", () => {
    // A box drawn where the land-cover layer is transparent: MCD12Q1 was never
    // read here at all, so the shortfall is missing imagery and not a colour
    // the decoder lost to. Saying the latter would tell the reader the whole
    // sample defeated the palette.
    const text = readLandCoverRegionText(
      Array.from({ length: 12 }, () => ({ r: 0, g: 0, b: 0, a: 0 })),
      2024,
      SAMPLING
    );

    expect(text).toContain("No sampled pixel carried a readable land-cover");
    expect(text).not.toContain("in this region");
    expect(text).toContain("12 pixels with no rendered imagery");
    expect(text).not.toContain("with no usable colour");
    // The citation survives a reading that reports nothing.
    expect(text).toContain("MCD12Q1 v061");
  });

  it("keeps transparency out of the share that questions the classes", () => {
    // 8 forest pixels, 12 that never rendered. The class named beside the
    // remainder was read from imagery that decoded exactly, so nothing here
    // argues against it — the drawn box simply extends past the tile.
    const text = readLandCoverRegionText(
      [
        ...block(1, 8),
        ...Array.from({ length: 12 }, () => ({ r: 0, g: 0, b: 0, a: 0 })),
      ],
      2024,
      SAMPLING
    );

    expect(text).toContain("Evergreen needleleaf forest (IGBP class 1) only");
    expect(text).toContain("8 classified of 20 sampled image pixels");
    expect(text).toContain("12 pixels with no rendered imagery");
    expect(text).not.toContain("with no usable colour");
  });

  it("splits a remainder that is part missing imagery and part bad colour", () => {
    // 6 forest, 8 never rendered, 6 one channel off class 1. Both reasons are
    // named and the printed counts sum to the 14 pixels carrying no class.
    const near = IGBP_RENDERED_PALETTE[1];
    const text = readLandCoverRegionText(
      [
        ...block(1, 6),
        ...Array.from({ length: 8 }, () => ({ r: 0, g: 0, b: 0, a: 0 })),
        ...Array.from({ length: 6 }, () => ({
          ...near,
          g: near.g - 1,
          a: 255,
        })),
      ],
      2024,
      SAMPLING
    );

    expect(text).toContain(
      "8 with no rendered imagery, 6 with no usable colour"
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

    // No urban class was sampled, so the clause names cropland alone.
    expect(text).toContain("Cropland on 50% of classified pixels");
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
    expect(unclassified).toContain(
      "Source-unclassified in every land-cover pixel read here"
    );
    expect(unclassified).not.toContain("human land use");
  });

  it("orders the clauses composition, human use, vegetation-index support", () => {
    const text = readLandCoverRegionText(
      [...block(12, 10), ...block(17, 6)],
      2024,
      SAMPLING
    );

    const composition = text.indexOf("Cropland (IGBP class 12) most frequent");
    // Prefix of both the singular and plural forms: this asserts clause order,
    // not which categories the fixture happened to sample.
    const humanUse = text.indexOf("the IGBP class");
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
