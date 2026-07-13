import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import {
  gibsRegionUrl,
  splitBoundsAtAntimeridian,
  type Bounds,
} from "../lib/imagery";
import { isAbortError } from "../lib/net";
import { pickBestScene } from "../lib/sceneSelection";
import { loadAbortableBitmap, loadAbortableTexture } from "../lib/textures";
import { formatYm, type YearMonth } from "../lib/timeline";

interface StudyCallbacks {
  onLoadingChange?: (loading: boolean) => void;
  /** Reports the resolved scene ("Sentinel-2 · 2024-08-18") or a no-data note. */
  onStatus?: (text: string) => void;
}

/**
 * A high-resolution true-color patch draped over a small region of the globe.
 * For a given timeline month it automatically finds the clearest available
 * satellite pass (see sceneSelection) and drapes that 30 m imagery as a curved
 * sphere-segment mesh just above the base globe.
 */
export class StudyRegion {
  readonly object = new THREE.Group();
  private mesh: THREE.Mesh | undefined;
  private bounds: Bounds | undefined;
  private monthKey: string | undefined;

  private seq = 0;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private texAbort: AbortController | undefined;

  constructor(
    private readonly maxAnisotropy: number,
    private readonly callbacks: StudyCallbacks = {}
  ) {
    this.object.visible = false;
  }

  get active(): boolean {
    return this.object.visible;
  }

  /** Show the patch for a region at a timeline month, rebuilding for new bounds. */
  show(bounds: Bounds, ym: YearMonth): void {
    this.bounds = bounds;
    this.buildMesh(bounds);
    this.object.visible = true;
    void this.resolve(ym);
  }

  /** Switch the patch to a new month (debounced for scrubbing). */
  setMonth(ym: YearMonth): void {
    if (!this.bounds) return;
    const key = monthKeyOf(ym);
    if (key === this.monthKey) return;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.resolve(ym), 220);
  }

  hide(): void {
    this.object.visible = false;
    this.seq++; // invalidate any in-flight resolve
    this.texAbort?.abort(); // and stop paying for its texture download
  }

  private async resolve(ym: YearMonth): Promise<void> {
    if (!this.bounds || !this.mesh) return;
    this.monthKey = monthKeyOf(ym);
    const seq = ++this.seq;

    this.callbacks.onLoadingChange?.(true);
    this.callbacks.onStatus?.(`Finding clearest pass for ${formatYm(ym)}…`);

    // No abort: a superseded resolve is cheap (tiny thumbnails) and is ignored
    // by the sequence guard, which avoids cascading-abort races while scrubbing.
    let best;
    try {
      best = await pickBestScene(this.bounds, ym);
    } catch {
      best = null;
    }
    if (seq !== this.seq) return;

    if (!best) {
      this.callbacks.onLoadingChange?.(false);
      this.callbacks.onStatus?.(
        `No clear pass for ${formatYm(ym)} — try another month`
      );
      return;
    }

    this.loadTexture(best.layer.wmsLayer, best.date, seq, () =>
      this.callbacks.onStatus?.(`${best.layer.label} · ${best.date}`)
    );
  }

  private loadTexture(
    wmsLayer: string,
    date: string,
    seq: number,
    onApplied: () => void
  ): void {
    if (!this.bounds) return;
    // A GetMap BBOX cannot cross ±180°: a dateline-straddling study region
    // (Fiji, the Aleutians) becomes two legal requests whose images are
    // stitched side-by-side into one texture. The mesh is built on the
    // continuous bounds, so its UVs line up with the composite unchanged.
    const parts = splitBoundsAtAntimeridian(this.bounds);
    const TOTAL = 4096;
    // One texture download at a time: a newer month/scene supersedes any
    // in-flight one — cancel it (the seq guard already ignores its result;
    // aborting stops the bytes too). AbortError is a non-event by design.
    this.texAbort?.abort();
    this.texAbort = new AbortController();
    const signal = this.texAbort.signal;
    if (parts.length === 1) {
      const url = gibsRegionUrl(wmsLayer, parts[0].bounds, date, {
        width: TOTAL,
        height: TOTAL,
      });
      loadAbortableTexture(url, { signal, retries: 0 })
        .then((texture) => this.applyTexture(texture, seq, onApplied))
        .catch((err: unknown) => {
          if (!isAbortError(err)) this.textureFailed(date, seq);
        });
      return;
    }
    void this.loadStitched(
      wmsLayer,
      date,
      parts,
      TOTAL,
      seq,
      signal,
      onApplied
    );
  }

  /** Fetch each piece's GetMap and concatenate them left→right on a canvas. */
  private async loadStitched(
    wmsLayer: string,
    date: string,
    parts: ReturnType<typeof splitBoundsAtAntimeridian>,
    total: number,
    seq: number,
    signal: AbortSignal,
    onApplied: () => void
  ): Promise<void> {
    // Pixel widths proportional to angular widths, exactly filling the canvas.
    const widths = parts.map((p) =>
      Math.max(1, Math.round(total * p.fraction))
    );
    widths[widths.length - 1] =
      total - widths.slice(0, -1).reduce((a, w) => a + w, 0);
    try {
      const bitmaps = await Promise.all(
        parts.map((part, i) =>
          loadAbortableBitmap(
            gibsRegionUrl(wmsLayer, part.bounds, date, {
              width: widths[i],
              height: total,
            }),
            { signal, retries: 0 }
          )
        )
      );
      if (seq !== this.seq || !this.mesh) {
        for (const bitmap of bitmaps) bitmap.close();
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = total;
      canvas.height = total;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      let x = 0;
      for (let i = 0; i < bitmaps.length; i++) {
        ctx.drawImage(bitmaps[i], x, 0, widths[i], total);
        bitmaps[i].close();
        x += widths[i];
      }
      this.applyTexture(new THREE.CanvasTexture(canvas), seq, onApplied);
    } catch (err) {
      if (!isAbortError(err)) this.textureFailed(date, seq);
    }
  }

  private applyTexture(
    texture: THREE.Texture,
    seq: number,
    onApplied: () => void
  ): void {
    const mesh = this.mesh;
    if (seq !== this.seq || !mesh) {
      texture.dispose();
      return;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
    this.callbacks.onLoadingChange?.(false);
    onApplied();
  }

  private textureFailed(date: string, seq: number): void {
    console.warn(`RoamingEye: high-res imagery failed for ${date}`);
    if (seq === this.seq) {
      this.callbacks.onLoadingChange?.(false);
      this.callbacks.onStatus?.("High-res imagery failed to load");
    }
  }

  private buildMesh(bounds: Bounds): void {
    this.disposeMesh();

    const segments = 48;
    const radius = 1.001; // above the base globe (clear of z-fighting up close)
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const v = i / segments;
      const lat = bounds.south + (bounds.north - bounds.south) * v;
      for (let j = 0; j <= segments; j++) {
        const u = j / segments;
        const lon = bounds.west + (bounds.east - bounds.west) * u;
        const p = latLngToVector3(lat, lon, radius);
        positions.push(p.x, p.y, p.z);
        uvs.push(u, v);
      }
    }

    const stride = segments + 1;
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a = i * stride + j;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const material = new THREE.MeshBasicMaterial({
      color: 0x222222, // placeholder until imagery loads
      side: THREE.DoubleSide, // robust against patch winding orientation
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.object.add(this.mesh);
  }

  private disposeMesh(): void {
    if (!this.mesh) return;
    this.object.remove(this.mesh);
    this.mesh.geometry.dispose();
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
    this.mesh = undefined;
  }
}

function monthKeyOf(ym: YearMonth): string {
  return `${ym.year}-${ym.month}`;
}
