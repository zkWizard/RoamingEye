import { describe, it, expect } from "vitest";
import {
  magnitudeFrequencyDistribution,
  DEFAULT_MAGNITUDE_BIN_WIDTH,
  MAGNITUDE_FREQUENCY_UNITS,
} from "./magnitudeFrequency";
import { SEISMICITY_SOURCE } from "./earthquakes";
import type { Earthquake } from "./earthquakes";

const quake = (
  magnitude: number,
  extra: Partial<Earthquake> = {}
): Earthquake => ({
  lat: 0,
  lon: 0,
  depthKm: 10,
  magnitude,
  time: 1_750_000_000_000,
  place: "somewhere",
  ...extra,
});

describe("magnitudeFrequencyDistribution", () => {
  it("tallies incremental and cumulative counts over contiguous bins", () => {
    // Magnitudes 4.6, 5.1, 5.4, 6.2 with width 0.5 →
    //   [4.5,5.0): 4.6            → 1
    //   [5.0,5.5): 5.1, 5.4       → 2
    //   [5.5,6.0): (empty)        → 0
    //   [6.0,6.5): 6.2            → 1
    const fmd = magnitudeFrequencyDistribution(
      [4.6, 5.1, 5.4, 6.2].map((m) => quake(m)),
      { binWidthMagnitude: 0.5 }
    );
    expect(fmd.bins).toEqual([
      { lowerEdge: 4.5, upperEdge: 5, incrementalCount: 1, cumulativeCount: 4 },
      { lowerEdge: 5, upperEdge: 5.5, incrementalCount: 2, cumulativeCount: 3 },
      { lowerEdge: 5.5, upperEdge: 6, incrementalCount: 0, cumulativeCount: 1 },
      { lowerEdge: 6, upperEdge: 6.5, incrementalCount: 1, cumulativeCount: 1 },
    ]);
    expect(fmd.usableEventCount).toBe(4);
    expect(fmd.suppliedEventCount).toBe(4);
    expect(fmd.binWidthMagnitude).toBe(0.5);
    expect(fmd.isForecast).toBe(false);
  });

  it("makes the cumulative count monotonically non-increasing with magnitude", () => {
    const fmd = magnitudeFrequencyDistribution(
      [4.5, 4.7, 5.2, 5.9, 6.1, 7.3].map((m) => quake(m)),
      { binWidthMagnitude: 0.5 }
    );
    for (let i = 1; i < fmd.bins.length; i += 1) {
      expect(fmd.bins[i].cumulativeCount).toBeLessThanOrEqual(
        fmd.bins[i - 1].cumulativeCount
      );
    }
    // The first (lowest) bin's cumulative count equals every usable event.
    expect(fmd.bins[0].cumulativeCount).toBe(fmd.usableEventCount);
  });

  it("keeps an event that lands exactly on a bin edge in the upper bin", () => {
    // 5.0 with width 0.5 belongs to [5.0,5.5), not [4.5,5.0).
    const fmd = magnitudeFrequencyDistribution([quake(5.0)], {
      binWidthMagnitude: 0.5,
    });
    expect(fmd.bins).toEqual([
      { lowerEdge: 5, upperEdge: 5.5, incrementalCount: 1, cumulativeCount: 1 },
    ]);
  });

  it("bins cleanly at a 0.1 width despite floating-point division", () => {
    // 4.6 / 0.1 = 45.9999… in IEEE-754; the edge must still resolve to 4.6.
    const fmd = magnitudeFrequencyDistribution([quake(4.6)], {
      binWidthMagnitude: 0.1,
    });
    expect(fmd.bins).toHaveLength(1);
    expect(fmd.bins[0].lowerEdge).toBe(4.6);
    expect(fmd.bins[0].upperEdge).toBe(4.7);
  });

  it("defaults to a half-magnitude bin width", () => {
    const fmd = magnitudeFrequencyDistribution([quake(5.2)]);
    expect(fmd.binWidthMagnitude).toBe(DEFAULT_MAGNITUDE_BIN_WIDTH);
    expect(fmd.bins).toEqual([
      { lowerEdge: 5, upperEdge: 5.5, incrementalCount: 1, cumulativeCount: 1 },
    ]);
  });

  it("is order-independent (bins by value, not input order)", () => {
    const ascending = magnitudeFrequencyDistribution(
      [4.6, 5.1, 5.4, 6.2].map((m) => quake(m)),
      { binWidthMagnitude: 0.5 }
    );
    const shuffled = magnitudeFrequencyDistribution(
      [6.2, 4.6, 5.4, 5.1].map((m) => quake(m)),
      { binWidthMagnitude: 0.5 }
    );
    expect(shuffled.bins).toEqual(ascending.bins);
  });

  it("counts non-finite magnitudes as supplied but not usable", () => {
    const fmd = magnitudeFrequencyDistribution([
      quake(5.1),
      quake(Number.NaN),
      quake(Number.POSITIVE_INFINITY),
    ]);
    expect(fmd.suppliedEventCount).toBe(3);
    expect(fmd.usableEventCount).toBe(1);
    expect(fmd.bins).toHaveLength(1);
    expect(fmd.bins[0].incrementalCount).toBe(1);
  });

  it("returns no bins for an empty event set", () => {
    const fmd = magnitudeFrequencyDistribution([]);
    expect(fmd.bins).toEqual([]);
    expect(fmd.usableEventCount).toBe(0);
    expect(fmd.suppliedEventCount).toBe(0);
  });

  it("yields no bins when the bin width is not usable", () => {
    for (const binWidthMagnitude of [
      0,
      -0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const fmd = magnitudeFrequencyDistribution([quake(5.1), quake(6.0)], {
        binWidthMagnitude,
      });
      expect(fmd.bins).toEqual([]);
      // Usable events are still counted even when no valid width bins them.
      expect(fmd.usableEventCount).toBe(2);
    }
  });

  it("handles negative magnitudes (small events) without special-casing", () => {
    const fmd = magnitudeFrequencyDistribution(
      [-0.3, 0.2, 0.4].map((m) => quake(m)),
      { binWidthMagnitude: 0.5 }
    );
    expect(fmd.bins).toEqual([
      {
        lowerEdge: -0.5,
        upperEdge: 0,
        incrementalCount: 1,
        cumulativeCount: 3,
      },
      { lowerEdge: 0, upperEdge: 0.5, incrementalCount: 2, cumulativeCount: 2 },
    ]);
  });

  it("retains provenance, units, and honest limitations", () => {
    const fmd = magnitudeFrequencyDistribution([quake(5.5)]);
    expect(fmd.source).toBe(SEISMICITY_SOURCE);
    expect(fmd.units).toBe(MAGNITUDE_FREQUENCY_UNITS);
    expect(fmd.kind).toBe("usgs-magnitude-frequency-distribution");
    expect(fmd.limitations.length).toBeGreaterThan(0);
    // The tally must not claim to be a Gutenberg–Richter / b-value product.
    expect(fmd.limitations.some((line) => /b-value/i.test(line))).toBe(true);
  });
});
