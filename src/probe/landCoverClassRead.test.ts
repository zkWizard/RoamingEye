import { describe, expect, it } from "vitest";
import { IGBP_RENDERED_PALETTE } from "../lib/landCoverPalette";
import { readLandCoverClassText } from "./landCoverClassRead";

/** An opaque pixel exactly as GIBS renders the given IGBP class. */
function pixel(classCode: keyof typeof IGBP_RENDERED_PALETTE) {
  return { ...IGBP_RENDERED_PALETTE[classCode], a: 255 };
}

describe("readLandCoverClassText", () => {
  it("decodes published palette colours into the class the source assigned", () => {
    // The 3x3 block a point probe reads, all one class.
    const text = readLandCoverClassText(
      Array.from({ length: 9 }, () => pixel(12)),
      2024
    );

    expect(text).toContain("Cropland (IGBP class 12)");
    expect(text).toContain(
      "Most frequent class in 9 of 9 sampled image pixels"
    );
    expect(text).toContain("MCD12Q1 v061, 500 m, 2024 annual IGBP map");
  });

  it("counts a mixed block without averaging the class codes", () => {
    // Codes 1 and 17 must never average to a "class 9" that no pixel carried.
    const text = readLandCoverClassText(
      [
        pixel(1),
        pixel(1),
        pixel(1),
        pixel(1),
        pixel(1),
        pixel(17),
        pixel(17),
        pixel(17),
        pixel(17),
      ],
      2024
    );

    expect(text).toContain("Evergreen needleleaf forest (IGBP class 1)");
    expect(text).toContain("Most frequent class in 5 of 9");
    expect(text).not.toContain("class 9");
  });

  it("reports the source's unclassified colour as MCD12Q1 declining to classify", () => {
    const text = readLandCoverClassText(
      Array.from({ length: 9 }, () => pixel(255)),
      2024
    );

    expect(text).toContain(
      "Source-unclassified in every land-cover pixel read here"
    );
    expect(text).toContain("9 pixels source-unclassified");
  });

  it("rejects a colour the palette does not publish rather than guessing", () => {
    // One channel off a real entry: a nearest-colour match here would invent a
    // source class, so the pixel stays unusable. Nothing was decoded, so the
    // copy reports an unreadable render and not bare ground.
    const near = IGBP_RENDERED_PALETTE[12];
    const text = readLandCoverClassText(
      Array.from({ length: 9 }, () => ({ ...near, r: near.r - 1, a: 255 })),
      2024
    );

    expect(text).toContain(
      "No sampled pixel carried a readable land-cover colour"
    );
    expect(text).toContain("9 pixels with no usable colour");
  });

  it("treats fully transparent pixels as no data", () => {
    const text = readLandCoverClassText(
      Array.from({ length: 9 }, () => ({ ...IGBP_RENDERED_PALETTE[12], a: 0 })),
      2024
    );

    expect(text).toContain("9 pixels with no usable colour");
  });

  it("carries the probed year through to the citation", () => {
    const text = readLandCoverClassText([pixel(16)], 2001);

    expect(text).toContain("Barren (IGBP class 16)");
    expect(text).toContain("2001 annual IGBP map");
  });
});

describe("vegetation-index support on the point reading", () => {
  it("says a greenness value over water is not plant greenness", () => {
    const text = readLandCoverClassText(
      Array.from({ length: 9 }, () => pixel(17)),
      2024
    );

    expect(text).toContain("Water (IGBP class 17)");
    expect(text).toContain(
      "MOD13A3 v061 still retrieves NDVI/EVI here, but it does not describe plant cover"
    );
  });

  it("qualifies a vegetated class as readable greenness", () => {
    const text = readLandCoverClassText(
      Array.from({ length: 9 }, () => pixel(2)),
      2024
    );

    expect(text).toContain("MOD13A3 v061 NDVI/EVI reads as plant greenness");
  });

  it("leaves a tie across tiers unresolved", () => {
    // Four cropland and four water pixels: the tie is real and the support
    // statement must not pick a side.
    const text = readLandCoverClassText(
      [
        pixel(12),
        pixel(12),
        pixel(12),
        pixel(12),
        pixel(17),
        pixel(17),
        pixel(17),
        pixel(17),
      ],
      2024
    );

    expect(text).toContain("Tied:");
    expect(text).toContain("not read the same way on the tied classes");
  });

  it("adds no support clause when no class was decoded", () => {
    const text = readLandCoverClassText(
      Array.from({ length: 9 }, () => pixel(255)),
      2024
    );

    expect(text).toContain(
      "Source-unclassified in every land-cover pixel read here"
    );
    expect(text).not.toContain("MOD13A3");
  });
});
