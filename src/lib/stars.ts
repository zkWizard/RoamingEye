/** Stars on the dark-sky shell. Seeded so a reload paints the same field. */

export const STAR_COUNT = 6000;
export const STAR_RADIUS_MIN = 40;
export const STAR_RADIUS_MAX = 70;
export const STAR_SEED = 0x51a5;

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StarField {
  positions: Float32Array;
  brightness: Float32Array;
}

export function starField(count = STAR_COUNT, seed = STAR_SEED): StarField {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const brightness = new Float32Array(count);
  const span = STAR_RADIUS_MAX - STAR_RADIUS_MIN;
  for (let i = 0; i < count; i++) {
    const radius = STAR_RADIUS_MIN + rand() * span;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const sinPhi = Math.sin(phi);
    positions[i * 3] = radius * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = radius * sinPhi * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
    brightness[i] = 0.25 + 0.75 * rand() * rand();
  }
  return { positions, brightness };
}
