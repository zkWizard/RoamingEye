import type { Object3D } from "three";

/**
 * A toggleable map overlay. Each overlay owns a Three.js object added to the
 * scene; the toolbar flips its visibility and triggers lazy loading on first
 * enable. New overlays just implement this and get added to the registry.
 */
export interface MapOverlay {
  readonly id: string;
  readonly label: string;
  /** Inline SVG markup for the toolbar icon. */
  readonly icon: string;
  /** The renderable object; shown/hidden via its `.visible`. */
  readonly object: Object3D;
  /** Whether the overlay starts enabled. */
  readonly defaultOn?: boolean;
  /** Lazily fetch/build whatever the overlay needs (called once, on first enable). */
  ensureLoaded?(): Promise<void>;
}

/** Globe radius (unit sphere). Overlays sit just above it to avoid z-fighting. */
export const GLOBE_RADIUS = 1;
