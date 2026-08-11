import type { MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Gross-error plausibility band for monthly soil-moisture observations
 * (terrestrial water storage).
 *
 * Air temperature and precipitation rate each have such a band
 * (./airTemperaturePlausibility.ts, ./precipitationRatePlausibility.ts); soil
 * moisture was the one climate metric passed through unchecked. `climate.ts`
 * only guards that a usable value is finite and non-negative, which still
 * admits physically impossible readings: a mis-applied scale factor, a value
 * carrying a deeper column's water mass, a percentage or fraction read as a
 * mass per unit area, or a decode error all pass that guard. This module adds
 * the conservative outer sanity band so those gross mistakes can be flagged
 * before a caller surfaces them as a real observation.
 *
 * Two independent ceilings were available, and the band deliberately takes the
 * looser one (see SOIL_MOISTURE_COLUMN and RENDERED_SOIL_MOISTURE_RAMP):
 *  - *Physical.* Water stored in a soil column of depth d cannot exceed
 *    d × 1000 kg/m³, the mass of an equally deep column of pure liquid water.
 *    That limit assumes a porosity of 1 — soil that is entirely pore space —
 *    so it is unreachable by any real soil, whose porosity is roughly 0.4–0.6.
 *  - *Rendered.* The value reaching this check is inverted from GIBS imagery,
 *    and the GIBS colormap for this layer spans 0–50 kg/m². A correct
 *    inversion therefore cannot express a value above the ramp's top bin.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - This is a *gross-error* check, NOT a climatological range and NOT a
 *    correctness guarantee. A value inside the band can still be wrong; the
 *    band only rejects readings this rendered variable could not produce.
 *  - The bounds are fixed reference values derived from the rendered layer's
 *    own depth and colormap, never from the sampled data.
 *  - A bone-dry month is legitimately zero, so only a negative water mass —
 *    impossible for a stored quantity — is flagged on the low side. Upstream
 *    `climate.ts` already rejects negatives, but the band is kept
 *    self-contained so it does not assume that guard ran.
 *  - The band says nothing about wetness, drought, runoff, infiltration,
 *    water-balance closure, or any future value. It only asks whether the
 *    number could be a soil-water mass at all.
 */

/**
 * The soil column GIBS actually renders for this layer, and the ceiling that
 * follows from its depth.
 *
 * The depth is read from the source rather than from prose: GIBS's WMTS
 * capabilities give `GLDAS_Underground_Soil_Moisture_Monthly` the ows:Title
 * "Soil Moisture (Monthly, 0-10 cm, Noah LSM, GLDAS)" — the shallowest of the
 * four GLDAS Noah soil layers (0-10, 10-40, 40-100, 100-200 cm), not the whole
 * root zone. The ceiling below is proportional to that depth, so it must be
 * re-derived if the rendered variable is ever changed to a deeper column.
 */
export const SOIL_MOISTURE_COLUMN = {
  /** Layer identifier whose ows:Title supplies the depth. */
  renderedLayer: "GLDAS_Underground_Soil_Moisture_Monthly",
  /** Depth of the rendered soil column, in metres (0-10 cm). */
  depthM: 0.1,
  /** Density of liquid water, in kg/m³; 1 mm of water ≡ 1 kg/m². */
  waterDensityKgM3: 1_000,
  /**
   * Water mass the column holds at the unreachable porosity of 1, in kg/m².
   * A real saturated soil reaches roughly 0.4–0.6 of this.
   */
  saturatedCeilingKgM2: 0.1 * 1_000, // 100 kg/m²
} as const;

/**
 * Top of the GIBS colormap ramp this layer is rendered and inverted through,
 * in kg/m². The document's continuous legend runs 0–50 kg/m² and closes with
 * an open "≥ 50.0" bin, so a correct inversion cannot report a higher value.
 * Kept as the second, tighter anchor the band stays clear of.
 */
export const RENDERED_SOIL_MOISTURE_RAMP = {
  maxKgM2: 50,
  colormapDoc: "GLDAS_Underground_Soil_Moisture_Monthly",
} as const;

/**
 * Inclusive plausibility band for a monthly soil-moisture reading, in kg/m².
 * The upper bound is the saturated ceiling of the rendered 0-10 cm column —
 * twice the top of the ramp the value is inverted through — so no genuine
 * reading, saturated or otherwise, is ever flagged. Only values the rendered
 * variable could not produce (a deeper column's water mass, a mis-scaled
 * sample, a decode error) fall outside it.
 */
export const PLAUSIBLE_SOIL_MOISTURE_KG_M2 = {
  /** A bone-dry month is real; a negative water mass is a decode error. */
  minKgM2: 0,
  /** 0.1 m of pure water — 2× the rendered ramp's 50 kg/m² top. */
  maxKgM2: SOIL_MOISTURE_COLUMN.saturatedCeilingKgM2,
} as const;

const PLAUSIBILITY_BASIS =
  "conservative gross-error band (0–100 kg/m²), the water a 0-10 cm soil " +
  "column holds at the unreachable porosity of 1 (0.1 m × 1000 kg/m³) and " +
  "twice the top of the GIBS ramp this layer is inverted through (0–50 " +
  "kg/m²); flags impossible values (a deeper column's water mass, a " +
  "mis-scaled sample, a decode error), not climatological limits";

export type SoilMoisturePlausibilityStatus =
  "plausible" | "implausibly-negative" | "implausibly-wet" | "not-usable";

export interface SoilMoisturePlausibility {
  kind: "soil-moisture-plausibility";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Same cited product as the observation; provenance is unchanged. */
  source: DatasetRef;
  dataMonth: YearMonth;
  /** The observed water mass in kg/m², or null when there was none to check. */
  observedKgM2: number | null;
  status: SoilMoisturePlausibilityStatus;
  /** Inclusive band the value was checked against. */
  bounds: { minKgM2: number; maxKgM2: number };
  /** The dimensional basis for the band; never a data-derived estimate. */
  basis: string;
  /** Why a value could not be checked, or null when one was. */
  reason: string | null;
}

/**
 * Check a monthly climate summary's soil-moisture value against the
 * gross-error plausibility band. Returns null for any other metric so a caller
 * cannot mistakenly apply a soil-moisture band to air temperature or
 * precipitation. A not-yet-published, invalid, or no-data month yields a
 * `not-usable` status rather than a fabricated verdict.
 */
export function soilMoisturePlausibility(
  summary: MonthlyClimateSummary
): SoilMoisturePlausibility | null {
  if (summary.metric.id !== "soil-moisture") {
    return null;
  }

  const bounds = {
    minKgM2: PLAUSIBLE_SOIL_MOISTURE_KG_M2.minKgM2,
    maxKgM2: PLAUSIBLE_SOIL_MOISTURE_KG_M2.maxKgM2,
  };
  const base = {
    kind: "soil-moisture-plausibility" as const,
    isForecast: false as const,
    source: summary.metric.source,
    dataMonth: summary.dataMonth,
    bounds,
    basis: PLAUSIBILITY_BASIS,
  };

  const value = summary.observedValue;
  const usable =
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    value !== null &&
    Number.isFinite(value);
  if (!usable || value === null) {
    return {
      ...base,
      observedKgM2: null,
      status: "not-usable",
      reason: unusableReason(summary),
    };
  }

  const status: SoilMoisturePlausibilityStatus =
    value < bounds.minKgM2
      ? "implausibly-negative"
      : value > bounds.maxKgM2
        ? "implausibly-wet"
        : "plausible";

  return { ...base, observedKgM2: value, status, reason: null };
}

function unusableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  if (summary.coverage.status !== "available") {
    return summary.coverage.reason ?? "no-usable-value";
  }
  return "no-usable-value";
}

/**
 * A compact, honest readout of a plausibility verdict with its cited source.
 * Emphasizes that a "plausible" result is a sanity pass, not a correctness
 * claim, and that a flagged value is likely a unit/decode error.
 */
export function formatSoilMoisturePlausibility(
  result: SoilMoisturePlausibility
): string {
  const source = `${result.source.shortName} v${result.source.version}`;
  if (result.status === "not-usable" || result.observedKgM2 === null) {
    return `No usable soil-moisture value to check (${result.reason ?? "unspecified"}); source ${source}`;
  }
  const value = `${formatNumber(result.observedKgM2)} kg/m²`;
  if (result.status === "plausible") {
    return `${value} within plausible soil-moisture band ${result.bounds.minKgM2}–${result.bounds.maxKgM2} kg/m² (gross-error sanity pass, not a correctness guarantee); source ${source}`;
  }
  const side = result.status === "implausibly-negative" ? "below" : "above";
  return `${value} is ${side} the plausible soil-moisture band ${result.bounds.minKgM2}–${result.bounds.maxKgM2} kg/m²; likely a unit or decode error, not a real observation; source ${source}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
