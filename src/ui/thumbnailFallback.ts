/**
 * What a view-card thumbnail should paint.
 *
 * The card's GetMap URL is ready before the element exists (see
 * `viewCardThumbnail`). The bitmap still fails sometimes: native lazy
 * loading aborts an in-flight image when the scrolling panel or the closed
 * phone sheet clips it, and that abort is an `error`. A GIBS hiccup is the
 * same event. Either way the browser paints its broken-image icon on top of
 * any background on the `<img>` itself, so the fallback has to be a box
 * behind an image we only reveal after a successful decode.
 */

export interface ThumbDecision {
  /**
   * `undefined` leaves the current `src` alone. `null` clears it so a failed
   * decode cannot stay attached. A string is the next URL to request.
   */
  src?: string | null;
  /** False keeps the `<img>` from painting, which is what hides the icon. */
  showImage: boolean;
  /** The per-layer gradient in the thumbnail box is the picture. */
  fallback: boolean;
}

/** One cache-busting retry. GIBS ignores the extra parameter. */
export function thumbRetryUrl(url: string): string {
  if (url.includes("retry=1")) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}retry=1`;
}

/** No URL yet: gradient immediately, and never assign an empty `src`. */
export function initialThumb(url: string): ThumbDecision {
  if (!url) return { src: null, showImage: false, fallback: true };
  return { src: url, showImage: false, fallback: false };
}

/**
 * `failuresSoFar` is how many errors this card has already observed.
 * The first one retries; the next one gives up.
 */
export function thumbOnError(
  url: string,
  failuresSoFar: number
): ThumbDecision {
  if (!url || failuresSoFar >= 1) {
    return { src: null, showImage: false, fallback: true };
  }
  return { src: thumbRetryUrl(url), showImage: false, fallback: false };
}

/** A zero-width decode is a failure that did not fire `error`. */
export function thumbOnLoad(naturalWidth: number): ThumbDecision {
  if (naturalWidth > 0) return { showImage: true, fallback: false };
  return { src: null, showImage: false, fallback: true };
}
