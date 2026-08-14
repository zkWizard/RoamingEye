import { LAYERS, LAYER_ORDER, type DatasetRef, type LayerId } from "./timeline";

/**
 * How RoamingEye actually reads each cited source dataset — the qualification
 * its citation must carry into a manuscript.
 *
 * RoamingEye never touches an archived NASA product. It renders GIBS browse
 * imagery and recovers everything it reports from the colours of that image, at
 * a measured end-to-end error the probe panel, the probe CSV and the place
 * export all disclose (`MEASURED_INVERSION`, validation.ts). The citation
 * bundle is the one surface built to leave the app — a researcher pastes it
 * straight into a reference manager — and it cited the source products with no
 * record of that indirection at all, so a copied entry credited (say) MOD11C3
 * for numbers MOD11C3 never published.
 *
 * The vector sources already solved this: each carries a `note` that "travels
 * with the entry so the limitation is not lost between the app and the
 * manuscript" (citation.ts). This module supplies the same qualification for
 * the GIBS datasets.
 *
 * No error figure is quoted here on purpose. A DatasetRef can back several
 * layers with different inversion status — MOD13A3 backs NDVI (measured) and
 * EVI (never validated) — so a single per-dataset RMSE would be wrong for one
 * of them. The note states the method; the per-layer measured error stays on
 * the surfaces that know which layer is being read.
 */

/** The way RoamingEye recovers information from a cited dataset's imagery. */
export type DatasetReadout =
  /** A continuous colour ramp inverted to physical units. */
  | "ramp-inverted"
  /** A colour ramp read as a fraction of scale, with no physical units. */
  | "relative-ramp"
  /** Discrete class colours — a category, never a measurement. */
  | "classes"
  /** Rendered as pictures only; no value is ever read from it. */
  | "imagery-only";

/**
 * Each layer's readout, pinned rather than derived at runtime.
 *
 * The authority for these values is `characterizeLayerInversion`
 * (briefValueUncertainty.ts), which decides them from `LEGENDS` and
 * `PROBE_SCALES`. Calling it here would import probe.ts into the lazily-loaded
 * providers chunk, and that one edge repartitions the build: measured, it
 * dissolved the lazy plate-boundary chunk and moved 10.4 kB gzip onto the entry
 * chunk every visitor downloads, to qualify a citation only the providers page
 * can produce.
 *
 * So the table is pinned and the agreement is asserted instead — the same
 * discipline the colormap ramps use. `citedDatasetReadout.test.ts` checks every
 * layer against `characterizeLayerInversion`, so a layer whose legend or probe
 * scale changes kind fails CI here rather than shipping a citation note that
 * quietly stopped being true. Adding a layer fails to compile until its readout
 * is stated.
 */
const LAYER_READOUT: Record<LayerId, DatasetReadout> = {
  ndvi: "ramp-inverted",
  // Inverts exactly the way the measured layers do; only its validation run is
  // missing, and an unmeasured error is not an absent one.
  evi: "ramp-inverted",
  lst: "ramp-inverted",
  airtemp: "ramp-inverted",
  sst: "ramp-inverted",
  precip: "ramp-inverted",
  soil: "ramp-inverted",
  snow: "ramp-inverted",
  aerosol: "ramp-inverted",
  // Swatches are class names, not a scale.
  landcover: "classes",
  // Shaded relief is read as a fraction of the ramp, with no physical units.
  terrain: "relative-ramp",
};

/**
 * Strongest-claim-first precedence, used when one dataset backs layers read in
 * different ways. The order is the strength of the claim a citation would carry:
 * a dataset that yields any physical value must say so, even if another of its
 * layers is only categorical. No dataset mixes kinds today; the precedence is
 * fixed here so that adding one cannot silently pick the weaker disclosure.
 */
const READOUT_PRECEDENCE: readonly DatasetReadout[] = [
  "ramp-inverted",
  "relative-ramp",
  "classes",
];

/** The layers a cited DatasetRef backs, identified by the DOI they are cited under. */
function layersCitedUnder(ref: DatasetRef): LayerId[] {
  return LAYER_ORDER.filter((id) => LAYERS[id].dataset?.doi === ref.doi);
}

/**
 * How RoamingEye reads a cited dataset. A DatasetRef no rendered layer claims —
 * the high-resolution HLS basemap — is `imagery-only`: it is drawn on the globe
 * and never sampled for a value.
 */
export function datasetReadout(ref: DatasetRef): DatasetReadout {
  const readouts = layersCitedUnder(ref).map((id) => LAYER_READOUT[id]);
  if (readouts.length === 0) return "imagery-only";
  return (
    READOUT_PRECEDENCE.find((kind) => readouts.includes(kind)) ?? "imagery-only"
  );
}

/**
 * The qualifying note for each readout. Each says the same two things a
 * reader needs: that RoamingEye only ever saw GIBS's rendered imagery of the
 * product, and what — if anything — it therefore reports. None claims an error
 * magnitude, and none tells the reader not to cite the product: the DOI is the
 * right citation for the imagery's source, just not for RoamingEye's numbers.
 */
const READOUT_NOTES: Record<DatasetReadout, string> = {
  "ramp-inverted":
    "RoamingEye reads this product only through GIBS's rendered browse imagery: " +
    "values it reports are recovered by inverting the displayed colour ramp, not " +
    "read from the archived product, and carry that inversion's error. Cite this " +
    "DOI as the source of the imagery rather than of those values.",
  "relative-ramp":
    "RoamingEye reads this product only through GIBS's rendered browse imagery, " +
    "on a relative colour scale with no physical units, so it reports no " +
    "calibrated value from it. Cite this DOI as the source of the imagery.",
  classes:
    "RoamingEye reads this product only through GIBS's rendered browse imagery, " +
    "as discrete class colours rather than a measurement. Cite this DOI as the " +
    "source of the imagery rather than of a value.",
  "imagery-only":
    "RoamingEye renders this product as imagery only and reports no values from it. " +
    "Cite this DOI as the source of the imagery.",
};

/**
 * The note a cited dataset's citation entry carries in every export format, so
 * the indirection between the archived product and RoamingEye's readout is not
 * lost between the app and the manuscript.
 */
export function datasetReadoutNote(ref: DatasetRef): string {
  return READOUT_NOTES[datasetReadout(ref)];
}
