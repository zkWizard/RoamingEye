import {
  IGBP_LAND_COVER_CLASSES,
  type IgbpLandCoverClassCode,
} from "./landCover";

/** An opaque RGBA pixel read from the rendered MCD12Q1 GIBS layer. */
export interface RenderedLandCoverPixel {
  r: number;
  g: number;
  b: number;
  /** Omit alpha for sources that expose RGB only. Transparent pixels are unavailable. */
  a?: number;
}

export type LandCoverPixelDecode =
  | { status: "classified"; classCode: IgbpLandCoverClassCode }
  | { status: "unavailable"; reason: "transparent" | "unmapped-color" };

/**
 * The categorical RGB values published by NASA GIBS for the MCD12Q1 LC_Type1
 * IGBP layer. These are source rendering colours, not a continuous scale, so
 * decoding deliberately accepts exact opaque palette entries only.
 */
export const IGBP_RENDERED_PALETTE: Readonly<
  Record<IgbpLandCoverClassCode, Readonly<RenderedLandCoverPixel>>
> = {
  1: { r: 33, g: 138, b: 33 },
  2: { r: 49, g: 204, b: 49 },
  3: { r: 152, g: 204, b: 49 },
  4: { r: 150, g: 250, b: 150 },
  5: { r: 141, g: 186, b: 141 },
  6: { r: 186, g: 141, b: 141 },
  7: { r: 245, g: 222, b: 179 },
  8: { r: 218, g: 235, b: 157 },
  9: { r: 255, g: 213, b: 0 },
  10: { r: 240, g: 185, b: 103 },
  11: { r: 71, g: 131, b: 181 },
  12: { r: 250, g: 239, b: 115 },
  13: { r: 255, g: 0, b: 0 },
  14: { r: 153, g: 147, b: 86 },
  15: { r: 255, g: 255, b: 255 },
  16: { r: 191, g: 191, b: 189 },
  17: { r: 134, g: 202, b: 227 },
  255: { r: 100, g: 100, b: 100 },
};

const PALETTE_ENTRIES = IGBP_LAND_COVER_CLASSES.map(({ code }) => ({
  code,
  ...IGBP_RENDERED_PALETTE[code],
}));

/**
 * Convert one rendered GIBS palette pixel into its native categorical class
 * code. Unknown, blended, antialiased, or transparent pixels remain
 * unavailable; choosing a nearest colour could invent a source class.
 */
export function decodeRenderedLandCoverPixel(
  pixel: RenderedLandCoverPixel
): LandCoverPixelDecode {
  if (pixel.a !== undefined && pixel.a === 0) {
    return { status: "unavailable", reason: "transparent" };
  }

  const match = PALETTE_ENTRIES.find(
    (entry) => pixel.r === entry.r && pixel.g === entry.g && pixel.b === entry.b
  );
  return match
    ? { status: "classified", classCode: match.code }
    : { status: "unavailable", reason: "unmapped-color" };
}
