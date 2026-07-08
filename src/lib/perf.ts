/**
 * Adaptive render resolution: keep the globe interactive on weak GPUs (old
 * lab machines, software rendering) by trading pixel ratio for frame rate.
 * Pure decision logic (see perf.test.ts); main.ts measures FPS over ~2 s
 * windows in the render loop and applies the result.
 */

/** Sustained frame rates below this trigger a resolution step down. */
export const LOW_FPS = 25;
/** Frame rates above this allow stepping back up (wide hysteresis band). */
export const HIGH_FPS = 55;
/** Never render below this pixel ratio — text/lines stay legible. */
export const MIN_PIXEL_RATIO = 0.75;

/**
 * The pixel ratio to use next, given the measured FPS of the last window.
 * Steps down 20% under sustained low FPS, back up 25% (inverse) when there
 * is clear headroom; the LOW/HIGH gap prevents oscillation.
 */
export function nextPixelRatio(
  current: number,
  fps: number,
  min = MIN_PIXEL_RATIO,
  max = 2
): number {
  if (fps < LOW_FPS) return Math.max(min, round2(current * 0.8));
  if (fps > HIGH_FPS && current < max) {
    return Math.min(max, round2(current * 1.25));
  }
  return current;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
