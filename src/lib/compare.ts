import {
  formatTimelineLabel,
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

/**
 * Accessible description of the comparison, e.g. "Aug 2019 vs Aug 2024" — and
 * "2001 vs 2020" for an annual product.
 *
 * Labelled at the layer's own publishing cadence, like every other date the
 * app renders (the scrubber readout and the provenance line both go through
 * `formatTimelineLabel`). Annual layers enumerate as `{year, month: 1}`
 * placeholders (`monthRangeForLayer`), so formatting a comparison with the
 * plain month formatter printed "Jan 2001 vs Jan 2020" over a land-cover
 * swipe: a January that MCD12Q1 does not resolve. An annual IGBP composite
 * classifies a whole year, and a change-detection view that dates each side
 * to a month claims the product separates months — the same fabricated
 * precision the app refuses everywhere else, and contradicted on screen by
 * its own scrubber reading a bare year.
 */
export function compareCaption(
  layer: LayerConfig,
  pinned: YearMonth,
  live: YearMonth
): string {
  return `${formatTimelineLabel(layer, pinned)} vs ${formatTimelineLabel(layer, live)}`;
}

/**
 * Date field for the provenance readout: one month normally, and both months
 * — pinned (left, "before") first — while a comparison is on screen.
 *
 * The provenance line is the app's citation surface. It is the only readout
 * styled `user-select: text` precisely because researchers copy it into notes
 * and methods sections (see `.provenance` in style.css), so it travels off
 * screen in a way the divider's own date chips never do. While a comparison
 * was showing it still named `months[currentIndex]` alone, which dated a
 * two-month change-detection view to a single month: the globe drew August
 * 2019 left of the divider and August 2024 right of it, and the line a reader
 * would paste under the figure said only "Aug 2024". Half the imagery on
 * screen had no provenance at all, and the half that did was attributed to
 * the wrong side of the seam for everything left of the divider.
 *
 * Same provenance drop already fixed for the PNG filename (`exportMonthStamp`)
 * and the copied GetMap URL (`imageryUrlExport`), on the third and last
 * surface that carries a comparison's dates out of the app.
 *
 * Both sides format through `formatTimelineLabel`, so an annual product reads
 * "2001 vs 2020" rather than claiming a January that MCD12Q1 cannot resolve,
 * and the dedupe is on the BUILT LABELS rather than the months: the moment
 * compare is enabled the pinned month IS the live month (main.ts pins
 * `months[currentIndex]`), and one image on both sides of the divider is one
 * month of provenance, not two.
 */
export function provenanceMonths(
  layer: LayerConfig,
  live: YearMonth,
  pinned?: YearMonth
): string {
  const liveLabel = formatTimelineLabel(layer, live);
  if (!pinned) return liveLabel;
  const pinnedLabel = formatTimelineLabel(layer, pinned);
  return pinnedLabel === liveLabel
    ? liveLabel
    : compareCaption(layer, pinned, live);
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
