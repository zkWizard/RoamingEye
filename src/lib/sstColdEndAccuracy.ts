import { PROBE_SCALES } from "./probe";
import type { ProbeSstExtremeCensoring } from "./probeSstExtremeCensoring";
import type { LayerId } from "./timeline";
import { MEASURED_INVERSION } from "./validation";

/**
 * Why the probe's single measured accuracy figure does not hold at the cold end
 * of the sea-surface-temperature ramp.
 *
 * `probeInversionAccuracy` binds each layer to the residual `validateInversion`
 * measures against GIBS's published colormap, and the probe panel renders it as
 * one ± band beside the value — for SST, `±1.0 °C vs GIBS colormap`. That
 * number is correct and CI-asserted, but it is a **whole-ramp RMSE**, and this
 * repository has already measured that the SST error is not uniform across the
 * ramp it summarizes:
 *
 *   > the price is absolute accuracy below ~4 °C, where RMSE is 2.8 °C against
 *   > 0.1–0.4 °C over the rest of the ramp
 *   > — docs/validation.md; the same figure is recorded on the `sst` stops in
 *   > `lib/legend.ts`.
 *
 * The cause is a deliberate trade, not a defect in the legend. GIBS's 0–2 °C
 * colours sit only 53 RGB units from the black it renders where the L3 product
 * carries no SST — inside the app-wide 60-unit no-data distance — so a
 * faithfully drawn cold end would invert land, sea ice, and cloud into
 * plausible near-freezing water. The legend therefore anchors its cold stop at
 * GIBS's ~2 °C hue instead, buying rejection of empty pixels at the cost of
 * absolute accuracy in the coldest water. `lib/sstNoData.ts` measures the same
 * 53-unit separation from the other direction, and the place panel — which
 * decodes through GIBS's physical colormap rather than this display gradient —
 * opts out of the trade entirely with its own tightened threshold, so this
 * caveat is specific to the probe surface.
 *
 * The two figures reconcile rather than contradict: the band below 4 °C is
 * about an eighth of the 0–32 °C ramp, and √(0.125·2.8² + 0.875·0.25²) ≈ 1.0 °C,
 * which is the committed whole-ramp figure. Quoting only the whole-ramp number
 * beside a polar or sub-polar reading therefore understates that reading's
 * error by roughly a factor of three — in exactly the water a marine reader is
 * most likely to be probing deliberately.
 *
 * Scope discipline: nothing here re-measures, corrects, or improves an
 * inversion — it reports a committed figure beside the committed figure it
 * qualifies — and only the SST layer is classified, so this module never speaks
 * for a ramp it has not measured. The limits a reader carries away are stated
 * once, in `SST_COLD_END_ACCURACY_LIMITATIONS` below, and rendered from there;
 * they are not restated here.
 *
 * One band the split does NOT describe: the coldest water of all. Both figures
 * above are two-sided RMSEs, and the same colormap ends in an OPEN low cap
 * where every SST below 0.00 °C shares one colour, so a month decoded into it
 * is a bound rather than a measurement (`probeSstExtremeCensoring`). Such a
 * month is always inside this band — it decodes to about 0.1 °C, far under the
 * 4 °C threshold — so the two screens co-fire on every record that reaches the
 * cap, and this module names the capped months and withholds the band from them
 * whenever the caller supplies the screen.
 */

/**
 * The cold-end accuracy split as measured, in the probe's reported unit (°C).
 *
 * Committed rather than re-derived at runtime; the drift guard in
 * `sstColdEndAccuracy.test.ts` ties these to `PROBE_SCALES.sst` and to
 * `MEASURED_INVERSION.sst`, so a recalibration that moves either fails loudly
 * instead of leaving this description stale.
 */
export const SST_COLD_END_ACCURACY = {
  /** The one layer whose cold-end split is asserted here. */
  layerId: "sst" as LayerId,
  unit: "°C",
  /** Below this reported value the whole-ramp RMSE no longer describes the error. */
  thresholdC: 4,
  /** Measured RMSE below the threshold (docs/validation.md). */
  coldBandRmseC: 2.8,
  /** Measured RMSE over the rest of the ramp, as a range (docs/validation.md). */
  restOfRampRmseC: { min: 0.1, max: 0.4 },
  /**
   * Where the display legend anchors its cold stop, in °C — GIBS's ~2 °C hue
   * rather than its true 0 °C colour, which sits inside the no-data distance of
   * the black GIBS renders for an absent retrieval.
   */
  legendColdAnchorC: 2,
  /** Where the split is documented and re-asserted. */
  source: "docs/validation.md",
} as const;

/** The limits a cold-end SST reading carries, as plain sentences. */
export const SST_COLD_END_ACCURACY_LIMITATIONS = [
  `The probe's quoted inversion accuracy is a whole-ramp RMSE; below ${SST_COLD_END_ACCURACY.thresholdC} °C the measured residual is ${SST_COLD_END_ACCURACY.coldBandRmseC} °C, against ${SST_COLD_END_ACCURACY.restOfRampRmseC.min}–${SST_COLD_END_ACCURACY.restOfRampRmseC.max} °C over the rest of the ramp.`,
  `The display legend anchors its cold stop at GIBS's ~${SST_COLD_END_ACCURACY.legendColdAnchorC} °C hue so that undrawn pixels stay rejected as no-data; the wider cold-end residual is the cost of that separation, not a retrieval error.`,
  "The screen reads reported values, which are themselves imprecise in this band, so a true cold-band reading can surface above the threshold and go unflagged.",
  "Both figures are two-sided residuals for resolved colours; a month decoded into the colormap's open low cap is a bound whose cold-side error is unbounded, so neither band describes it.",
  "This is rendering-inversion error only — not the accuracy of the underlying L3 product — and no sea-ice, biological, ecological, hazard, causal, or forecast claim follows from a cold reading.",
] as const;

export interface SstColdEndAccuracyReading {
  kind: "sst-cold-end-accuracy";
  /** True only for the SST layer with at least one reported value in the band. */
  applies: boolean;
  /** Coldest reported value in °C, or null when nothing was reported. */
  coldestValueC: number | null;
  /** Reported months at or below the threshold. */
  coldBandMonths: number;
  /**
   * Of those, how many are not measurements at all: months the published
   * colormap collapsed into its open low cap, whose cold-side error is
   * unbounded and which therefore sit outside both quoted bands. Zero whenever
   * the caller supplies no censoring screen, which keeps the reading exactly
   * as it read before this was measured.
   */
  cappedMonths: number;
  /** Measured residual for this band, or null when the reading does not apply. */
  coldBandRmseC: number | null;
  /** The whole-ramp figure the panel quotes, for contrast; null when unmeasured. */
  wholeRampRmseC: number | null;
}

/**
 * Classify a probed SST series against the ramp's cold-end accuracy split.
 *
 * `values` are the physical values the panel charts and summarizes — the same
 * numbers the reader sees — so this describes what the quoted ± band can be
 * said to mean for them, not how they were obtained.
 *
 * `censoring` is the same series judged against the ramp's open end caps. It is
 * optional because it answers a different question and every caller that has it
 * already computed it for its own clause; supplying it lets this reading say
 * which of the cold-band months are bounds rather than measurements, and
 * omitting it simply leaves that unmeasured rather than assumed absent. A
 * screen for another layer, or one with nothing to judge, counts as none.
 */
export function probeSstColdEndAccuracy(
  layerId: LayerId | undefined,
  values: readonly (number | null)[],
  censoring?: ProbeSstExtremeCensoring
): SstColdEndAccuracyReading {
  const empty: SstColdEndAccuracyReading = {
    kind: "sst-cold-end-accuracy",
    applies: false,
    coldestValueC: null,
    coldBandMonths: 0,
    cappedMonths: 0,
    coldBandRmseC: null,
    wholeRampRmseC: null,
  };
  if (layerId !== SST_COLD_END_ACCURACY.layerId) return empty;

  const reported = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );
  if (reported.length === 0) return empty;

  const coldest = Math.min(...reported);
  const coldBandMonths = reported.filter(
    (value) => value <= SST_COLD_END_ACCURACY.thresholdC
  ).length;
  if (coldBandMonths === 0) {
    return { ...empty, coldestValueC: coldest };
  }
  // Only the LOW cap can put a month in this band: the high cap collapses water
  // at or above 32 °C, which no threshold this side of the ramp reaches. So the
  // ceiling count is deliberately ignored rather than added in.
  const cappedMonths =
    censoring && censoring.applicable ? censoring.floorMonthCount : 0;
  return {
    kind: "sst-cold-end-accuracy",
    applies: true,
    coldestValueC: coldest,
    coldBandMonths,
    // A screen judged on a different series could in principle count more
    // capped months than this one saw cold-band months; clamp rather than
    // print a subset larger than its set.
    cappedMonths: Math.min(cappedMonths, coldBandMonths),
    coldBandRmseC: SST_COLD_END_ACCURACY.coldBandRmseC,
    wholeRampRmseC: MEASURED_INVERSION.sst.rmse,
  };
}

/**
 * Short clause for the probe panel status line, *replacing* the whole-ramp
 * accuracy figure it qualifies rather than following it. Empty for every other
 * layer, for an empty record, and for any SST record that stays out of the cold
 * band — so an ordinary readout is unchanged and the caller falls back to the
 * unqualified accuracy clause.
 *
 * `wholeRampClause` is the accuracy clause this one supersedes, e.g.
 * `±1.0 °C vs GIBS colormap`. Rendering both printed that figure twice in one
 * line — once as the reading's accuracy, again inside the correction naming it
 * — so it is taken as an argument instead, keeping its attribution and stating
 * it once. Omitting it falls back to the bare figure, unchanged.
 *
 * A capped month adds a short trailing parenthesis rather than a second clause:
 * it corrects the very band this clause just quoted, so it belongs inside it.
 */
export function sstColdEndAccuracyClause(
  reading: SstColdEndAccuracyReading,
  wholeRampClause = ""
): string {
  if (!reading.applies || reading.coldBandRmseC === null) return "";
  // A layer that inverts no colour has no pooled figure to name, and its clause
  // is a sentence rather than a band — never splice that in behind "not".
  const pooled =
    reading.wholeRampRmseC === null
      ? ""
      : wholeRampClause ||
        `±${reading.wholeRampRmseC.toFixed(1)} ${SST_COLD_END_ACCURACY.unit}`;
  const whole = pooled ? `the whole-ramp ${pooled}` : "the whole-ramp figure";
  // Neither band is a two-sided residual for a month the colormap capped, so
  // name the exception instead of letting the ± read as covering every row in
  // the band. No corrected value is offered: none exists.
  const capped =
    reading.cappedMonths > 0
      ? ` (neither band describes the ${reading.cappedMonths} capped ${
          reading.cappedMonths === 1 ? "month" : "months"
        })`
      : "";
  return `±${reading.coldBandRmseC.toFixed(1)} ${SST_COLD_END_ACCURACY.unit} below ${SST_COLD_END_ACCURACY.thresholdC} ${SST_COLD_END_ACCURACY.unit}, not ${whole}${capped}`;
}

/**
 * CSV provenance headers qualifying the pooled inversion RMSE that
 * `inversionAccuracyCsvHeaders` writes into the same file.
 *
 * The export is a second surface with its own failure mode. On screen the
 * reader sees the pooled band beside the values it describes and can be left to
 * read them together; a downloaded file outlives that session and states its
 * accuracy once, at the top, as a rule that looks complete for every row below
 * it. For a polar or sub-polar record that rule understates the error by about
 * a factor of three, so the qualifier travels with the file exactly as it
 * travels with the panel.
 *
 * Returned as a list, and empty unless the record actually enters the band —
 * an ordinary subtropical export is byte-identical to before. Silence is
 * correct there rather than merely convenient: above the threshold the pooled
 * figure *overstates* the residual, and a conservative band needs no warning.
 */
export function sstColdEndAccuracyCsvHeaders(
  reading: SstColdEndAccuracyReading
): string[] {
  if (!reading.applies || reading.coldBandRmseC === null) return [];
  const { unit, thresholdC, restOfRampRmseC, legendColdAnchorC, source } =
    SST_COLD_END_ACCURACY;
  const whole =
    reading.wholeRampRmseC === null
      ? "the pooled figure above"
      : `the pooled ±${reading.wholeRampRmseC.toFixed(1)} ${unit} above`;
  const months = reading.coldBandMonths === 1 ? "month" : "months";
  // When the low cap took the coldest month, that number is an upper bound on
  // possibly colder water and printing it bare hands the reader a measurement.
  // The status line marks every censored statistic the moment it renders it;
  // this parenthetical is the same figure and takes the same inequality.
  const coldestPrefix = reading.cappedMonths > 0 ? "≤ " : "";
  const coldest =
    reading.coldestValueC === null
      ? ""
      : ` (coldest ${coldestPrefix}${reading.coldestValueC.toFixed(1)} ${unit})`;
  const capped =
    reading.cappedMonths > 0
      ? [
          `# inversion_validation_cold_end_capped: ${reading.cappedMonths} of those ${months} decode into the colormap's open low cap rather than resolving — both figures above are two-sided residuals for a colour that stands for one value so neither describes those rows whose cold-side error is unbounded (see the sst_ramp_censoring lines)`,
        ]
      : [];
  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  return [
    `# inversion_validation_cold_end: that RMSE is pooled over the whole SST ramp — below ${thresholdC} ${unit} the measured residual is ±${reading.coldBandRmseC.toFixed(1)} ${unit} against ±${restOfRampRmseC.min}–${restOfRampRmseC.max} ${unit} over the rest of the ramp (${source})`,
    `# inversion_validation_cold_end_rows: ${reading.coldBandMonths} sampled ${months} report at or below ${thresholdC} ${unit}${coldest} — read those rows against the ±${reading.coldBandRmseC.toFixed(1)} ${unit} band and not ${whole}`,
    `# inversion_validation_cold_end_cause: the display legend anchors its cold stop at GIBS's ~${legendColdAnchorC} ${unit} hue so that undrawn pixels stay rejected as no-data; the wider cold-end residual is the cost of that separation and not a retrieval error`,
    ...capped,
    `# inversion_validation_cold_end_screen: this count reads reported values which are themselves imprecise in this band — a true cold-band month can surface above the threshold and go unflagged so the count is a lower bound and never an exhaustive one`,
  ];
}

/**
 * Drift anchor: the threshold this module splits the ramp at has to lie inside
 * the range the probe scales its SST readings with, and the cold-band residual
 * has to stay worse than the whole-ramp figure it qualifies — otherwise the
 * split has stopped describing the legend. Exported so the test can assert it.
 */
export const SST_COLD_END_SCALE_ANCHOR = {
  min: PROBE_SCALES.sst.min,
  max: PROBE_SCALES.sst.max,
  unit: PROBE_SCALES.sst.unit,
  wholeRampRmse: MEASURED_INVERSION.sst.rmse,
} as const;
