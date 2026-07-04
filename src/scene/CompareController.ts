import * as THREE from "three";
import { gibsWmsUrl, type LayerConfig, type YearMonth } from "../lib/timeline";

/**
 * Renders the A/B comparison: the same scene drawn twice per frame with the
 * globe texture swapped, each pass scissored to one side of the divider. No
 * second scene, no shader changes — the camera, overlays, and lighting are
 * identical on both sides by construction.
 *
 * The pinned ("before") month owns its own full-resolution texture, loaded
 * once on enable; the live ("after") side is whatever GlobeTextureManager
 * currently has applied to the globe material.
 */
export class CompareController {
  /** Divider position as a fraction of the viewport width. */
  split = 0.5;

  private readonly loader = new THREE.TextureLoader();
  private texture: THREE.Texture | undefined;
  private _pinned: YearMonth | undefined;
  private _active = false;
  private seq = 0;

  constructor(
    private readonly material: THREE.MeshStandardMaterial,
    private readonly maxAnisotropy: number,
    /** Fires when the pinned texture finishes loading (or fails). */
    private readonly onReadyChange?: (ready: boolean) => void
  ) {}

  get active(): boolean {
    return this._active;
  }

  get pinned(): YearMonth | undefined {
    return this._pinned;
  }

  /** Ready to draw the split (pinned imagery in hand). */
  get showing(): boolean {
    return this._active && this.texture !== undefined;
  }

  /** Pin `ym` of `layer` as the left ("before") side. */
  enable(layer: LayerConfig, ym: YearMonth): void {
    this.disable();
    this._active = true;
    this._pinned = ym;
    const seq = ++this.seq;
    this.loader.load(
      gibsWmsUrl(layer, ym, { width: 2048, height: 1024 }),
      (texture) => {
        if (seq !== this.seq || !this._active) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.maxAnisotropy;
        this.texture = texture;
        this.onReadyChange?.(true);
      },
      undefined,
      () => {
        console.warn("RoamingEye: compare imagery failed to load");
        if (seq === this.seq) {
          this._active = false;
          this.onReadyChange?.(false);
        }
      }
    );
  }

  disable(): void {
    this.seq++;
    this._active = false;
    this._pinned = undefined;
    this.texture?.dispose();
    this.texture = undefined;
  }

  /**
   * Two scissored passes: pinned month left of the divider, live month right.
   * Call in place of the normal `renderer.render` when `showing`.
   */
  renderSplit(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ): void {
    if (!this.texture) return;
    const size = renderer.getSize(new THREE.Vector2());
    const splitX = Math.round(size.x * this.split);
    const live = this.material.map;
    // Swapping between two loaded textures reuses the same shader program;
    // only a null↔texture change would require a material rebuild.
    const needsRebuild = live === null;

    renderer.setScissorTest(true);

    this.material.map = this.texture;
    if (needsRebuild) this.material.needsUpdate = true;
    renderer.setScissor(0, 0, splitX, size.y);
    renderer.render(scene, camera);

    this.material.map = live;
    if (needsRebuild) this.material.needsUpdate = true;
    renderer.setScissor(splitX, 0, size.x - splitX, size.y);
    renderer.render(scene, camera);

    renderer.setScissorTest(false);
    renderer.setScissor(0, 0, size.x, size.y);
  }
}
