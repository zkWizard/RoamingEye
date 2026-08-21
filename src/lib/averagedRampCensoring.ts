/**
 * Why a colormap end-cap screen cannot see censoring in an AVERAGED footprint,
 * stated once for every layer whose ramp is capped at both ends.
 *
 * Each per-layer screen reads the charted series and marks a month landing in
 * the published colormap's lowest or highest finite bin with a `≤` or `≥`
 * prefix. That is exact in point mode, where the charted value is a MEDIAN of a
 * tight pixel block: a median returns one of the decoded pixel values, so a
 * censored result is itself in a terminal bin and is caught.
 *
 * Averaged footprints combine differently. `ProbeSampler` inverts every sampled
 * pixel on its own and then takes a cos(lat)-weighted MEAN of the usable ones
 * (`weightedMeanValid`). A mean is not one of its members, so a footprint mixing
 * capped and resolved pixels lands anywhere inside the finite ramp while still
 * carrying the cap's one-sided error — the capped pixels entered at the bin they
 * were collapsed into, not at the value they had. Screening that mean finds
 * nothing, no inequality is drawn, and a censored area mean is presented as an
 * ordinary two-sided estimate.
 *
 * Direction is knowable in principle — a floor-capped pixel always enters high,
 * a ceiling-capped one always low — but PRESENCE is not: the sampler reports one
 * combined value and a usable share per month, and recovering more would take a
 * per-pixel tally of terminal-bin decodes that `sampleMonth` does not collect.
 * So a two-cap layer claims neither direction nor magnitude, and states only the
 * thing the reader cannot otherwise know: on an averaged footprint, the absence
 * of a mark is not evidence of an uncensored footprint.
 *
 * Layer-specific physics stays with `marineAveragedSstCensoring.ts` and
 * `probeLstAveragedCensoring.ts`; a ramp open at ONE end can name a direction
 * conditionally and words its own clauses (`probeAerosolAveragedCensoring.ts`).
 */

/**
 * Which averaged footprint a clause describes, for wording only. Declared in
 * this neutral module so an atmosphere module and a marine one can share the
 * union without either depending on the other.
 */
export type AveragedFootprint = "drawn-region" | "sampled-area";

/** The reader-facing name for an averaged footprint. */
export function averagedFootprintLabel(footprint: AveragedFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}

/**
 * Limitations an averaged end-cap statement carries whatever the layer, held as
 * separate constants so each layer's exported list keeps its own order and its
 * own layer-specific entries while quoting this wording verbatim.
 */
export const AVERAGED_RAMP_MEAN_DEFEATS_SCREEN_LIMITATION =
  "An averaged footprint charts a weighted mean of per-pixel decodes, so a mean of capped and resolved pixels lands inside the finite ramp and the end-cap screen does not mark it.";

/** Two-cap layers only: they can sign neither direction nor magnitude. */
export const AVERAGED_RAMP_UNDETECTABLE_LIMITATION =
  "Whether any sampled pixel was censored is not recoverable from the combined value and the usable share the sampler reports, so neither presence, direction, nor magnitude is claimed.";

/** The scope limit: point probes are already screened exactly. */
export const AVERAGED_RAMP_SCOPE_LIMITATION =
  "The statement applies to averaged footprints only; a point probe charts a median of a tight pixel block, which the end-cap screen already catches.";

/**
 * The probe status-line clause for a two-cap layer's averaged footprint.
 *
 * The wording splits on whether the screen marked anything, because the two
 * readings mislead differently: with no mark the whole series reads as
 * uncensored, while with marks the reader is told which months are bounds, which
 * reads as a claim the rest are not.
 */
export function averagedRampCensoringClause(
  footprint: AveragedFootprint,
  markedMonthCount: number,
  colormapDoc: string
): string {
  const label = averagedFootprintLabel(footprint);
  if (markedMonthCount > 0) {
    return `those marks screen the ${label}'s monthly means, not the pixels behind them — a mean of capped and resolved pixels lands inside the finite ramp, so the unmarked months are not established as uncensored`;
  }
  return `each ${label} value is a weighted mean of per-pixel decodes, so capped pixels average in with resolved ones and land inside the finite ramp — no month is marked above, but that is not evidence the ${label} held no censored pixel (source ${colormapDoc} colormap)`;
}

/**
 * The CSV provenance headers carrying the same disclosure into an export, keyed
 * by `metricKey` (`sst`, `lst`) so each layer's columns stay self-describing.
 *
 * The export needs this MORE than the status line does. A layer's extreme-
 * censoring headers write nothing at all when no charted month landed in a
 * terminal bin, which is the ordinary outcome for an averaged footprint
 * precisely because a mean of capped and resolved pixels lands inside the finite
 * ramp. So the download most likely to hide censoring is the one that ships with
 * no mention of it, read later by someone who no longer has the panel to
 * consult. When that block IS present it states a bin rule that is exact for a
 * point probe's median and incomplete here, so the wording splits on that too: a
 * rule the reader can apply is corrected differently from a silence.
 */
export function averagedRampCensoringCsvHeaders(
  metricKey: string,
  footprint: AveragedFootprint,
  markedMonthCount: number,
  colormapDoc: string
): string[] {
  const label = averagedFootprintLabel(footprint);

  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  const scope =
    markedMonthCount > 0
      ? `# ${metricKey}_ramp_censoring_averaged: the bin rule above screens this ${label}'s monthly means and not the pixels behind them — a mean of capped and resolved pixels lands inside the finite ramp — so rows it does not mark are not established as uncensored`
      : `# ${metricKey}_ramp_censoring_averaged: every value below is an area-weighted mean of per-pixel decodes over the ${label} — a pixel the published ${colormapDoc} colormap capped averages in with resolved ones and the mean lands inside the finite ramp — so no row is flagged as a bound and that silence is not evidence the ${label} held no censored pixel`;
  return [
    scope,
    `# ${metricKey}_ramp_censoring_averaged_detection: telling which months held a capped pixel would take a per-pixel tally of terminal-bin decodes that the sampler does not report — so no presence and no direction and no magnitude is stated for this ${label}`,
  ];
}
