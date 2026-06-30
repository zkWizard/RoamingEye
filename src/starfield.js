/**
 * Starfield geometry helpers.
 *
 * The position math is kept here as a pure function so it can be unit-tested
 * without a WebGL context. `main.js` wraps the returned buffer in a
 * THREE.BufferGeometry for rendering.
 */

/** Inner radius of the spherical shell the stars are scattered on. */
export const STAR_SHELL_MIN = 40;
/** Width of the shell; stars fall in [STAR_SHELL_MIN, STAR_SHELL_MIN + RANGE]. */
export const STAR_SHELL_RANGE = 30;

/**
 * Generate a flat Float32Array of XYZ star positions scattered uniformly over
 * a spherical shell around the origin.
 *
 * @param {number} starCount  Number of stars to generate (must be >= 0).
 * @param {() => number} [rng] Random source returning [0, 1). Defaults to
 *   Math.random. Injectable so tests can run deterministically.
 * @returns {Float32Array} Length `starCount * 3`, laid out [x0,y0,z0, x1,...].
 */
export function generateStarPositions(starCount, rng = Math.random) {
  if (!Number.isInteger(starCount) || starCount < 0) {
    throw new RangeError(`starCount must be a non-negative integer, got ${starCount}`);
  }

  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    // Scatter stars on a large sphere shell around the scene.
    const r = STAR_SHELL_MIN + rng() * STAR_SHELL_RANGE;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  return positions;
}
