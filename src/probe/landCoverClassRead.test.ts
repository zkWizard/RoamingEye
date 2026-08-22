import { describe, expect, it } from "vitest";
import { IGBP_RENDERED_PALETTE } from "../lib/landCoverPalette";
import {
  landCoverTenureClause,
  readLandCoverClassText,
} from "./landCoverClassRead";

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

  it("says nothing rendered rather than blaming the colour, on transparency", () => {
    // Nothing was drawn at this point, so there was never a colour to match.
    // Reporting it as an unreadable colour is evidence against the palette that
    // transparency cannot supply.
    const text = readLandCoverClassText(
      Array.from({ length: 9 }, () => ({ ...IGBP_RENDERED_PALETTE[12], a: 0 })),
      2024
    );

    expect(text).toContain("9 pixels with no rendered imagery");
    expect(text).not.toContain("with no usable colour");
  });

  it("separates transparency from undecodable colour in one sample", () => {
    // 5 drawn nowhere, 4 drawn one channel off class 12. The printed parts sum
    // to the 9 pixels that carried no class.
    const near = IGBP_RENDERED_PALETTE[12];
    const text = readLandCoverClassText(
      [
        ...Array.from({ length: 5 }, () => ({ ...near, a: 0 })),
        ...Array.from({ length: 4 }, () => ({
          ...near,
          r: near.r - 1,
          a: 255,
        })),
      ],
      2024
    );

    expect(text).toContain("5 pixels with no rendered imagery");
    expect(text).toContain("4 pixels with no usable colour");
  });

  it("names transparency beside a class it did report", () => {
    // The classified branch, not the unavailable one: 6 cropland pixels and 3
    // that never rendered. The label stands; the shortfall is not the decoder
    // failing on imagery it received.
    const text = readLandCoverClassText(
      [
        ...Array.from({ length: 6 }, () => pixel(12)),
        ...Array.from({ length: 3 }, () => ({
          ...IGBP_RENDERED_PALETTE[12],
          a: 0,
        })),
      ],
      2024
    );

    expect(text).toContain("Cropland (IGBP class 12)");
    expect(text).toContain("the other 3 pixels with no rendered imagery");
    expect(text).not.toContain("with no usable colour");
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

describe("landCoverTenureClause", () => {
  /** One annual map, read as a 9-pixel block all carrying `classCode`. */
  function year(y: number, classCode: keyof typeof IGBP_RENDERED_PALETTE) {
    return {
      year: y,
      pixels: Array.from({ length: 9 }, () => pixel(classCode)),
    };
  }

  it("says a class held every map read, without claiming it will hold", () => {
    const clause = landCoverTenureClause([
      year(2021, 8),
      year(2022, 8),
      year(2023, 8),
      year(2024, 8),
    ]);

    expect(clause).toBe("Woody savanna on all 4 annual maps read, 2021–2024.");
  });

  it("counts whole years per class when the maps disagree, and never averages the codes", () => {
    const clause = landCoverTenureClause([
      year(2021, 10),
      year(2022, 8),
      year(2023, 8),
      year(2024, 8),
    ]);

    expect(clause).toContain("Across all 4 annual maps read, 2021–2024:");
    expect(clause).toContain("Woody savanna on 3, Grassland on 1");
    // Codes 8 and 10 must never average into a class 9 no map assigned.
    expect(clause).not.toMatch(/Savanna on \d/);
    // A differing label is not evidence of change on the ground.
    expect(clause).toContain("can be reclassification");
  });

  it("does not credit tenure to a class the sampled pixels only tied on", () => {
    const tied = {
      year: 2023,
      pixels: [pixel(8), pixel(8), pixel(10), pixel(10)],
    };
    const clause = landCoverTenureClause([year(2021, 8), tied, year(2024, 8)]);

    expect(clause).toBe(
      "Woody savanna on 2 of the 3 annual maps read, 2021–2024."
    );
  });

  it("withholds tenure below two classified maps", () => {
    expect(landCoverTenureClause([year(2024, 8)])).toBeNull();
    expect(
      landCoverTenureClause([
        { year: 2023, pixels: Array.from({ length: 9 }, () => pixel(255)) },
        year(2024, 8),
      ])
    ).toBeNull();
  });

  it("reads the same whichever order the maps arrive in, ties included", () => {
    // Two years each: the tenure counts tie exactly, which quantised class
    // codes make ordinary rather than rare.
    const maps = [year(2021, 8), year(2022, 10), year(2023, 8), year(2024, 10)];

    expect(landCoverTenureClause(maps)).toBe(
      landCoverTenureClause([...maps].reverse())
    );
    expect(landCoverTenureClause(maps)).toContain(
      "Woody savanna on 2, Grassland on 2"
    );
  });
});
