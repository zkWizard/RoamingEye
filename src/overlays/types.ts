import type { LineSegments, Object3D, PerspectiveCamera, Points } from "three";

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
  /**
   * Never persisted to (or restored from) the saved session. For overlays that
   * must be a fresh, explicit opt-in every visit — e.g. geolocation, which may
   * not prompt without a user gesture and shouldn't surprise a returning user.
   */
  readonly ephemeral?: boolean;
  /**
   * The overlay tells the user about its own load failures, so the toolbar
   * must not report them a second time. Only geolocation does: a denial is a
   * browser-level outcome with its own wording, not a fetch that can be
   * retried by toggling.
   */
  readonly reportsOwnLoadErrors?: boolean;
  /**
   * Lazily fetch/build whatever the overlay needs. Called on every enable;
   * implementations memoize with `once()` so the work happens one time.
   */
  ensureLoaded?(): Promise<void>;
  /** Per-frame hook for view-dependent overlays (throttle internally). */
  update?(camera: PerspectiveCamera, viewportHeightPx: number): void;
}

/**
 * Point markers an overlay offers up for hover inspection. The HoverInspector
 * hit-tests the points (only while they are visible) and shows `describe`'s
 * text in the tooltip instead of the plain coordinate readout.
 */
export interface HoverPointSource {
  readonly points: Points;
  /**
   * The markers' own drawn radius, in world units — omit to accept the
   * inspector's default, which is sized for the ~0.022 markers most overlays
   * draw. Supply it when the overlay varies marker size per record: one radius
   * for every source leaves a marker drawn larger than it nameable only near
   * its centre. The inspector keeps its default as a floor, so this widens a
   * hit region and never tightens one.
   */
  readonly hitRadius?: number;
  /** Tooltip text for the point at `index`, or undefined to skip it. */
  describe(index: number): string | undefined;
}

/**
 * Line linework an overlay offers up for hover inspection, for overlays drawn
 * as segments rather than markers (e.g. plate boundaries). The HoverInspector
 * hit-tests the segments (only while they are visible) exactly as it does
 * points, and shows `describe`'s text in the tooltip.
 */
export interface HoverLineSource {
  readonly lines: LineSegments;
  /** Tooltip text for the segment at `segmentIndex`, or undefined to skip it. */
  describe(segmentIndex: number): string | undefined;
}

/**
 * Memoize a lazy load, keeping only a SUCCESSFUL result.
 *
 * The obvious `promise ??= load()` caches the rejection too, which quietly
 * costs the user their retry: one dropped connection or one 503 from an
 * upstream feed, and the enable fails — then every later attempt re-rejects
 * instantly from cache, off the same dead promise, even once the network is
 * back. The toggle looks like it is trying and can only really recover with a
 * page reload. Dropping the memo on failure makes the next enable a genuine
 * second attempt, which is what "turn it on again" has to mean for the
 * toolbar's retry wording to be true.
 *
 * Concurrent callers still share one in-flight load: the memo is assigned
 * synchronously, and it is only cleared later, when the rejection settles.
 */
export function once(load: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () =>
    (pending ??= load().catch((err: unknown) => {
      pending = undefined;
      throw err;
    }));
}

/** Globe radius (unit sphere). Overlays sit just above it to avoid z-fighting. */
export const GLOBE_RADIUS = 1;
