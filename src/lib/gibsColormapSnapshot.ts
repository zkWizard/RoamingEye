import snapshot from "./gibsColormaps.json";
import type { ColormapEntry, CalibratedLayerId } from "./colormap";

/**
 * A pinned copy of the GIBS colormap ramps the probe's inversion accuracy is
 * measured against — the ground truth for "what value does this colour mean".
 *
 * The published accuracy figures (validation.MEASURED_INVERSION, quoted in
 * METHODS.md §3 and docs/validation.md, and shown to users as the ± band on
 * probe readings) are the residuals of inverting these colours through our
 * legend gradients. That measurement used to run **only** in the weekly,
 * network-touching inversion contract, so an edit to a legend gradient or a
 * probe scale could change the true accuracy and leave the published figures
 * wrong for up to a week with every offline check green. Pinning the ramps
 * here lets the same measurement re-run offline on every PR.
 *
 * This is a *cache of the authoritative document*, never a replacement for
 * it. Provenance is carried explicitly (`SNAPSHOT_PROVENANCE`) and the live
 * contract still fetches each colormap weekly and fails if it has drifted
 * from this snapshot — so the cache cannot quietly go stale.
 *
 * Regenerate with: node scripts/snapshot-colormaps.mjs
 */

interface SnapshotFile {
  /** ISO date (UTC) the documents were retrieved. */
  retrieved: string;
  /** URL template the documents came from, with `<doc>` for the document name. */
  base: string;
  layers: Record<
    string,
    { doc: string; entries: { rgb: number[]; value: number }[] }
  >;
}

const file = snapshot as SnapshotFile;

/** Where the pinned ramps came from and when — cite this, not the cache. */
export const SNAPSHOT_PROVENANCE: {
  retrieved: string;
  base: string;
  docs: Record<CalibratedLayerId, string>;
} = {
  retrieved: file.retrieved,
  base: file.base,
  docs: Object.fromEntries(
    Object.entries(file.layers).map(([layer, { doc }]) => [layer, doc])
  ) as Record<CalibratedLayerId, string>,
};

/**
 * The pinned continuous-legend entries for a calibrated layer, in the shape
 * `parseColormapEntries` returns — so the offline re-measurement runs the
 * production inversion path unchanged.
 */
export function snapshotColormapEntries(
  layer: CalibratedLayerId
): ColormapEntry[] {
  const entry = file.layers[layer];
  if (!entry) return [];
  return entry.entries.map(({ rgb, value }) => ({
    rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
    value,
  }));
}
