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
 * Responsibilities:
 *  - Debounce rapid scrubbing so we don't fire a request per dragged pixel.
 *  - Ignore stale loads (only the latest selection wins).
 *  - LRU-cache decoded textures and dispose evicted ones to bound GPU memory.
 */

interface ManagerOptions {
  image?: GibsImageOptions;
  /** Max textures kept on the GPU before the least-recently-used is disposed. */
  cacheSize?: number;
  /** Debounce window for scrubbing, in ms. */
  debounceMs?: number;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (key: string) => void;
}

export class GlobeTextureManager {
  private readonly material: THREE.MeshStandardMaterial;
  private readonly loader = new THREE.TextureLoader();
  private readonly cache = new Map<string, THREE.Texture>(); // insertion order == LRU
  private readonly anisotropy: number;
  private readonly options: Required<
    Omit<ManagerOptions, "onLoadingChange" | "onError" | "image">
  > &
    Pick<ManagerOptions, "onLoadingChange" | "onError" | "image">;

  private requestSeq = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private currentKey: string | undefined;

  constructor(
    material: THREE.MeshStandardMaterial,
    maxAnisotropy: number,
    options: ManagerOptions = {}
  ) {
    this.material = material;
    this.anisotropy = maxAnisotropy;
    this.options = {
      cacheSize: options.cacheSize ?? 12,
      debounceMs: options.debounceMs ?? 150,
      image: options.image,
      onLoadingChange: options.onLoadingChange,
      onError: options.onError,
    };
  }

  /** Request that the globe show the given layer + month (debounced). */
  show(layer: LayerConfig, ym: YearMonth): void {
    const key = `${layer.id}:${ym.year}-${ym.month}`;
    if (key === this.currentKey) return;
    this.currentKey = key;

    // Cached → apply immediately, no network, no debounce.
    const cached = this.cache.get(key);
    if (cached) {
      this.touch(key, cached);
      this.apply(cached);
      this.options.onLoadingChange?.(false);
      return;
    }

    this.options.onLoadingChange?.(true);
    clearTimeout(this.debounceTimer);
    const seq = ++this.requestSeq;
    this.debounceTimer = setTimeout(
      () => this.load(layer, ym, key, seq),
      this.options.debounceMs
    );
  }

  private load(
    layer: LayerConfig,
    ym: YearMonth,
    key: string,
    seq: number
  ): void {
    const url = gibsWmsUrl(layer, ym, this.options.image);
    this.loader.load(
      url,
      (texture) => {
        if (seq !== this.requestSeq) {
          texture.dispose(); // a newer request superseded this one
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.anisotropy;
        this.touch(key, texture);
        this.evict();
        this.apply(texture);
        this.options.onLoadingChange?.(false);
      },
      undefined,
      () => {
        // Network/imagery failure is recoverable and external — warn, don't
        // error, so it doesn't trip the e2e "no console errors" smoke test.
        console.warn(`RoamingEye: failed to load imagery for ${key}`);
        if (seq === this.requestSeq) {
          this.options.onLoadingChange?.(false);
          this.options.onError?.(key);
        }
      }
    );
  }

  private apply(texture: THREE.Texture): void {
    this.material.map = texture;
    this.material.color.set(0xffffff);
    this.material.needsUpdate = true;
  }

  /** Mark a key as most-recently-used. */
  private touch(key: string, texture: THREE.Texture): void {
    this.cache.delete(key);
    this.cache.set(key, texture);
  }

  /** Drop least-recently-used textures beyond the cache cap. */
  private evict(): void {
    while (this.cache.size > this.options.cacheSize) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const texture = this.cache.get(oldest);
      this.cache.delete(oldest);
      // Never dispose the texture currently on screen.
      if (texture && texture !== this.material.map) texture.dispose();
    }
  }

  dispose(): void {
    clearTimeout(this.debounceTimer);
    for (const texture of this.cache.values()) texture.dispose();
    this.cache.clear();
  }
}
