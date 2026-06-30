import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { gibsRegionUrl, type Bounds } from "../lib/imagery";
import { pickBestScene } from "../lib/sceneSelection";
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
  private readonly loader = new THREE.TextureLoader();
  private bounds: Bounds | undefined;
  private monthKey: string | undefined;

  private seq = 0;
  private debounce: ReturnType<typeof setTimeout> | undefined;

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
    const url = gibsRegionUrl(wmsLayer, this.bounds, date, {
      width: 4096,
      height: 4096,
    });
    this.loader.load(
      url,
      (texture) => {
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
      },
      undefined,
      () => {
        console.warn(`RoamingEye: high-res imagery failed for ${date}`);
        if (seq === this.seq) {
          this.callbacks.onLoadingChange?.(false);
          this.callbacks.onStatus?.("High-res imagery failed to load");
        }
      }
    );
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
