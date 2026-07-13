import {
  gibsRegionUrl,
  splitBoundsAtAntimeridian,
  type Bounds,
} from "./imagery";
import { fetchBlob } from "./net";
import type { YearMonth } from "./timeline";

/**
 * Cloud-and-coverage-aware scene selection for the high-resolution study patch.
 *
 * HLS imagery is per-scene daily, so any given day may be cloudy or only
 * partially covered by a satellite swath. Rather than hand the user a black or
 * cloud-filled tile, we probe a few candidate acquisition dates with tiny
 * thumbnails, score each for usable coverage, and pick the clearest — falling
 * back from Sentinel-2 (HLS S30) to Landsat (HLS L30) when needed.
 */

export interface SceneLayer {
  id: string;
  wmsLayer: string;
  label: string;
}

export const SCENE_LAYERS: SceneLayer[] = [
  {
    id: "hls-s30",
    wmsLayer: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance",
    label: "Sentinel-2 · HLS S30 · 30 m",
  },
  {
    id: "hls-l30",
    wmsLayer: "HLS_L30_Nadir_BRDF_Adjusted_Reflectance",
    label: "Landsat · HLS L30 · 30 m",
  },
];

/**
 * Candidate acquisition days to probe within a month. HLS revisit is ~2–3 days
 * but coverage on any given day is orbit-specific, so we sample ~every third day
 * across the month and let scoring pick the clearest actual pass.
 */
export function candidateDates(ym: YearMonth): string[] {
  const mm = String(ym.month).padStart(2, "0");
  // Keep candidate requests on real calendar days. In particular, asking GIBS
  // for February 29 in a non-leap year is not a missing HLS observation; it is
  // an invalid timestamp, and treating it as a failed scene distorts a bounded
  // probing budget.
  const daysInMonth = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  return [2, 5, 8, 11, 14, 17, 20, 23, 26, 29]
    .filter((day) => day <= daysInMonth)
    .map((day) => `${ym.year}-${mm}-${String(day).padStart(2, "0")}`);
}

/**
 * Fraction of pixels that carry usable signal — i.e. neither no-data (near
 * black) nor saturated cloud (near white). Pure, so it's unit-tested with
 * synthetic pixel buffers.
 */
export function coverageScore(pixels: Uint8ClampedArray): number {
  let useful = 0;
  let total = 0;
  for (let i = 0; i + 2 < pixels.length; i += 4) {
    const lum = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    total++;
    if (lum > 12 && lum < 245) useful++;
  }
  return total ? useful / total : 0;
}

export interface BestScene {
  layer: SceneLayer;
  date: string;
  score: number;
}

/** Coverage score below which a scene is considered unusable. */
export const MIN_USABLE_SCORE = 0.04;
/** Coverage score above which we stop searching (good enough). */
const GOOD_ENOUGH_SCORE = 0.35;
/**
 * Cap simultaneous thumbnail requests so selecting a study scene does not
 * monopolize the browser connection pool or compete excessively with globe
 * imagery. This limits request pressure only; it does not change candidate
 * dates or coverage scoring.
 */
export const SCENE_PROBE_CONCURRENCY = 3;

/**
 * Run asynchronous work with a bounded number of in-flight operations while
 * retaining input order. Kept generic and pure in its scheduling so the
 * scene-selection network policy is directly testable.
 */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  maxInFlight: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(maxInFlight) || 1);
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker())
  );
  return results;
}

/**
 * User-visible context for a selected HLS scene. The score is a rendered
 * thumbnail signal screen, not a cloud product, ground-resolution measure,
 * or fractional geographic coverage claim.
 */
export function formatSceneSelectionStatus(scene: BestScene): string {
  const score = Number.isFinite(scene.score)
    ? `${Math.round(Math.min(1, Math.max(0, scene.score)) * 100)}% usable thumbnail signal`
    : "usable thumbnail signal unavailable";
  return `${scene.layer.label} · ${scene.date} · ${score} (screening only)`;
}

/**
 * Score a whole (possibly antimeridian-crossing) box: each legal piece is
 * probed with its own thumbnail and the scores combine weighted by the
 * piece's share of the box — so a Fiji-sized region is judged on ALL of its
 * area, not on a slid approximation of it.
 */
async function probe(
  layer: SceneLayer,
  bounds: Bounds,
  date: string,
  signal?: AbortSignal
): Promise<number> {
  const parts = splitBoundsAtAntimeridian(bounds);
  const scores = await Promise.all(
    parts.map((part) => probePart(layer, part.bounds, date, signal))
  );
  return scores.reduce((sum, s, i) => sum + s * parts[i].fraction, 0);
}

async function probePart(
  layer: SceneLayer,
  bounds: Bounds,
  date: string,
  signal?: AbortSignal
): Promise<number> {
  try {
    const url = gibsRegionUrl(layer.wmsLayer, bounds, date, {
      width: 96,
      height: 96,
    });
    const blob = await fetchBlob(url, { retries: 0, timeoutMs: 8000, signal });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return 0;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return coverageScore(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data
    );
  } catch {
    return 0;
  }
}

/**
 * Probe candidate dates/layers and return the clearest scene, or null if none
 * carry usable imagery for the month.
 */
export async function pickBestScene(
  bounds: Bounds,
  ym: YearMonth,
  signal?: AbortSignal
): Promise<BestScene | null> {
  const dates = candidateDates(ym);
  let best: BestScene | null = null;

  for (const layer of SCENE_LAYERS) {
    const scores = await mapWithConcurrency(
      dates,
      SCENE_PROBE_CONCURRENCY,
      (date) => probe(layer, bounds, date, signal)
    );
    for (let i = 0; i < dates.length; i++) {
      if (!best || scores[i] > best.score) {
        best = { layer, date: dates[i], score: scores[i] };
      }
    }
    if (best && best.score >= GOOD_ENOUGH_SCORE) break; // good enough
  }

  return best && best.score >= MIN_USABLE_SCORE ? best : null;
}
