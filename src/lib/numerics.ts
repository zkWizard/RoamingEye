/**
 * Compensated floating-point summation for every scientific accumulation.
 *
 * Naive left-to-right summation has worst-case error O(εn) and an answer
 * that depends on iteration order; the probe averages up to ~555 monthly
 * values (MERRA-2 back to 1980) and thousands of cos(lat)-weighted grid
 * samples, then subtracts near-equal numbers (anomaly = value − climatology,
 * e.g. Kelvin-scale LST), which surfaces any lost digits amplified. We
 * publish CSVs whose only stated uncertainty is the colormap quantization —
 * the arithmetic beneath them should contribute provably nothing.
 *
 * Neumaier's variant of Kahan summation carries the running compensation for
 * the case where the next addend is larger than the running sum, giving an
 * error bound independent of n at the same cost class (Higham, *Accuracy and
 * Stability of Numerical Algorithms*, §4.3; NumPy defaults to the related
 * pairwise scheme for the same reason). Property tests in
 * numerics.property.test.ts hold these to permutation invariance and to an
 * arbitrary-precision reference.
 */

export interface NeumaierAccumulator {
  /** Fold one addend into the running sum. */
  add(x: number): void;
  /** The compensated total so far. */
  sum(): number;
}

/** A streaming Neumaier (improved Kahan) accumulator. */
export function makeNeumaierAcc(): NeumaierAccumulator {
  let s = 0; // running sum
  let c = 0; // running compensation (the digits `s` couldn't hold)
  return {
    add(x: number): void {
      const t = s + x;
      // Whichever operand was smaller lost digits in `t`; recover them.
      c += Math.abs(s) >= Math.abs(x) ? s - t + x : x - t + s;
      s = t;
    },
    sum: (): number => s + c,
  };
}

/** Compensated sum of a whole array. */
export function neumaierSum(values: ArrayLike<number>): number {
  const acc = makeNeumaierAcc();
  for (let i = 0; i < values.length; i++) acc.add(values[i]);
  return acc.sum();
}
