import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first spatial-support (native-grid) descriptor for a multi-signal
 * environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature
 * as monthly source observations for one place. Sampling them at a shared point
 * or box invites a reader to treat the four values as describing the same patch
 * of ground at the same detail. But each product is published on its own native
 * grid: MOD13A3 NDVI is a 1 km grid, while the GLDAS land-surface fields are a
 * 0.25° grid (~28 km at the equator). A 1 km vegetation pixel and a ~28 km land
 * cell are *not co-registered* — the coarse cell averages over an area hundreds
 * of times larger. This module makes that grain difference explicit.
 *
 * It is deliberately distinct from — and composes with — the brief's other
 * rigor descriptors:
 *   - coverage adequacy   → what usable SHARE of the sampled area returned data
 *   - temporal alignment  → whether the data MONTHS line up
 *   - source independence → whether two signals share a SOURCE PRODUCT
 *   - unit commensurability → whether the values share UNITS
 * Native support is a fifth axis: the SIZE of each product's native grid cell.
 *
 * Provenance discipline: the native grid is read only from the dataset's cited
 * title (the same metadata already carried on every `DatasetRef`), never from
 * an invented side table. A citation that states no grid — e.g. the MERRA-2 2 m
 * air-temperature title — is reported as `unknown`, not back-filled with a
 * guessed resolution. The nominal metres for an angular grid use the meridional
 * degree length (~111.32 km) and are a coarse, latitude-dependent order-of-
 * magnitude figure for comparison only — never a ground-resolution or accuracy
 * claim. It reports grid structure and nothing about the values themselves: no
 * condition, comparison, risk, causation, or forecast.
 */

/** Mean length of one degree of latitude (WGS84), for nominal angular scale. */
const METRES_PER_DEGREE = 111_320;

/** One signal's native grid, read from its cited dataset title. */
export interface SignalSpatialSupport {
  id: EnvironmentSignalId;
  label: string;
  /** Provenance for the observation; never dropped. */
  source: DatasetRef;
  /**
   * Native grid token exactly as it appears in the dataset title (e.g. "1km",
   * "0.25°", "0.05Deg"); null when the cited title states no grid.
   */
  statedGrid: string | null;
  /**
   * Nominal representative linear cell size in metres for `statedGrid`; null
   * when the grid is unknown. Angular grids use the meridional degree length
   * and vary with latitude — a coarse comparison figure, not a precision claim.
   */
  nominalMetres: number | null;
  /** Honest, source-carrying sentence; no fitness, quality, or value claim. */
  statement: string;
}

export interface SpatialSupportSummary {
  kind: "spatial-support";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal native grid, in signal order. */
  signals: SignalSpatialSupport[];
  /**
   * Number of distinct native grids among signals whose grid is stated
   * (deduplicated by nominal metres).
   */
  distinctStatedGrids: number;
  /** Ids of signals whose citation title states no native grid, in order. */
  unknownGridSignalIds: EnvironmentSignalId[];
  /** Finest / coarsest nominal cell size (metres) among stated grids; null when none. */
  finestMetres: number | null;
  coarsestMetres: number | null;
  /**
   * Coarsest ÷ finest nominal linear scale among stated grids; null when fewer
   * than two signals carry a stated grid. 1 when every stated grid matches.
   */
  scaleRatio: number | null;
  /**
   * Nominal AREAL grain contrast: the square of `scaleRatio`, i.e. roughly how
   * many finest-grid cells tile one coarsest cell. This is the magnitude that
   * governs the change-of-support caveat — a coarse cell averages over an area,
   * not a length, so a modest linear ratio (e.g. ~28×) is a far larger areal
   * one (~780×). Null when `scaleRatio` is null; 1 when every stated grid
   * matches. A nominal comparison figure, never a measured footprint or
   * accuracy claim.
   */
  areaScaleRatio: number | null;
  /**
   * True only when 2+ considered signals all carry the same stated grid and
   * none is unknown — the only case where a shared native support can be
   * asserted.
   */
  commonGrid: boolean;
  /** Honest one-line summary; native support is grid structure, not fitness. */
  statement: string;
  limits: string[];
}

export interface SpatialSupportOptions {
  /**
   * Which signals to assess. "available" (default) considers only signals
   * carrying a usable observation, because grain matters for the evidence a
   * reader would actually place side by side; "all" describes the brief's whole
   * native-support basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const SPATIAL_SUPPORT_LIMITS = [
  "Native support is a product's grid-cell size, not the accuracy of its values.",
  "The grid is read only from the cited title; an unstated grid is left unknown.",
  "Nominal metres for angular grids use the degree length and vary with latitude.",
  "Area contrast is the square of the linear grid ratio — a nominal comparison figure, not a measured footprint.",
];

/**
 * Read a native grid token from a dataset title. Recognizes kilometre ("1km",
 * "9 km"), degree ("0.25°", "0.05Deg"), and bare-metre ("500 m") grids, tried
 * in that order so a "km" token is never mis-read as bare metres. Returns null
 * when the title states no recognizable grid, so provenance is never invented.
 */
export function parseNativeGrid(
  title: string
): { statedGrid: string; nominalMetres: number } | null {
  const km = /(\d+(?:\.\d+)?)\s*km\b/i.exec(title);
  if (km) {
    return { statedGrid: km[0].trim(), nominalMetres: Number(km[1]) * 1000 };
  }
  const deg = /(\d+(?:\.\d+)?)\s*(?:°|deg(?:ree)?s?\b)/i.exec(title);
  if (deg) {
    return {
      statedGrid: deg[0].trim(),
      nominalMetres: Number(deg[1]) * METRES_PER_DEGREE,
    };
  }
  const metres = /(\d+(?:\.\d+)?)\s*m\b/i.exec(title);
  if (metres) {
    return { statedGrid: metres[0].trim(), nominalMetres: Number(metres[1]) };
  }
  return null;
}

/**
 * Describe the native spatial grid of a composed brief's signals and report
 * whether they share one. Signals on different grids are not co-registered:
 * a value from a coarse cell averages over a far larger area than a fine one,
 * so the two must not be read as the same patch of ground at the same detail.
 * This reports grid structure only — never a condition, comparison, or forecast.
 */
export function summarizeSpatialSupport(
  signals: readonly EnvironmentSignalBrief[],
  options?: SpatialSupportOptions
): SpatialSupportSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const perSignal = considered.map((signal) => describeSignal(signal));
  const consideredSignalIds = perSignal.map((entry) => entry.id);
  const unknownGridSignalIds = perSignal
    .filter((entry) => entry.nominalMetres === null)
    .map((entry) => entry.id);

  const knownMetres = perSignal
    .map((entry) => entry.nominalMetres)
    .filter((metres): metres is number => metres !== null);
  const distinctStatedGrids = new Set(knownMetres).size;
  const finestMetres = knownMetres.length ? Math.min(...knownMetres) : null;
  const coarsestMetres = knownMetres.length ? Math.max(...knownMetres) : null;
  const scaleRatio =
    knownMetres.length >= 2 && finestMetres && finestMetres > 0
      ? coarsestMetres! / finestMetres
      : null;
  const areaScaleRatio = scaleRatio === null ? null : scaleRatio * scaleRatio;
  const commonGrid =
    considered.length >= 2 &&
    unknownGridSignalIds.length === 0 &&
    distinctStatedGrids === 1;

  return {
    kind: "spatial-support",
    consideredSignalIds,
    signals: perSignal,
    distinctStatedGrids,
    unknownGridSignalIds,
    finestMetres,
    coarsestMetres,
    scaleRatio,
    areaScaleRatio,
    commonGrid,
    statement: summaryStatement({
      consideredCount: considered.length,
      distinctStatedGrids,
      unknownGridSignalIds,
      finestMetres,
      coarsestMetres,
      scaleRatio,
      areaScaleRatio,
    }),
    limits: SPATIAL_SUPPORT_LIMITS,
  };
}

function describeSignal(signal: EnvironmentSignalBrief): SignalSpatialSupport {
  const grid = parseNativeGrid(signal.source.title);
  const source = sourceLabel(signal.source);
  if (!grid) {
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      statedGrid: null,
      nominalMetres: null,
      statement: `${signal.label}: native grid not stated in the cited title; source ${source}.`,
    };
  }
  return {
    id: signal.id,
    label: signal.label,
    source: signal.source,
    statedGrid: grid.statedGrid,
    nominalMetres: grid.nominalMetres,
    statement: `${signal.label}: ${grid.statedGrid} native grid (~${formatMetres(grid.nominalMetres)} nominal); source ${source}.`,
  };
}

function summaryStatement(summary: {
  consideredCount: number;
  distinctStatedGrids: number;
  unknownGridSignalIds: EnvironmentSignalId[];
  finestMetres: number | null;
  coarsestMetres: number | null;
  scaleRatio: number | null;
  areaScaleRatio: number | null;
}): string {
  const unknownClause =
    summary.unknownGridSignalIds.length > 0
      ? ` Native grid not stated in the citation for: ${summary.unknownGridSignalIds.join(", ")}.`
      : "";

  if (summary.consideredCount === 0) {
    return "No usable observations to compare for native spatial support.";
  }

  const knownCount =
    summary.consideredCount - summary.unknownGridSignalIds.length;

  if (knownCount === 0) {
    return `No cited native grid for the ${summary.consideredCount} usable observation${plural(
      summary.consideredCount
    )}.${unknownClause}`;
  }

  if (knownCount === 1) {
    return `Only 1 usable observation carries a stated native grid (~${formatMetres(
      summary.finestMetres!
    )}); a cross-signal support comparison needs two or more.${unknownClause}`;
  }

  if (summary.distinctStatedGrids === 1) {
    return `${knownCount} usable observations share one ~${formatMetres(
      summary.finestMetres!
    )} native grid.${unknownClause}`;
  }

  const range = `${summary.distinctStatedGrids} distinct native grids (~${formatMetres(
    summary.finestMetres!
  )} to ~${formatMetres(summary.coarsestMetres!)})`;
  return `${knownCount} usable observations sit on ${range}; the coarsest cell is ~${formatRatio(
    summary.scaleRatio!
  )} the finest in linear scale, so it averages over about ${formatRatio(
    summary.areaScaleRatio!
  )} the area — they are not co-registered at a common resolution and should not be read as the same patch of ground at the same detail.${unknownClause}`;
}

/** Compact cell-size label: kilometres above 1 km, else metres. */
function formatMetres(metres: number): string {
  if (metres >= 1000) {
    return `${Number((metres / 1000).toPrecision(3))} km`;
  }
  return `${Number(metres.toPrecision(3))} m`;
}

function formatRatio(ratio: number): string {
  return ratio >= 10
    ? `${Math.round(ratio)}×`
    : `${Number(ratio.toPrecision(2))}×`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
