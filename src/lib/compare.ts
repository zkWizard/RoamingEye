import { formatYm, ymEqual, type YearMonth } from "./timeline";

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
