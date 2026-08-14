import {
  formatYm,
  gibsWmsUrl,
  ymEqual,
  type LayerConfig,
  type YearMonth,
} from "./timeline";

/**
 * Comparison (A/B) mode model: the pure logic behind the swipe divider that
 * shows two months of the same layer side by side — the core change-detection
 * workflow (pre/post eruption, drought years, decade-apart snowlines).
 *
 * Interaction contract (see ui/CompareControls.ts + main.ts): scrub to the
 * "before" month, enable compare to pin it on the left; the timeline keeps
 * driving the right ("after") side; drag the divider to sweep between them.
 */

/** The divider never reaches the edges, so both sides stay visible. */
export const MIN_SPLIT = 0.08;
export const MAX_SPLIT = 0.92;

export function clampSplit(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0.5;
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, fraction));
}

/** Map a pointer x within the viewport to a clamped split fraction. */
export function splitFromPointer(clientX: number, width: number): number {
  if (width <= 0) return 0.5;
  return clampSplit(clientX / width);
}

/** Accessible description of the comparison, e.g. "Aug 2019 vs Aug 2024". */
export function compareCaption(pinned: YearMonth, live: YearMonth): string {
  return `${formatYm(pinned)} vs ${formatYm(live)}`;
}

/** Comparing a month to itself shows nothing — callers surface a hint. */
export function isTrivialCompare(pinned: YearMonth, live: YearMonth): boolean {
  return ymEqual(pinned, live);
}

/**
 * Month field for an exported figure's filename: `"2024-08"` normally, and
 * `"compare_2019-08-left_2024-08-right"` while a comparison is on screen.
 *
 * A comparison PNG holds two months of imagery, but the divider and its two
 * date chips are DOM overlays — the canvas readback that produces the file
 * captures the imagery and neither label. The filename is then the figure's
 * only surviving provenance, so it has to say both months and which side of
 * the seam each one is on; naming the live month alone would date a two-month
 * change-detection figure to a single month once it is in a slide deck. The
 * deep link already records the pin (main.ts `currentViewState`), and every
 * CSV export carries that link — the PNG is the surface that was dropping it.
 *
 * A trivial comparison shows one month on both sides, so it stamps as one.
 */
export function exportMonthStamp(live: YearMonth, pinned?: YearMonth): string {
  if (!pinned || isTrivialCompare(pinned, live)) return isoYm(live);
  return `compare_${isoYm(pinned)}-left_${isoYm(live)}-right`;
}

/**
 * Clipboard payload for the "Imagery URL" export action: the GIBS WMS GetMap
 * URL for every month the view is actually built from, pinned ("before", left
 * of the divider) first.
 *
 * Same provenance drop as `exportMonthStamp` fixed for the PNG, on the other
 * export action. A comparison draws two months of imagery from two separate
 * GetMap requests (scene/CompareController loads the pinned one itself), but
 * the copied URL named only `months[currentIndex]` — so the artifact a user
 * pastes into a notebook or a methods section reproduced one side of a
 * change-detection view and silently discarded the other, with nothing in the
 * URL to say a second month was on screen. Both requests are already made by
 * the app; this hands over the pair it actually used rather than half of it.
 *
 * The dedupe is on the built URLs, not on the months, so the two cases that
 * genuinely render one image — a self-comparison, and a `static` (time-less)
 * layer whose URL carries no TIME param — collapse to a single line by
 * construction and cannot drift away from what `gibsWmsUrl` emits.
 */
export function imageryUrlExport(
  layer: LayerConfig,
  live: YearMonth,
  pinned?: YearMonth
): string {
  const liveUrl = gibsWmsUrl(layer, live);
  if (!pinned) return liveUrl;
  const pinnedUrl = gibsWmsUrl(layer, pinned);
  return pinnedUrl === liveUrl ? liveUrl : `${pinnedUrl}\n${liveUrl}`;
}

function isoYm(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}
