import { BIRD_2003_PLATE_BOUNDARY_SOURCE } from "./plateBoundaryContext";
import { polylineLengthKm } from "./plateBoundaryLength";
import type { Position } from "./geojson";
import type { PlateBoundary } from "./plates";

/**
 * Repeated polylines in the supplied Bird (2003) plate-boundary linework.
 *
 * The bundled `public/data/plate-boundaries.geojson` carries the PB2002
 * boundary steps one feature at a time, and the source digitization repeats a
 * few of them verbatim: where a boundary crosses the antimeridian the GeoJSON
 * conversion emits the eastern half, the western half, and — for six steps — a
 * second, byte-identical copy of that western half. All of the source's own
 * attributes (`Name`, `Source`, `Type`, `PlateA`/`PlateB`) match across the
 * copies, so these are one mapped trace supplied twice, not two independent
 * digitizations of the same margin.
 *
 * That matters to anything that *aggregates* the linework. Summing per-feature
 * length (see plateBoundaryLength.ts) over the file as supplied counts those
 * traces twice, which inflates the Antarctica–Pacific pair by ~85% and
 * North America–Pacific by ~31% (measured; see plateBoundaryDuplication.test.ts).
 * Distance and hover queries are unaffected — a nearest-segment search is
 * idempotent under duplication — so the repeats are only a problem for totals.
 *
 * This module reports the repeats rather than editing the bundled file: the
 * shipped data stays a faithful copy of the source, and a caller that wants a
 * total over distinct traces asks for one explicitly via
 * {@link distinctPlateBoundaries}. Nothing is dropped silently and every repeat
 * is enumerated with the indices it occupied in the supplied array.
 *
 * Traces are matched on their exact vertex sequence, in either direction, and
 * nothing else. This is a check for *supplied redundancy*, not a geometric
 * merge: it never snaps near-coincident vertices, never joins traces that share
 * only part of their run (adjacent PB2002 steps legitimately share a junction
 * vertex, and two differently-labelled steps can share a short common trace),
 * and it asserts nothing about boundary type, motion, activity, or hazard.
 *
 * Pure, render-free logic (see plateBoundaryDuplication.test.ts).
 */

export const PLATE_BOUNDARY_DUPLICATION_UNITS = {
  coordinates: "decimal degrees (longitude, latitude)",
  length: "km (great-circle, mean-radius sphere)",
} as const;

/** One trace supplied more than once, with every occurrence accounted for. */
export interface RepeatedPlateBoundaryTrace {
  /**
   * Index in the supplied array of the first occurrence — the one
   * {@link distinctPlateBoundaries} keeps.
   */
  firstIndex: number;
  /** Indices of the later, identical occurrences, ascending. */
  repeatIndices: readonly number[];
  /**
   * The label on each occurrence, in supply order (first occurrence included).
   * Retained verbatim; an empty source label reads as null.
   */
  labels: readonly (string | null)[];
  /**
   * True when every occurrence carries the same label. False flags a repeat
   * whose copies disagree — the same trace filed under two plate pairs, which
   * is a source-labelling question this module reports but does not resolve.
   */
  sameLabel: boolean;
  /** Vertices in the trace (identical across occurrences by construction). */
  vertexCount: number;
  /** Great-circle length of a single copy of the trace, km. */
  traceLengthKm: number;
  /** Length counted more than once: traceLengthKm × repeatIndices.length. */
  redundantLengthKm: number;
}

export type PlateBoundaryDuplicationStatus =
  "no-boundaries" | "no-repeats" | "repeats-present";

/**
 * A description of redundancy in the supplied linework. Lengths are the same
 * great-circle sums plateBoundaryLength.ts reports, so `distinctLengthKm` is
 * directly comparable with that module's `totalLengthKm`.
 */
export interface PlateBoundaryDuplicationReport {
  kind: "bird-2003-plate-boundary-duplication";
  isForecast: false;
  status: PlateBoundaryDuplicationStatus;
  suppliedBoundaryCount: number;
  /** Supplied features that repeat an earlier one (excludes first occurrences). */
  repeatedFeatureCount: number;
  /** Distinct traces: suppliedBoundaryCount − repeatedFeatureCount. */
  distinctTraceCount: number;
  /** Summed length of every supplied feature, repeats included, km. */
  suppliedLengthKm: number;
  /** The part of `suppliedLengthKm` contributed by repeats, km. */
  redundantLengthKm: number;
  /** Summed length counting each distinct trace once, km. */
  distinctLengthKm: number;
  /** Every repeated trace, ordered by first occurrence. */
  repeats: readonly RepeatedPlateBoundaryTrace[];
  provenance: typeof BIRD_2003_PLATE_BOUNDARY_SOURCE;
  units: typeof PLATE_BOUNDARY_DUPLICATION_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Reports redundancy in the linework supplied to this helper only; it is not a statement about the completeness or correctness of the PB2002 model.",
  "Traces match on an exact vertex sequence (forward or reversed). Near-coincident but unequal traces are not matched, and traces that overlap only in part are left alone — adjacent PB2002 steps legitimately share junction vertices.",
  "A repeat is a supplied-data observation, not a geometric or geological merge: it adds no boundary type, motion, deformation, activity, or age, and infers no seismicity, volcanism, hazard, or forecast.",
  "Lengths inherit the digitization and generalization resolution of the bundled file; they are not the true length of a boundary.",
] as const;

/**
 * Identify traces supplied more than once, and quantify the length that a
 * per-feature sum therefore counts more than once.
 *
 * Occurrence order is the supplied order: the earliest occurrence of a trace is
 * the `firstIndex`, and every later identical feature is a repeat. A polyline
 * with fewer than two vertices has no measurable length and can still be
 * reported as a repeat, contributing zero redundant length.
 */
export function plateBoundaryDuplication(
  boundaries: readonly PlateBoundary[]
): PlateBoundaryDuplicationReport {
  const groups = new Map<string, number[]>();
  let suppliedLengthKm = 0;

  boundaries.forEach((boundary, index) => {
    suppliedLengthKm += polylineLengthKm(boundary.points);
    const key = traceKey(boundary.points);
    const existing = groups.get(key);
    if (existing) existing.push(index);
    else groups.set(key, [index]);
  });

  const repeats: RepeatedPlateBoundaryTrace[] = [];
  let redundantLengthKm = 0;
  let repeatedFeatureCount = 0;

  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const [firstIndex, ...repeatIndices] = indices;
    const first = boundaries[firstIndex];
    const traceLengthKm = polylineLengthKm(first.points);
    const redundant = traceLengthKm * repeatIndices.length;
    const labels = indices.map((index) => labelOf(boundaries[index]));

    redundantLengthKm += redundant;
    repeatedFeatureCount += repeatIndices.length;
    repeats.push({
      firstIndex,
      repeatIndices,
      labels,
      sameLabel: labels.every((label) => label === labels[0]),
      vertexCount: first.points.length,
      traceLengthKm,
      redundantLengthKm: redundant,
    });
  }

  repeats.sort((first, second) => first.firstIndex - second.firstIndex);

  return {
    kind: "bird-2003-plate-boundary-duplication",
    isForecast: false,
    status:
      boundaries.length === 0
        ? "no-boundaries"
        : repeats.length === 0
          ? "no-repeats"
          : "repeats-present",
    suppliedBoundaryCount: boundaries.length,
    repeatedFeatureCount,
    distinctTraceCount: boundaries.length - repeatedFeatureCount,
    suppliedLengthKm,
    redundantLengthKm,
    distinctLengthKm: suppliedLengthKm - redundantLengthKm,
    repeats,
    provenance: BIRD_2003_PLATE_BOUNDARY_SOURCE,
    units: PLATE_BOUNDARY_DUPLICATION_UNITS,
    limitations: LIMITATIONS,
  };
}

/**
 * The supplied boundaries with later copies of an already-seen trace removed,
 * in supply order. Pass the result to an aggregator — e.g.
 * `summarizePlateBoundaryLengths(distinctPlateBoundaries(boundaries))` — to
 * total each mapped trace once instead of once per supplied feature.
 *
 * The first occurrence is kept verbatim, including its label and any optional
 * source attributes it carries, so no provenance is lost. Rendering and
 * nearest-boundary queries do not need this: drawing or measuring to a trace
 * twice yields the same picture and the same distance.
 */
export function distinctPlateBoundaries(
  boundaries: readonly PlateBoundary[]
): PlateBoundary[] {
  const seen = new Set<string>();
  const out: PlateBoundary[] = [];
  for (const boundary of boundaries) {
    const key = traceKey(boundary.points);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(boundary);
  }
  return out;
}

function labelOf(boundary: PlateBoundary): string | null {
  const label = typeof boundary.name === "string" ? boundary.name.trim() : "";
  return label.length > 0 ? label : null;
}

/**
 * A direction-insensitive identity for a vertex sequence: the lexicographically
 * smaller of the forward and reversed serializations. A trace digitized
 * backwards is the same mapped trace, so the two must collide.
 *
 * Vertices serialize through their own numeric values, so only exactly equal
 * coordinates match; nothing is rounded or snapped. Non-finite vertices
 * serialize distinctly rather than being treated as wildcards, which keeps a
 * malformed feature from matching anything it is not identical to.
 */
function traceKey(points: readonly Position[]): string {
  const forward = serialize(points);
  const reversed = serialize([...points].reverse());
  return forward <= reversed ? forward : reversed;
}

function serialize(points: readonly Position[]): string {
  return points
    .map((point) =>
      Array.isArray(point) ? `${String(point[0])},${String(point[1])}` : "?"
    )
    .join(";");
}
