import { PROBE_SCALES } from "./probe";
import { COLORMAP_DOCS } from "./colormap";

/**
 * What a sea-surface-temperature value means when it lands in the *first or
 * last bin* of the ramp GIBS actually renders SST with.
 *
 * GIBS publishes `MODIS_Sea_Surface_Temperature` (units °C) as 216 legend
 * entries: one "No Data" swatch, one **open** low cap tooltipped `< 0.00`,
 * 213 finite 0.15 °C bins spanning 0.00–32.00, and one **open** high cap
 * tooltipped `≥ 32.00`. `parseColormapEntries` keeps only the finite bins —
 * open caps carry no range to take a midpoint of — so the two caps are absent
 * from the inversion table and from every accuracy figure derived from it
 * (`MEASURED_INVERSION.sst` counts 213 entries, not 216).
 *
 * That omission is not neutral. Because inversion is a nearest-entry lookup
 * over the finite bins only, a rendered cap colour does not fail; it silently
 * resolves to the nearest *interior* bin's midpoint. Measured against the live
 * colormap through this app's own `invertColormapEntries`:
 *
 *  - `< 0.00`  rgb(43,0,26)  → 0.075 °C
 *  - `≥ 32.00` rgb(107,2,0)  → 31.9 °C
 *
 * So both caps are reported as ordinary interior readings. A terminal-bin
 * value is therefore a **one-sided bound**, never a two-sided measurement.
 *
 * Two things make this sharper for SST than the generic legend-extreme
 * treatment in `briefLegendSaturation` (which places a value against
 * `PROBE_SCALES` min/max and is layer-agnostic):
 *
 * 1. **The floor sits above the freezing point of seawater.** Sea water
 *    freezes near −1.8 °C at practical salinity 35 (closer to 0 °C as water
 *    freshens), so sub-zero water is a permanent, ordinary state of the polar
 *    and sub-polar ocean — not a rare extreme. Every bit of it renders as the
 *    single `< 0.00` cap and is reported as +0.075 °C, i.e. on the *wrong side
 *    of freezing*. The ramp cannot resolve anything below 0.00 °C at all.
 * 2. **The floor bin is not separable from no-data.** Pure black rgb(0,0,0) —
 *    what undrawn pixels become once GIBS transparency is flattened into a
 *    JPEG tile — sits 53.0 away from the floor bin's rgb(45,0,28), inside the
 *    `NO_DATA_DISTANCE` of 60. Measured, black inverts to 0.075 °C as well.
 *    A floor-bin reading is thus ambiguous three ways: genuinely 0.00–0.15 °C
 *    water, sub-zero water at the open cap, or nothing rendered at all.
 *
 * This module states those facts and classifies a supplied value against them.
 * It applies no correction, estimates no true value behind a bound, and infers
 * no marine-biological, ecological, habitat, sea-ice, hazard, causal, or
 * forecast claim — an SST number, bounded or not, is a physical observation
 * only. The freezing-point figure below is an approximate physical reference
 * for reading the floor, never a measurement taken from the imagery.
 *
 * Constants are committed rather than re-derived at runtime; the drift guard
 * in `sstRampTerminals.test.ts` ties them to `PROBE_SCALES.sst`, so a
 * recalibration of the SST scale fails loudly instead of leaving this
 * description stale.
 */

/** GIBS colormap document these terminals were read from. */
export const SST_RAMP_COLORMAP_DOC = COLORMAP_DOCS.sst;

/**
 * The ramp's structure as published, in the colormap's own units (°C).
 *
 * `floor`/`ceiling` are the finite ramp's outer edges — identical to
 * `PROBE_SCALES.sst` min/max, which were derived from this same document.
 * The `...BinMidpoint` values are what inversion actually returns for a
 * terminal colour, because `parseColormapEntries` represents every bin by its
 * range midpoint.
 */
export const SST_RAMP_TERMINALS = {
  unit: "°C",
  /** Lowest value the finite ramp represents; below this only the open cap. */
  floor: 0,
  /** Highest value the finite ramp represents; above this only the open cap. */
  ceiling: 32,
  /** Width of one published bin (0.00–0.15, 0.15–0.30, …). */
  binWidth: 0.15,
  /** Inversion output for any colour at or below the floor. */
  floorBinMidpoint: 0.075,
  /** Inversion output for any colour at or above the ceiling. */
  ceilingBinMidpoint: 31.9,
  /** Open low-cap swatch; tooltipped `< 0.00`, dropped by the entry parser. */
  openLowCapRgb: { r: 43, g: 0, b: 26 },
  /** Open high-cap swatch; tooltipped `≥ 32.00`, dropped by the entry parser. */
  openHighCapRgb: { r: 107, g: 2, b: 0 },
  /**
   * Euclidean RGB distance from the floor bin's colour to pure black. Below
   * `NO_DATA_DISTANCE` (60), so undrawn pixels are not rejected at the floor.
   */
  floorBinDistanceFromBlack: 53,
} as const;

/**
 * Approximate freezing point of sea water at the surface, practical salinity
 * 35, in °C. A physical reference for interpreting the ramp floor — it is
 * salinity-dependent (nearer 0 °C in brackish water) and is never used to
 * correct, extrapolate, or reconstruct a value behind the cap.
 */
export const SEAWATER_FREEZING_POINT_REFERENCE_C = -1.8;

/**
 * Where a supplied SST value sits relative to the ramp's terminal bins.
 *
 * `unresolvable` marks a value the ramp cannot produce at all (outside
 * floor–ceiling, or not finite) — reported rather than clamped into a bin.
 */
export type SstRampTerminalPosition =
  "floor-bin" | "interior" | "ceiling-bin" | "unresolvable";

/** What kind of statement the value supports, given where it landed. */
export type SstRampReadingKind =
  /** Two-sided: the ramp resolves the value on both sides. */
  | "measurement"
  /** One-sided: the true value may lie at or beyond the bound. */
  | "upper-bound"
  | "lower-bound"
  /** The ramp cannot represent this value; nothing is claimed. */
  | "not-representable";

export interface SstRampTerminalReading {
  kind: "sst-ramp-terminal-reading";
  colormapDoc: typeof SST_RAMP_COLORMAP_DOC;
  unit: typeof SST_RAMP_TERMINALS.unit;
  /** The value as supplied, unmodified; null when not representable. */
  value: number | null;
  position: SstRampTerminalPosition;
  reading: SstRampReadingKind;
  /**
   * True when the ramp saturates here, so the number is a bound. False for
   * interior values and for values the ramp cannot represent at all.
   */
  saturated: boolean;
  /**
   * The one-sided bound the value supports, in °C, or null when the reading is
   * two-sided or not representable. At the floor this is an upper bound; at the
   * ceiling, a lower bound.
   */
  bound: number | null;
  /**
   * True only at the floor bin, where the rendered colour cannot be told apart
   * from an undrawn (black) pixel. Callers must not treat such a value as
   * confirmed water.
   */
  ambiguousWithNoData: boolean;
  /**
   * True at the floor bin: the true SST may be sub-zero, down to the local
   * freezing point, which the ramp does not resolve.
   */
  mayBeSubZero: boolean;
  /** Provenance-tagged sentence for UI/export consumers. */
  statement: string;
}

/**
 * Classify a supplied SST value (°C, as this app reports it) against the
 * ramp's terminal bins.
 *
 * The input is the value already inverted from imagery — the same number the
 * probe and place panel would show — so this describes what that number can
 * legitimately be said to mean, not how it was obtained.
 */
export function readSstRampTerminal(
  value: number | null
): SstRampTerminalReading {
  const position = sstRampTerminalPosition(value);
  const base = {
    kind: "sst-ramp-terminal-reading",
    colormapDoc: SST_RAMP_COLORMAP_DOC,
    unit: SST_RAMP_TERMINALS.unit,
  } as const;

  if (position === "unresolvable") {
    return {
      ...base,
      value: null,
      position,
      reading: "not-representable",
      saturated: false,
      bound: null,
      ambiguousWithNoData: false,
      mayBeSubZero: false,
      statement: unresolvableStatement(),
    };
  }

  const saturated = position !== "interior";
  const atFloor = position === "floor-bin";
  return {
    ...base,
    value: value as number,
    position,
    reading: atFloor
      ? "upper-bound"
      : position === "ceiling-bin"
        ? "lower-bound"
        : "measurement",
    saturated,
    bound: atFloor
      ? SST_RAMP_TERMINALS.binWidth
      : position === "ceiling-bin"
        ? SST_RAMP_TERMINALS.ceiling - SST_RAMP_TERMINALS.binWidth
        : null,
    ambiguousWithNoData: atFloor,
    mayBeSubZero: atFloor,
    statement: terminalStatement(value as number, position),
  };
}

/**
 * Which terminal bin a value falls in. Values are matched against the bin's
 * published *range*, not its midpoint, so a reading carried at reduced
 * precision still classifies correctly.
 */
export function sstRampTerminalPosition(
  value: number | null
): SstRampTerminalPosition {
  if (value === null || !Number.isFinite(value)) return "unresolvable";
  const { floor, ceiling, binWidth } = SST_RAMP_TERMINALS;
  if (value < floor || value > ceiling) return "unresolvable";
  if (value <= floor + binWidth) return "floor-bin";
  if (value >= ceiling - binWidth) return "ceiling-bin";
  return "interior";
}

/**
 * The limits a terminal SST reading carries, as plain sentences. Ordered
 * most-specific first; empty for interior and unresolvable readings, which
 * carry no terminal caveat.
 */
export function sstRampTerminalLimitations(
  reading: SstRampTerminalReading
): string[] {
  if (reading.position === "floor-bin") {
    return [
      `The ramp's lowest finite bin is ${SST_RAMP_TERMINALS.floor}–${SST_RAMP_TERMINALS.binWidth} °C; everything colder shares one open “< ${SST_RAMP_TERMINALS.floor}” swatch, so the value is an upper bound, not a measurement.`,
      `Sea water freezes near ${SEAWATER_FREEZING_POINT_REFERENCE_C} °C at practical salinity 35, so the true value may be below freezing even though the reported number is above it.`,
      "The floor bin's colour is closer to black than the no-data threshold allows, so an undrawn pixel inverts to the same value — a floor reading is not evidence that water was observed.",
      "No sea-ice, biological, ecological, hazard, causal, or forecast claim follows from a floor reading.",
    ];
  }
  if (reading.position === "ceiling-bin") {
    return [
      `The ramp's highest finite bin ends at ${SST_RAMP_TERMINALS.ceiling} °C; everything warmer shares one open “≥ ${SST_RAMP_TERMINALS.ceiling}” swatch, so the value is a lower bound, not a measurement.`,
      "Warm pools that exceed the ramp ceiling are reported at the ceiling, so their peak magnitude and any trend within them are censored.",
      "No biological, ecological, hazard, causal, or forecast claim follows from a ceiling reading.",
    ];
  }
  return [];
}

function terminalStatement(
  value: number,
  position: Exclude<SstRampTerminalPosition, "unresolvable">
): string {
  const shown = `${value} °C`;
  const source = `source ${SST_RAMP_COLORMAP_DOC} colormap`;
  if (position === "interior") {
    return `${shown} sits inside the ${SST_RAMP_TERMINALS.floor}–${SST_RAMP_TERMINALS.ceiling} °C range the SST ramp resolves on both sides; ${source}.`;
  }
  if (position === "floor-bin") {
    return `${shown} is in the SST ramp's lowest bin, where the colormap saturates: the true value is at most ${SST_RAMP_TERMINALS.binWidth} °C and may be below freezing (near ${SEAWATER_FREEZING_POINT_REFERENCE_C} °C at salinity 35), and the same colour is indistinguishable from an undrawn pixel — read it as an upper bound, not a measurement; ${source}.`;
  }
  return `${shown} is in the SST ramp's highest bin, where the colormap saturates: the true value is at least ${SST_RAMP_TERMINALS.ceiling - SST_RAMP_TERMINALS.binWidth} °C — read it as a lower bound, not a measurement; ${source}.`;
}

function unresolvableStatement(): string {
  return `No SST value the ${SST_RAMP_TERMINALS.floor}–${SST_RAMP_TERMINALS.ceiling} °C ramp can represent; source ${SST_RAMP_COLORMAP_DOC} colormap.`;
}

/**
 * Drift anchor: the finite ramp edges this module describes are the same ones
 * the probe scales its SST readings with. Exported so the test can assert the
 * two never diverge.
 */
export const SST_RAMP_SCALE_ANCHOR = {
  min: PROBE_SCALES.sst.min,
  max: PROBE_SCALES.sst.max,
  unit: PROBE_SCALES.sst.unit,
} as const;
