import { describe, expect, it } from "vitest";
import { MAGNITUDE_SIZE_BUCKETS } from "../lib/earthquakes";
import { POINT_THRESHOLD } from "../scene/HoverInspector";

/**
 * The quake overlay is the only one that varies marker size per record, so it
 * is the only one whose hover hit radius cannot be a single constant. These
 * pin the relationship the overlay declares through `HoverPointSource.hitRadius`
 * — not the seismology, which lives in lib/earthquakes.test.ts.
 */
describe("magnitude marker hit radius", () => {
  const radiusOf = (size: number) => size / 2;

  it("draws a larger marker for a larger magnitude", () => {
    const sizes = MAGNITUDE_SIZE_BUCKETS.map((b) => b.size);
    const descendingByMinimum = [...MAGNITUDE_SIZE_BUCKETS]
      .sort((a, b) => b.min - a.min)
      .map((b) => b.size);
    expect(sizes).toEqual(descendingByMinimum);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("leaves the strongest events smaller than their marker under one radius", () => {
    // The defect this radius closes: at the shared default, an M6.5+ marker is
    // nameable only well inside its own edge, so the events the size channel
    // exists to make prominent were the hardest to identify.
    const strongest = MAGNITUDE_SIZE_BUCKETS[0];
    expect(strongest.min).toBe(6.5);
    expect(radiusOf(strongest.size)).toBeGreaterThan(POINT_THRESHOLD * 2);
  });

  it("keeps the default as a floor for the smallest markers", () => {
    // Below the default the inspector clamps, so declaring a radius can only
    // widen a hit region — the smallest bucket keeps the aim it accepts today.
    const smallest = MAGNITUDE_SIZE_BUCKETS[MAGNITUDE_SIZE_BUCKETS.length - 1];
    expect(radiusOf(smallest.size)).toBeLessThan(POINT_THRESHOLD);
    expect(Math.max(radiusOf(smallest.size), POINT_THRESHOLD)).toBe(
      POINT_THRESHOLD
    );
  });
});
