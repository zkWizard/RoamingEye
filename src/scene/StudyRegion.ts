import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { gibsRegionUrl, HIRES_LAYER, type Bounds } from "../lib/imagery";

/**
 * A high-resolution true-color patch draped over a small region of the globe.
 * The patch is a curved sphere-segment mesh covering the region's bounds; its
 * texture is an HLS image fetched for the current date. Sits just above the
 * base imagery so it reads as a sharper "inset" you can zoom into.
 */
export class StudyRegion {
  readonly object = new THREE.Group();
  private mesh: THREE.Mesh | undefined;
  private readonly loader = new THREE.TextureLoader();
  private bounds: Bounds | undefined;
  private currentDate: string | undefined;

  private seq = 0;
  private debounce: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly maxAnisotropy: number,
    private readonly onLoadingChange?: (loading: boolean) => void
  ) {
    this.object.visible = false;
  }

  get active(): boolean {
    return this.object.visible;
  }

  /** Show the patch for a region at a date, rebuilding the mesh for new bounds. */
  show(bounds: Bounds, date: string): void {
    this.bounds = bounds;
    this.currentDate = date;
    this.buildMesh(bounds);
    this.object.visible = true;
    this.loadTexture(date);
  }

  /** Update the patch imagery to a new date (debounced for scrubbing). */
  setDate(date: string): void {
    if (!this.bounds || date === this.currentDate) return;
    this.currentDate = date;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.loadTexture(date), 200);
  }

  hide(): void {
    this.object.visible = false;
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

  private loadTexture(date: string): void {
    if (!this.bounds || !this.mesh) return;
    const url = gibsRegionUrl(HIRES_LAYER.wmsLayer, this.bounds, date, {
      width: 4096,
      height: 4096,
    });
    const seq = ++this.seq;
    this.onLoadingChange?.(true);

    this.loader.load(
      url,
      (texture) => {
        if (seq !== this.seq) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.maxAnisotropy;
        const material = this.mesh?.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        this.onLoadingChange?.(false);
      },
      undefined,
      () => {
        console.warn(`RoamingEye: high-res imagery failed for ${date}`);
        if (seq === this.seq) this.onLoadingChange?.(false);
      }
    );
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
