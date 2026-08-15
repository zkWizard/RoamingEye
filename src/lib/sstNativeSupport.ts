import type { Bounds } from "./imagery";
import { SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE } from "./marineCoverage";
import { parseNativeGrid } from "./spatialSupport";
import type { DatasetRef, LayerId } from "./timeline";

/**
 * Provenance-first native-grid adequacy descriptor for a boundary-mean SST.
 *
 * The place panel reports an area-weighted mean of the rendered SST pixels
 * inside a searched boundary and calls it a "boundary-mean". Rendered pixels
 * are not independent measurements: the cited product is published on a ~9 km
 * L3 grid, and GIBS resamples that grid onto whatever image the sampler
 * requests. A boundary smaller than one native cell therefore yields many
 * rendered pixels that all carry a single source value — and that one cell's
 * ~9 km footprint extends beyond the searched boundary, so the value partly
 * describes water the user did not ask about.
 *
 * This module states how many native cells a boundary's extent can span. It is
 * deliberately a different axis from the marine descriptors it composes with:
 *   - coverage adequacy (`marineBoundarySstSupport`) → what SHARE of the
 *     sampled boundary returned usable pixels
 *   - sampling constraints (`sstObservingConstraints`) → WHICH MOMENTS the
 *     monthly composite actually samples
 *   - ramp censoring (`sstRampCensoring`) → whether the VALUE sits in an open
 *     terminal bin
 * Native support asks a fourth question: can the boundary resolve more than one
 * independent source measurement at all?
 *
 * Honesty discipline, matching `spatialSupport`:
 *  - The grid is read only from the dataset's cited title, never from an
 *    invented side table. A citation stating no grid is reported `unknown`.
 *  - The cell count is an UPPER BOUND from the boundary's angular extent. It is
 *    not a count of retrievals: cloud screening removes cells, and the bounding
 *    box is at least as large as the boundary itself. Fewer independent values
 *    may stand behind the mean; never more.
 *  - Nominal metres use the meridional degree length and the box's mid-latitude
 *    cosine — a coarse, order-of-magnitude figure for comparison only, not a
 *    ground-resolution, projection, or accuracy claim.
 *  - It describes grid structure and sampling geometry only: no temperature,
 *    condition, marine-biology, habitat, causal, risk, or forecast claim.
 */

/** Mean length of one degree of latitude (WGS84), for nominal angular scale. */
const METRES_PER_DEGREE = 111_320;

/**
 * Minimum cosine applied to the mid-latitude when converting a longitude span
 * to metres. Longitude cells collapse to zero width at the poles, which would
 * mint an unbounded cell count for a polar box; clamping keeps the bound finite
 * and conservative. Matches the floor `imagery.ts` already applies for the same
 * reason.
 */
const MIN_LATITUDE_COSINE = 0.15;

export type SstNativeSupportStatus =
  "graded" | "unknown-native-grid" | "invalid-bounds";

/**
 * Which footprint a qualifying note is spoken about. The same geometry bound
 * qualifies two surfaces that name their footprint differently: the place panel
 * searches a named boundary, the probe charts a box the user drew. The
 * `sampled-area` footprint of `marineAveragedSstSupport` is deliberately absent
 * — that box is a fixed ~1°, which under the mid-latitude cosine floor still
 * spans more than one cell each way, so it never reaches a qualifying state.
 */
export type SstNativeSupportFootprint = "searched-boundary" | "drawn-region";

export type SstNativeSupportClass =
  /** Narrower than one native cell in at least one direction. */
  | "sub-cell"
  /** Spans at least one cell each way, but bounds fewer than two cells. */
  | "single-cell"
  /** Bounds 2–10 native cells. */
  | "few-cells"
  /** Bounds more than 10 native cells. */
  | "many-cells";

/** Ascending cell-count cut points; the first bound met from the top wins. */
export const SST_NATIVE_SUPPORT_THRESHOLDS = {
  /** At or above this bound, the extent spans many native cells. */
  manyCells: 10,
  /** At or above this bound (and below manyCells), a few native cells. */
  fewCells: 2,
} as const;

export interface SstNativeSupportSummary {
  kind: "sea-surface-temperature-native-support";
  /** This is sampling geometry, not a marine-biology measurement. */
  marineBiologyObservation: false;
  isForecast: false;
  /** Grid structure only — never a fitness, accuracy, or condition claim. */
  claimScope: "descriptive-native-grid-support-only";
  status: SstNativeSupportStatus;
  /** Provenance for the product whose grid this describes; never dropped. */
  source: DatasetRef;
  /**
   * Native grid token exactly as the cited title states it (e.g. "9km"); null
   * when the title states no grid.
   */
  statedGrid: string | null;
  /** Nominal native cell size in metres; null when the grid is unknown. */
  nativeCellMetres: number | null;
  /** Nominal north–south extent of the bounding box, in metres; null when invalid. */
  extentNorthSouthMetres: number | null;
  /** Nominal east–west extent at the box's mid-latitude, in metres; null when invalid. */
  extentEastWestMetres: number | null;
  /**
   * Upper bound on native cells the extent can span, as an area ratio. Null
   * unless graded. Never a retrieval count — see the module note.
   */
  boundedCellCount: number | null;
  /** Graded band for `boundedCellCount`; null unless graded. */
  supportClass: SstNativeSupportClass | null;
  /**
   * True when the extent is narrower than one native cell in at least one
   * direction, so the cell's footprint necessarily spills outside the boundary.
   */
  nativeCellExceedsBoundary: boolean;
  /**
   * True when the extent bounds fewer than two native cells — the reported
   * "mean" cannot rest on more than a single independent source measurement.
   */
  meanBoundedBySingleCell: boolean;
  /** Honest, source-carrying sentence; no fitness or value claim. */
  statement: string;
  limits: readonly string[];
}

export const SST_NATIVE_SUPPORT_LIMITATIONS: readonly string[] = [
  "Native support is the product's grid-cell size, not the accuracy of its values.",
  "The grid is read only from the cited dataset title; an unstated grid is left unknown.",
  "The cell count bounds the boundary's extent; cloud screening means fewer independent values may stand behind the mean, never more.",
  "The bound uses the boundary's bounding box, which is at least as large as the boundary itself.",
  "Nominal metres use the degree length and the box mid-latitude cosine — an order-of-magnitude comparison, not a ground-resolution claim.",
];

/**
 * Bound the independent native SST cells a searched boundary's extent can span.
 * Reports sampling geometry only; it never states, adjusts, or qualifies the
 * temperature itself.
 */
export function summarizeSstNativeSupport(
  bounds: Bounds | null,
  source: DatasetRef = SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source
): SstNativeSupportSummary {
  const grid = parseNativeGrid(source.title);
  const extent = boundsExtentMetres(bounds);

  const base = {
    kind: "sea-surface-temperature-native-support",
    marineBiologyObservation: false,
    isForecast: false,
    claimScope: "descriptive-native-grid-support-only",
    source,
    statedGrid: grid?.statedGrid ?? null,
    nativeCellMetres: grid?.nominalMetres ?? null,
    extentNorthSouthMetres: extent?.northSouthMetres ?? null,
    extentEastWestMetres: extent?.eastWestMetres ?? null,
    limits: SST_NATIVE_SUPPORT_LIMITATIONS,
  } as const;

  // An unstated grid is reported as unknown rather than back-filled with a
  // guessed resolution, and is checked before the bounds so a citation that
  // states no grid never reads as a geometry problem.
  if (!grid) {
    return {
      ...base,
      status: "unknown-native-grid",
      boundedCellCount: null,
      supportClass: null,
      nativeCellExceedsBoundary: false,
      meanBoundedBySingleCell: false,
      statement: `${source.shortName} v${source.version} states no native grid in its citation, so the native support behind a boundary-mean SST is unknown`,
    };
  }

  if (!extent) {
    return {
      ...base,
      status: "invalid-bounds",
      boundedCellCount: null,
      supportClass: null,
      nativeCellExceedsBoundary: false,
      meanBoundedBySingleCell: false,
      statement: `No usable searched boundary extent, so the ${grid.statedGrid} native support behind a boundary-mean SST cannot be bounded`,
    };
  }

  const cellsNorthSouth = extent.northSouthMetres / grid.nominalMetres;
  const cellsEastWest = extent.eastWestMetres / grid.nominalMetres;
  const boundedCellCount = cellsNorthSouth * cellsEastWest;
  const nativeCellExceedsBoundary =
    Math.min(cellsNorthSouth, cellsEastWest) < 1;
  const supportClass = classifySupport(
    boundedCellCount,
    cellsNorthSouth,
    cellsEastWest
  );

  return {
    ...base,
    status: "graded",
    boundedCellCount,
    supportClass,
    nativeCellExceedsBoundary,
    meanBoundedBySingleCell:
      boundedCellCount < SST_NATIVE_SUPPORT_THRESHOLDS.fewCells,
    statement: describeSupport(
      supportClass,
      boundedCellCount,
      grid.statedGrid,
      source
    ),
  };
}

/** One-line phrasing for a graded summary, for panel and export consumers. */
export function describeSstNativeSupport(
  summary: SstNativeSupportSummary
): string {
  return summary.statement;
}

/**
 * The clause a place readout should carry, or null when this bound corrects
 * nothing the reading already says.
 *
 * Only two graded states change how the printed "mean" may be read:
 *  - the extent is narrower than one native cell in some direction, so that
 *    cell's ~9 km footprint necessarily spills outside the searched boundary
 *    and the value partly describes water the user did not ask about; and
 *  - the extent bounds fewer than two cells, so the "mean" cannot rest on more
 *    than one independent source measurement.
 * A boundary spanning many cells is left unstated: "mean" is then an ordinary
 * word for what happened, and a clause on every card would bury the two cases
 * that actually qualify the number beside them.
 *
 * An ungraded summary also stays silent. An unstated grid and an unusable
 * extent are properties of the citation and the workflow, not of the value, and
 * the readings that hit them already say what went wrong.
 *
 * The citation is deliberately not repeated here: this is a fragment for a line
 * that already names the cited product, and `statedGrid` is read from that same
 * title. The full `DatasetRef` stays on the summary for structured consumers.
 *
 * `footprint` names the geometry the note is spoken about and changes nothing
 * else; it defaults to the searched boundary the place panel passes, so the
 * card's wording is unchanged. The summary's own `statement` keeps the
 * boundary phrasing either way — it is a structured field, not this fragment.
 */
export function qualifyingSstNativeSupportNote(
  summary: SstNativeSupportSummary,
  footprint: SstNativeSupportFootprint = "searched-boundary"
): string | null {
  if (summary.status !== "graded") return null;
  const { nativeCellExceedsBoundary, meanBoundedBySingleCell } = summary;
  if (!nativeCellExceedsBoundary && !meanBoundedBySingleCell) return null;

  // `statedGrid` is non-null for every graded summary — the grade is derived
  // from the parsed grid — but the fallback keeps the sentence honest rather
  // than asserting a token that was never read from the citation.
  const grid = summary.statedGrid ?? "native";
  const where = footprintLabel(footprint);
  if (nativeCellExceedsBoundary) {
    return meanBoundedBySingleCell
      ? `${where} is narrower than one ${grid} source cell, whose footprint extends beyond it — the mean rests on a single source cell`
      : `${where} is narrower than one ${grid} source cell in one direction, so that cell's footprint extends beyond it`;
  }
  return `${where} bounds at most ${formatCellBound(
    summary.boundedCellCount!
  )} ${grid} source cells — the mean cannot rest on more than one independent source measurement`;
}

/**
 * The native-support clause a probe series should carry for a footprint it
 * averaged, or null when nothing qualifies the charted mean.
 *
 * Coverage adequacy (`marineAveragedSstSupport`) reports what SHARE of the
 * footprint returned usable pixels; it cannot say how many independent source
 * values those pixels carry. A drawn region may be as small as 0.2° a side
 * (`boundsUsable` in lib/probe.ts), and above roughly 66° latitude 0.2° of
 * longitude is narrower than one ~9 km L3 cell — so a region chart can print a
 * "mean" that rests on a single retrieval whose footprint extends outside the
 * box the panel header names. The place panel states this for a searched
 * boundary; the series surface did not.
 *
 * Gated the same way as the place card, for the same reasons:
 *  - non-SST layers pass through silently — this bound describes the cited SST
 *    product's grid and nothing else; and
 *  - a series in which no month produced a value gets no clause. There is then
 *    no mean for the geometry to qualify, and the empty-series notes already
 *    say what happened.
 * Sampling geometry only: no temperature, condition, or marine-biology claim.
 */
export function sstNativeSupportNote(
  layerId: LayerId,
  footprint: SstNativeSupportFootprint,
  bounds: Bounds | null,
  values: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== "sst") return null;
  const charted = values?.some((value) => Number.isFinite(value)) ?? false;
  if (!charted) return null;
  return qualifyingSstNativeSupportNote(
    summarizeSstNativeSupport(bounds),
    footprint
  );
}

/** How each surface names the footprint the bound was measured over. */
function footprintLabel(footprint: SstNativeSupportFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "searched boundary";
}

function classifySupport(
  boundedCellCount: number,
  cellsNorthSouth: number,
  cellsEastWest: number
): SstNativeSupportClass {
  // A thin sliver can bound a large area ratio while still being narrower than
  // one cell across, so the linear test is applied before the area bands.
  if (Math.min(cellsNorthSouth, cellsEastWest) < 1) return "sub-cell";
  if (boundedCellCount >= SST_NATIVE_SUPPORT_THRESHOLDS.manyCells) {
    return "many-cells";
  }
  if (boundedCellCount >= SST_NATIVE_SUPPORT_THRESHOLDS.fewCells) {
    return "few-cells";
  }
  return "single-cell";
}

function describeSupport(
  supportClass: SstNativeSupportClass,
  boundedCellCount: number,
  statedGrid: string,
  source: DatasetRef
): string {
  const cited = `${source.shortName} v${source.version}`;
  const bound = formatCellBound(boundedCellCount);
  switch (supportClass) {
    case "sub-cell":
      return `Searched boundary is narrower than one ${statedGrid} ${cited} cell, whose footprint extends beyond it; the mean rests on a single source cell`;
    case "single-cell":
      return `Searched boundary bounds ${bound} ${statedGrid} ${cited} cells; the mean cannot rest on more than one independent source measurement`;
    case "few-cells":
      return `Searched boundary bounds at most ${bound} ${statedGrid} ${cited} cells`;
    case "many-cells":
      return `Searched boundary bounds at most ${bound} ${statedGrid} ${cited} cells`;
  }
}

/**
 * Nominal metric extent of a bounding box. Returns null for any box that is not
 * finite, ordered, and positive in both directions, so an unusable geometry is
 * never graded.
 */
function boundsExtentMetres(
  bounds: Bounds | null
): { northSouthMetres: number; eastWestMetres: number } | null {
  if (!bounds) return null;
  const { south, north, west, east } = bounds;
  if (![south, north, west, east].every((value) => Number.isFinite(value))) {
    return null;
  }
  const latSpan = north - south;
  const lonSpan = east - west;
  if (latSpan <= 0 || lonSpan <= 0) return null;
  if (Math.abs(south) > 90 || Math.abs(north) > 90) return null;

  const midLat = (south + north) / 2;
  const cosine = Math.max(
    MIN_LATITUDE_COSINE,
    Math.cos(midLat * (Math.PI / 180))
  );
  return {
    northSouthMetres: latSpan * METRES_PER_DEGREE,
    eastWestMetres: lonSpan * METRES_PER_DEGREE * cosine,
  };
}

/** Readable bound: two significant figures below 10, whole numbers above. */
function formatCellBound(boundedCellCount: number): string {
  if (boundedCellCount >= 10) return String(Math.round(boundedCellCount));
  return boundedCellCount.toFixed(1);
}
