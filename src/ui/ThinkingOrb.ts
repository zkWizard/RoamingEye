import type { OrbSize, OrbState } from "./orbGeometry";

export type { OrbSize, OrbState };

/**
 * A dotted thought-orb (thinking-orbs, vendored in src/vendor) on a plain 2D
 * canvas, for the moments the app is busy on the reader's behalf.
 *
 * Upstream ships the orb as a React component; its engine is framework-free,
 * and this is the small binding the app needs instead: pick a state and a
 * size, put `canvas` where it belongs, and call `start`/`stop` as the work
 * begins and ends.
 *
 * The canvas exists, sized, from construction, so a caller can lay it out at
 * once; the geometry (orbGeometry.ts) is fetched on the first `start`, which
 * keeps the engine out of the entry chunk. The orb draws its first frame a
 * beat later, which a fade-in covers where it shows (the boot curtain).
 *
 * The orb is decoration beside words that already say what is happening
 * ("Loading Earth…", "Sampling 12/316 months…"), so it is `aria-hidden`: a
 * screen reader hears the words once, not the words and then an image of them.
 */

type Geometry = typeof import("./orbGeometry");
let geometry: Geometry | undefined;
let loading: Promise<void> | undefined;

/**
 * Fetch the geometry once, for every orb. Never rejects: a chunk that fails to
 * load (offline, a deploy mid-session) leaves the canvas blank beside its
 * words, which is all an orb is worth, rather than raising the error toast.
 * The next `start` tries again.
 */
function loadGeometry(): Promise<void> {
  loading ??= import("./orbGeometry").then(
    (mod) => {
      geometry = mod;
    },
    () => {
      loading = undefined;
    }
  );
  return loading;
}

/** Ink follows the theme the app is in, which ThemeToggle keeps on <html>. */
const isDark = (): boolean =>
  document.documentElement.getAttribute("data-theme") !== "light";

/**
 * Orbs whose work is on. The page-level signals are watched once, for all of
 * them; an orb that has stopped is not in the set, so nothing holds it and a
 * caller can simply drop it.
 */
const active = new Set<ThinkingOrb>();
let reducedMotion: MediaQueryList | undefined;

/** Starts the shared watchers on first use, so importing touches no DOM. */
function watchPage(): void {
  if (reducedMotion) return;
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const refreshAll = () => active.forEach((orb) => orb.refresh());
  reducedMotion.addEventListener("change", refreshAll);
  document.addEventListener("visibilitychange", refreshAll);
  // A still frame (reduced motion) has no loop to pick up a theme flip.
  new MutationObserver(() => active.forEach((orb) => orb.paintNow())).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ["data-theme"] }
  );
}

export class ThinkingOrb {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly dpr = Math.min(2, window.devicePixelRatio || 1);
  private raf = 0;

  constructor(
    private readonly state: OrbState,
    private readonly size: OrbSize,
    className?: string
  ) {
    watchPage();
    this.canvas = document.createElement("canvas");
    if (className) this.canvas.className = className;
    this.canvas.width = Math.round(size * this.dpr);
    this.canvas.height = Math.round(size * this.dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.setAttribute("aria-hidden", "true");
    this.ctx = this.canvas.getContext("2d");
  }

  /** The work began: animate, or hold a still frame under reduced motion. */
  start(): void {
    active.add(this);
    this.refresh();
  }

  /** The work ended. Stops the frame loop; the canvas keeps its last frame. */
  stop(): void {
    active.delete(this);
    this.refresh();
  }

  /** Paint the current instant. Every orb shares one clock, so they agree. */
  paintNow(): void {
    const ctx = this.ctx;
    if (!ctx || !geometry) return;
    const seconds = reducedMotion?.matches ? "still" : performance.now() / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    geometry.paintOrb(ctx, this.state, this.size, seconds, isDark());
  }

  /**
   * One place decides whether frames run: only while the work is on, the tab
   * is visible, motion is welcome, and the canvas is still in the document. A
   * caller that throws its markup away (a search result list re-rendering)
   * therefore stops the orb with it, with no teardown of its own to forget.
   */
  refresh(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!active.has(this)) return;
    if (!geometry) {
      // The work may be over by the time it lands, so refresh() asks again —
      // but only if it did land, or a failed load would retry in a loop.
      void loadGeometry().then(() => {
        if (geometry) this.refresh();
      });
      return;
    }

    this.paintNow();
    if (reducedMotion?.matches || document.visibilityState === "hidden") {
      return;
    }

    const loop = () => {
      if (!this.canvas.isConnected) {
        active.delete(this);
        this.raf = 0;
        return;
      }
      this.paintNow();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
}
