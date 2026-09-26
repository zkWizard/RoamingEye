import { paintFrame, type OrbFrame } from "../vendor/thinking-orbs/engine/core";
import { frameGlobe, frameWave } from "../vendor/thinking-orbs/engine/lattice";
import type { ModeFrame } from "../vendor/thinking-orbs/engine/types";
import { resolvePreset, type ModeKey } from "../vendor/thinking-orbs/presets";
import type { OrbSize } from "../vendor/thinking-orbs/types";

/**
 * The orb's geometry and painter: the vendored thinking-orbs engine (see
 * src/vendor/thinking-orbs), narrowed to the states the app draws. It is its
 * own module so ThinkingOrb.ts can load it on first use: an orb is decoration,
 * and ~2.5 kB of it would otherwise ride in the entry chunk ahead of the globe.
 *
 * Only these modes are imported, so the others stay out of the bundle:
 *  - `searching`: a scan meridian sweeps a dotted globe. The boot curtain and
 *    a place search are both looking for somewhere on Earth.
 *  - `listening`: a waveform rolls through the rings. A probe reads a time
 *    series off the archive, month by month.
 */
export type OrbState = "searching" | "listening";
export type { OrbSize };

const FRAMES: Partial<Record<ModeKey, ModeFrame>> = {
  globe: frameGlobe,
  wave: frameWave,
};

/** Upstream's representative instant under reduced motion, in engine time. */
const STILL_T = 0.6;

/**
 * The geometry of one instant: pure, no canvas. `seconds` is the shared page
 * clock, which each preset scales by its own tuned speed; `"still"` is the
 * frame reduced motion holds.
 */
export function orbFrame(
  state: OrbState,
  size: OrbSize,
  seconds: number | "still"
): OrbFrame {
  const { mode, speed, opts } = resolvePreset(state, size);
  const frame = FRAMES[mode];
  if (!frame) throw new Error(`ThinkingOrb: no geometry for ${state}`);
  return frame(size, seconds === "still" ? STILL_T : seconds * speed, opts);
}

/** Paint one instant into a context already scaled to CSS pixels. */
export function paintOrb(
  ctx: CanvasRenderingContext2D,
  state: OrbState,
  size: OrbSize,
  seconds: number | "still",
  dark: boolean
): void {
  paintFrame(ctx, orbFrame(state, size, seconds), dark);
}
