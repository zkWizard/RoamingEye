// LOCAL: upstream's src/types.ts also declares the React component's props,
// which import from 'react'. Only the two types the engine reads are kept,
// with upstream's documentation, so nothing here depends on a framework.

/**
 * The nine shipped states — each a hand-tuned animation:
 * - `working`    — particles on tilted orbits
 * - `searching`  — a scan meridian sweeps a dotted globe
 * - `solving`    — bands scramble in quarter turns, then click back
 * - `listening`  — a waveform rolls through latitude rings
 * - `connecting` — a constellation wires itself, packets running the edges
 * - `weaving`    — three strands plait around the sphere
 * - `composing`  — an undulating multi-band sash
 * - `breathing`  — a face-on ring slowly morphing
 * - `shaping`    — a dotted outline morphs circle → triangle → square
 */
export type OrbState =
  | 'working'
  | 'searching'
  | 'solving'
  | 'listening'
  | 'connecting'
  | 'weaving'
  | 'composing'
  | 'breathing'
  | 'shaping';

/**
 * Rendered size in CSS pixels. 64 (chat-avatar scale) and 20 (inline-text
 * scale) are hand-tuned designs, not a scale factor — each carries its own
 * dot count, dot size and speed. 32 (compact avatar scale) sits between
 * them and is interpolated from the two, in log space because those knobs
 * are ratios; it reads correctly but has not had a tuning pass of its own.
 */
export type OrbSize = 64 | 32 | 20;
