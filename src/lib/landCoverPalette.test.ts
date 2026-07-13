import { describe, expect, it } from "vitest";
import { IGBP_LAND_COVER_CLASSES } from "./landCover";
import {
  decodeRenderedLandCoverPixel,
  IGBP_RENDERED_PALETTE,
} from "./landCoverPalette";

describe("rendered MCD12Q1 palette decoding", () => {
  it("maps every published IGBP palette colour to its native categorical code", () => {
    for (const { code } of IGBP_LAND_COVER_CLASSES) {
      expect(decodeRenderedLandCoverPixel(IGBP_RENDERED_PALETTE[code])).toEqual(
        {
          status: "classified",
          classCode: code,
        }
      );
    }
  });

  it("keeps transparent and non-palette rendered pixels explicitly unavailable", () => {
    expect(
      decodeRenderedLandCoverPixel({ r: 33, g: 138, b: 33, a: 0 })
    ).toEqual({
      status: "unavailable",
      reason: "transparent",
    });
    expect(decodeRenderedLandCoverPixel({ r: 34, g: 138, b: 33 })).toEqual({
      status: "unavailable",
      reason: "unmapped-color",
    });
  });

  it("does not approximate a class from a nearby rendered colour", () => {
    expect(decodeRenderedLandCoverPixel({ r: 254, g: 1, b: 1 })).toEqual({
      status: "unavailable",
      reason: "unmapped-color",
    });
  });
});
