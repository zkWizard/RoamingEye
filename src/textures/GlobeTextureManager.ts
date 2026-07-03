import * as THREE from "three";
import {
  gibsWmsUrl,
  type LayerConfig,
  type YearMonth,
  type GibsImageOptions,
} from "../lib/timeline";

/**
 * Loads NASA GIBS monthly composites and applies them to the globe material.
 *
 * To make scrubbing feel real-time, this uses two resolutions:
 *  - **Preview**: a small image for every month in the range, prefetched up
 *    front and cached. Crossing into a new month while dragging is then an
 *    instant cache hit, so the globe changes live at each boundary.
 *  - **Sharp**: a full-resolution image loaded (debounced) only for the month
 *    the user settles on, then swapped in to crisp up the view.
 *
 * It also ignores stale loads (only the latest selection wins) and disposes
 * textures it no longer needs to bound GPU memory.
 */

interface ManagerOptions {
  /** Small image size used for instant scrubbing (default 512×256). */
  preview?: GibsImageOptions;
  /** Full-resolution size for the settled month (default 2048×1024). */
  sharp?: GibsImageOptions;
  /** Max full-resolution textures kept before the least-recently-used is dropped. */
  sharpCacheSize?: number;
  /** Delay before loading the sharp upgrade after the user stops, in ms. */
  debounceMs?: number;
  /** How many preview images to prefetch concurrently. */
  prefetchConcurrency?: number;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (key: string) => void;
}

export class GlobeTextureManager {
  private readonly material: THREE.MeshStandardMaterial;
  private readonly loader = new THREE.TextureLoader();
  private readonly anisotropy: number;

  // Preview textures are kept for the whole current range; sharp textures are
  // a small LRU set (insertion order == recency).
  private readonly previewCache = new Map<string, THREE.Texture>();
  private readonly sharpCache = new Map<string, THREE.Texture>();

  private readonly preview: GibsImageOptions;
  private readonly sharp: GibsImageOptions;
  private readonly sharpCacheSize: number;
  private readonly debounceMs: number;
  private readonly prefetchConcurrency: number;
  private readonly onLoadingChange?: (loading: boolean) => void;
  private readonly onError?: (key: string) => void;

  private currentKey: string | undefined;
  private sharpSeq = 0;
  private sharpTimer: ReturnType<typeof setTimeout> | undefined;
  private prefetchSeq = 0;

  constructor(
    material: THREE.MeshStandardMaterial,
    maxAnisotropy: number,
    options: ManagerOptions = {}
  ) {
    this.material = material;
    this.anisotropy = maxAnisotropy;
    this.preview = options.preview ?? { width: 512, height: 256 };
    this.sharp = options.sharp ?? { width: 2048, height: 1024 };
    this.sharpCacheSize = options.sharpCacheSize ?? 8;
    this.debounceMs = options.debounceMs ?? 150;
    this.prefetchConcurrency = options.prefetchConcurrency ?? 6;
    this.onLoadingChange = options.onLoadingChange;
    this.onError = options.onError;
  }

  /**
   * Show the given layer + month. Applies the best already-loaded texture
   * immediately (so scrubbing is live), then upgrades to full resolution once
   * the user settles.
   */
  show(layer: LayerConfig, ym: YearMonth): void {
    const key = keyFor(layer, ym);
    if (key === this.currentKey) return;
    this.currentKey = key;

    const sharp = this.sharpCache.get(key);
    if (sharp) {
      this.touchSharp(key, sharp);
      this.apply(sharp);
      this.cancelSharp();
      this.onLoadingChange?.(false);
      return;
    }

    const preview = this.previewCache.get(key);
    if (preview) {
      this.apply(preview); // instant — this is what makes scrubbing real-time
      this.onLoadingChange?.(false);
    } else {
      this.onLoadingChange?.(true); // nothing cached yet for this month
    }

    this.scheduleSharp(layer, ym, key);
  }

  /**
   * Prefetch a small preview for every month in the range, so scrubbing is
   * instant. Safe to call repeatedly (e.g. on layer change); a new call
   * supersedes any in-flight prefetch and drops previews from other layers.
   */
  prefetchPreviews(layer: LayerConfig, months: YearMonth[]): void {
    const seq = ++this.prefetchSeq;
    this.disposePreviewsExcept(layer.id);

    // Dedupe by cache key: a static layer maps every month to the same key, so
    // it must enter the queue once, not once per month.
    const queued = new Set<string>();
    const pending = months.filter((ym) => {
      const key = keyFor(layer, ym);
      if (this.previewCache.has(key) || queued.has(key)) return false;
      queued.add(key);
      return true;
    });
    let next = 0;
    let active = 0;

    const pump = (): void => {
      if (seq !== this.prefetchSeq) return;
      while (active < this.prefetchConcurrency && next < pending.length) {
        const ym = pending[next++];
        const key = keyFor(layer, ym);
        active++;
        this.loader.load(
          gibsWmsUrl(layer, ym, this.preview),
          (texture) => {
            if (seq === this.prefetchSeq) {
              this.prep(texture, true);
              this.previewCache.set(key, texture);
            } else {
              texture.dispose();
            }
            active--;
            pump();
          },
          undefined,
          () => {
            active--;
            pump();
          }
        );
      }
    };

    pump();
  }

  dispose(): void {
    this.cancelSharp();
    this.prefetchSeq++; // stop any in-flight prefetch pumps
    for (const texture of this.previewCache.values()) texture.dispose();
    for (const texture of this.sharpCache.values()) texture.dispose();
    this.previewCache.clear();
    this.sharpCache.clear();
  }

  // --- internals ------------------------------------------------------------

  private scheduleSharp(layer: LayerConfig, ym: YearMonth, key: string): void {
    this.cancelSharp();
    const seq = ++this.sharpSeq;
    this.sharpTimer = setTimeout(
      () => this.loadSharp(layer, ym, key, seq),
      this.debounceMs
    );
  }

  private cancelSharp(): void {
    clearTimeout(this.sharpTimer);
  }

  private loadSharp(
    layer: LayerConfig,
    ym: YearMonth,
    key: string,
    seq: number
  ): void {
    this.loader.load(
      gibsWmsUrl(layer, ym, this.sharp),
      (texture) => {
        // Drop if a newer selection or sharp request superseded this one.
        if (seq !== this.sharpSeq || key !== this.currentKey) {
          texture.dispose();
          return;
        }
        this.prep(texture, false);
        this.touchSharp(key, texture);
        this.evictSharp();
        this.apply(texture);
        this.onLoadingChange?.(false);
      },
      undefined,
      () => {
        // External/network failure is recoverable — warn, don't error, so it
        // doesn't trip the e2e "no console errors" smoke test.
        console.warn(`RoamingEye: failed to load imagery for ${key}`);
        if (key === this.currentKey) {
          this.onLoadingChange?.(false);
          this.onError?.(key);
        }
      }
    );
  }

  private apply(texture: THREE.Texture): void {
    this.material.map = texture;
    this.material.color.set(0xffffff);
    this.material.needsUpdate = true;
  }

  private prep(texture: THREE.Texture, isPreview: boolean): void {
    texture.colorSpace = THREE.SRGBColorSpace;
    if (isPreview) {
      // 60 of these are kept at once — skip mipmaps to keep GPU memory bounded.
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
    } else {
      texture.anisotropy = this.anisotropy; // crisp limb on the settled month
    }
  }

  private touchSharp(key: string, texture: THREE.Texture): void {
    this.sharpCache.delete(key);
    this.sharpCache.set(key, texture);
  }

  private evictSharp(): void {
    while (this.sharpCache.size > this.sharpCacheSize) {
      const oldest = this.sharpCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const texture = this.sharpCache.get(oldest);
      this.sharpCache.delete(oldest);
      if (texture && texture !== this.material.map) texture.dispose();
    }
  }

  private disposePreviewsExcept(layerId: string): void {
    const prefix = `${layerId}:`;
    for (const [key, texture] of this.previewCache) {
      if (!key.startsWith(prefix) && texture !== this.material.map) {
        texture.dispose();
        this.previewCache.delete(key);
      }
    }
  }
}

function keyFor(layer: LayerConfig, ym: YearMonth): string {
  // Static (time-less) layers map every month to one cache entry, so scrubbing
  // never refetches them and prefetch fetches them exactly once.
  return layer.static
    ? `${layer.id}:static`
    : `${layer.id}:${ym.year}-${ym.month}`;
}
