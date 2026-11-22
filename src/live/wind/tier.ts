/** About 40k particles on a desktop GPU, 10k when the device or the pixel ratio is limited. */

export const WIND_PARTICLES_FULL = 40_000;
export const WIND_PARTICLES_LOW = 10_000;

export function windParticleCount(input: {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  pixelRatio: number;
  maxPixelRatio: number;
}): number {
  const lowMemory =
    input.deviceMemoryGb !== undefined && input.deviceMemoryGb <= 4;
  const lowCpu = (input.hardwareConcurrency ?? 8) <= 2;
  const dprLimited = input.pixelRatio < input.maxPixelRatio - 0.05;
  if (lowMemory || lowCpu || dprLimited) return WIND_PARTICLES_LOW;
  return WIND_PARTICLES_FULL;
}

export function particleGrid(count: number): { width: number; height: number } {
  if (count <= WIND_PARTICLES_LOW) return { width: 100, height: 100 };
  return { width: 200, height: 200 };
}

export function trailTextureSize(count: number): {
  width: number;
  height: number;
} {
  if (count <= WIND_PARTICLES_LOW) return { width: 1024, height: 512 };
  return { width: 2048, height: 1024 };
}

/**
 * Point size in trail-texture pixels. A close camera uses a smaller stamp so
 * the same world streak does not become a block when the texture is magnified.
 */
export function windPointSize(distance: number): number {
  const safe = Number.isFinite(distance) ? distance : 3;
  return Math.min(1.35, Math.max(0.65, 0.4 * safe));
}
