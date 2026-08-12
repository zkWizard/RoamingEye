import { colormapUrl, COLORMAP_DOCS } from "./colormap";
import { PROBE_SCALES } from "./probe";

/**
 * NASA's published MODIS_Sea_Surface_Temperature colormap ends in two OPEN
 * intervals: every SST below 0.00 °C is rendered in one colour ("< 0.00"),
 * and every SST at or above 32.00 °C in another ("≥ 32.00"). Those two caps
 * carry no finite range, so `parseColormapEntries` skips them and the probe's
 * nearest-entry inversion resolves them to the closest finite ramp colour
 * instead — 2.8 RGB units away at the cold end, 3.2 at the warm end, far
 * inside any usable inversion threshold.
 *
 * The consequence for ocean work is a silent CENSORING, not a rejection: a
 * sub-zero polar or sub-polar pixel (seawater freezes near −1.8 °C at 35 PSU,
 * and MODIS/Aqua L3 retrievals routinely report below 0 °C in the Barents,
 * Bering, Labrador, Ross, and Weddell seas in winter) is decoded and reported
 * as ≈ 0.1 °C — a warm bias of up to ~1.9 °C in exactly the waters where the
 * sea-ice margin sits. The warm cap censors the other way in the tropical
 * warm pool.
 *
 * This module does not undo the censoring — the information is genuinely gone
 * from the imagery. It names it, so a decoded value that lands in a terminal
 * ramp bin is reported as a BOUND rather than as a point measurement. It is a
 * statement about the rendered colour ramp only: not a marine-biology,
 * habitat, ecosystem, sea-ice, causal, risk, or forecast claim.
 */

/**
 * The published ramp's terminal bins and the open caps beyond them, read from
 * the live colormap document on 2026-08-11. The contract test re-derives all
 * four numbers from GIBS so an upstream re-render fails loudly rather than
 * quietly changing which values are censored.
 */
export const SST_PUBLISHED_RAMP = {
  colormapDoc: COLORMAP_DOCS.sst,
  unit: PROBE_SCALES.sst.unit,
  /** Lowest finite bin: [0.00, 0.15). Anything colder shares one colour. */
  floorBin: { lo: 0, hi: 0.15 },
  /** Highest finite bin: [31.80, 32.00). Anything warmer shares one colour. */
  ceilingBin: { lo: 31.8, hi: 32 },
} as const;

/**
 * Approximate freezing point of seawater at 35 PSU. Quoted only to say how
 * far below the ramp floor a real ocean observation can legitimately sit; the
 * app never estimates a value for a censored pixel.
 */
export const SEAWATER_FREEZING_POINT_C = -1.8;

export type SstRampCensoringStatus =
  /** Inside the finite ramp; the decoded value stands as an estimate. */
  | "within-published-ramp"
  /** In the ramp's lowest bin, indistinguishable from censored colder water. */
  | "at-ramp-floor"
  /** In the ramp's highest bin, indistinguishable from censored warmer water. */
  | "at-ramp-ceiling"
  /** Outside the published ramp entirely — not a value this ramp can render. */
  | "outside-published-ramp"
  /** No value, or a non-finite one. */
  | "no-value";

export interface SstRampCensoringSummary {
  kind: "sea-surface-temperature-ramp-censoring";
  /** A colour-ramp statement, never a biological one. */
  marineBiologyObservation: false;
  isForecast: false;
  status: SstRampCensoringStatus;
  /** Decoded SST exactly as supplied; null when there is none to describe. */
  observedValue: number | null;
  /**
   * True when the value cannot be distinguished from an observation the ramp
   * collapsed into an end cap, so it must be read as a bound.
   */
  possiblyCensored: boolean;
  /**
   * Which way the true observation can lie. "upper" means the true SST is at
   * or below the decoded value; "lower" means at or above it. Null when the
   * decoded value is not at a terminal bin.
   */
  boundDirection: "upper" | "lower" | null;
  /** Ready-to-render value text: bounded ("≤ 0.1 °C") when censoring is possible. */
  valueText: string | null;
  /** One sentence naming the censoring, or null when there is none to name. */
  qualifier: string | null;
  /** The published ramp this judgement is made against. */
  ramp: typeof SST_PUBLISHED_RAMP;
  /** The authoritative document the ramp was read from. */
  colormapUrl: string;
}

/**
 * Classify a decoded SST against the published ramp's terminal bins.
 *
 * The direction of the bound is safe for a boundary MEAN as well as a single
 * pixel: a censored cold pixel always decodes warmer than it truly is, so a
 * mean sitting in the floor bin can only overstate the true mean (and
 * symmetrically at the ceiling). Values inside the ramp are returned
 * unqualified — this never adds doubt the colormap does not justify.
 */
export function summarizeSstRampCensoring(
  observedValue: number | null | undefined
): SstRampCensoringSummary {
  const value =
    observedValue === null ||
    observedValue === undefined ||
    !Number.isFinite(observedValue)
      ? null
      : observedValue;
  const status = rampStatus(value);
  const possiblyCensored =
    status === "at-ramp-floor" || status === "at-ramp-ceiling";
  const boundDirection =
    status === "at-ramp-floor"
      ? ("upper" as const)
      : status === "at-ramp-ceiling"
        ? ("lower" as const)
        : null;

  return {
    kind: "sea-surface-temperature-ramp-censoring",
    marineBiologyObservation: false,
    isForecast: false,
    status,
    observedValue: value,
    possiblyCensored,
    boundDirection,
    valueText:
      value === null
        ? null
        : `${boundDirection === "upper" ? "≤ " : boundDirection === "lower" ? "≥ " : ""}${value.toFixed(1)} ${SST_PUBLISHED_RAMP.unit}`,
    qualifier: qualifierFor(status),
    ramp: SST_PUBLISHED_RAMP,
    colormapUrl: colormapUrl(SST_PUBLISHED_RAMP.colormapDoc),
  };
}

function rampStatus(value: number | null): SstRampCensoringStatus {
  if (value === null) return "no-value";
  const { floorBin, ceilingBin } = SST_PUBLISHED_RAMP;
  if (value < floorBin.lo || value > ceilingBin.hi) {
    return "outside-published-ramp";
  }
  if (value < floorBin.hi) return "at-ramp-floor";
  // Inclusive of the cap's own edge: 32.00 °C is the open cap's lower bound,
  // and PROBE_SCALES.sst admits it, so it is censored rather than impossible.
  if (value >= ceilingBin.lo) return "at-ramp-ceiling";
  return "within-published-ramp";
}

function qualifierFor(status: SstRampCensoringStatus): string | null {
  const { floorBin, ceilingBin } = SST_PUBLISHED_RAMP;
  const unit = SST_PUBLISHED_RAMP.unit;
  if (status === "at-ramp-floor") {
    return `at the published colormap's lowest bin — NASA renders every SST below ${floorBin.lo.toFixed(1)} ${unit} in a single colour, so this is an upper bound on a possibly colder observation (seawater freezes near ${SEAWATER_FREEZING_POINT_C} ${unit})`;
  }
  if (status === "at-ramp-ceiling") {
    return `at the published colormap's highest bin — NASA renders every SST at or above ${ceilingBin.hi.toFixed(1)} ${unit} in a single colour, so this is a lower bound on a possibly warmer observation`;
  }
  if (status === "outside-published-ramp") {
    return `outside the published colormap's ${floorBin.lo.toFixed(1)}–${ceilingBin.hi.toFixed(1)} ${unit} range, so it cannot have been decoded from this ramp`;
  }
  return null;
}
