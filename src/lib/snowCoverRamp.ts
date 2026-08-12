import { buildColormapLut, invertColormap, PROBE_SCALES } from "./probe";
import type { Rgb } from "./probe";
import { LEGENDS, type GradientLegendSpec } from "./legend";

/**
 * The snow-cover layer's authoritative rendering ramp, and the audit that
 * keeps the app's legend gradient faithful to it.
 *
 * The cryosphere layer is served as
 * `MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct`, and GIBS's WMTS
 * capabilities name `MODIS_NDSI_Snow_Cover` as the colormap it renders those
 * tiles with. That document is *not* one of the continuous ramps in
 * lib/colormap.ts: it is a **discrete** legend (one colour per whole percent)
 * plus a second, `classification` legend holding eight non-measurement flags
 * — cloud, night, ocean, fill and friends — that GIBS draws as opaque colours
 * over the same imagery.
 *
 * Two consequences the probe has to respect, both measured from the live
 * document (see snowCoverRamp.test.ts) rather than assumed:
 *
 *  1. The ramp is **banded**. Values 1–20, 21–40, 41–60 and 61–80 each share a
 *     green channel (240/210/180/150) and differ only in a 19-step blue
 *     ripple; 81–99 are finely resolved; 100 is a separate pure red. So the
 *     rendered imagery resolves high snow fractions far better than low ones,
 *     and a probed percentage is a reading of the ramp, not of MOD10CM's own
 *     value.
 *  2. Percent 0 is rendered **transparent** — snow-free ground is simply not
 *     drawn. In a rendered tile "no snow" and "no observation" therefore look
 *     identical, so the probe cannot distinguish them and reports neither.
 *
 * Pure and offline-testable; the live-XML run is the weekly contract test
 * (contract/snow-cover-ramp.contract.test.ts).
 */

/** Colormap document GIBS names in the snow layer's WMTS `ows:Metadata`. */
export const SNOW_COVER_COLORMAP_DOC = "MODIS_NDSI_Snow_Cover";

/** One rendered ramp colour and the snow-cover percent it stands for. */
export interface SnowCoverRampEntry {
  rgb: Rgb;
  /** Whole percent of the monthly average snow-cover field, 1–100. */
  percent: number;
}

/** A colour GIBS draws for an observation *flag*, not for a snow amount. */
export interface SnowCoverFlagColor {
  /** The class name as published in the colormap document. */
  label: string;
  rgb: Rgb;
}

/**
 * The non-measurement classes, committed from the live document on
 * 2026-08-11. None of these is a snow-cover percentage: they say the product
 * made no observation (missing, no decision, night, cloud, detector
 * saturated) or that the pixel is not land (inland water, ocean, fill).
 * Decoding any of them as a percentage would invent snow where MOD10CM
 * reports none — the failure this module exists to prevent.
 */
export const SNOW_COVER_FLAG_COLORS: readonly SnowCoverFlagColor[] = [
  { label: "Missing Data", rgb: { r: 255, g: 200, b: 255 } },
  { label: "No Decision", rgb: { r: 200, g: 200, b: 200 } },
  { label: "Night", rgb: { r: 189, g: 0, b: 189 } },
  { label: "Inland Water", rgb: { r: 0, g: 0, b: 255 } },
  { label: "Ocean", rgb: { r: 35, g: 35, b: 117 } },
  { label: "Cloud", rgb: { r: 0, g: 191, b: 255 } },
  { label: "Detector Saturated", rgb: { r: 170, g: 0, b: 0 } },
  { label: "Fill", rgb: { r: 255, g: 255, b: 255 } },
];

const LEGEND_ENTRY = /<LegendEntry\b[^>]*\/?>/g;
const ENTRY_RGB = /rgb="(\d+),(\d+),(\d+)"/;
const ENTRY_TOOLTIP = /tooltip="([^"]*)"/;

function legendSection(xml: string, type: string): string | null {
  return (
    new RegExp(`<Legend type="${type}"[\\s\\S]*?<\\/Legend>`).exec(xml)?.[0] ??
    null
  );
}

/**
 * Parse the discrete data ramp: every rendered colour paired with its whole
 * percent. Percent 0 is skipped — GIBS marks it transparent, so it carries no
 * colour a probe could ever sample (the contract test re-checks that flag
 * against the live document instead of trusting this comment).
 */
export function parseSnowCoverRampEntries(xml: string): SnowCoverRampEntry[] {
  const legend = legendSection(xml, "discrete");
  if (!legend) return [];
  const entries: SnowCoverRampEntry[] = [];
  for (const tag of legend.match(LEGEND_ENTRY) ?? []) {
    const rgb = ENTRY_RGB.exec(tag);
    const tooltip = ENTRY_TOOLTIP.exec(tag);
    if (!rgb || !tooltip) continue;
    const percent = Number(tooltip[1]);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) continue;
    entries.push({
      rgb: { r: +rgb[1], g: +rgb[2], b: +rgb[3] },
      percent,
    });
  }
  return entries;
}

/** Parse the second, `classification` legend: the observation-flag colours. */
export function parseSnowCoverFlagColors(xml: string): SnowCoverFlagColor[] {
  const legend = legendSection(xml, "classification");
  if (!legend) return [];
  const flags: SnowCoverFlagColor[] = [];
  for (const tag of legend.match(LEGEND_ENTRY) ?? []) {
    const rgb = ENTRY_RGB.exec(tag);
    const tooltip = ENTRY_TOOLTIP.exec(tag);
    if (!rgb || !tooltip) continue;
    flags.push({
      label: tooltip[1].trim(),
      rgb: { r: +rgb[1], g: +rgb[2], b: +rgb[3] },
    });
  }
  return flags;
}

export interface SnowCoverInversionAudit {
  /** Ramp colours considered. */
  total: number;
  /** Ramp colours the legend gradient rejects as no-data. Must stay 0. */
  nulls: number;
  /** RMSE of recovered − published percent, in percentage points. */
  rmse: number | null;
  /** Mean signed error, percentage points. */
  bias: number | null;
  /** Largest absolute error, percentage points. */
  worstAbsError: number | null;
  /** Whether recovered percent rises monotonically with published percent. */
  monotone: boolean;
  /**
   * Closest any flag colour comes (Euclidean RGB) to the legend gradient.
   * Above probe.NO_DATA_DISTANCE means every flag is rejected outright.
   */
  tightestFlagDistance: number;
  /** Flag labels the gradient would decode as a percentage. Must stay empty. */
  decodedFlags: string[];
}

/**
 * Run GIBS's own ramp colours through the production inversion the probe uses
 * for this layer (the legend gradient + the 0–100 % probe scale) and report
 * the residuals — plus how far the non-measurement flags sit from that
 * gradient, which is what stops cloud and fill pixels being read as snow.
 */
export function auditSnowCoverInversion(
  entries: readonly SnowCoverRampEntry[],
  flags: readonly SnowCoverFlagColor[] = SNOW_COVER_FLAG_COLORS
): SnowCoverInversionAudit {
  const spec = LEGENDS.snow as GradientLegendSpec;
  const lut = buildColormapLut(spec.stops);
  const scale = PROBE_SCALES.snow;
  const span = scale.max - scale.min;
  const recovered = (rgb: Rgb): number | null => {
    const position = invertColormap(rgb, lut);
    return position === null ? null : scale.min + position * span;
  };

  const errors: number[] = [];
  let nulls = 0;
  let monotone = true;
  let previous = -Infinity;
  for (const entry of [...entries].sort((a, b) => a.percent - b.percent)) {
    const value = recovered(entry.rgb);
    if (value === null) {
      nulls++;
      continue;
    }
    if (value < previous - 1e-9) monotone = false;
    previous = value;
    errors.push(value - entry.percent);
  }

  let tightestFlagDistance = Infinity;
  const decodedFlags: string[] = [];
  for (const flag of flags) {
    for (const color of lut) {
      const distance = Math.hypot(
        flag.rgb.r - color.r,
        flag.rgb.g - color.g,
        flag.rgb.b - color.b
      );
      if (distance < tightestFlagDistance) tightestFlagDistance = distance;
    }
    if (recovered(flag.rgb) !== null) decodedFlags.push(flag.label);
  }

  const n = errors.length;
  return {
    total: entries.length,
    nulls,
    rmse: n ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n) : null,
    bias: n ? errors.reduce((s, e) => s + e, 0) / n : null,
    worstAbsError: n ? Math.max(...errors.map((e) => Math.abs(e))) : null,
    monotone,
    tightestFlagDistance,
    decodedFlags,
  };
}

/**
 * Figures measured 2026-08-11 against the live `MODIS_NDSI_Snow_Cover`
 * document. The weekly contract test re-measures and asserts these still
 * hold, so a GIBS re-render or a legend edit fails CI instead of quietly
 * degrading the only cryosphere readout in the app.
 *
 * For scale: `validation.MEASURED_INVERSION` records RMSE 8.23 kg/m² for soil
 * moisture and 18.95 K for air temperature, because those legends approximate
 * a continuous ramp with a handful of stops. Snow does far better (0.62 of
 * 100 percentage points) only because the published ramp is coarse enough to
 * reproduce stop-for-stop — accuracy against the *rendering*, not against
 * MOD10CM's own snow-cover retrieval, whose uncertainty is the product team's
 * published validation.
 */
export const MEASURED_SNOW_COVER_INVERSION = {
  total: 100,
  nulls: 0,
  rmse: 0.62,
  /** Ceiling on the largest single-colour error; measured 1.94. */
  worstAbsError: 1.95,
  /** Nearest flag is "No Decision" grey, well outside NO_DATA_DISTANCE (60). */
  tightestFlagDistance: 67.1,
} as const;
