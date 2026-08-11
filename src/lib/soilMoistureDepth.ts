/**
 * The soil layer's cited sampling depth (hydrology / land surface).
 *
 * NASA GIBS publishes `GLDAS_Underground_Soil_Moisture_Monthly` under the
 * title "Soil Moisture (Monthly, 0-10 cm, Noah LSM, GLDAS)" — the *topmost*
 * Noah soil layer, not the root zone. RoamingEye previously described it as
 * "root-zone soil moisture", which is a different variable: GLDAS Noah's root
 * zone is the 0-100 cm column (`RootMoist`), and it is the column agronomy and
 * agricultural-drought work actually use.
 *
 * The distinction is not cosmetic. A 0-10 cm column holds at most ~50 kg/m² of
 * water — which is exactly where the layer's GIBS colormap tops out, and about
 * a tenth of what a saturated 0-100 cm root zone holds — and it responds to
 * individual rain events and to evaporative drying within days. The root zone
 * integrates weeks to months. Reading a near-surface value as root-zone water
 * overstates how much water is stored and how persistent a wet or dry signal
 * is, in the exact direction that matters for a drought or crop-stress claim.
 *
 * This module is the single source of truth for the depth string every soil
 * surface prints (legend caption, layer picker, probe axis and CSV header,
 * place-panel metric label), so the depth cannot drift apart between them.
 * Deliberately dependency-free so the modules that describe the layer —
 * including ./timeline — can all cite it without an import cycle.
 *
 * Pure constants and formatting; no rendering, no inference (see
 * soilMoistureDepth.test.ts). The live GIBS title is re-checked weekly by
 * contract/soil-moisture-depth.contract.test.ts, so an upstream re-definition
 * fails loudly rather than silently re-mislabelling the layer.
 */

/** Sampled soil column, in centimetres below the surface, as GIBS declares it. */
export const SOIL_MOISTURE_DEPTH_CM = { top: 0, bottom: 10 } as const;

/** The depth interval as it is printed in every user-facing soil label. */
export const SOIL_MOISTURE_DEPTH_LABEL = `${SOIL_MOISTURE_DEPTH_CM.top}-${SOIL_MOISTURE_DEPTH_CM.bottom} cm`;

/**
 * The depth interval GLDAS Noah's root-zone variable covers. Recorded only to
 * name what this layer is *not*; RoamingEye does not render or sample it.
 */
export const GLDAS_ROOT_ZONE_DEPTH_LABEL = "0-100 cm";

/**
 * Honest limits of a near-surface soil-moisture column. These describe what the
 * sampled depth can and cannot support; they add no drought index, water
 * balance, causal attribution, or forecast.
 */
export const SOIL_MOISTURE_DEPTH_LIMITATIONS = [
  `Soil moisture is sampled over the ${SOIL_MOISTURE_DEPTH_LABEL} surface layer, not the ${GLDAS_ROOT_ZONE_DEPTH_LABEL} root zone; the two are different GLDAS Noah variables and hold different amounts of water.`,
  "A near-surface column responds to individual rain events and to evaporative drying within days, so it is a poor stand-in for the weeks-to-months storage that agricultural drought is defined on.",
  "Values are a land-surface model state, not an in-situ or remotely sensed soil measurement.",
] as const;

/** e.g. "0-10 cm surface layer" — the phrase soil labels append. */
export function soilMoistureDepthText(): string {
  return `${SOIL_MOISTURE_DEPTH_LABEL} surface layer`;
}
