import {
  decodePlatePair,
  subductionSummary,
  type PlateIdentity,
} from "./platePairs";
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
 * kept verbatim here instead of being normalized to a canonical pair.
 *
 * The glyph alone cannot be read for polarity by a reader who does not know the
 * convention, and it is not self-explaining: "AM/PS" and "EU\AF" are the same
 * shape but opposite readings, so assuming the first-named plate is the one
 * descending is right for one and wrong for the other. Every surface that
 * prints the label therefore also states the reading — the tooltip through
 * plateBoundarySubductionReading below, the place panel's crossing paragraph
 * through subductionPolarityText in plateBoundaryContext.ts, the
 * nearest-boundary sentence through nearestPlateBoundaryStatement in
 * plateProximity.ts, and the place panel's matched-boundary list through
 * plateBoundaryDelimiterClause below.
 *
 * That last surface is why the clause is a shared export rather than a string
 * built inside the tooltip. The list prints plateBoundaryPairLabel verbatim,
 * delimiter included, while the crossing paragraph above it names only the two
 * or three descents covering the most matched segments — and the list is
 * ordered alphabetically by plate-pair label, not by segment count, so the two
 * selections do not coincide. Over twelve tectonic search extents, 15 of 55
 * listed rows printed a delimiter and 3 of those encoded a descent the
 * paragraph never stated, leaving the glyph as the only thing on screen saying
 * which plate goes under.
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
 * Read back the descent a PB2002 label's delimiter encodes, e.g. "Cocos
 * subducts beneath North America" for "CO\NA".
 *
 * Returns null when the label records no subduction ("-", PB2002's marking for
 * a non-subducting step) or cannot be decoded at all, so a caller renders
 * nothing rather than implying a polarity the model did not write. 176 of the
 * 241 bundled features return null, every one of them for a hyphen rather than
 * a decode failure.
 *
 * This is a categorical passthrough of byte 3 of the label. It measures
 * nothing and adds no convergence rate, slab depth, deformation, activity, or
 * hazard. A null is not an absence of information — the hyphen is PB2002's
 * positive mark for a non-subducting segment — but it is not a boundary-type
 * classification either: the model's 7-way class code lives in the steps file
 * this app does not bundle, so a hyphen says only "not subduction".
 */
export function plateBoundarySubductionReading(
  name: string | null
): string | null {
  const decoded = name === null ? null : decodePlatePair(name);
  return decoded === null ? null : subductionSummary(decoded);
}

/**
 * The trailing clause that reads a label's delimiter back, ready to append to
 * whatever a surface prints the label inside, or "" when the label records no
 * subduction.
 *
 * Shared so the tooltip and the place panel's matched-boundary list decode the
 * glyph with one wording: a reader who meets "delimiter:" on the globe and then
 * in the panel is reading the same convention, not two paraphrases of it.
 * Returning "" rather than null keeps it a plain append at both call sites, and
 * keeps the non-subducting majority silent. The hyphen those 176 of 241 labels
 * carry is a real reading — PB2002's mark for a non-subducting segment — so the
 * silence is a space decision, not a claim that nothing was recorded: the panel
 * states the tally once in subductionMarkingText rather than repeating it on
 * every hovered segment. A clause here would also have to carry the limit that
 * a hyphen names no non-subducting class, which the panel has room for.
 */
export function plateBoundaryDelimiterClause(name: string | null): string {
  const reading = plateBoundarySubductionReading(name);
  return reading === null ? "" : ` · delimiter: ${reading}`;
}

/**
 * Describe a single boundary polyline. Returns the unlabeled text for a
 * polyline whose label is not a two-code PB2002 pair.
 *
 * The descent clause follows the verbatim label so it reads as the decoding of
 * the glyph immediately before it, and is omitted entirely for the
 * non-subducting majority rather than saying that nothing was recorded.
 */
export function plateBoundaryHoverLabel(boundary: PlateBoundary): string {
  return (
    plateBoundaryPairLabel(boundary.name) +
    plateBoundaryDelimiterClause(boundary.name)
  );
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
