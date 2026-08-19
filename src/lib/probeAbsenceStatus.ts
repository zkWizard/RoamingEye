/**
 * Compose the probe panel's status line for a record that produced no usable
 * value in any sampled month.
 *
 * The panel's default sentence for that case is "No data at this point for this
 * layer." Six sibling modules exist precisely because that sentence is wrong
 * for a product whose *domain of definition* excludes the probed point:
 * `marineProbeDomain` (SST is an ocean-only L3 field, so an inland point
 * carries no value by construction), `atmosphereProbeDomain`, `soilProbeDomain`,
 * `snowProbeAbsence`, `vegetationProbeAbsence`, and `lstProbeDomain` (MOD11C3
 * is retrieved over land only, and is a clear-sky composite besides, so it is
 * two-sided like the marine note). Each returns a domain note
 * that states what the product covers and what an absence does and does not
 * imply, and `ProbePanel.finish()` documents that note as *replacing* the bare
 * line.
 *
 * It did not replace it: the panel joined the two, so a user who probed a city
 * with the SST layer selected read the retrieval-failure sentence first and the
 * correction second. That ordering is worse than either alone. The bare line is
 * an unqualified assertion about the point ("no data *at this point*"), and
 * `marineProbeDomain`'s note is explicitly two-sided — it refuses to say
 * whether the absence locates the point outside the domain or reflects an
 * in-domain gap (cloud, sea ice, missing swath). Leading with the assertion and
 * following with the refusal reads as a measurement the note then hedges,
 * rather than as the one honest statement the module set out to make. The
 * land-only siblings put it more plainly still: their note ends "not evidence
 * of a failed retrieval", directly after the sentence that reported one.
 *
 * The rule this encodes, matching the documented contract:
 *
 *  - A **spatial support note** describes what was actually sampled inside an
 *    averaged footprint, so it leads when present — an averaged footprint that
 *    returned nothing is not "no data at this point"; there was no point.
 *  - A **domain note** replaces the bare line, because the bare line is the
 *    claim it exists to correct.
 *  - The bare line survives only when neither note speaks, which is the case it
 *    was written for: an empty record with nothing further known about it.
 *
 * Callers today gate each domain note on its own layer and pass the support
 * note into it, so at most one of the two arrives non-null; the support-note
 * branch still carries any domain note that follows it rather than dropping
 * evidence, so the composition stays correct if that ever changes.
 *
 * Pure, render-free logic (see probeAbsenceStatus.test.ts).
 */

/** The panel's explanation when nothing further is known about the absence. */
export const BARE_PROBE_ABSENCE_LINE = "No data at this point for this layer.";

/**
 * Render a lower-case clause as a standalone sentence, so a support note can
 * carry the whole status line when there are no stats to lead with.
 */
export function asSentence(clause: string): string {
  const text = `${clause.charAt(0).toUpperCase()}${clause.slice(1)}`;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The status line for an empty probe record.
 *
 * @param spatialSupportNote what share of an averaged footprint returned data,
 *   or null for a point probe and for a fully sampled footprint.
 * @param domainNote the cited product-domain explanation for the emptiness, or
 *   null when no domain module speaks for this layer.
 */
export function probeAbsenceStatusLine(
  spatialSupportNote?: string | null,
  domainNote?: string | null
): string {
  const lead = spatialSupportNote
    ? asSentence(spatialSupportNote)
    : domainNote
      ? null
      : BARE_PROBE_ABSENCE_LINE;
  return [lead, domainNote].filter(Boolean).join(" ");
}
