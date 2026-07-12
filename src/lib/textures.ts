import * as THREE from "three";
import { fetchBlob } from "./net";

/**
 * Cancellable texture loading for imagery.
 *
 * THREE.TextureLoader rides an <img> element, which cannot be aborted: a
 * user scrubbing across months kept paying for every superseded download —
 * the seq/generation guards prevented stale textures from ever being
 * APPLIED, but the bytes still crossed the wire, against NASA GIBS (a
 * shared, free service) and on possibly-metered field connections.
 *
 * fetch() + AbortController + createImageBitmap is the cancellable path,
 * and it is already proven in-repo (the probe sampler). Routing through
 * lib/net's fetchBlob also buys imagery the full robustness stack: offline
 * fast-fail, status-aware retries, Retry-After handling, and the WMS
 * ServiceException/HTML-with-200 payload guard.
 *
 * Orientation: decode-time flip (imageOrientation: "flipY") with
 * texture.flipY = false — the standard three.js ImageBitmap pattern —
 * renders pixel-identically to TextureLoader's upload-time flip.
 */

export interface LoadTextureOptions {
  signal?: AbortSignal;
  retries?: number;
  timeoutMs?: number;
}

/**
 * Fetch a URL into an ImageBitmap, abortable via `signal`. Rejects with an
 * AbortError DOMException when aborted (callers treat that as a non-event:
 * no toast, no warn, no retry-burn) and with lib/net's typed errors for real
 * failures. Orientation is the image's own — canvas compositors draw it
 * as-is (set `flip: true` for direct GPU upload; see loadAbortableTexture).
 */
export async function loadAbortableBitmap(
  url: string,
  options: LoadTextureOptions = {},
  flip = false
): Promise<ImageBitmap> {
  const blob = await fetchBlob(url, {
    retries: options.retries ?? 2,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
  const bitmap = await createImageBitmap(
    blob,
    flip ? { imageOrientation: "flipY" } : {}
  );
  // The fetch can win a race against an abort that lands during decode;
  // honor the caller's intent rather than hand back a bitmap it will leak.
  if (options.signal?.aborted) {
    bitmap.close();
    throw new DOMException("texture load aborted", "AbortError");
  }
  return bitmap;
}

/** Fetch a URL into a THREE.Texture, abortable via `signal` (see above). */
export async function loadAbortableTexture(
  url: string,
  options: LoadTextureOptions = {}
): Promise<THREE.Texture> {
  const bitmap = await loadAbortableBitmap(url, options, true);
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
