import { IGBP_LAND_COVER_CLASSES } from "./landCover";

/**
 * The interpretation guardrail for the land-cover legend.
 *
 * Every other layer the legend draws is a magnitude: its bar runs from a low
 * value to a high one, so position on the scale carries meaning and the note
 * that follows the citation only has to say what the magnitude is not. Land
 * cover is the app's one categorical layer. Its colours are *names* — the
 * swatch order is the IGBP code order, which ranks nothing — and until now it
 * was also the one layer whose legend rendered a bare "Source: MCD12Q1 v061."
 * with no guardrail at all, while both vegetation-index layers and snow cover
 * carried one (lib/legend `LEGENDS`).
 *
 * Two things a reader can get wrong from the swatches alone, both already
 * stated by modules that only run once a probe has been drawn:
 *
 *  - **A class is counted, never averaged.** `landCoverCompositionReading.ts`
 *    ships that sentence on every region reading, but a user who never draws a
 *    region never sees it, and a strip of colours reads like a scale.
 *  - **A class is a cover threshold its definition requires, not a statement of
 *    what the pixel holds.** `vegetationIndexLandCoverSupport.ts` partitions
 *    the classes on exactly this distinction; Barren is the sharpest case,
 *    because the MCD12Q1 v061 LC_Type1 definition requires at least 60%
 *    non-vegetated sand, rock, or soil and still permits vegetation below 10%.
 *    "Barren" on the globe therefore does not mean "no plants".
 *
 * The class count is derived from {@link IGBP_LAND_COVER_CLASSES} rather than
 * written out, so a change to the class table cannot leave the sentence the
 * user reads claiming a count the legend no longer draws — the same rule
 * `vegetationIndexLegendNote` follows for the rendered ramp bounds.
 *
 * Nothing here interprets the map. The note reports what a class label is and
 * what its definition requires; it infers no biomass, biodiversity, habitat
 * quality, ecological health, cause, or forecast, and it does not claim any
 * particular pixel is correctly classified.
 */

/**
 * Informative IGBP LC_Type1 classes — codes 1..17. The unclassified code 255
 * is drawn in the legend but carries no land-cover type, so it is not counted
 * among the classes the note names.
 */
export const INFORMATIVE_IGBP_CLASS_COUNT = IGBP_LAND_COVER_CLASSES.filter(
  (entry) => entry.isInformativeLandCover
).length;

/**
 * The sentence the legend renders after the MCD12Q1 citation.
 *
 * Kept to the two guardrails above: it says what a colour is (a name, not a
 * rank) and what a class definition is (a threshold, not a measurement).
 */
export function landCoverLegendNote(): string {
  return (
    `Colours name a class; they do not rank one — the ${INFORMATIVE_IGBP_CLASS_COUNT} IGBP classes are ` +
    "counted, never averaged, and the swatch order carries no magnitude. A class is the cover " +
    "threshold its definition requires, not what a pixel holds: Barren still permits vegetation below 10%."
  );
}
