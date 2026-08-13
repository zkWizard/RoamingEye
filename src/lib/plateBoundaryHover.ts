import { decodePlatePair, type PlateIdentity } from "./platePairs";
import type { PlateBoundary } from "./plates";

/**
 * Tooltip text naming the two plates a hovered Bird (2003) boundary separates.
 *
 * The plate-boundaries overlay draws every polyline as one flattened
 * LineSegments, so a hovered segment is resolved back to its source boundary by
 * the render-time ownership index (see plateBoundaryRendering.ts) and then
 * decoded through the PB2002 vocabulary in platePairs.ts.
 *
 * This states only the plate-pair identity the source label already carries.
 * PB2002 boundary-step labels do not encode boundary TYPE (spreading,
 * convergent, transform), relative motion, slip rate, deformation, or activity,
 * so the label never names one.
 *
 * The code order and the delimiter are not incidental, though. PB2002 lists the
 * left-hand plate first and writes subduction polarity into byte 3 — "/" for
 * the right-hand plate descending, "\" for the left — so the delimiter does say
 * which plate subducts, read from the label alone rather than from the drawn
 * polyline's traversal direction (Bird 2003 electronic supplement readme,
 * quoted at PB2002_LABEL_CONVENTION in platePairs.ts). That is why the label is
 * kept verbatim here instead of being normalized to a canonical pair, and the
 * place panel spells the polarity out in prose (subductionPolarityText in
 * plateBoundaryContext.ts) rather than leaving a reader to interpret the glyph.
 *
 * Unknown codes are surfaced rather than dropped so the readout stays honest
 * about the source.
 */

/** Shown when a polyline carries no decodable PB2002 plate-pair label. */
export const UNLABELED_PLATE_BOUNDARY_TEXT =
  "Plate boundary · plate pair not labeled in source";

function plateText(plate: PlateIdentity): string {
  // A code outside Bird (2003) Table 1 keeps its raw code and is marked as
  // unrecognized rather than being silently rendered as if it were a name.
  return plate.name ?? `${plate.code} (code not in PB2002 vocabulary)`;
}

/**
 * Describe a PB2002 plate-pair label on its own, without a polyline.
 *
 * Shared by the globe tooltip and the place panel's plate-boundary list so a
 * boundary is named identically wherever it appears. A null label is the
 * source's own absence (an unlabeled supplied feature), reported as unlabeled
 * rather than guessed at.
 */
export function plateBoundaryPairLabel(name: string | null): string {
  const decoded = name === null ? null : decodePlatePair(name);
  if (!decoded) return UNLABELED_PLATE_BOUNDARY_TEXT;
  const [first, second] = decoded.plates;
  return `${plateText(first)}–${plateText(
    second
  )} plate boundary · PB2002 ${decoded.label}`;
}

/**
 * Describe a single boundary polyline. Returns the unlabeled text for a
 * polyline whose label is not a two-code PB2002 pair.
 */
export function plateBoundaryHoverLabel(boundary: PlateBoundary): string {
  return plateBoundaryPairLabel(boundary.name);
}

/**
 * Resolve a rendered segment index to its boundary's hover text.
 *
 * Returns undefined when the segment index is not one this linework produced,
 * or when the ownership index points outside the supplied boundaries, so a
 * stale or mismatched index yields no readout instead of naming the wrong
 * plates.
 */
export function plateBoundarySegmentHoverLabel(
  boundaries: readonly PlateBoundary[],
  segmentBoundaries: readonly number[],
  segmentIndex: number
): string | undefined {
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0) return undefined;
  if (segmentIndex >= segmentBoundaries.length) return undefined;
  const boundary = boundaries[segmentBoundaries[segmentIndex]];
  return boundary === undefined ? undefined : plateBoundaryHoverLabel(boundary);
}
