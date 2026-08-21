import { characterizeLayerInversion } from "./briefValueUncertainty";
import type { ProbeInversionAccuracyStatus } from "./probeInversionAccuracy";
import type { LayerId } from "./timeline";
import { uncalibratedVegetationAccuracyClause } from "./vegetationIndexRamp";

/**
 * Say so when a probed layer's inversion has never been validated at all.
 *
 * Two builders already write an accuracy figure into the probe CSV's
 * provenance header: `inversionAccuracyCsvHeaders` for the layers measured
 * against a published GIBS colormap (`MEASURED_INVERSION`), and
 * `uncalibratedVegetationAccuracyCsvHeaders` for the vegetation index whose
 * error is measured against its ramp document instead. Both return nothing for
 * a layer neither of them covers, and today exactly one probed layer falls
 * through both: snow cover. Its values are recovered by inverting the displayed
 * colour ramp — the same mechanism the bounded layers use, on a calibrated
 * percentage scale — but no validation run has ever measured that gradient
 * against a published colormap.
 *
 * The result is the inversion of what the file should say. A snow CSV carries
 * the `±0.5 %` quantization floor from `csvHeaderText` and no error line at
 * all, while an SST CSV carries the same kind of floor *and* an
 * `# inversion_validation:` line stating RMSE ±1.0 °C. A reader comparing the
 * two files — or a script scanning them — reads the layer with the *unmeasured*
 * error as the better characterized one, because silence in a provenance header
 * is read as "nothing to declare" rather than "never measured". The file is the
 * worse place for that to happen: it states its accuracy once at the top as a
 * rule covering every row, then outlives the session that would have supplied
 * the context.
 *
 * So this builder writes the absence itself. It quotes no figure, invents no
 * band, and makes no claim about how large the error is — `MEASURED_INVERSION`
 * is the only authority for that and it has no entry to give. It states only
 * that the error is unmeasured rather than absent, which is the one thing the
 * repository actually knows and the one thing the empty header failed to say.
 *
 * Written under its own `inversion_validation_unmeasured` key, on the same
 * reasoning that gave the gradient reading its own: a script keyed on the exact
 * name of the calibrated figure must not pick this up as one, while a prefix
 * scan still finds it. No two of the three keys can appear together — this
 * builder speaks only for the status the first refuses and the layer the second
 * refuses.
 *
 * Scope, deliberately narrow: this describes the *rendering-inversion* error
 * only, exactly as its two siblings do. It says nothing about the accuracy of
 * the underlying MOD10CM product against in-situ measurement, which is the
 * product team's own published validation and is cited separately in
 * METHODS.md.
 */
export function unvalidatedInversionCsvHeaders(
  id: LayerId,
  inversionAccuracyStatus: ProbeInversionAccuracyStatus
): string[] {
  // The measured builder speaks for every other status, so this one stays
  // silent there — the keys can never both appear for one layer.
  if (inversionAccuracyStatus !== "uncharacterized") return [];
  // The vegetation builder speaks for the index whose ramp document was
  // measured, so this one stays silent for it on the same terms.
  if (
    uncalibratedVegetationAccuracyClause(id, inversionAccuracyStatus) !== null
  )
    return [];
  // The classifier decides the reason from the committed sources rather than a
  // layer list, so a layer that gains a colormap document stops reaching this
  // line by itself. Only an unvalidated *inversion* is disclosed here: a
  // categorical layer or an uncalibrated scale has no band to be missing.
  if (characterizeLayerInversion(id).reason !== "unvalidated-inversion")
    return [];
  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on csvHeaderText in probe.ts).
  return [
    `# inversion_validation_unmeasured: no validation run has measured this layer's display gradient against a published GIBS colormap — its values are recovered by the same gradient inversion the measured layers use so the inversion error is unmeasured rather than absent and no ± band can be stated (docs/validation.md)`,
    `# inversion_validation_unmeasured_scope: rendering-inversion error only; not the accuracy of the underlying product against in-situ measurement. The quantization figure this file also carries is the resolution of a gradient position and is not a bound on that unmeasured error`,
  ];
}
