import { summarizeLandCoverContext } from "../lib/landCover";
import { decodeRenderedLandCoverPixel } from "../lib/landCoverPalette";
import { describeLandCoverComposition } from "../lib/landCoverCompositionReading";
import {
  landCoverHumanUseNote,
  summarizeLandCoverHumanUse,
} from "../lib/landCoverHumanUse";
import {
  summarizeVegetationIndexLandCoverSupport,
  vegetationIndexSupportNote,
} from "../lib/vegetationIndexLandCoverSupport";
import type { RenderedPixel } from "./ProbeSampler";

/**
 * Turn the rendered pixels of a drawn-region land-cover sample into panel copy.
 *
 * Loaded on demand alongside the point-probe reader: only the class-coded layer
 * needs the class tables. Pixels that do not match a published palette colour
 * exactly stay unclassified — picking the nearest colour would invent a source
 * class that MCD12Q1 never assigned, and over a region that error would
 * accumulate into a share rather than affecting a single reading.
 *
 * Transparent pixels are counted apart from that failure, because over a region
 * the two produce the same share and mean opposite things: a box drawn past the
 * edge of the rendered tile decoded nothing because nothing was there, while
 * undecodable colours are the decoder losing to imagery it did receive — and
 * only the second is a reason to doubt the classes reported beside it. The
 * class contract admits one value per pixel, so this is the last point at which
 * the reasons are still separable.
 *
 * The sampled grid is appended verbatim so the reported composition can be
 * reproduced: the same grid the numeric region mean uses.
 */
export function readLandCoverRegionText(
  pixels: readonly RenderedPixel[],
  dataYear: number,
  sampling: {
    latitudeGridSize: number;
    longitudeGridSize: number;
    sourcePixelCount: number;
  }
): string {
  let transparentSampleCount = 0;
  const observations = pixels.map((pixel) => {
    const decoded = decodeRenderedLandCoverPixel(pixel);
    if (decoded.status === "unavailable" && decoded.reason === "transparent") {
      transparentSampleCount += 1;
    }
    return {
      classCode: decoded.status === "classified" ? decoded.classCode : null,
    };
  });
  const context = summarizeLandCoverContext(observations, dataYear);
  const reading = describeLandCoverComposition(context, {
    transparentSampleCount,
  });
  // The composition copy names only the MOST FREQUENT class, so a region whose
  // cultivated and built-up classes together outweigh the leader still reads as
  // that leader alone: 45% forest, 30% cropland, 25% urban says "forest most
  // frequent" and never that most of the classified mix is human land use.
  // Re-bucketing the same class counts states it, on the same denominator.
  const humanUse = landCoverHumanUseNote(summarizeLandCoverHumanUse(context));
  // The class mix alone does not say whether the region is a surface the
  // vegetation-index layers can be read on at all: MOD13A3 retrieves NDVI and
  // EVI over barren, snow, ice, and water just as it does over canopy. State
  // that share here, where the user has the class composition in front of them.
  const support = vegetationIndexSupportNote(
    summarizeVegetationIndexLandCoverSupport(context)
  );
  return `${reading.text}${humanUse === null ? "" : ` ${humanUse}`}${support === null ? "" : ` ${support}`} Sampled on a ${sampling.latitudeGridSize}×${sampling.longitudeGridSize} grid over the drawn box, resolving to ${sampling.sourcePixelCount} distinct source pixels.`;
}
