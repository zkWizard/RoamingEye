/**
 * Why the place panel's vegetation value is a mean over the *drawn* part of a
 * boundary rather than over the boundary.
 *
 * GIBS marks the fill band and both negative bands of MODIS_L3_NDVI
 * transparent, so the continuous legend the app parses starts just above zero
 * (renderedMinimum 0.0001, see vegetationIndexRenderedRange.ts). Open water,
 * snow, ice, cloud, and negative-index barren ground are therefore not drawn,
 * arrive as JPEG black, and are rejected by the place path's inversion
 * threshold (see vegetationIndexNoData.ts) instead of entering the mean.
 *
 * The consequence is directional and must be stated. The excluded pixels are
 * not a random sample of the boundary: they are exactly its lowest-index ones,
 * so the surviving mean is biased high relative to a whole-boundary mean by an
 * amount the rendered tile cannot recover. A rendered tile also cannot separate
 * "index at or below zero" from "not observed" — both are absent pixels — so
 * the shortfall must not be attributed to cloud alone.
 *
 * This is the same defect the snow card already discloses (snowCoverNarrative's
 * DRAWN_FRACTION_CAVEAT) arising from the same transparent-band mechanism; the
 * vegetation card reported only a bare "N% sampled coverage", which reads as
 * incidental missingness rather than as a signed bias in the number beside it.
 *
 * Nothing here interprets the index. An excluded pixel means the product drew
 * no vegetation index there — not that the surface is bare, not that it is
 * water, and not that greenness is low. Pure, render-free logic (see
 * vegetationDrawnCoverage.test.ts).
 */

/** Whether every sampled pixel in the footprint carried a drawn NDVI value. */
export type VegetationDrawnCoverage = "complete" | "incomplete" | "unknown";

/**
 * Classify the current month's drawn fraction. Only an exact 1 is "complete":
 * the card rounds its coverage percentage, so a footprint that prints "100%
 * sampled coverage" at 0.999 still has undrawn pixels and still needs the
 * caveat. A fraction outside [0, 1] is not a fraction and is reported as
 * unknown rather than silently treated as complete.
 */
export function classifyVegetationDrawnCoverage(
  drawnFraction: number | null | undefined
): VegetationDrawnCoverage {
  if (
    drawnFraction === null ||
    drawnFraction === undefined ||
    !Number.isFinite(drawnFraction) ||
    drawnFraction < 0 ||
    drawnFraction > 1
  ) {
    return "unknown";
  }
  return drawnFraction === 1 ? "complete" : "incomplete";
}

/**
 * The caveat itself. It names the mechanism and the direction, and stops
 * there — the size of the bias depends on what the undrawn pixels would have
 * read, which is precisely what the rendered product does not supply.
 */
export const VEGETATION_DRAWN_COVERAGE_CAVEAT =
  "GIBS draws no colour below the NDVI ramp start, so negative-index water, " +
  "snow, ice and cloud are excluded and cannot be told apart from unobserved " +
  "ground; this is the mean where NDVI was drawn, not a whole-boundary mean";

/**
 * The clause to append to a vegetation card, or null when it would mislead.
 *
 * Silent on complete coverage, where the mean really does cover the boundary
 * and the clause would describe an exclusion that did not happen. Silent for a
 * single boundary point, which is not a mean over an area at all — the card's
 * own suffix already refuses to present that sample as a regional mean, and
 * this clause's "whole-boundary mean" framing does not apply to it.
 */
export function vegetationDrawnCoverageCaveat(
  drawnFraction: number | null | undefined,
  options: { isRegionalMean: boolean }
): string | null {
  if (!options.isRegionalMean) return null;
  return classifyVegetationDrawnCoverage(drawnFraction) === "complete"
    ? null
    : VEGETATION_DRAWN_COVERAGE_CAVEAT;
}
